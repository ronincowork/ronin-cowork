import { sessionOfPane } from './tmux.js';

export async function messageSender(
  session = process.env.RONIN_SESSION ?? '',
  pane = process.env.TMUX_PANE ?? '',
  resolvePane: (paneId: string) => Promise<string | null> = sessionOfPane,
): Promise<string> {
  const resolved = session || (pane ? await resolvePane(pane) : '') || '';
  return resolved && !resolved.startsWith('grid_') ? resolved : 'Agent';
}
