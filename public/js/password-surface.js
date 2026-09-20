/* One browser-password work surface, seated unchanged in Setup and Settings. */
import { WorkspaceKit } from './workspace-kit.js';
import { ask } from './ask.js';
import { request } from './request.js';
import { t } from './lexicon.js';
import { createSetupZoneSlot, goodToGo } from './setup-zone.js';

export const PASSWORD_SURFACE_TYPE = 'machine.password';

const el = (tag, cls = '', text = null) => {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text != null) node.textContent = String(text);
  return node;
};

export function createPasswordSurface(context = {}) {
  const { createSurface, createAction, createActionBar, createNotice } = WorkspaceKit.primitives;
  const surface = createSurface({ label: t('password.title', 'Password') });
  const body = el('div', 'setup-surface-body setup-register-compact password-surface');
  const intro = el('section', 'setup-register-welcome');
  intro.append(
    el('span', 'setup-register-eyebrow', t('password.eyebrow', 'How you reach this machine')),
    el('h2', '', t('password.heading', 'How do you reach this machine?')),
    el('p', 'setup-lede', t('password.explain', 'Most people reach Ronin over Tailnet, which is already private. A password on top is optional—set one only if this machine is reachable some other way.')),
  );
  const access = el('section', 'setup-register-group password-access');
  access.append(el('h3', '', t('password.access', 'Browser access')));
  const selectorHost = el('div', 'password-selector');
  const form = el('form', 'setup-form setup-register-form password-form');
  form.hidden = true;
  const formGroup = el('section', 'setup-register-group password-form-group');
  formGroup.append(el('h3', '', t('password.choose', 'Choose a password')));
  const first = el('input'); first.type = 'password'; first.autocomplete = 'new-password';
  const second = el('input'); second.type = 'password'; second.autocomplete = 'new-password';
  const passwordLine = (label, control, id) => {
    const row = el('label', 'setup-field setup-register-input');
    const validation = el('small', 'setup-notice password-validation');
    control.id = id; control.required = true;
    validation.id = `${id}-validation`;
    control.setAttribute('aria-describedby', validation.id);
    validation.setAttribute('role', 'status'); validation.setAttribute('aria-live', 'polite');
    row.append(el('span', 'setup-register-question', label), control, validation);
    return { row, validation };
  };
  const firstField = passwordLine(t('password.new', 'New password'), first, 'ronin-new-password');
  const secondField = passwordLine(t('password.confirm', 'Confirm new password'), second, 'ronin-confirm-password');
  formGroup.append(firstField.row, secondField.row);
  const save = createAction({ label: t('password.save', 'Save password'), kind: 'primary', action: () => {} });
  save.el.type = 'submit';
  const cancel = createAction({ label: t('password.cancel', 'Cancel'), action: () => closeForm() });
  const formActions = createActionBar({ label: t('password.save_actions', 'Save password actions'), actions: [cancel, save] });
  const send = el('div', 'setup-register-send');
  send.append(formActions.el);
  form.append(formGroup, send);

  const change = createAction({ label: t('password.change', 'Change password'), action: () => openForm('change') });
  const changeRow = createActionBar({ label: t('password.change_actions', 'Password actions'), actions: [change] });
  changeRow.el.hidden = true;
  const note = createNotice();
  note.el.setAttribute('role', 'status'); note.el.setAttribute('aria-live', 'polite');
  const reach = el('p', 'setup-fine', t('password.off_warning', 'When password protection is Off, anyone who can reach an allowed Ronin address can use it. This does not change network binding or Tailscale access.'));
  const basic = el('p', 'setup-fine'); basic.hidden = true;
  const recovery = el('section', 'setup-register-group password-recovery');
  recovery.append(
    el('h3', '', t('password.forgotten', 'Forgotten password')),
    el('p', 'setup-fine', t('password.recovery_help', 'On the machine running Ronin, open a terminal in the Ronin installation and run bin/ronin-recovery. Enter the one-time code under “Use a recovery code” on the login page. It works without the old password and expires after 30 minutes.')),
  );
  access.append(selectorHost, changeRow.el, note.el, reach, basic);
  /**
   * Step 5's header zone. Tailscale is a fact about this machine, read from the Setup scan
   * (progress.facts.tailscale). It is three-valued on purpose: absent means the scan has not
   * said yet, which is not the same as saying Tailscale is missing, so the zone declines to
   * claim either until it knows.
   */
  const zone = context.environment?.answerSetupStep ? createSetupZoneSlot() : null;
  let passwordRequired = false;
  const paintZone = () => {
    if (!zone) return;
    const progress = context.environment?.setupProgress?.();
    const step = progress?.steps?.find((entry) => entry.id === 'password');
    const tailscale = progress?.facts?.tailscale;
    if (step?.answered) {
      zone.paint({
        state: passwordRequired ? 'Password set.' : 'Tailnet only. No password.',
        picks: [goodToGo(() => context.environment?.nextSetupStep?.())],
      });
      return;
    }
    const addPassword = { label: 'Add password', action: () => openForm('enable') };
    if (tailscale === true) {
      zone.paint({
        state: 'Tailnet available. Add a password as well?',
        picks: [
          { label: 'Tailnet only', action: () => context.environment?.answerSetupStep?.('password', 'not_now') },
          addPassword,
        ],
      });
      return;
    }
    zone.paint({
      state: tailscale === false ? 'Tailnet not available on this machine.' : 'Checking how you reach this machine\u2026',
      picks: [addPassword, { label: 'No password', action: () => context.environment?.answerSetupStep?.('password', 'not_now') }],
    });
  };
  if (zone) body.append(zone.el);
  body.append(intro, access, form, recovery);
  surface.content.append(body);

  let saved = false;
  let busy = false;
  let mode = '';
  let selector = null;

  const say = (text, bad = false) => note.set(text ? (bad ? 'failed' : 'success') : '', text || '');
  const validate = (field, message = '') => {
    field.validation.textContent = message;
    field.row.querySelector('input').setAttribute('aria-invalid', String(Boolean(message)));
  };
  function closeForm() {
    mode = '';
    form.hidden = true;
    first.value = ''; second.value = '';
    validate(firstField); validate(secondField);
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
    changeRow.el.hidden = !saved;
    reach.hidden = saved;
    basic.hidden = state?.basic !== true;
    basic.textContent = t('password.basic_kept', 'Legacy Basic authentication is also configured. Turning this password Off does not remove that separate restriction.');
    context.environment?.onPasswordState?.({ required: saved, basic: state?.basic === true });
    passwordRequired = saved;
    paintZone();
  };

  // No group head: the section's own h3 already says 'Browser access', and the head repeated
  // it word for word directly beneath. The label is shortened to fit the shared stone rather
  // than stretch it — it was ellipsing to 'Require a passw…'.
  selector = ask([{ fields: [{
    key: 'required', label: t('password.require', 'Require password'), switch: [t('password.on', 'On'), t('password.off', 'Off')],
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
    context.environment?.onPasswordChoice?.(false);
  };

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (busy) return;
    validate(firstField); validate(secondField);
    if (first.value.length < 8) {
      validate(firstField, t('password.too_short', 'Use at least 8 characters.'));
      first.focus(); return;
    }
    if (first.value !== second.value) {
      validate(secondField, t('password.no_match', 'The two passwords do not match.'));
      second.focus(); return;
    }
    busy = true; save.el.disabled = true; cancel.el.disabled = true;
    say(mode === 'change' ? t('password.changing', 'Changing password…') : t('password.enabling', 'Turning password protection on…'));
    const result = await request('/api/password', { method: 'PUT', json: { password: first.value, confirm: second.value } });
    busy = false; save.el.disabled = false; cancel.el.disabled = false;
    if (!result.ok) { say(result.message, true); return; }
    const changed = mode === 'change';
    closeForm(); paint(result.data);
    say(changed ? t('password.changed', 'Password changed. Other browser sessions have been logged out.') : t('password.on_saved', 'Password protection is On.'));
    context.environment?.onPasswordChoice?.(true);
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
