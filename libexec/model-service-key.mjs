// Called through a private pipe by the model-service launch wrapper.
import { readFileSync } from 'node:fs';
import { parse } from 'dotenv';

const [file, endpoint] = process.argv.slice(2);
try {
  const credential = parse(readFileSync(file));
  if (!credential.OPENAI_API_KEY || credential.OPENAI_BASE_URL !== endpoint) throw new Error();
  process.stdout.write(credential.OPENAI_API_KEY);
} catch {
  process.stderr.write('Model service credential unavailable for this endpoint.\n');
  process.exitCode = 1;
}
