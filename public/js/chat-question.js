/* part of the ronin-cowork client — see js/README.md */
/**
 * THE QUESTION IN CHAT (KAN-657, KAN-658) — what an Agent's CLI is stopped at, at the end of its
 * conversation, answered there (owner, 2026-11-18: "Ideally, we never have to go to terminal or
 * even know it's there"). The card's `question` (src/asking.ts) is drawn as ERABI questions: a
 * choice per question the CLI asked, Approve or Keep planning under a plan, Yes or No under a
 * permission with the exact command. One press answers a single choice; several questions, or
 * checkboxes, go with Send. A one-of question also carries the CLI's implicit final answer,
 * Write something: its required line is sent literally. The tile stays on Chat.
 */
import { t } from './lexicon.js';
import { ask } from './ask.js';
import { renderMarkdownDocument } from './markdown-reader.js';
import { WorkspacePrimitives } from './workspace-primitives.js';

const el = (tag, cls, text) => {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text != null) node.textContent = String(text);
  return node;
};

/** A question Chat can answer by a press; anything else is Answer in Terminal's. */
export const answerable = (question) => ['choice', 'plan', 'permission'].includes(question?.kind);

/**
 * @param question  the card's question
 * @param send      (answer) → Promise<{ ok, message }>: { choices: [n | [n…]] } or { yes }
 * @param terminal  the way to the terminal, for free text; null where there is none
 */
export function buildQuestion(question, { send, terminal = null }) {
  const { createAction, createActionBar } = WorkspacePrimitives;
  const root = el('div', 'chat-question');
  const notice = el('p', 'chat-question-notice');
  let busy = false;
  const answer = async (value) => {
    if (busy) return;
    busy = true;
    root.dataset.state = 'sending';
    notice.textContent = t('question.sending', 'Answering…');
    const result = await send(value);
    busy = false;
    root.dataset.state = result.ok ? 'sent' : '';
    notice.textContent = result.ok ? '' : result.message;
  };
  const yesNo = (yes, no) => ask([{ fields: [{ key: 'yes', label: t('question.answer', 'Answer'), options: [{ v: 'yes', l: yes }, { v: 'no', l: no }] }] }], {
    exposed: true, density: 'tight', onChange: (now) => { if (now.yes) void answer({ yes: now.yes === 'yes' }); },
  }).el;

  if (question.kind === 'plan') {
    root.append(el('p', 'chat-question-title', t('question.plan', 'Approve this plan?')),
      renderMarkdownDocument(question.plan),
      yesNo(t('question.approve', 'Approve'), t('question.keep_planning', 'Keep planning')));
  } else if (question.kind === 'permission') {
    root.append(el('p', 'chat-question-title', t('question.permission', 'Allow {tool}?', { tool: question.tool })));
    if (question.reason && question.reason !== question.detail) root.append(el('p', 'chat-question-reason', question.reason));
    if (question.detail) root.append(renderMarkdownDocument(`\`\`\`\n${question.detail}\n\`\`\``));
    root.append(yesNo(t('question.yes', 'Yes'), t('question.no', 'No')));
  } else {
    const questions = question.questions || [];
    const values = questions.map((q) => q.many ? [] : '');
    const custom = questions.map(() => '');
    const stage = el('div', 'chat-question-stage');
    let at = 0;
    const choiceAt = (i) => {
      const q = questions[i];
      const value = values[i];
      if (q.many) {
        const picked = value.filter((v) => v !== 'write').map(Number);
        return value.includes('write') ? { choices: picked, text: custom[i].trim() } : picked;
      }
      return value === 'write' ? { text: custom[i].trim() } : value === '' ? null : Number(value);
    };
    const complete = (i) => {
      const q = questions[i];
      const value = values[i];
      if (q.many) return !value.includes('write') || Boolean(custom[i].trim()); // no ticks is a valid answer
      return value !== '' && (value !== 'write' || Boolean(custom[i].trim()));
    };
    const paint = () => {
      stage.replaceChildren();
      const i = at;
      const q = questions[i];
      if (!q) return;
      const fieldKey = `q${i}`;
      const customRow = () => {
        const input = el('input', 'chat-question-custom');
        input.type = 'text';
        input.value = custom[i];
        input.placeholder = t('question.write_placeholder', 'Write your answer');
        input.addEventListener('input', () => { custom[i] = input.value; });
        return input;
      };
      const one = ask([{ fields: [{
        key: fieldKey, label: q.header || t('question.answer', 'Answer'), many: q.many,
        options: [
          ...q.options.map((o, n) => ({ v: String(n), l: o.label, ...(o.description ? { sub: o.description } : {}) })),
          { v: 'write', l: t('question.write', 'Write something here'), row: customRow, required: true },
        ],
      }] }], { value: { [fieldKey]: values[i] },
        exposed: true, density: 'tight',
        onChange: (now) => {
          values[i] = now[fieldKey];
          // A lone, ordinary one-of answer keeps the quick one-press path.
          if (questions.length === 1 && !q.many && now[fieldKey] !== '' && now[fieldKey] !== 'write') void answer({ choices: [Number(now[fieldKey])] });
        },
      });
      const actions = [];
      if (i < questions.length - 1) {
        actions.push(createAction({ label: t('question.next', 'Next'), kind: 'primary', size: 'compact', action: () => {
          values[i] = one.value()[fieldKey];
          if (!complete(i)) {
            notice.textContent = t('question.unanswered', 'Answer this question first.');
            return;
          }
          notice.textContent = '';
          at += 1;
          paint();
        } }));
      } else {
        actions.push(createAction({ label: t('question.send', 'Send'), kind: 'primary', size: 'compact', action: () => {
          values[i] = one.value()[fieldKey];
          if (!questions.every((_, index) => complete(index))) {
          notice.textContent = t('question.unanswered', 'Answer each question first.');
          return;
          }
          void answer({ choices: questions.map((_, index) => choiceAt(index)) });
        } }));
      }
      if (terminal) actions.push(createAction({ label: t('transcript.answer_in_terminal', 'Answer in Terminal'), size: 'compact', action: terminal }));
      stage.append(el('p', 'chat-question-title', q.question), one.el, createActionBar({ actions }).el);
    };
    root.append(stage);
    paint();
  }
  root.append(notice);
  return root;
}
