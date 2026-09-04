import { settleManagedResidue } from '../desks/settlement-runtime.js';

const args = process.argv.slice(2);
if (args.length !== 1 || !['--dry-run', '--yes'].includes(args[0]!)) {
  console.error('usage: ronin-desk-settle --dry-run | --yes');
  process.exit(2);
}
try {
  const result = await settleManagedResidue(args[0] === '--yes');
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
} catch (error) {
  console.error(`STUCK: ${String((error as Error).message ?? error)}`);
  process.exit(5);
}
