import { sanitize, faClass } from './safe.js';

const NOTICE_MS = 15000;

/** Shows a non-fatal problem (e.g. one GeoJSON file failed) without stopping the map. */
export function notify(message) {
  console.warn(message);
  const item = document.createElement('div');
  item.className = 'notice';
  item.textContent = message;
  const close = document.createElement('button');
  close.type = 'button';
  close.setAttribute('aria-label', 'Dismiss');
  close.textContent = '×';
  close.addEventListener('click', () => item.remove());
  item.append(close);
  document.getElementById('notices').append(item);
  setTimeout(() => item.remove(), NOTICE_MS);
}

/** Replaces the loading spinner with an error message. */
export function fail(message) {
  document.querySelector('.loader').hidden = true;
  const box = document.getElementById('load-error');
  box.textContent = `The map could not be loaded: ${message}`;
  box.hidden = false;
}

export function showMap() {
  document.querySelector('.loader').hidden = true;
  document.getElementById('map').style.visibility = 'visible';
}

/** Turns a legend control container into a collapsible "ladder" with a title bar. */
export function makeLadder(container, title, icon, id) {
  if (id) container.id = id;
  container.classList.add('ladder');

  const header = document.createElement('h6');
  header.className = 'pointer minimize';
  const iconClass = faClass(icon);
  header.innerHTML =
    (iconClass ? `<span class="legend-icon"><i class="${iconClass}"></i></span>` : '') +
    sanitize(title) +
    '<span class="legend-arrow"><i class="fa-solid fa-chevron-down"></i></span>';
  container.prepend(header);
}

/** Accordion behaviour: only one legend is expanded at a time, the first one on start. */
export function initLadders(map) {
  const headers = [...map.getContainer().querySelectorAll('.ladder > h6')];
  const open = target => headers.forEach(h => h.classList.toggle('minimize', h !== target));

  headers.forEach(h => h.addEventListener('click', () => {
    open(h.classList.contains('minimize') ? h : null);
  }));
  if (headers.length) open(headers[0]);
}

/** Creates a Leaflet control from a DOM element that does not leak clicks/scrolls to the map. */
export function domControl(element, position) {
  const Control = L.Control.extend({
    onAdd() {
      L.DomEvent.disableClickPropagation(element);
      L.DomEvent.disableScrollPropagation(element);
      return element;
    },
  });
  return new Control({ position });
}
