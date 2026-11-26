/* part of the ronin-cowork client — see js/README.md */
/**
 * THE TABLE PATTERN (owner, 26 Nov 2026): the table on Setup's Hermes bar, made the one look for a list of
 * things. A muted heading row; one row per thing, its first cell the name in strong type; its presses as
 * links on the right; then optional `+ …` lines (a press) or a quiet note. A cell may be a node (a ✓ before a
 * name); a row marked `off` reads muted. Styles: .hermes-table in style.css.
 *
 *   createTable({ headings: ['Name', 'Model'],
 *     rows: [{ cells: ['Kimi', 'moonshotai/kimi-k3'], tools: [['Edit', fn], ['Remove', fn]] }],
 *     lines: [['+ Add a model', fn], ['No model options yet.', null]] })
 */
function make(tag, cls, text) {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text != null) node.textContent = String(text);
  return node;
}

/** A press drawn as a link, the table's only kind of button. */
export function tableLink(label, fn) {
  const node = make('button', 'hermes-add-line data-table-link', label);
  node.type = 'button';
  node.addEventListener('click', () => { if (!node.disabled) fn(); });
  return node;
}

export function createTable({ headings = [], rows = [], lines = [] } = {}) {
  const tools = rows.some((row) => row.tools?.length);
  const table = make('table', 'hermes-table data-table');
  const head = make('tr');
  for (const h of headings) head.append(make('th', null, h));
  if (tools) head.append(make('th', 'hermes-tools'));
  const thead = make('thead'); thead.append(head);
  const body = make('tbody');
  for (const row of rows) {
    const tr = make('tr', row.off ? 'data-table-off' : null);
    row.cells.forEach((cell, i) => {
      const node = make(i === 0 ? 'th' : 'td', null, cell instanceof Node ? null : cell);
      if (cell instanceof Node) node.append(cell);
      tr.append(node);
    });
    if (tools) {
      const cell = make('td', 'hermes-tools');
      for (const [label, fn] of row.tools || []) cell.append(tableLink(label, fn));
      tr.append(cell);
    }
    body.append(tr);
  }
  for (const [label, fn] of lines) {
    const tr = make('tr', 'hermes-add'); const cell = make('td'); cell.colSpan = headings.length + (tools ? 1 : 0);
    cell.append(fn ? tableLink(label, fn) : make('span', 'hermes-add-note', label));
    tr.append(cell); body.append(tr);
  }
  table.append(thead, body);
  return table;
}
