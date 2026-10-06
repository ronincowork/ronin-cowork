/* part of the ronin-cowork client — see js/README.md */
/**
 * READING — a tenant's collection reading, raw, in its place. Rollout rule step 2 (samurai_lab
 * UI_STRUCTURE.md): put the surface in its place raw if need be; the formatting comes after.
 * Board and Workspace open with it until their rows are built, one card per hand-in. The
 * reading comes through the one seam (collection-reading.js); w12 makes it a store want.
 */
import { WorkspaceKit } from './workspace-kit.js';
import { readCollection } from './collection-reading.js';

export const READING_TYPE = 'tenant.reading';

/** `filter()` is read at each show, so one surface follows its tenant's param. */
export function createReadingSurface({ label, filter, onRead = () => {} }) {
  const { createSurface } = WorkspaceKit.primitives;
  const surface = createSurface({ label });
  const pre = document.createElement('pre');
  pre.className = 'cv-pre';
  surface.content.append(pre);
  let reading = null;
  const read = () => {
    reading?.abort();
    const controller = new AbortController();
    reading = controller;
    void readCollection(filter(), { signal: controller.signal }).then((result) => {
      if (controller.signal.aborted) return;
      if (!result.ok) { surface.setState('failed', result.message || ''); return; }
      surface.setState();
      pre.textContent = JSON.stringify(result.data, null, 2);
      onRead(result.data || {});
    });
  };
  return {
    el: surface.el,
    show: read,
    leave: () => reading?.abort(),
    destroy: () => reading?.abort(),
  };
}
