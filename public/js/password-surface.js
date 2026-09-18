/* One browser-password work surface, seated unchanged in Setup and Settings. */
import { WorkspaceKit } from './workspace-kit.js';
import { ask } from './ask.js';
import { request } from './request.js';
import { field } from './ui.js';
import { t } from './lexicon.js';

export const PASSWORD_SURFACE_TYPE = 'machine.password';

const el = (tag, cls = '', text = null) => {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text != null) node.textContent = String(text);
  return node;
};

export function createPasswordSurface(context = {}) {
  const surface = WorkspaceKit.primitives.createSurface({ label: t('password.title', 'Password') });
  const body = el('div', 'setup-surface-body password-surface');
  const intro = el('section', 'password-intro');
  intro.append(
    el('h2', '', t('password.heading', 'Browser password')),
    el('p', 'setup-lede', t('password.explain', 'One password protects this Ronin installation through both its local HTTP and Tailscale HTTPS addresses.')),
  );
  const selectorHost = el('div', 'password-selector');
  const form = el('form', 'password-form');
  form.hidden = true;
  const first = el('input'); first.type = 'password'; first.autocomplete = 'new-password';
  const second = el('input'); second.type = 'password'; second.autocomplete = 'new-password';
  const firstField = field(first, { label: t('password.new', 'New password') });
  const secondField = field(second, { label: t('password.confirm', 'Confirm password') });
  firstField.el.classList.add('setup-field'); secondField.el.classList.add('setup-field');
  const save = WorkspaceKit.primitives.createAction({ label: t('password.save', 'Save password'), kind: 'primary', action: () => {} });
  save.el.type = 'submit';
  const cancel = WorkspaceKit.primitives.createAction({ label: t('password.cancel', 'Cancel'), action: () => closeForm() });
  const formActions = el('div', 'password-actions'); formActions.append(save.el, cancel.el);
  form.append(firstField.el, secondField.el, formActions);

  const change = WorkspaceKit.primitives.createAction({ label: t('password.change', 'Change password'), action: () => openForm('change') });
  const changeRow = el('div', 'password-actions'); changeRow.append(change.el); changeRow.hidden = true;
  const note = el('p', 'setup-notice password-notice'); note.setAttribute('role', 'status'); note.setAttribute('aria-live', 'polite');
  const reach = el('p', 'setup-fine', t('password.off_warning', 'When password protection is Off, anyone who can reach an allowed Ronin address can use it. This does not change network binding or Tailscale access.'));
  const basic = el('p', 'setup-fine'); basic.hidden = true;
  const recovery = el('section', 'password-recovery');
  recovery.append(
    el('h3', '', t('password.forgotten', 'Forgotten password')),
    el('p', 'setup-fine', t('password.recovery_help', 'On the machine running Ronin, open a terminal in the Ronin installation and run bin/ronin-recovery. Enter the one-time code under “Use a recovery code” on the login page. It works without the old password and expires after 30 minutes.')),
  );
  body.append(intro, selectorHost, form, changeRow, note, reach, basic, recovery);
  surface.content.append(body);

  let saved = false;
  let busy = false;
  let mode = '';
  let selector = null;

  const say = (text, bad = false) => { note.textContent = text || ''; note.dataset.tone = bad ? 'failed' : 'success'; };
  function closeForm() {
    mode = '';
    form.hidden = true;
    first.value = ''; second.value = '';
  }
  function openForm(next) {
    mode = next;
    form.hidden = false;
    save.el.textContent = next === 'change' ? t('password.save_change', 'Change password') : t('password.save', 'Save password');
    first.focus();
  }
  const paint = (state) => {
    saved = state?.required === true;
    selector?.set('required', saved);
    changeRow.hidden = !saved;
    reach.hidden = saved;
    basic.hidden = state?.basic !== true;
    basic.textContent = t('password.basic_kept', 'Legacy Basic authentication is also configured. Turning this password Off does not remove that separate restriction.');
    context.environment?.onPasswordState?.({ required: saved, basic: state?.basic === true });
  };

  selector = ask([{ group: t('password.access', 'Browser access'), fields: [{
    key: 'required', label: t('password.require', 'Require a password'), switch: [t('password.on', 'On'), t('password.off', 'Off')],
  }] }], {
    value: { required: false },
    onChange: (next) => {
      if (busy || next.required === saved) return;
      // ERABI reports the owner's press; the reading remains the saved answer until the
      // mutation succeeds.
      selector.set('required', saved);
      if (next.required) { say(''); openForm('enable'); return; }
      void disable();
    },
  });
  selectorHost.append(selector.el);

  const disable = async () => {
    busy = true; say(t('password.turning_off', 'Turning password protection off…'));
    const result = await request('/api/password', { method: 'DELETE' });
    busy = false;
    if (!result.ok) { say(result.message, true); selector.set('required', saved); return; }
    closeForm(); paint(result.data); say(t('password.off_saved', 'Password protection is Off.'));
  };

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (busy) return;
    if (first.value.length < 8) { say(t('password.too_short', 'Use at least 8 characters.'), true); first.focus(); return; }
    if (first.value !== second.value) { say(t('password.no_match', 'The two passwords do not match.'), true); second.focus(); return; }
    busy = true; save.el.disabled = true; cancel.el.disabled = true;
    say(mode === 'change' ? t('password.changing', 'Changing password…') : t('password.enabling', 'Turning password protection on…'));
    const result = await request('/api/password', { method: 'PUT', json: { password: first.value, confirm: second.value } });
    busy = false; save.el.disabled = false; cancel.el.disabled = false;
    if (!result.ok) { say(result.message, true); return; }
    const changed = mode === 'change';
    closeForm(); paint(result.data);
    say(changed ? t('password.changed', 'Password changed. Other browser sessions have been logged out.') : t('password.on_saved', 'Password protection is On.'));
  });

  const show = async () => {
    closeForm(); say(t('password.reading', 'Reading saved password setting…'));
    const result = await request('/api/password', { cache: 'no-store' });
    if (!result.ok) { say(result.message, true); return; }
    paint(result.data); say('');
  };
  return { el: surface.el, show, destroy: () => selector.destroy() };
}

export function passwordSurfaceDefinition() {
  return {
    type: PASSWORD_SURFACE_TYPE,
    header: 'surface',
    label: () => t('password.title', 'Password'),
    summary: () => t('password.summary', 'Browser access'),
    create: (context) => createPasswordSurface(context),
  };
}

export function registerPasswordSurface() {
  const library = WorkspaceKit.workbench.library;
  if (!library.has(PASSWORD_SURFACE_TYPE)) library.register(passwordSurfaceDefinition());
  return PASSWORD_SURFACE_TYPE;
}
