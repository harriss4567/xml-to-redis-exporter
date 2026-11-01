#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { createClient } from 'redis';
import { parseConfig } from './parser.js';
import { buildEntries, exportToRedis } from './exporter.js';

export const USAGE = 'Usage: export.sh [-v] /path/to/xml';

export class UsageError extends Error {}

/**
 * Parses command-line arguments.
 * @param {string[]} argv - arguments without the node binary and script path
 * @returns {{ verbose: boolean, file: string }}
 */
export function parseArgs(argv) {
  let verbose = false;
  const positional = [];
  for (const arg of argv) {
    if (arg === '-v' || arg === '--verbose') {
      verbose = true;
    } else if (arg.startsWith('-')) {
      throw new UsageError(`Unknown option: ${arg}`);
    } else {
      positional.push(arg);
    }
  }
  if (positional.length !== 1) {
    throw new UsageError('Expected exactly one XML file path');
  }
  return { verbose, file: positional[0] };
}

/**
 * Runs the full export: read file -> parse -> write to Redis -> optionally print keys.
 * Dependencies are injectable to keep this unit-testable.
 */
export async function run(argv, {
  readFileFn = (path) => readFile(path, 'utf8'),
  clientFactory = () => createClient({ url: process.env.REDIS_URL || 'redis://localhost:6379' }),
  log = console.log,
} = {}) {
  const { verbose, file } = parseArgs(argv);
  const xml = await readFileFn(file);
  const entries = buildEntries(parseConfig(xml));

  const client = clientFactory();
  client.on?.('error', () => {}); // errors surface through the awaited calls below
  await client.connect();
  let savedKeys;
  try {
    savedKeys = await exportToRedis(client, entries);
  } finally {
    await (client.close ? client.close() : client.quit());
  }

  if (verbose) {
    for (const key of savedKeys) log(key);
  }
  log(`Exported ${savedKeys.length} keys to Redis.`);
  return savedKeys;
}

// Execute only when invoked directly, not when imported by tests.
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  run(process.argv.slice(2)).catch((err) => {
    console.error(`Error: ${err.message}`);
    if (err instanceof UsageError) {
      console.error(USAGE);
    }
    process.exit(1);
  });
}
