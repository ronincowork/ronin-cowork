/* part of the ronin-cowork client — see js/README.md */
export const SESSION_DRAG = 'text/x-ronin-session';
/** A doc dragged off the ▧ Docs list: its short reference (`dir/name`), for a composer. */
export const DOC_MIME = 'text/x-ronin-doc';

/** Let `node` accept a dragged session; `seatOf()` names the workspace it stands for and
 *  `onDrop(name, id)` is what a landing means (team-view.js arranges it). */
export function acceptDrops(node, seatOf, onDrop) {
  node.addEventListener('dragover', (event) => {
    if (![...event.dataTransfer.types].includes(SESSION_DRAG)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    node.dataset.dropReady = 'true';
  });
  node.addEventListener('dragleave', () => { delete node.dataset.dropReady; });
  node.addEventListener('drop', (event) => {
    delete node.dataset.dropReady;
    const name = event.dataTransfer.getData(SESSION_DRAG);
    const id = seatOf();
    if (!name || !id) return;
    event.preventDefault();
    onDrop(name, id);
  });
}
