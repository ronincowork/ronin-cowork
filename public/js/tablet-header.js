/* part of the ronin-cowork client — see js/README.md */

const TABLET = '(pointer: coarse) and (min-width: 681px)';
const TOOL_SELECTOR = '.work-record, .transcript-toggle, select.output, .tdocs-btn';

/** One header for the wide touch workbench; desktop and phone keep their own chrome. */
export function installTabletHeader() {
  const agents = document.getElementById('tabletagents');
  const agentsRight = document.getElementById('tabletagentsright');
  const tools = document.getElementById('tablettools');
  if (!agents || !agentsRight || !tools) return;
  const media = window.matchMedia(TABLET);
  let parked = [];
  let queued = false;
  let observer = null;

  const restore = () => {
    for (const { node, marker } of parked) {
      if (marker.parentNode) marker.replaceWith(node);
      else node.remove();
    }
    parked = [];
    tools.replaceChildren();
  };
  const visibleTiles = () => [...document.querySelectorAll('.wk-workbench-host .tile')]
    .filter((tile) => tile.getClientRects().length && tile.querySelector('.sess')?.textContent.trim());
  const render = () => {
    queued = false;
    restore();
    const kind = document.documentElement.dataset.workbench || '';
    const tiles = media.matches && ['team', 'cowork'].includes(kind) ? visibleTiles() : [];
    agents.hidden = !tiles.length;
    agentsRight.hidden = !tiles.length;
    tools.hidden = !tiles.length;
    agents.replaceChildren();
    agentsRight.replaceChildren();
    if (!tiles.length) { observer?.takeRecords(); return; }

    const selected = tiles.find((tile) => tile.classList.contains('active')) || tiles[0];
    selected.classList.add('active');
    for (const [index, tile] of tiles.entries()) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'tablet-agent';
      button.textContent = tile.querySelector('.sess')?.textContent.trim() || 'Agent';
      button.setAttribute('aria-pressed', String(tile === selected));
      button.addEventListener('click', () => {
        tile.querySelector('.tile-body')?.dispatchEvent(new Event('pointerdown', { bubbles: true }));
        schedule();
      });
      (index < Math.ceil(tiles.length / 2) ? agents : agentsRight).append(button);
    }

    for (const node of selected.querySelectorAll(`.tile-head > ${TOOL_SELECTOR}`)) {
      if (node.hidden) continue;
      const nodes = node.classList.contains('tdocs-btn') && node.nextElementSibling?.classList.contains('tdocs')
        ? [node, node.nextElementSibling] : [node];
      for (const item of nodes) {
        const marker = document.createComment('tablet-control');
        item.before(marker);
        parked.push({ node: item, marker });
        tools.append(item);
      }
    }
    // Moving the selected controls is this adapter's own projection, not new state.
    // Drop those mutation records so they cannot schedule an endless repaint loop.
    observer?.takeRecords();
  };
  const schedule = () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(render);
  };
  observer = new MutationObserver(schedule);
  observer.observe(document.getElementById('viewhost') || document.body, {
    subtree: true, childList: true, characterData: true,
    attributes: true, attributeFilter: ['class', 'hidden'],
  });
  media.addEventListener?.('change', schedule);
  window.addEventListener('resize', schedule);
  schedule();
}
