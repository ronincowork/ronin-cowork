/* part of the ronin-cowork client — see js/README.md */
import { request } from './request.js';
import { toast } from './ui.js';
import { t } from './lexicon.js';

const LIMIT = 25 * 1024 * 1024;

/** Hand one file to this tile's Agent: it lands in the session's drop/, the Docs tab lists
 * it, and the server types its path into the Agent's input without pressing Enter. */
export async function sendFile(tile, file) {
  const session = tile.session;
  if (!session || !file) return;
  if (file.size > LIMIT) {
    toast(t('drop.too_big', '{name} is over the 25 MB limit.', { name: file.name || 'File' }), false);
    return;
  }
  // A pasted screenshot arrives as "image.png"; the server stamps every name with the time.
  const name = file.name || `pasted.${(file.type.split('/')[1] || 'bin').replace(/[^a-z0-9]/gi, '')}`;
  toast(t('drop.sending', 'Sending {name}…', { name }));
  const r = await request(`/api/sessions/${encodeURIComponent(session)}/drop?name=${encodeURIComponent(name)}`, {
    method: 'POST',
    headers: { 'content-type': file.type || 'application/octet-stream' },
    text: file,
  });
  if (!r.ok) { toast(t('drop.failed', 'Could not send {name}: {reason}', { name, reason: r.message }), false); return; }
  toast(r.data.typed
    ? t('drop.typed', 'Saved {name}; its path is in the input, add your prompt.', { name })
    : t('drop.not_typed', 'Saved to {path}; not typed into the input ({reason}).', { path: r.data.path, reason: r.data.reason || '' }));
}

/** The paperclip: the system picker (Finder; the photo library on a phone). */
export function pickFile(tile) {
  const input = Object.assign(document.createElement('input'), { type: 'file', multiple: true });
  input.addEventListener('change', () => { for (const f of input.files || []) void sendFile(tile, f); });
  input.click();
}

/** Drag a file onto the tile, or paste one on it. Text drops and text pastes are untouched. */
export function installFileDrops(tile) {
  const el = tile.el;
  const carriesFiles = (e) => !!tile.session && [...(e.dataTransfer?.types || [])].includes('Files');
  const clear = () => { delete tile.body.dataset.dropText; };
  el.addEventListener('dragover', (e) => {
    if (!carriesFiles(e)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    tile.body.dataset.dropText = 'true';
  });
  el.addEventListener('dragleave', (e) => { if (!el.contains(e.relatedTarget)) clear(); });
  el.addEventListener('drop', (e) => {
    if (!carriesFiles(e)) return;
    e.preventDefault();
    e.stopPropagation(); // the cell's own drop (a session card) must not see this
    clear();
    for (const f of e.dataTransfer.files) void sendFile(tile, f);
  });
  // Capture, so xterm and the composer never type a file's name or nothing at all.
  el.addEventListener('paste', (e) => {
    const files = [...(e.clipboardData?.files || [])];
    if (!files.length || !tile.session) return;
    if (e.target instanceof Element && e.target.closest('.tile-doc-view')) return;
    e.preventDefault();
    e.stopPropagation();
    for (const f of files) void sendFile(tile, f);
  }, true);
}
