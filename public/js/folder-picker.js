/* Host-side folder chooser shared by setup and Campaign Workspace Folders. */
import { request } from './request.js';
import { status } from './ui.js';
import { t } from './lexicon.js';

const el = (tag, cls, text) => {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text != null) node.textContent = text;
  return node;
};

export function createFolderPicker({ value = '', onChange = () => {} } = {}) {
  const shell = el('div', 'folder-picker');
  const chosen = el('div', 'folder-chosen');
  const chosenLabel = el('span', null, t('folders.selected', 'Selected folder'));
  const chosenPath = el('code', null, value || t('folders.none_selected', 'None selected'));
  const context = el('span', 'folder-context', t('folders.start_context', 'This is where the Agent will start.'));
  chosen.append(chosenLabel, chosenPath, context);
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
  shell.append(chosen, controls, crumbs, listing, create);

  let selected = value;
  let current = '';
  let homeDir = '';
  let parent = null;
  let timer = null;
  const select = async (dir) => {
    selected = dir;
    chosenPath.textContent = dir;
    onChange(dir);
    context.textContent = t('folders.inspecting', 'Checking the starting context…');
    const inspected = await request(`/api/project-roots/inspect?dir=${encodeURIComponent(dir)}`, { cache: 'no-store' });
    if (!inspected.ok) { context.textContent = inspected.message; return; }
    const bits = [inspected.data.repo ? t('folders.git_found', 'Git repository') : t('folders.ordinary', 'Ordinary folder')];
    if (inspected.data.project_context?.length) bits.push(t('folders.context_found', 'Project instructions: {files}', { files: inspected.data.project_context.join(', ') }));
    else bits.push(t('folders.context_none', 'No recognized project instructions here; the Agent can still start here.'));
    context.textContent = bits.join(' · ');
  };
  const load = async (dir = current) => {
    listing.replaceChildren(el('span', 'folder-loading', t('folders.loading', 'Reading folders…')));
    const qs = new URLSearchParams();
    if (dir) qs.set('dir', dir);
    if (hidden.checked) qs.set('hidden', 'yes');
    if (search.value.trim()) qs.set('q', search.value.trim());
    const result = await request('/api/folders?' + qs, { cache: 'no-store' });
    if (!result.ok) { listing.replaceChildren(el('span', 'bad', result.message)); return; }
    current = result.data.dir; homeDir = result.data.home; parent = result.data.parent;
    back.disabled = !parent;
    crumbs.replaceChildren();
    const relative = current === homeDir ? [] : current.slice(homeDir.length + 1).split('/');
    let at = homeDir;
    const addCrumb = (label, dirAt) => { const button = el('button', null, label); button.type = 'button'; button.addEventListener('click', () => load(dirAt)); crumbs.append(button); };
    addCrumb(t('folders.home', 'Home'), homeDir);
    for (const part of relative) { crumbs.append(document.createTextNode('/')); at += '/' + part; addCrumb(part, at); }
    listing.replaceChildren();
    for (const folder of result.data.folders) {
      const row = el('div', 'folder-row');
      const open = el('button', 'folder-open', '▸ ' + folder.name); open.type = 'button'; open.addEventListener('click', () => load(folder.dir));
      const choose = el('button', 'folder-choose', t('folders.choose', 'Choose')); choose.type = 'button'; choose.addEventListener('click', () => void select(folder.dir));
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
    if (!confirm(t('folders.create_confirm', 'Create this folder on the Ronin machine?\n\n{target}', { target }))) return;
    make.disabled = true; line.say(t('folders.creating', 'Creating…'), 'busy');
    const result = await request('/api/folders', { method: 'POST', json: { parent: current, name: folderName, init_git: initGit.checked } });
    make.disabled = false;
    if (!result.ok) { line.say(result.message, 'bad'); return; }
    await select(result.data.dir); name.value = ''; initGit.checked = false; create.open = false; line.say(''); await load(current);
  });
  void load(value || '');
  return { el: shell, input: chosenPath, value: () => selected, select, refresh: load };
}
