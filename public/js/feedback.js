/* Feedback is an ordinary Workbench surface: one form, one explicit send, no overlay. */
import { WorkspaceKit } from './workspace-kit.js';
import { request } from './request.js';
import { t } from './lexicon.js';

export const FEEDBACK_TYPE = 'ronin.feedback';

export function registerFeedbackSurface() {
  const { library } = WorkspaceKit.workbench;
  if (library.has(FEEDBACK_TYPE)) return;
  library.register({
    type: FEEDBACK_TYPE,
    header: 'surface',
    visible: () => false,
    label: () => t('feedback.title', 'Feedback'),
    create: ({ workspace, environment }) => environment.feedback(workspace),
  });
}

const node = (tag, cls, text) => {
  const out = document.createElement(tag);
  if (cls) out.className = cls;
  if (text != null) out.textContent = text;
  return out;
};

function groups() { return [
  ['about', t('feedback.about', 'A little about you'), [
    ['developer', t('feedback.about_developer', 'Developer')], ['founder', t('feedback.about_founder', 'Founder')],
    ['researcher', t('feedback.about_researcher', 'Researcher')], ['student', t('feedback.about_student', 'Student')], ['other', t('feedback.other', 'Something else')],
  ]],
  ['using_ronin_for', t('feedback.using', 'What do you use Ronin for?'), [
    ['coding', t('feedback.using_coding', 'Coding')], ['research', t('feedback.using_research', 'Research')],
    ['writing', t('feedback.using_writing', 'Writing')], ['operations', t('feedback.using_operations', 'Operations')], ['other', t('feedback.other', 'Something else')],
  ]],
  ['feedback_kind', t('feedback.kind', 'What kind of feedback is this?'), [
    ['like', t('feedback.kind_like', 'Something I like')], ['idea', t('feedback.kind_idea', 'An idea')],
    ['problem', t('feedback.kind_problem', 'Something is not working')], ['question', t('feedback.kind_question', 'A question')], ['other', t('feedback.other', 'Something else')],
  ]],
]; }

function packetId() {
  const alphabet = 'abcdefghjkmnpqrstvwxyz23456789';
  const bytes = crypto.getRandomValues(new Uint8Array(26));
  return 'pkt_' + [...bytes].map((byte) => alphabet[byte % alphabet.length]).join('');
}

export function createFeedbackSurface(onSent) {
  const { createSurface, createAction, createForm, createField } = WorkspaceKit.primitives;
  const send = createAction({ label: t('feedback.send', 'Send'), size: 'compact', kind: 'primary' });
  const surface = createSurface({ label: t('feedback.title', 'Feedback'), className: 'fb-surface', actions: [send] });
  const form = createForm();
  surface.content.classList.add('fb-surface-content');
  form.el.classList.add('fb-form');
  form.fields.classList.add('fb-fields');
  const message = node('textarea', 'fb-message');
  message.rows = 10;
  message.maxLength = 2000;
  message.placeholder = t('feedback.message_placeholder', 'Tell us anything. What do you like? What should we add or change?');
  form.fields.append(createField({
    label: t('feedback.message', 'What would you like to tell us?'), control: message,
    description: t('feedback.message_help', 'Write as much or as little as you want. Everything below is optional.'),
  }).el);
  const selected = {};
  const choiceButtons = [];
  for (const [name, label, choices] of groups()) {
    selected[name] = new Set();
    const group = node('fieldset', 'fb-choice-group');
    group.append(node('legend', 'fb-choice-label', label));
    const row = node('div', 'fb-choices');
    for (const [value, word] of choices) {
      const choice = createAction({ label: word, size: 'compact', selected: false });
      choice.el.addEventListener('click', () => {
        const on = !selected[name].has(value);
        if (on) selected[name].add(value); else selected[name].delete(value);
        choice.el.setAttribute('aria-pressed', String(on));
      });
      choiceButtons.push(choice.el);
      row.append(choice.el);
    }
    group.append(row);
    form.fields.append(group);
  }
  const contact = node('input', 'fb-contact');
  contact.type = 'text'; contact.maxLength = 320; contact.autocomplete = 'email';
  form.fields.append(createField({
    label: t('feedback.reply_contact', 'Reply contact (optional)'), control: contact,
    description: t('feedback.reply_help', 'Only if you would like a reply. It is never stored with this Ronin install’s identity.'),
  }).el);
  surface.content.append(form.el);
  let id = '';
  let sent = false;
  const submit = async () => {
    if (send.el.disabled) return;
    id ||= packetId();
    send.setDisabled(true); send.el.textContent = t('feedback.sending', 'Sending…');
    form.notice.set('', '');
    const body = { message: message.value.trim(), reply_contact: contact.value.trim() };
    for (const [name, values] of Object.entries(selected)) body[name] = [...values];
    const result = await request('/api/feedback', { method: 'POST', json: { packet_id: id, body } });
    if (!result.ok) {
      form.notice.set('failed', result.message);
      send.setDisabled(false); send.el.textContent = t('feedback.send', 'Send');
      return;
    }
    send.el.textContent = t('feedback.sent', 'Sent — thank you');
    form.notice.set('success', t('feedback.thank_you', 'Thank you for helping us make Ronin better.'));
    sent = true;
    window.setTimeout(() => onSent?.(), 900);
  };
  send.el.addEventListener('click', () => void submit());
  form.el.addEventListener('submit', (event) => { event.preventDefault(); void submit(); });
  const reset = () => {
    id = ''; sent = false; message.value = ''; contact.value = '';
    for (const values of Object.values(selected)) values.clear();
    for (const button of choiceButtons) button.setAttribute('aria-pressed', 'false');
    form.notice.set('', ''); send.setDisabled(false); send.el.textContent = t('feedback.send', 'Send');
  };
  return { el: surface.el, show: () => { if (sent) reset(); message.focus(); } };
}

export function installFeedbackButton(workspace) {
  const slot = document.getElementById('feedbackaction');
  if (!slot) return;
  const action = WorkspaceKit.primitives.createAction({ label: t('feedback.button', 'Feedback'), size: 'compact', className: 'fb-bar-action' });
  action.el.addEventListener('click', () => {
    if (workspace.active?.view?.placeFeedback?.()) return;
    workspace.navigate('cowork');
    workspace.active?.view?.placeFeedback?.();
  });
  slot.replaceChildren(action.el);
}
