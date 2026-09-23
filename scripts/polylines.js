import { sanitize, escapeHtml, isColor } from './safe.js';
import { fetchJson } from './sheets.js';
import { notify, makeLadder } from './ui.js';

/** Loads all polyline GeoJSON files in parallel and adds them with a legend. */
export async function addPolylines(map, rows, s) {
  rows = rows.filter(r => r['GeoJSON URL']);
  if (!rows.length) return;

  // Own pane above polygons (overlayPane = 400), so lines stay clickable on top
  map.createPane('polylines').style.zIndex = 450;

  const weight = s.num('Polyline Thickness', 2);
  const position = s.position('Polyline Legend Position');
  const legend = position && L.control.layers(null, null, { collapsed: false, position });

  const results = await Promise.allSettled(rows.map(r => fetchJson(r['GeoJSON URL'])));

  results.forEach((result, i) => {
    const row = rows[i];
    const name = row['Display Name'] || row['GeoJSON URL'];
    if (result.status === 'rejected') {
      notify(`Polyline "${name}" could not be loaded: ${result.reason.message}`);
      return;
    }

    const color = isColor(row.Color) ? row.Color : 'grey';
    let layer;
    try {
      layer = L.geoJSON(result.value, {
        pane: 'polylines',
        style: { color, weight },
        filter: f => /LineString$/.test(f.geometry?.type),
      });
    } catch (err) {
      notify(`Polyline "${name}" contains invalid GeoJSON: ${err.message}`);
      return;
    }

    if (row.Description) layer.bindPopup(sanitize(row.Description));
    layer.addTo(map);
    legend?.addOverlay(layer,
      `<i class="color-line" style="background-color:${escapeHtml(color)}"></i> ${sanitize(name)}`);
  });

  if (!legend) return;
  legend.addTo(map);
  const container = legend.getContainer();
  makeLadder(container, s.get('Polyline Legend Title'), s.get('Polyline Legend Icon'), 'polylines-legend');

  if (s.get('Display Title') === 'in polylines legend') {
    const title = document.createElement('div');
    title.className = 'legend-map-title';
    title.innerHTML = `<h3>${sanitize(s.get('Map Title'))}</h3><h6>${sanitize(s.get('Map Subtitle'))}</h6>`;
    container.prepend(title);
  }
}
