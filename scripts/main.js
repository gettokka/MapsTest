import { loadData } from './sheets.js';
import { sanitize, escapeHtml, safeUrl, parseLatLng } from './safe.js';
import { notify, fail, showMap, initLadders, domControl } from './ui.js';
import { addPoints } from './points.js';
import { addTable } from './table.js';
import { addPolylines } from './polylines.js';
import { addPolygons } from './polygons.js';

// Set in google-doc-url.js (not needed when local csv/ files are used)
const docUrl = window.googleDocURL;

// Default center is overridden by the sheet options and the points
const map = L.map('map', {
  attributionControl: false,
  zoomControl: false,
  scrollWheelZoom: false,
}).setView([41.76, -72.69], 11);

// Providers name their key option differently
const KEY_OPTIONS = ['apikey', 'apiKey', 'accessToken', 'key'];

function addBaseMap(s) {
  const name = s.get('Basemap Tiles', 'OpenStreetMap.Mapnik');
  const key = s.get('Basemap Tiles API Key');
  const keyOptions = key ? Object.fromEntries(KEY_OPTIONS.map(k => [k, key])) : {};

  let layer;
  try {
    layer = L.tileLayer.provider(name, keyOptions);
  } catch {
    notify(`Unknown basemap "${name}", using OpenStreetMap instead.`);
  }
  // e.g. CARTO requires a key since 2026; leaflet-providers leaves a placeholder
  if (layer && KEY_OPTIONS.some(k => String(layer.options[k] ?? '').startsWith('<insert'))) {
    notify(`Basemap "${name}" requires an API key ("Basemap Tiles API Key"), using OpenStreetMap instead.`);
    layer = null;
  }
  (layer ?? L.tileLayer.provider('OpenStreetMap.Mapnik')).addTo(map);
}

/** Uses the initial center/zoom from the sheet, otherwise fits all points. */
function centerAndZoom(s, bounds) {
  const center = parseLatLng(s.get('Initial Center Latitude'), s.get('Initial Center Longitude'));
  const zoom = parseInt(s.get('Initial Zoom'), 10);
  const hasZoom = zoom >= 0 && zoom <= 20;

  if (center) {
    map.setView(center, hasZoom ? zoom : bounds ? map.getBoundsZoom(bounds) : map.getZoom());
  } else if (bounds) {
    if (hasZoom) map.setView(bounds.getCenter(), zoom);
    else map.fitBounds(bounds, { padding: [30, 30], maxZoom: 15 });
  } else if (hasZoom) {
    map.setZoom(zoom);
  }
}

function addTitle(s, home) {
  const display = s.get('Display Title');
  if (display !== 'topleft' && display !== 'topcenter') return;

  const title = L.DomUtil.create('div', 'map-title leaflet-bar leaflet-control leaflet-control-custom');
  title.innerHTML = `<h3 class="pointer" title="Reset map view">${sanitize(s.get('Map Title'))}</h3>` +
    `<h5>${sanitize(s.get('Map Subtitle'))}</h5>`;
  title.querySelector('h3').addEventListener('click', () => map.setView(home.center, home.zoom));

  if (display === 'topleft') {
    domControl(title, 'topleft').addTo(map);
  } else {
    const center = L.DomUtil.create('div', 'div-center', map.getContainer());
    center.append(title);
    L.DomEvent.disableClickPropagation(title);
  }
}

function addSearch(s) {
  const position = s.position('Search Button');
  if (!position) return;

  // Nominatim results are limited to the current map view
  const queryParams = { bounded: 1 };
  const zoom = s.num('Search Results Zoom Level', null);
  const geocoder = L.Control.geocoder({
    position,
    expand: 'click',
    defaultMarkGeocode: zoom === null,
    geocoder: L.Control.Geocoder.nominatim({ geocodingQueryParams: queryParams }),
  }).addTo(map);

  if (zoom !== null) geocoder.on('markgeocode', e => map.setView(e.geocode.center, zoom));

  const updateViewbox = () => { queryParams.viewbox = map.getBounds().toBBoxString(); };
  map.on('moveend', updateViewbox);
  updateViewbox();
}

function addControls(s) {
  addSearch(s);

  const locate = s.position('Show My Location');
  if (locate) {
    L.control.locate({ position: locate, keepCurrentZoomLevel: true, returnToPrevBounds: true }).addTo(map);
  }

  const zoom = s.position('Zoom Controls');
  if (zoom) L.control.zoom({ position: zoom }).addTo(map);
}

/** Credits: "View data by <author> | View code by <credit> with Leaflet" */
function addAttribution(s) {
  const dataUrl = safeUrl(docUrl);
  const name = sanitize(s.get('Author Name'));
  let authorUrl = s.get('Author Email or Website');
  if (authorUrl.includes('@') && !authorUrl.includes(':')) authorUrl = `mailto:${authorUrl}`;
  authorUrl = safeUrl(authorUrl);
  const repoUrl = safeUrl(s.get('Author Code Repo'));
  const codeCredit = sanitize(s.get('Author Code Credit'));
  const link = (url, text) => (url ? `<a href="${escapeHtml(url)}" target="_blank" rel="noopener">${text}</a>` : text);

  let credit = `View ${link(dataUrl, 'data')}`;
  if (name) credit += ` by ${link(authorUrl, name)}`;
  credit += ` | View ${link(repoUrl, 'code')}`;
  if (codeCredit) credit += ` by ${codeCredit}`;
  credit += ' with <a href="https://leafletjs.com" target="_blank" rel="noopener">Leaflet</a>';

  const position = s.position('Credits and Attribution') ?? 'bottomright';
  L.control.attribution({ position, prefix: credit }).addTo(map);
}

function showIntroPopup(s) {
  const text = sanitize(s.get('Intro Popup Text'));
  if (!text) return;

  if (window.matchMedia('(max-width: 760px)').matches) {
    const popup = document.createElement('div');
    popup.id = 'mobile-intro-popup';
    popup.innerHTML = `<p>${text}</p><button type="button" id="mobile-intro-popup-close" aria-label="Close">` +
      '<i class="fa-solid fa-xmark"></i></button>';
    popup.querySelector('button').addEventListener('click', () => popup.remove());
    document.body.append(popup);
  } else {
    L.popup({ className: 'intro-popup' }).setLatLng(map.getCenter()).setContent(text).openOn(map);
  }
}

async function init() {
  const data = await loadData(docUrl);
  const s = data.options;

  document.title = s.get('Map Title', 'Map');
  addAttribution(s);
  addBaseMap(s);

  // Title first, so it sits above all other top-left controls
  const home = {};
  addTitle(s, home);

  const points = addPoints(map, data.points, s);
  addTable(map, points, s);
  centerAndZoom(s, points.bounds);
  home.center = map.getCenter();
  home.zoom = map.getZoom();

  addControls(s);
  await Promise.all([
    addPolylines(map, data.polylines, s),
    addPolygons(map, data.polygons),
  ]);

  initLadders(map);
  showMap();
  showIntroPopup(s);
}

init().catch(err => {
  console.error(err);
  fail(err.message);
});
