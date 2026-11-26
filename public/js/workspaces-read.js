/* part of the ronin-cowork client — see js/README.md */
import { request } from './request.js';
import { store } from './store.js';

// EVERY LIST OF WORKSPACES ON THE PAGE HEARS EACH READ (KAN-724). A Workspace saved on its page
// reads the Workspaces again; New Team, seated on another bench, hears that read and reads its
// own list, so a Workspace just made is offered there without a reload. Nothing polls.
const heard = new Set();
// THE WORKSPACES PUSH (KAN-809): the server says `workspaces-changed` whenever the workspaces fact is
// rebuilt, whoever wrote the record; every read someone listens to reads again.
const reads = new Set();
store.listen('workspaces-changed', () => { for (const one of reads) if (one.listening()) void one.read(); });
/** The office's Workspaces: one read, every surface on the bench hears it. No Campaign is named (KAN-727). */
export function createWorkspacesRead() {
  let workspaces = [];
  const listeners = new Set();
  const read = {
    listening: () => listeners.size > 0,
    list: () => workspaces,
    read: async () => {
      const answer = await request('/api/workspaces', { cache: 'no-store' });
      if (answer.ok) workspaces = answer.data?.workspaces || [];
      for (const listener of [...listeners, ...heard]) listener(answer);
      return answer;
    },
    subscribe: (listener) => { listeners.add(listener); return () => listeners.delete(listener); },
  };
  reads.add(read);
  return read;
}

/** Hear every bench's Workspaces read on this page. Returns the unsubscribe. */
export function hearWorkspaces(listener) {
  heard.add(listener);
  return () => heard.delete(listener);
}
