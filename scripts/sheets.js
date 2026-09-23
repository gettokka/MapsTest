/* global Papa */
import { notify } from './ui.js';

const TIMEOUT_MS = 15000;
const MAX_POLYGON_SHEETS = 20;
const POSITIONS = ['topleft', 'topright', 'bottomleft', 'bottomright'];

export async function fetchWithTimeout(url, options = {}, ms = TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
    return res;
  } catch (err) {
    if (err.name === 'AbortError') throw new Error(`timeout after ${ms / 1000}s for ${url}`);
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchJson(url) {
  return (await fetchWithTimeout(url)).json();
}

/** Key/value settings from an "Options" or "Polygons" tab (columns "Setting" and "Customize"). */
export class Settings {
  constructor(rows) {
    this.values = new Map(rows.filter(r => r.Setting).map(r => [r.Setting, r.Customize ?? '']));
  }

  has(name) {
    return this.values.has(name);
  }

  get(name, fallback = '') {
    return this.values.get(name) || fallback;
  }

  num(name, fallback) {
    const n = parseFloat(this.get(name));
    return Number.isFinite(n) ? n : fallback;
  }

  on(name) {
    return this.get(name).toLowerCase() === 'on';
  }

  /** A valid Leaflet control position, or null if the setting is "off" or invalid. */
  position(name) {
    const value = this.get(name);
    return POSITIONS.includes(value) ? value : null;
  }
}

function parseCsv(text) {
  return Papa.parse(text, {
    header: true,
    skipEmptyLines: 'greedy',
    transformHeader: h => h.trim(),
    transform: v => v.trim(),
  }).data;
}

/**
 * Local CSV files (csv/<Tab>.csv) take precedence, which allows running
 * the map without Google. Otherwise the tabs are read from the Google Sheet
 * via its CSV export; the sheet must be shared as "Anyone with the link".
 */
async function createSource(docUrl) {
  const local = await fetch('csv/Options.csv', { method: 'HEAD' })
    .then(res => res.ok, () => false);

  if (local) {
    return async tab => {
      const res = await fetch(`csv/${tab}.csv`);
      return res.ok ? parseCsv(await res.text()) : null;
    };
  }

  const id = String(docUrl ?? '').match(/\/spreadsheets\/d\/([\w-]+)/)?.[1];
  if (!id) throw new Error('googleDocURL in google-doc-url.js is not a Google Sheets link');

  return async tab => {
    const url = `https://docs.google.com/spreadsheets/d/${id}/gviz/tq` +
      `?tqx=out:csv&headers=1&sheet=${encodeURIComponent(tab)}`;
    const res = await fetchWithTimeout(url);
    if (!res.headers.get('content-type')?.includes('text/csv')) {
      throw new Error('Google Sheet is not accessible. Share it as "Anyone with the link can view".');
    }
    return parseCsv(await res.text());
  };
}

// Google returns the first tab for tab names that do not exist,
// so every tab is validated by the columns/settings it must contain.
const hasColumns = (rows, ...cols) => rows?.length > 0 && cols.every(c => c in rows[0]);

export async function loadData(docUrl) {
  const load = await createSource(docUrl);

  const optional = (tab, ...cols) => load(tab).then(
    rows => (hasColumns(rows, ...cols) ? rows : []),
    err => { notify(`Tab "${tab}" could not be loaded: ${err.message}`); return []; },
  );

  const [options, points, polylines] = await Promise.all([
    load('Options'),
    optional('Points', 'Latitude', 'Longitude'),
    optional('Polylines', 'GeoJSON URL'),
  ]);
  if (!hasColumns(options, 'Setting', 'Customize')) {
    throw new Error('tab "Options" is missing or has no "Setting"/"Customize" columns');
  }

  // Polygon tabs are named Polygons, Polygons1, Polygons2, ...
  const polygons = [];
  for (let i = 0; i < MAX_POLYGON_SHEETS; i++) {
    const tab = i === 0 ? 'Polygons' : `Polygons${i}`;
    const rows = await optional(tab, 'Setting', 'Customize');
    const settings = new Settings(rows);
    if (!settings.get('Polygon GeoJSON URL')) break;
    polygons.push(settings);
  }

  return { options: new Settings(options), points, polylines, polygons };
}
