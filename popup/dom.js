// DOM and SVG utility helpers for Open in App Popup (XSS Safe)

/**
 * Safe DOM Helper: Clears all child nodes without innerHTML
 * @param {HTMLElement} el
 */
export function clearElement(el) {
  if (!el) return;
  while (el.firstChild) {
    el.removeChild(el.firstChild);
  }
}

/**
 * Safe DOM Helper: Displays text state placeholder
 * @param {HTMLElement} container
 * @param {string} text
 * @param {string} className
 */
export function showPlaceholder(container, text, className = 'empty-state') {
  clearElement(container);
  const div = document.createElement('div');
  div.className = className;
  div.textContent = text;
  container.appendChild(div);
}

/**
 * Safe DOM Helper: Creates SVG Popout icon
 * @returns {SVGElement}
 */
export function createPopoutSvgIcon() {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', '13');
  svg.setAttribute('height', '13');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');

  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', 'M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6');

  const polyline = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
  polyline.setAttribute('points', '15 3 21 3 21 9');

  const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
  line.setAttribute('x1', '10');
  line.setAttribute('y1', '14');
  line.setAttribute('x2', '21');
  line.setAttribute('y2', '3');

  svg.appendChild(path);
  svg.appendChild(polyline);
  svg.appendChild(line);
  return svg;
}

/**
 * Safe DOM Helper: Creates SVG Chevron icon for accordion
 * @returns {SVGElement}
 */
export function createChevronSvgIcon() {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', '14');
  svg.setAttribute('height', '14');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.classList.add('chevron-icon');

  const polyline = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
  polyline.setAttribute('points', '6 9 12 15 18 9');
  svg.appendChild(polyline);
  return svg;
}

/**
 * Safe DOM Helper: Creates SVG Delete/Trash icon
 * @returns {SVGElement}
 */
export function createTrashSvgIcon() {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', '13');
  svg.setAttribute('height', '13');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');

  const polyline = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
  polyline.setAttribute('points', '3 6 5 6 21 6');

  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', 'M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2');

  svg.appendChild(polyline);
  svg.appendChild(path);
  return svg;
}

/**
 * Status message display helper
 * @param {HTMLElement} statusEl
 * @param {string} text
 * @param {boolean} [isError=false]
 */
export function setStatus(statusEl, text, isError = false) {
  if (!statusEl) return;
  statusEl.textContent = text;
  statusEl.style.color = isError ? 'var(--danger)' : 'var(--text-muted)';
}
