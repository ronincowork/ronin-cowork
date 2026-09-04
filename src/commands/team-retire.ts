import { retireTeam } from '../team-retire.js';

const [verb, team, ...rest] = process.argv.slice(2);
if (verb !== 'retire' || !team) {
  console.error('usage: ronin-team retire <team> [--prompt | --ignore]');
  process.exit(2);
}
const disposition = rest.includes('--prompt') ? 'prompt' : rest.includes('--ignore') ? 'ignore' : 'inspect';
try {
  const result = await retireTeam(team, disposition);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  process.exit(result.ok === true ? 0 : 4);
} catch (error) {
  console.error(`STUCK: ${String((error as Error).message ?? error)}`);
  process.exit(5);
}
