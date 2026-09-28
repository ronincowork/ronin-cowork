import type { RequestHandler } from 'express';
import { count } from './counts.js';

// Only explicit browser mutations. Roster polls, terminal bytes and page views aren't tools.
const operations: Array<[string, RegExp, string]> = [
  ['POST', /^\/api\/(launch|session)$/, 'session_create'],
  ['POST', /^\/api\/sessions\/[^/]+\/archive$/, 'session_archive'],
  ['POST', /^\/api\/archived-sessions\/[^/]+\/rehydrate$/, 'session_restore'],
  ['DELETE', /^\/api\/sessions\/[^/]+$/, 'DELETE /api/sessions/:name'],
  ['DELETE', /^\/api\/archived-sessions\/[^/]+$/, 'DELETE /api/archived-sessions/:id'],
  ['POST', /^\/api\/sessions\/[^/]+\/shutdown$/, 'POST /api/sessions/:name/shutdown'],
  ['PUT', /^\/api\/sessions\/[^/]+\/teams$/, 'session_set'],
  ['POST', /^\/api\/sessions\/[^/]+\/(team_lead|project-root)$/, 'session_set'],
  ['POST', /^\/api\/team-rosters$/, 'team roster write'],
  ['PUT', /^\/api\/(team|team-rosters\/[^/]+)$/, 'team roster write'],
  ['POST', /^\/api\/work-items$/, 'work item create'],
  ['PUT', /^\/api\/work-items\/[^/]+$/, 'work item write'],
  ...['assign', 'release', 'return', 'restore', 'reparent', 'stage', 'status', 'docs'].map(verb =>
    ['POST', new RegExp('^/api/work-items/[^/]+/' + verb + '$'), 'work item ' + verb] as [string, RegExp, string]),
];
export const countBrowserTool: RequestHandler = (req, _res, next) => {
  const source = req.get('x-ronin-source');
  if (source === 'user_desktop' || source === 'user_mobile') {
    const operation = operations.find(([method, pattern]) => method === req.method && pattern.test(req.path));
    if (operation) count('tool.call', { tool: operation[2], source });
  }
  next();
};
