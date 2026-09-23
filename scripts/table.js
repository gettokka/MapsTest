import { sanitize, escapeHtml, isColor, debounce } from './safe.js';

const compare = (a, b) => {
  const x = parseFloat(a);
  const y = parseFloat(b);
  return Number.isFinite(x) && Number.isFinite(y)
    ? x - y
    : String(a ?? '').localeCompare(String(b ?? ''), undefined, { numeric: true });
};

/**
 * Shows a sortable table below the map listing the points that are
 * currently visible (inside the map view and in an active group).
 */
export function addTable(map, { points, isShown }, s) {
  const columns = s.get('Table Columns').split(',').map(c => c.trim()).filter(Boolean);
  if (!s.on('Display Table') || !columns.length || !points.length) return;

  let height = s.num('Table Height', 40);
  if (height < 10 || height > 90) height = 40;

  map.getContainer().style.height = `${100 - height}vh`;
  map.invalidateSize();

  const wrapper = document.getElementById('maptable');
  wrapper.style.height = `${height}vh`;
  wrapper.hidden = false;
  wrapper.innerHTML =
    '<table><thead><tr>' +
    columns.map((c, i) => `<th><button type="button" data-col="${i}">${escapeHtml(c)}</button></th>`).join('') +
    '</tr></thead><tbody></tbody></table>';

  const [background, text] = s.get('Table Header Color').split(',').map(c => c.trim());
  const thead = wrapper.querySelector('thead');
  if (isColor(background)) thead.style.setProperty('--table-header-bg', background);
  if (isColor(text)) thead.style.setProperty('--table-header-fg', text);

  const tbody = wrapper.querySelector('tbody');
  let sortColumn = null;
  let ascending = true;

  function render() {
    const view = map.getBounds();
    const rows = points
      .filter(p => isShown(p) && view.contains(p.latlng))
      .map(p => p.row);

    if (sortColumn !== null) {
      const key = columns[sortColumn];
      rows.sort((a, b) => (ascending ? 1 : -1) * compare(a[key], b[key]));
    }

    tbody.innerHTML = rows.length
      ? rows.map(r => `<tr>${columns.map(c => `<td>${sanitize(r[c])}</td>`).join('')}</tr>`).join('')
      : `<tr><td colspan="${columns.length}" class="empty">No points in the current map view</td></tr>`;
  }

  thead.addEventListener('click', e => {
    const button = e.target.closest('button[data-col]');
    if (!button) return;
    const col = Number(button.dataset.col);
    ascending = sortColumn === col ? !ascending : true;
    sortColumn = col;
    thead.querySelectorAll('th').forEach((th, i) => {
      th.removeAttribute('aria-sort');
      if (i === col) th.setAttribute('aria-sort', ascending ? 'ascending' : 'descending');
    });
    render();
  });

  // overlayadd/overlayremove fire once per legend toggle, unlike layeradd
  // which fires for every single marker when clusters open or close.
  map.on('moveend overlayadd overlayremove', debounce(render, 150));
  render();
}
