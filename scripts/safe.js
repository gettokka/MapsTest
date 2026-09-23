/* global DOMPurify */

// Links that open in a new tab must not get access to window.opener.
DOMPurify.addHook('afterSanitizeAttributes', node => {
  if (node.tagName === 'A' && node.getAttribute('target') === '_blank') {
    node.setAttribute('rel', 'noopener noreferrer');
  }
});

/**
 * Sheet cells may contain simple HTML (links, <br>, <b>, images).
 * Everything that could execute script is stripped.
 */
export function sanitize(html) {
  return DOMPurify.sanitize(String(html ?? ''), { ADD_ATTR: ['target'] });
}

export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

/** Returns an absolute http(s)/mailto URL, or null for anything else (e.g. javascript:). */
export function safeUrl(url) {
  if (!url) return null;
  try {
    const u = new URL(url, location.href);
    return ['http:', 'https:', 'mailto:'].includes(u.protocol) ? u.href : null;
  } catch {
    return null;
  }
}

export function isColor(value) {
  return Boolean(value) && CSS.supports('color', value);
}

/** Font Awesome class for an icon name like "fa-bicycle" or "bicycle"; null if invalid. */
export function faClass(name) {
  const icon = String(name ?? '').trim().replace(/^fa-/, '');
  return /^[a-z0-9-]+$/.test(icon) ? `fa fa-${icon}` : null;
}

export function debounce(fn, ms) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}

/** Parses "41.76" / "41,76" pairs into a LatLng, or null if not a valid coordinate. */
export function parseLatLng(lat, lon) {
  const la = parseFloat(String(lat ?? '').replace(',', '.'));
  const lo = parseFloat(String(lon ?? '').replace(',', '.'));
  const valid = Number.isFinite(la) && Number.isFinite(lo) &&
    Math.abs(la) <= 90 && Math.abs(lo) <= 180;
  return valid ? L.latLng(la, lo) : null;
}
