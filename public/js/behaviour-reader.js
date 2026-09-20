/* part of the ronin-cowork client — the shared bridge from ERABI's read glyph to a Workbench document */
const BESIDE = Object.freeze({ workspace1: 'workspace2', workspace2: 'workspace1', workspace3: 'workspace4', workspace4: 'workspace3' });

export function installBehaviourReader(bench, type = 'document', editType = 'campaign.behaviours') {
  const read = (event) => {
    const path = String(event.detail?.path || '');
    const source = event.detail?.source;
    if (!path || !(source instanceof Node) || !bench.host.contains(source)) return;
    const workspace = source.closest('[data-workspace]')?.dataset.workspace || bench.selected();
    bench.place(type, BESIDE[workspace] || 'workspace2', { key: path, path });
  };
  window.addEventListener('ronin:read-document', read);
  const edit = (event) => {
    const name = String(event.detail?.name || '');
    const scope = String(event.detail?.scope || '');
    const source = event.detail?.source;
    if (!name || !scope || !(source instanceof Node) || !bench.host.contains(source)) return;
    const workspace = source.closest('[data-workspace]')?.dataset.workspace || bench.selected();
    bench.place(editType, BESIDE[workspace] || 'workspace2', { name, scope });
  };
  window.addEventListener('ronin:edit-behaviour', edit);
  return () => { window.removeEventListener('ronin:read-document', read); window.removeEventListener('ronin:edit-behaviour', edit); };
}
