/* part of the ronin-cowork client — see js/README.md */
/**
 * A BUTTON'S MESSAGE (owner, 24 Nov 2026): a button on a surface may tell an Agent what the person
 * pressed. It goes the Message box's way (POST /api/messages), marked a press, so the Agent reads
 * "From <person> [Button]: <text>" and a Chat draws it as "Pressed: <text>". The queue routes it.
 * Moving between a workbench's selector steps never sends one (docs/architecture/setup-workbench.md).
 */
import { request } from './request.js';

export const sendPress = (target, text) => request('/api/messages', { method: 'POST', json: { target, text, press: true } });
