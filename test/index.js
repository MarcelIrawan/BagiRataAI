/**
 * Entry point for `node --test test/`.
 *
 * Node 24 treats the positional argument to `node --test` as a glob, so the
 * bare directory `test/` resolves to this module instead of a test file. This
 * file imports every *.test.js beside it so `npm test` runs the whole suite.
 * New test files are picked up automatically.
 */
import { readdirSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { join } from 'node:path';

const dir = fileURLToPath(new URL('.', import.meta.url));

for (const file of readdirSync(dir).filter((name) => name.endsWith('.test.js')).sort()) {
  await import(pathToFileURL(join(dir, file)).href);
}
