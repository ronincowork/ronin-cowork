/* Host-side folder chooser: the Workspace page's Add a folder. */
import { request } from './request.js';
import { confirmDialog, status } from './ui.js';
import { t } from './lexicon.js';

const el = (tag, cls, text) => {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text != null) node.textContent = text;
  return node;
};

/** Walk, find or make a folder on this machine; its row's `take` button (or a folder just made) hands it to `onChange`. */
export function createFolderPicker({ onChange = () => {}, take = t('folders.choose', 'Choose') } = {}) {
  const shell = el('div', 'folder-picker');
  const controls = el('div', 'folder-controls');
  const back = el('button', null, t('folders.up', '← Up')); back.type = 'button';
  const home = el('button', null, t('folders.home', 'Home')); home.type = 'button';
  const search = document.createElement('input'); search.type = 'search'; search.placeholder = t('folders.search', 'Find a folder here');
  const hiddenLabel = el('label', 'folder-hidden'); const hidden = document.createElement('input'); hidden.type = 'checkbox';
  hiddenLabel.append(hidden, document.createTextNode(t('folders.hidden', 'Show hidden folders')));
  controls.append(back, home, search, hiddenLabel);
  const crumbs = el('div', 'folder-crumbs');
  const listing = el('div', 'folder-list');
  const create = el('details', 'folder-create');
  const createSummary = el('summary', null, t('folders.new', '＋ New folder here'));
  const createRow = el('div', 'folder-create-row');
  const name = document.createElement('input'); name.type = 'text'; name.placeholder = t('folders.new_name', 'Folder name');
  const gitLabel = el('label'); const initGit = document.createElement('input'); initGit.type = 'checkbox';
  gitLabel.append(initGit, document.createTextNode(t('folders.git', 'Start Git version history')));
  const make = el('button', null, t('folders.create', 'Create and select')); make.type = 'button';
  const line = status('folder-status');
  createRow.append(name, gitLabel, make); create.append(createSummary, createRow, line.el);
  shell.append(controls, crumbs, listing, create);

  let current = '';
  let homeDir = '';
  let parent = null;
  let timer = null;
  const select = (dir) => onChange(dir);
  const load = async (dir = current) => {
    listing.replaceChildren(el('span', 'folder-loading', t('folders.loading', 'Reading folders…')));
    const qs = new URLSearchParams();
    if (dir) qs.set('dir', dir);
    if (hidden.checked) qs.set('hidden', 'yes');
    if (search.value.trim()) qs.set('q', search.value.trim());
    const result = await request('/api/folders?' + qs, { cache: 'no-store' });
    if (!result.ok) { listing.replaceChildren(el('span', 'bad', result.message)); return; }
    current = result.data.dir; homeDir = result.data.home; parent = result.data.parent;
    hiddenLabel.hidden = result.data.hidden_shown === false; // an office never shows hidden folders
    back.disabled = !parent;
    crumbs.replaceChildren();
    const relative = current === homeDir ? [] : current.slice(homeDir.length + 1).split('/');
    let at = homeDir;
    const addCrumb = (label, dirAt) => { const button = el('button', null, label); button.type = 'button'; button.addEventListener('click', () => load(dirAt)); crumbs.append(button); };
    addCrumb(t('folders.home', 'Home'), homeDir);
    for (const part of relative) { crumbs.append(document.createTextNode('/')); at += '/' + part; addCrumb(part, at); }
    listing.replaceChildren();
    // Folders with a repository first, under their own line, because those are the ones
    // that matter most when looking for work; plain folders follow (Glen, 2026-09-07).
    const isRepo = (folder) => folder.kind === 'repository';
    const folders = [...result.data.folders].sort((a, b) => Number(isRepo(b)) - Number(isRepo(a)));
    let group = null;
    for (const folder of folders) {
      const kind = isRepo(folder) ? 'repository' : 'folder';
      if (kind !== group) {
        group = kind;
        listing.append(el('div', 'folder-group', kind === 'repository' ? t('folders.group_repositories', 'Folders with a Git repository') : t('folders.group_plain', 'Folders')));
      }
      const row = el('div', 'folder-row');
      const open = el('button', 'folder-open', `▸ ${folder.name}`); open.type = 'button'; open.addEventListener('click', () => load(folder.dir));
      const choose = el('button', 'folder-choose', take); choose.type = 'button';
      choose.addEventListener('click', () => select(folder.dir));
      row.append(open, choose); listing.append(row);
    }
    if (!result.data.folders.length) listing.append(el('span', 'folder-empty', t('folders.empty', 'No matching folders here.')));
    createSummary.textContent = t('folders.new_in', '＋ New folder in {name}', { name: current === homeDir ? t('folders.home', 'Home') : current.split('/').pop() });
  };
  back.addEventListener('click', () => parent && load(parent));
  home.addEventListener('click', () => load(homeDir));
  hidden.addEventListener('change', () => load());
  search.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(() => load(), 180); });
  make.addEventListener('click', async () => {
    const folderName = name.value.trim();
    if (!folderName) { line.say(t('folders.name_needed', 'Give the new folder a name.'), 'bad'); return; }
    const target = current.replace(/\/$/, '') + '/' + folderName;
    if (!await confirmDialog({
      label: t('folders.create_title', 'Create folder'),
      message: t('folders.create_confirm', 'Create this folder on the Ronin machine?\n\n{target}', { target }),
      confirmLabel: t('folders.create', 'Create and select'),
      cancelLabel: t('roots.cancel_folder', 'Cancel'),
    })) return;
    make.disabled = true; line.say(t('folders.creating', 'Creating…'), 'busy');
    const result = await request('/api/folders', { method: 'POST', json: { parent: current, name: folderName, init_git: initGit.checked } });
    make.disabled = false;
    if (!result.ok) { line.say(result.message, 'bad'); return; }
    select(result.data.dir); name.value = ''; initGit.checked = false; create.open = false; line.say(''); await load(current);
  });
  void load('');
  return { el: shell, home: () => homeDir, refresh: load };
}
