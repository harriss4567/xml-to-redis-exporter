import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parseArgs, run, UsageError } from '../src/cli.js';
import { FakeRedis } from './fakeRedis.js';

const sampleXml = () => readFile(new URL('./fixtures/sample.xml', import.meta.url), 'utf8');

function deps(redis, xml) {
  const lines = [];
  return {
    lines,
    options: {
      readFileFn: async () => xml,
      clientFactory: () => redis,
      log: (line) => lines.push(line),
    },
  };
}

test('parseArgs: file only', () => {
  assert.deepEqual(parseArgs(['/data/config.xml']), { verbose: false, file: '/data/config.xml' });
});

test('parseArgs: -v before or after the file', () => {
  assert.deepEqual(parseArgs(['-v', 'a.xml']), { verbose: true, file: 'a.xml' });
  assert.deepEqual(parseArgs(['a.xml', '-v']), { verbose: true, file: 'a.xml' });
});

test('parseArgs: rejects missing file, extra files and unknown options', () => {
  assert.throws(() => parseArgs([]), UsageError);
  assert.throws(() => parseArgs(['-v']), UsageError);
  assert.throws(() => parseArgs(['a.xml', 'b.xml']), UsageError);
  assert.throws(() => parseArgs(['-x', 'a.xml']), /Unknown option: -x/);
});

test('run without -v prints only a summary', async () => {
  const redis = new FakeRedis();
  const { lines, options } = deps(redis, await sampleXml());
  await run(['config.xml'], options);

  assert.deepEqual(lines, ['Exported 4 keys to Redis.']);
  assert.equal(redis.get('cookie:dlp-avast:01net'), 'mmm_net_dlp_777_ppc_m');
  assert.ok(redis.closed, 'client should be closed');
});

test('run with -v prints every saved key', async () => {
  const redis = new FakeRedis();
  const { lines, options } = deps(redis, await sampleXml());
  await run(['-v', 'config.xml'], options);

  assert.deepEqual(lines, [
    'subdomains',
    'cookie:dlp-avast:amazon',
    'cookie:dlp-avast:01net',
    'cookie:dlp-avg:amazon',
    'Exported 4 keys to Redis.',
  ]);
});

test('run does not touch Redis when the XML is invalid', async () => {
  const redis = new FakeRedis({ 'cookie:keep:me': 'v' });
  const { options } = deps(redis, '<config><broken></config>');
  await assert.rejects(run(['bad.xml'], options), /Invalid XML/);
  assert.equal(redis.connected, false);
  assert.equal(redis.get('cookie:keep:me'), 'v');
});

test('run closes the client even if the export fails', async () => {
  const redis = new FakeRedis();
  redis.multi = () => { throw new Error('boom'); };
  const { options } = deps(redis, await sampleXml());
  await assert.rejects(run(['config.xml'], options), /boom/);
  assert.ok(redis.closed);
});

test('run propagates file read errors', async () => {
  const redis = new FakeRedis();
  await assert.rejects(
    run(['missing.xml'], {
      readFileFn: async () => { throw new Error('ENOENT: no such file'); },
      clientFactory: () => redis,
      log: () => {},
    }),
    /ENOENT/,
  );
  assert.equal(redis.connected, false);
});
