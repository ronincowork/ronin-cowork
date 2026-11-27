/* part of the ronin-cowork client — see js/README.md */
/**
 * WORKBENCHES FROM A FOLDER (KAN-954). Each folder in the office's ~/ronin/custom/workbenches/ is a
 * workbench (GET /api/workbenches, src/routes/workbenches-api.ts). Its page code is loaded from
 * /custom/workbenches/<name>/<entry> and registers its surfaces in the one surface registry the
 * built-in workbenches use; Cowork makes the profile from workbench.json's surfaces and opens it
 * at #/<name> as a door workbench (door-workbenches.js), its seated surfaces placed on first open.
 * The contract is docs/architecture/workbench.md, Workbench packages. No package is named here.
 */
import { WorkspaceKit } from './workspace-kit.js';
import { t } from './lexicon.js';
import { request } from './request.js';
import { addWorkbenchAppearance } from './workspace-contract.js';
import { doorWorkbench } from './door-workbenches.js';

const registry = () => WorkspaceKit.workbench;
const opened = [];
/** The folder workbenches open in this page, in folder order: Home's stones for them. */
export const folderWorkbenches = () => opened.slice();
// WHICH WORKBENCHES MEMBERS SEE (KAN-955): `shown` is this person's list (a member, with the
// setting set), else null: everything. `membersSee` is the setting as saved, for Settings.
let shown = null, membersSee = [];
export const shownWorkbenches = () => shown;
export const savedMembersSee = () => membersSee.slice();
export const setSavedMembersSee = (list) => { membersSee = list.slice(); };
/** Whether a workbench is offered to this person. */
export const isShown = (name) => !shown || shown.includes(name);

/** What a package's page code is given: its own name, title and folder, and Cowork's client. */
const roninFor = (workbench, base) => Object.freeze({
  name: workbench.name, title: workbench.title, base,
  WorkspaceKit, t, request,
  // A Cowork client module by its public/js file name, the same instance Cowork uses.
  cowork: (file) => import(`./${file}`),
  surfaces: Object.freeze({ register: (definition) => { const { surfaces } = registry(); if (!surfaces.has(definition?.type)) surfaces.register(definition); } }),
});

async function openFolderWorkbench(workspace, workbench) {
  const base = `/custom/workbenches/${encodeURIComponent(workbench.name)}/`;
  const page = await import(new URL(workbench.entry, new URL(base, location.origin)).href);
  await page.default?.(roninFor(workbench, base));
  const { surfaces, profiles } = registry();
  const offered = workbench.surfaces.filter((surface) => surfaces.has(surface.type));
  profiles.define(workbench.name, offered.map((surface) => surface.type));
  const seats = Object.fromEntries(offered.filter((surface) => surface.seat >= 1 && surface.seat <= 4).map((surface) => [`workspace${surface.seat}`, surface.type]));
  addWorkbenchAppearance(workbench.name);
  workspace.register(workbench.name, doorWorkbench({
    id: workbench.name, profile: workbench.name, label: workbench.title, seats,
    count: Object.keys(seats).some((seat) => seat === 'workspace3' || seat === 'workspace4') ? 4 : 2,
    hints: false,
    environment: ({ bench }) => ({ place: (type, at, detail = {}) => bench().place(type, at, detail) }),
  }));
}

/** Every folder workbench, registered as a destination before the workspace starts. One that will
 * not load is reported in the console and the rest still open. */
export async function loadFolderWorkbenches(workspace) {
  const result = await request('/api/workbenches', { cache: 'no-store' });
  const list = result.ok && Array.isArray(result.data.workbenches) ? result.data.workbenches : [];
  shown = result.ok && Array.isArray(result.data.shown) && result.data.shown.length ? result.data.shown : null;
  membersSee = result.ok && Array.isArray(result.data.members_see) ? result.data.members_see : [];
  const ok = await Promise.all(list.map((workbench) => openFolderWorkbench(workspace, workbench).then(() => true)
    .catch((error) => { console.warn(`workbench ${workbench.name}`, error); return false; })));
  opened.splice(0, opened.length, ...list.filter((_w, i) => ok[i]));
  return folderWorkbenches();
}
