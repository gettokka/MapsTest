import { sanitize, escapeHtml, safeUrl, isColor, faClass, parseLatLng } from './safe.js';
import { notify, makeLadder } from './ui.js';

// Colour names from the former Leaflet.awesome-markers plugin, so existing sheets keep working.
// Any other valid CSS colour (e.g. "#ff8800") is accepted as well.
const MARKER_COLORS = {
  red: '#d63e2a', darkred: '#a23336', lightred: '#ff8e7f', orange: '#f69730',
  beige: '#ffcb92', green: '#72b026', darkgreen: '#728224', lightgreen: '#bbf970',
  blue: '#38aadd', darkblue: '#0067a3', lightblue: '#8adaff', purple: '#d252b9',
  darkpurple: '#5b396b', pink: '#ff91ea', cadetblue: '#436978', white: '#fbfbfb',
  gray: '#575757', lightgray: '#a3a3a3', black: '#303030',
};

const isImagePath = icon => icon.includes('.');

function markerColor(row) {
  const color = (row['Marker Color'] ?? '').toLowerCase();
  return MARKER_COLORS[color] ?? (isColor(color) ? color : MARKER_COLORS.blue);
}

function parseSize(value) {
  const [w, h] = String(value ?? '').split('x').map(n => parseInt(n, 10));
  return w > 0 && h > 0 ? [w, h] : [32, 32];
}

function markerIcon(row) {
  const icon = row['Marker Icon'] ?? '';
  const imageUrl = isImagePath(icon) && safeUrl(icon);

  if (imageUrl) {
    const [w, h] = parseSize(row['Custom Size']);
    return L.icon({ iconUrl: imageUrl, iconSize: [w, h], iconAnchor: [w / 2, h], popupAnchor: [0, -h] });
  }

  const glyph = faClass(icon);
  const glyphColor = isColor(row['Icon Color']) ? row['Icon Color'] : 'white';
  return L.divIcon({
    className: 'pin-marker',
    html:
      '<svg viewBox="0 0 32 42" width="32" height="42" aria-hidden="true">' +
      `<path d="M16 1C7.7 1 1 7.7 1 16c0 10.5 15 25 15 25s15-14.5 15-25C31 7.7 24.3 1 16 1z" fill="${escapeHtml(markerColor(row))}"/>` +
      '</svg>' +
      (glyph ? `<i class="${glyph}" style="color:${escapeHtml(glyphColor)}"></i>` : ''),
    iconSize: [32, 42],
    iconAnchor: [16, 42],
    popupAnchor: [0, -36],
  });
}

function popupHtml(row) {
  const image = safeUrl(row.Image);
  return `<b>${sanitize(row.Name)}</b><br>` +
    (image ? `<img src="${escapeHtml(image)}" alt=""><br>` : '') +
    sanitize(row.Description);
}

function legendIcon(row) {
  const icon = row['Marker Icon'] ?? '';
  const imageUrl = isImagePath(icon) && safeUrl(icon);
  return imageUrl
    ? `<img src="${escapeHtml(imageUrl)}" class="markers-legend-icon" alt="">`
    : `<i class="fa-solid fa-location-dot" style="color:${escapeHtml(markerColor(row))}"></i>`;
}

/**
 * Adds all points to the map, grouped into toggleable layers by the "Group" column.
 * Returns the points plus a visibility test used by the table.
 */
export function addPoints(map, rows, s) {
  const points = [];
  const skipped = [];

  for (const row of rows) {
    const latlng = parseLatLng(row.Latitude, row.Longitude);
    if (!latlng) {
      if (row.Latitude || row.Longitude) skipped.push(row.Name || '(unnamed)');
      continue;
    }
    const marker = L.marker(latlng, { icon: markerIcon(row) }).bindPopup(popupHtml(row));
    points.push({ row, latlng, marker, group: row.Group ?? '' });
  }

  if (skipped.length) {
    notify(`${skipped.length} point(s) skipped because of invalid coordinates: ${skipped.join(', ')}`);
  }
  if (!points.length) return { points, bounds: null, isShown: () => false };

  const cluster = s.on('Cluster Markers');
  const bounds = L.latLngBounds(points.map(p => p.latlng));
  const groupNames = [...new Set(points.map(p => p.group))];

  // Single group: no legend needed
  if (groupNames.length === 1) {
    const markers = points.map(p => p.marker);
    (cluster ? L.markerClusterGroup().addLayers(markers) : L.featureGroup(markers)).addTo(map);
    return { points, bounds, isShown: () => true };
  }

  const groups = new Map(groupNames.map(name => [name, L.layerGroup()]));
  points.forEach(p => groups.get(p.group).addLayer(p.marker));

  if (cluster) {
    const clusterSupport = L.markerClusterGroup.layerSupport().addTo(map);
    clusterSupport.checkIn([...groups.values()]);
  }
  groups.forEach(layer => layer.addTo(map));

  const position = s.position('Point Legend Position');
  if (position) {
    const overlays = {};
    groups.forEach((layer, name) => {
      const first = points.find(p => p.group === name).row;
      overlays[`${legendIcon(first)} ${escapeHtml(name)}`] = layer;
    });
    const legend = L.control.layers(null, overlays, { collapsed: false, position }).addTo(map);
    makeLadder(legend.getContainer(), s.get('Point Legend Title'), s.get('Point Legend Icon'), 'points-legend');
  }

  return { points, bounds, isShown: p => map.hasLayer(groups.get(p.group)) };
}
