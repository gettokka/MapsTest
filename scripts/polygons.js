/* global palette */
import polylabel from './vendor/polylabel.js';
import { sanitize, escapeHtml, safeUrl, isColor } from './safe.js';
import { fetchJson } from './sheets.js';
import { notify, makeLadder, domControl } from './ui.js';

const NO_DATA_COLOR = '#cccccc';

const formatValue = v => (typeof v === 'number' ? v.toLocaleString() : escapeHtml(v));

/** "a, Label A; b, Label B" -> [['a', 'Label A'], ['b', 'Label B']] */
function splitPairs(value) {
  return value.split(';')
    .map(pair => pair.split(',').map(x => x.trim()))
    .filter(([key]) => key);
}

function makePalette(scheme, count) {
  const colors = palette(scheme, count) ?? palette('tol-sq', count) ?? palette('rainbow', count);
  return colors.map(c => `#${c}`);
}

/** Reads and validates the settings of one "Polygons" tab. Throws on configuration errors. */
function parseConfig(s) {
  const properties = splitPairs(s.get('Polygon Properties, Labels'));
  const rangeSets = s.get('Property Ranges').split(';');
  const colorSets = s.get('Property Range Manual Colors').split(';');
  const scheme = s.get('Property Range Color Palette', 'tol-sq');

  if (!properties.length) throw new Error('"Polygon Properties, Labels" is empty');
  if (rangeSets.length !== properties.length) {
    throw new Error('the number of "Property Ranges" sets must match the number of properties');
  }

  const layers = properties.map(([property, label], i) => {
    const raw = rangeSets[i].split(',').map(d => d.trim()).filter(Boolean);
    const numeric = raw.length > 0 && raw.every(d => Number.isFinite(parseFloat(d)));
    const divisors = numeric ? raw.map(parseFloat) : raw;

    let colors = (colorSets[i] ?? '').split(',').map(c => c.trim()).filter(Boolean);
    if (colors.length) {
      if (colors.length !== divisors.length) {
        throw new Error(`property "${property}": the number of colors must match the number of ranges`);
      }
      colors = colors.map(c => (isColor(c) ? c : NO_DATA_COLOR));
    } else {
      colors = makePalette(scheme, Math.max(divisors.length, 1));
    }
    return { property, label: label || property, divisors, colors, numeric };
  });

  const opacity = Math.min(Math.max(s.num('Polygon Color Opacity', 0.7), 0), 1);
  const outline = s.get('Polygon Outline Color');

  return {
    layers,
    opacity,
    outline: isColor(outline) ? outline : 'white',
    popupProperties: splitPairs(s.get('Property Popups, Labels')),
    showImages: s.on('Show Images When Available'),
    labelProperty: s.get('Show Polygon Labels'),
    labelZoom: s.num('Show Polygon Labels at Zoom Level', 9),
  };
}

function getColor(layer, value) {
  const { divisors, colors, numeric } = layer;
  if (!divisors.length) return colors[0];

  if (numeric) {
    const d = typeof value === 'number' ? value : parseFloat(value);
    if (!Number.isFinite(d)) return NO_DATA_COLOR;
    let i = divisors.length - 1;
    while (i > 0 && d < divisors[i]) i--;
    return colors[i];
  }

  const i = divisors.indexOf(String(value ?? '').trim());
  return i === -1 ? NO_DATA_COLOR : colors[i];
}

function popupHtml(config, properties) {
  let html = config.popupProperties
    .map(([key, label]) => `${escapeHtml(label || key)}: <b>${formatValue(properties[key])}</b>`)
    .join('<br>');

  const image = config.showImages && safeUrl(properties.img);
  if (image) html += `<img src="${escapeHtml(image)}" alt="">`;
  return html;
}

/** Best position for a text label: the pole of inaccessibility of the (largest) polygon. */
function labelPosition(geometry) {
  if (geometry.type === 'Point') return L.latLng(geometry.coordinates[1], geometry.coordinates[0]);

  let rings = geometry.coordinates;
  if (geometry.type === 'MultiPolygon') {
    const area = ([outer]) => {
      const xs = outer.map(c => c[0]);
      const ys = outer.map(c => c[1]);
      return (Math.max(...xs) - Math.min(...xs)) * (Math.max(...ys) - Math.min(...ys));
    };
    rings = rings.reduce((a, b) => (area(b) > area(a) ? b : a));
  } else if (geometry.type !== 'Polygon') {
    return null;
  }
  const [x, y] = polylabel(rings, 0.0001);
  return L.latLng(y, x);
}

function buildLayers(config, data) {
  const labels = L.featureGroup();
  const hasPopup = config.popupProperties.length > 0 || config.showImages;

  const geojson = L.geoJSON(data, {
    pointToLayer: (feature, latlng) => L.circleMarker(latlng, { className: 'geojson-point-marker' }),
    onEachFeature(feature, layer) {
      if (hasPopup) layer.bindPopup(() => popupHtml(config, feature.properties ?? {}));

      const text = config.labelProperty && feature.properties?.[config.labelProperty];
      const position = text != null && text !== '' && feature.geometry && labelPosition(feature.geometry);
      if (position) {
        labels.addLayer(L.marker(position, {
          interactive: false,
          keyboard: false,
          icon: L.divIcon({ className: 'polygon-label', iconSize: null, html: `<span>${escapeHtml(text)}</span>` }),
        }));
      }
    },
  });
  return { geojson, labels };
}

function styleFor(config, layer) {
  return feature => {
    const color = getColor(layer, feature.properties?.[layer.property]);
    return feature.geometry?.type === 'Point'
      ? { radius: 4, weight: 1, opacity: 1, color, fillOpacity: config.opacity, fillColor: 'white' }
      : { weight: 2, opacity: 1, color: config.outline, dashArray: '3', fillOpacity: config.opacity, fillColor: color };
  };
}

function scaleHtml(config, layer) {
  if (!layer.divisors.length) return '';
  return layer.divisors.map((from, i) => {
    const to = layer.divisors[i + 1];
    const range = !layer.numeric
      ? escapeHtml(from)
      : formatValue(from) + (to !== undefined ? `&ndash;${formatValue(to)}` : '+');
    return `<i style="background:${escapeHtml(layer.colors[i])};opacity:${config.opacity}"></i> ${range}`;
  }).join('<br>');
}

function createLegend(index, config, s) {
  const element = L.DomUtil.create('div', 'leaflet-control leaflet-control-custom leaflet-bar polygons-legend');
  const options = config.layers
    .map((layer, i) => `<label><input type="radio" name="polygons-${index}" value="${i}"> ${sanitize(layer.label)}</label>`)
    .join('<br>');
  element.innerHTML =
    `<form>${options}<br><label><input type="radio" name="polygons-${index}" value="-1"> Off</label></form>` +
    '<div class="polygons-legend-scale" hidden></div>';
  makeLadder(element, s.get('Polygon Legend Title'), s.get('Polygon Legend Icon'));
  return element;
}

async function loadPolygonSheet(s) {
  const config = parseConfig(s);
  const data = await fetchJson(s.get('Polygon GeoJSON URL'));
  return { config, ...buildLayers(config, data) };
}

/**
 * One choropleth layer per "Polygons" tab. Each tab gets its own legend
 * with a radio button per property and an "Off" option.
 */
function showPolygonSheet(map, s, index, { config, geojson, labels }) {
  const position = s.position('Polygon Legend Position');
  const legend = position && createLegend(index, config, s);
  const scale = legend?.querySelector('.polygons-legend-scale');
  let active = -1;

  const updateLabels = () => {
    const visible = active >= 0 && map.getZoom() >= config.labelZoom;
    if (visible) labels.addTo(map);
    else labels.remove();
  };

  function activate(i) {
    active = i;
    if (i < 0) {
      geojson.remove();
    } else {
      geojson.setStyle(styleFor(config, config.layers[i]));
      geojson.addTo(map);
    }
    updateLabels();

    if (scale) {
      scale.innerHTML = i >= 0 ? scaleHtml(config, config.layers[i]) : '';
      scale.hidden = !scale.innerHTML;
    }
    if (legend) legend.querySelector(`input[value="${i}"]`).checked = true;
  }

  if (legend) {
    domControl(legend, position).addTo(map);
    legend.querySelector('form').addEventListener('change', e => activate(Number(e.target.value)));
  }
  map.on('zoomend', updateLabels);
  activate(s.on('Show Polygon Data on Start') ? 0 : -1);
}

/** Loads all polygon tabs in parallel, then adds them in tab order so legends keep their order. */
export async function addPolygons(map, sheets) {
  const results = await Promise.allSettled(sheets.map(loadPolygonSheet));
  results.forEach((result, index) => {
    if (result.status === 'fulfilled') {
      showPolygonSheet(map, sheets[index], index, result.value);
    } else {
      const url = sheets[index].get('Polygon GeoJSON URL');
      notify(`Polygons from "${url}" could not be shown: ${result.reason.message}`);
    }
  });
}
