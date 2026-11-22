/*
 * LINKS IN CHAT (owner, 19 Nov): what a message names becomes a link when Ronin knows it, and
 * only then; anything else stays text. One pass over the drawn text, three kinds:
 *
 *  - a work item's id (KAN-698): "Let's do Agent Harness (KAN-680)" — opens the tile's own item
 *    overlay; Close returns to the chat where it was. Known: in the pushed Epics and their items
 *    (store.js `epics`, `epicItems`), else the item read answers it (a renamed id such as w806, a
 *    Done item no longer pushed).
 *  - an Agent's name, @name or bare, that the session list holds (KAN-701): opens that Agent.
 *  - a document, a path or a file name (~/ronin/office/ABOUT_USER.md, docs/a.md, ABOUT_USER.md,
 *    samurai_lab/ronin_cloud/X.md written from above the Workspace folders), that the Agent's
 *    file-link route finds as a file (KAN-701): opens it in the tile's Docs.
 *  - a commit hash (db709a8) that is a commit in the Agent's repos (KAN-701): opens
 *    `git show --stat -p` of it in the tile's Docs, as a read-only page.
 *
 * One read per id or path per page, only for what the push and the session list cannot answer.
 */
import { get } from './store.js';
import { request } from './request.js';
import { S } from './state.js';
import { SURFACE_DRAG } from './workbench.js';

// A path with a slash or ~ ending in an extension, or a bare file name with a document's extension.
const DOC = String.raw`(?:~|\.{1,2})?\/?[\w.@+-]+(?:\/[\w.@+-]+)*\.[A-Za-z0-9]{1,6}`;
// The item store's ids (src/work-items.ts ID): w123, or a Jira key such as KAN-123.
const ITEM = String.raw`w[1-9][0-9]*|[A-Z][A-Z0-9_]+-[1-9][0-9]*`;
const AGENT = String.raw`@?[a-z][a-z0-9_-]*[a-z0-9]`;
// A short or full commit hash, with at least one letter (not a number); alone, or after branch@
// as hand-ins say it (dev@7e2b28b). The Agent's repos decide whether it is one.
const COMMIT = String.raw`(?=[0-9]*[a-f])[0-9a-f]{7,40}`;
// A hash ends where a sentence may (f12cf12.), never before a file's extension (abc1234.md).
const HASH_END = String.raw`(?!\w|\.\w)`;
const TOKEN = new RegExp(String.raw`(?:(?<=\w@)(?<atcommit>${COMMIT})${HASH_END}|(?<![\w/.~@-])(?:(?<item>${ITEM})|(?<commit>${COMMIT})${HASH_END}|(?<doc>${DOC})|(?<agent>${AGENT})))(?![\w/-])`, 'g');
const HAS_TOKEN = new RegExp(TOKEN.source); // a stateless test: the /g one carries lastIndex into matchAll
const BARE_DOC = /^[\w.@+-]+\.(?:md|html?|txt|json|ya?ml|csv|pdf|png|jpe?g)$/i;

const items = new Map(); // id → Promise<item | null>
const docs = new Map(); // session \0 path → Promise<path | null>
const commits = new Map(); // session \0 hash → Promise<hash | null>

function pushed(id) {
  for (const list of [get('epics'), get('epicItems')]) {
    const hit = Array.isArray(list) ? list.find((item) => item?.id === id) : null;
    if (hit) return hit;
  }
  return null;
}

/** The item an id names, or null; from the push at once, else one read. */
export function knownItem(id) {
  const hit = pushed(id);
  if (hit) return hit;
  if (!items.has(id)) {
    items.set(id, request(`/api/work-items/${encodeURIComponent(id)}`, { cache: 'no-store' })
      .then((r) => (r.ok && r.data?.item?.id ? r.data.item : null), () => null));
  }
  return items.get(id);
}

/** The Agent a name or @name names, from the session list, or null. */
export const knownAgent = (word) => (S.sessions || []).find((row) => row.name === word.replace(/^@/, ''))?.name || null;

/** The file a path or file name in `session`'s chat names, as Docs opens it, or null. */
export function knownDoc(session, written) {
  if (!session || (!written.includes('/') && !BARE_DOC.test(written))) return null;
  const key = `${session}\u0000${written}`;
  if (!docs.has(key)) {
    docs.set(key, request(`/api/sessions/${encodeURIComponent(session)}/file-link?path=${encodeURIComponent(written)}`, { cache: 'no-store' })
      .then((r) => (r.ok && r.data?.path ? r.data.path : null), () => null));
  }
  return docs.get(key);
}

/** When the hash is a commit in one of `session`'s repos (its desks, working folder, Workspace
 *  folders): its `git show --stat -p` page, the path Docs opens (read-only); else null. */
export function knownCommit(session, hash) {
  if (!session) return null;
  const key = `${session}\u0000${hash}`;
  if (!commits.has(key)) {
    commits.set(key, request(`/api/sessions/${encodeURIComponent(session)}/commit?ref=${encodeURIComponent(hash)}`, { cache: 'no-store' })
      .then((r) => (r.ok && r.data?.path ? r.data.path : null), () => null));
  }
  return commits.get(key);
}

/** What a link carries when dragged (KAN-707): the workbench's own surface payload, as a selector
 *  pill's, so a workspace it is dropped on opens it there: an item on its Find item surface, an
 *  Agent's tile, a document or a commit's page on a Document surface. */
const SESSION_DRAG = 'text/x-ronin-session'; // team-drag.js: a Team's roster takes an Agent dropped on it
const dropAs = (kind, target) => (kind === 'item' ? { type: 'team.find-item', detail: { key: target.id } }
  : kind === 'agent' ? { type: 'session.terminal', detail: { key: target } }
    : { type: 'document', detail: { key: target } });

function link(doc, words, kind, target, open, title) {
  const a = doc.createElement('a');
  a.className = `chat-item-link chat-${kind}-link`;
  a.href = '#';
  a.dataset[kind] = typeof target === 'string' ? target : target.id;
  // A document shows its file name; the whole path is its tooltip (owner, 19 Nov, KAN-707).
  a.textContent = kind === 'doc' ? words.split('/').pop() : words;
  if (title) a.title = title;
  a.draggable = true;
  a.addEventListener('dragstart', (event) => {
    event.dataTransfer.setData(SURFACE_DRAG, JSON.stringify(dropAs(kind, target)));
    if (kind === 'agent') event.dataTransfer.setData(SESSION_DRAG, target);
    event.dataTransfer.setData('text/plain', words);
    event.dataTransfer.effectAllowed = 'copy';
  });
  a.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (a.getAttribute('aria-busy') === 'true') return;
    a.setAttribute('aria-busy', 'true'); // the press answers at once; what it opens follows
    Promise.resolve().then(() => open(target)).finally(() => a.removeAttribute('aria-busy'));
  });
  return a;
}

/**
 * Turns what `entry`'s text names into links: `open.item(item)`, `open.agent(name)`,
 * `open.doc(path)`; `session()` is the Agent whose chat it is (its files). A kind without its
 * opener is left as text. Returns entry.
 */
export function linkChat(entry, open = {}) {
  const doc = entry?.ownerDocument || globalThis.document;
  if (!doc?.createTreeWalker) return entry;
  const session = open.session?.() || '';
  const walker = doc.createTreeWalker(entry, 4 /* NodeFilter.SHOW_TEXT */);
  const nodes = [];
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (node.parentElement?.closest('a, button, pre')) continue;
    if (HAS_TOKEN.test(node.nodeValue)) nodes.push(node);
  }
  for (const node of nodes) {
    const text = node.nodeValue;
    const found = [...text.matchAll(TOKEN)].map((m) => {
      const { item, doc: path, agent } = m.groups;
      const commit = m.groups.commit || m.groups.atcommit;
      const kind = item ? 'item' : commit ? 'commit' : path ? 'doc' : 'agent';
      const words = item || commit || path || agent;
      if (!open[kind]) return null;
      const target = kind === 'item' ? knownItem(words) : kind === 'commit' ? knownCommit(session, words)
        : kind === 'doc' ? knownDoc(session, words) : knownAgent(words);
      return target ? { at: m.index, words, kind, target } : null;
    }).filter(Boolean);
    if (!found.length) continue;
    void Promise.all(found.map((f) => f.target)).then((targets) => {
      const hits = found.map((f, i) => ({ ...f, target: targets[i] })).filter((f) => f.target);
      if (!hits.length || !node.parentNode) return;
      const frag = doc.createDocumentFragment();
      let at = 0;
      for (const f of hits) {
        frag.append(text.slice(at, f.at), link(doc, f.words, f.kind, f.target, open[f.kind], f.kind === 'item' ? f.target.title : f.kind === 'doc' ? f.target : ''));
        at = f.at + f.words.length;
      }
      frag.append(text.slice(at));
      node.replaceWith(frag);
    });
  }
  return entry;
}
