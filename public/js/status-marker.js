/* A small reusable maturity marker for cards, buttons, and headings. */
const STATUS_MARKERS = Object.freeze({
  beta: 'Beta',
  comingSoon: 'Coming soon',
});

export function createStatusMarker(kind) {
  const label = STATUS_MARKERS[kind];
  if (!label) return null;
  const marker = document.createElement('span');
  marker.className = 'status-marker';
  marker.dataset.status = kind;
  marker.textContent = label;
  return marker;
}
