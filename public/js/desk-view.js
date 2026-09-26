/* part of the ronin-cowork client — see js/README.md */
/** Desk is its own Workbench kind. It reuses the aggregate surface controller, while
 * owning a distinct profile, tenant identity, restoration namespace, and first-open map. */
import { createCoworkView } from './cowork-view.js';

export function createDeskView() {
  return createCoworkView({ kind: 'desk' });
}
