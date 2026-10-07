/* part of the ronin-cowork client — see js/README.md */
/**
 * READING — a tenant's collection reading, raw, in its place. Rollout rule step 2 (samurai_lab
 * UI_STRUCTURE.md): put the surface in its place raw if need be; the formatting comes after.
 * Board and Workspace open with it until their rows are built, one card per hand-in. The
 * reading arrives by push through the one seam (collection-reading.js).
 */
import { WorkspaceKit } from './workspace-kit.js';
import { readingKey, subscribeCollection } from './collection-reading.js';

export const READING_TYPE = 'tenant.reading';

/** `filter()` is read at each show, so one surface follows its tenant's param. */
export function createReadingSurface({ label, filter, onRead = () => {} }) {
  const { createSurface } = WorkspaceKit.primitives;
  const surface = createSurface({ label });
  const pre = document.createElement('pre');
  pre.className = 'cv-pre';
  surface.content.append(pre);
  let stop = null;
  let heard = ''; // the key subscribed to, so a changed param resubscribes and the same one does not
  const listen = () => {
    const wanted = filter();
    const key = readingKey('collection', wanted);
    if (stop && key === heard) return;
    stop?.();
    heard = key;
    stop = subscribeCollection(wanted, (reading) => {
      pre.textContent = JSON.stringify(reading, null, 2);
      onRead(reading || {});
    });
  };
  const quiet = () => { stop?.(); stop = null; heard = ''; };
  return {
    el: surface.el,
    show: listen,
    leave: quiet,
    destroy: quiet,
  };
}
