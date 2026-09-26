/* Versioned content boundary for the reusable garden canvas. */
const GARDEN_CANVAS_VERSION = 2;
export const GARDEN_REGION_KEYS = Object.freeze(['question', 'cta', 'copy', 'media']);

const text = (value) => typeof value === 'string' ? value.trim() : '';
const enabled = (value) => value && typeof value === 'object' && value.enabled !== false;
const safeAction = (value) => /^[a-z][a-z0-9.-]*$/.test(text(value)) ? text(value) : '';
const safeSource = (value) => {
  const source = text(value);
  if (!source || /^(?:javascript|data):/i.test(source)) return '';
  return source;
};

const normalizeQuestion = (value) => {
  if (!enabled(value) || !text(value.prompt)) return null;
  const kind = ['text', 'textarea'].includes(value.kind) ? value.kind : 'text';
  return Object.freeze({ prompt: text(value.prompt), kind, placeholder: text(value.placeholder), name: text(value.name) || 'answer' });
};

const normalizeCta = (value) => {
  const action = enabled(value) ? safeAction(value.action) : '';
  const label = enabled(value) ? text(value.label) : '';
  return action && label ? Object.freeze({ action, label }) : null;
};

const isoInstant = (value) => {
  const candidate = text(value);
  return candidate && /(?:Z|[+-]\d\d:\d\d)$/.test(candidate) && Number.isFinite(Date.parse(candidate)) ? candidate : '';
};

const normalizeCopy = (value, now) => {
  if (!Array.isArray(value)) return null;
  const items = value.flatMap((item, index) => {
    if (!enabled(item) || !text(item.id)) return [];
    const kind = text(item.kind);
    const body = text(item.body);
    if (kind === 'title') {
      if (index !== 0) return [];
      const copy = { id: text(item.id), kind, eyebrow: text(item.eyebrow), heading: text(item.heading), body };
      return copy.eyebrow || copy.heading || copy.body ? [Object.freeze(copy)] : [];
    }
    if (kind === 'instruction' || kind === 'note') {
      return body ? [Object.freeze({ id: text(item.id), kind, body, stamp: text(item.stamp) })] : [];
    }
    if (kind !== 'response' || !body) return [];
    const at = isoInstant(item.at);
    const expires_at = item.expires_at == null ? '' : isoInstant(item.expires_at);
    if (!at || (item.expires_at != null && !expires_at) || (expires_at && (Date.parse(expires_at) <= Date.parse(at) || Date.parse(expires_at) <= now))) return [];
    return [Object.freeze({ id: text(item.id), kind, body, at, expires_at })];
  });
  return items.length ? Object.freeze(items) : null;
};

const normalizeMedia = (value) => {
  const rows = Array.isArray(value) ? value : enabled(value) && Array.isArray(value.items) ? value.items : [];
  const items = rows.flatMap((item) => {
    const kind = enabled(item) && ['doc', 'url', 'video'].includes(item.kind) ? item.kind : '';
    const src = kind === 'doc' ? '' : safeSource(item.src);
    const root = kind === 'doc' ? text(item.root) : '';
    const path = kind === 'doc' ? text(item.path) : '';
    if (!text(item.id) || !kind || !text(item.label) || (kind === 'doc' ? !path : !src)) return [];
    return [Object.freeze({ id: text(item.id), kind, src, root, path, label: text(item.label), description: text(item.description), stamp: text(item.stamp) })];
  });
  return items.length ? Object.freeze(items) : null;
};

export function normalizeGardenCanvasCatalog(value, now = Date.now()) {
  if (!value || value.schema_version !== GARDEN_CANVAS_VERSION || !value.canvases || typeof value.canvases !== 'object') {
    throw new Error(`garden canvas content must use version ${GARDEN_CANVAS_VERSION}`);
  }
  const canvases = {};
  for (const [canvasId, raw] of Object.entries(value.canvases)) {
    if (!canvasId || !raw || typeof raw !== 'object') continue;
    canvases[canvasId] = Object.freeze({
      id: canvasId,
      question: normalizeQuestion(raw.question),
      cta: normalizeCta(raw.cta),
      copy: normalizeCopy(raw.copy, now),
      media: normalizeMedia(raw.media),
    });
  }
  return Object.freeze({ schema_version: GARDEN_CANVAS_VERSION, canvases: Object.freeze(canvases) });
}
