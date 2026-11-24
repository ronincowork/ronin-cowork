/* A stable four-region work surface. It is a painter: it is handed one resolved
   canvas object and renders it. It looks nothing up, fetches nothing, keeps no
   clock, and decides nothing about why it was given what it was given. */
import { WorkspaceKit } from './workspace-kit.js';
import { GARDEN_REGION_KEYS } from './garden-canvas-model.js';
import { createSenmaida, createHito } from './senmaida.js';
import { renderMarkdownDocument } from './markdown-reader.js';

export const GARDEN_CANVAS_TYPE = 'setup.garden';

const node = (tag, cls = '', value = '') => {
  const el = document.createElement(tag);
  if (cls) el.className = cls;
  if (value) el.textContent = value;
  return el;
};

function createGardenCanvas({ onAction = () => {}, onMedia = () => {} } = {}) {
  const surface = WorkspaceKit.primitives.createSurface({ label: 'Assist', className: 'garden-canvas' });
  surface.content.classList.add('garden-canvas-content');
  const scene = node('div', 'garden-canvas-scene');
  scene.setAttribute('aria-live', 'polite');
  const mark = createSenmaida('panel', 'garden-canvas-mark');
  const hito = createHito('garden-canvas-hito');
  scene.append(mark, hito);
  const regions = Object.fromEntries(GARDEN_REGION_KEYS.map((key) => {
    const region = node('section', `garden-region garden-region-${key}`);
    region.dataset.region = key;
    region.hidden = true;
    scene.append(region);
    return [key, region];
  }));

  const overlay = node('div', 'garden-media-overlay');
  overlay.hidden = true;
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', 'Media');
  const close = node('button', 'garden-media-close', '×');
  close.type = 'button'; close.setAttribute('aria-label', 'Close media');
  const mediaBody = node('div', 'garden-media-body');
  overlay.append(close, mediaBody);
  let mediaOpener = null;
  const closeMedia = () => {
    if (overlay.hidden) return;
    mediaBody.replaceChildren();
    overlay.hidden = true;
    mediaOpener?.focus();
    mediaOpener = null;
  };
  close.addEventListener('click', closeMedia);
  overlay.addEventListener('pointerdown', (event) => { if (event.target === overlay) { event.preventDefault(); closeMedia(); } });
  overlay.addEventListener('keydown', (event) => { if (event.key === 'Escape') { event.preventDefault(); closeMedia(); } });

  /* The host reads the document or resolves the source and hands back a view. */
  const showMedia = (view) => {
    mediaBody.replaceChildren();
    if (!view) return;
    overlay.setAttribute('aria-label', view.label || 'Document');
    mediaBody.append(node('h2', '', view.label));
    if (view.src) {
      const external = node('a', 'garden-media-external', 'Open separately \u2197');
      external.href = view.src; external.target = '_blank'; external.rel = 'noopener';
      mediaBody.append(external);
    }
    let viewer;
    if (typeof view.text === 'string') {
      viewer = node('div', 'garden-media-doc');
      viewer.append(renderMarkdownDocument(view.text, document, { onLink: view.onLink, resolveHref: view.resolveHref }));
    } else if (view.kind === 'video') {
      viewer = node('video', 'garden-media-video');
      viewer.controls = true; viewer.preload = 'metadata'; viewer.src = view.src;
    } else {
      viewer = node('iframe', 'garden-media-frame');
      viewer.title = view.label; viewer.src = view.src;
      viewer.setAttribute('sandbox', 'allow-same-origin');
    }
    mediaBody.append(viewer);
    overlay.hidden = false;
    if (view.fragment) scrollMediaTo(view.fragment);
    close.focus();
  };
  const scrollMediaTo = (fragment) => {
    const heading = [...mediaBody.querySelectorAll('[id]')].find((node) => node.id === fragment);
    heading?.scrollIntoView?.({ block: 'start' });
  };

  const paintCopy = (items) => {
    for (const copy of items) {
      const item = node('article', 'garden-copy-item');
      item.dataset.copyId = copy.id;
      if (copy.kind) item.dataset.kind = copy.kind;
      if (copy.eyebrow) item.append(node('p', 'garden-copy-eyebrow', copy.eyebrow));
      if (copy.heading) item.append(node('h2', 'garden-copy-heading', copy.heading));
      if (copy.body) item.append(node('p', 'garden-copy-body', copy.body));
      if (copy.stamp) item.append(node('time', 'garden-copy-stamp', copy.stamp));
      regions.copy.append(item);
    }
  };
  const paintQuestion = (question) => {
    const label = node('label', 'garden-question-label', question.prompt);
    const input = node(question.kind === 'textarea' ? 'textarea' : 'input', 'garden-question-input');
    input.name = question.name; input.placeholder = question.placeholder;
    if (question.kind === 'text') input.type = 'text';
    label.append(input); regions.question.append(label);
  };
  const paintCta = (cta) => {
    const button = node('button', 'garden-cta', cta.label);
    button.type = 'button'; button.addEventListener('click', () => onAction(cta.action));
    regions.cta.append(button);
  };
  const paintMedia = (items) => {
    const list = node('div', 'garden-media-list');
    for (const item of items) {
      const button = node('button', 'garden-media-choice');
      button.type = 'button';
      button.dataset.kind = item.kind;
      if (item.id) button.dataset.mediaId = item.id;
      button.append(node('strong', '', item.label));
      if (item.description) button.append(node('span', '', item.description));
      button.addEventListener('click', () => { mediaOpener = button; onMedia(item); });
      list.append(button);
    }
    regions.media.append(list);
  };

  let painted = 0;
  const paint = (canvas) => {
    closeMedia();
    for (const region of Object.values(regions)) { region.replaceChildren(); region.hidden = true; }
    if (canvas?.copy) { paintCopy(canvas.copy); regions.copy.hidden = false; }
    if (canvas?.question) { paintQuestion(canvas.question); regions.question.hidden = false; }
    if (canvas?.cta) { paintCta(canvas.cta); regions.cta.hidden = false; }
    if (canvas?.media) { paintMedia(canvas.media); regions.media.hidden = false; }
    scene.dataset.empty = String(!canvas || GARDEN_REGION_KEYS.every((key) => !canvas[key]));
    painted += 1;
  };

  /* A chat seated in place of the scene (setup-irasshai.js), or none: the surface is then that
     chat alone, headed `label` (her name), its header's only tool the chat's own `toggle`
     (Term / Chat, KAN-717) beside the name (garden-canvas.css). With `below` (hosted Setup's Ask
     Ronin panel, w926) the scene stays and the chat sits under it. */
  let seated = null;
  let seatedToggle = null;
  const chat = (view, label = '', toggle = null, { below = false } = {}) => {
    if (surface.header) surface.header.title.textContent = view ? label || 'Assist' : 'Assist';
    if (seatedToggle !== toggle) {
      seatedToggle?.remove();
      seatedToggle = view && toggle && surface.header ? toggle : null;
      if (seatedToggle) surface.header.title.after(seatedToggle);
    }
    if (seated === view) { scene.hidden = Boolean(seated) && !below; return; }
    seated?.remove();
    seated = view || null;
    if (seated) { closeMedia(); surface.content.append(seated); }
    scene.hidden = Boolean(seated) && !below;
    surface.el.dataset.chat = seated ? (below ? 'below' : 'on') : 'off';
  };

  surface.content.append(scene, overlay);
  return { ...surface, paint, showMedia, scrollMediaTo, closeMedia, chat, paintCount: () => painted };
}

export function registerGardenCanvas() {
  if (WorkspaceKit.workbench.surfaces.has(GARDEN_CANVAS_TYPE)) return GARDEN_CANVAS_TYPE;
  return WorkspaceKit.workbench.surfaces.register({
    type: GARDEN_CANVAS_TYPE,
    header: 'surface',
    label: 'Assist',
    create: (context) => {
      const canvas = createGardenCanvas({
        onAction: (action) => context.environment?.openSetupAction?.(action),
        onMedia: (item) => context.environment?.openGardenMedia?.(item),
      });
      context.environment?.onGardenCanvas?.(canvas);
      return canvas;
    },
  });
}
