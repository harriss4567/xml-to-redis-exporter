import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parseConfig } from '../src/parser.js';

const fixture = (name) => readFile(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');

test('parses subdomains in document order', async () => {
  const { subdomains } = parseConfig(await fixture('sample.xml'));
  assert.deepEqual(subdomains, ['http://secureline.tools.avast.com', 'http://gf.tools.avast.com']);
});

test('parses cookies with name, host and value, ignoring comments', async () => {
  const { cookies } = parseConfig(await fixture('sample.xml'));
  assert.deepEqual(cookies, [
    { name: 'dlp-avast', host: 'amazon', value: 'mmm_amz_dlp_777_ppc_m' },
    { name: 'dlp-avast', host: '01net', value: 'mmm_net_dlp_777_ppc_m' },
    { name: 'dlp-avg', host: 'amazon', value: 'mmm_amz_dlp_779_ppc_m' },
  ]);
});

test('keeps numeric-looking values as strings', () => {
  const { subdomains, cookies } = parseConfig(
    '<config><subdomains><subdomain>12345</subdomain></subdomains>'
    + '<cookies><cookie name="n" host="007">0123</cookie></cookies></config>',
  );
  assert.deepEqual(subdomains, ['12345']);
  assert.deepEqual(cookies, [{ name: 'n', host: '007', value: '0123' }]);
});

test('handles a single subdomain and a single cookie as arrays', () => {
  const result = parseConfig(
    '<config><subdomains><subdomain>http://a.com</subdomain></subdomains>'
    + '<cookies><cookie name="x" host="y">z</cookie></cookies></config>',
  );
  assert.deepEqual(result, {
    subdomains: ['http://a.com'],
    cookies: [{ name: 'x', host: 'y', value: 'z' }],
  });
});

test('trims whitespace around values', () => {
  const { subdomains, cookies } = parseConfig(
    '<config><subdomains><subdomain>\n  http://a.com \t</subdomain></subdomains>'
    + '<cookies><cookie name="x" host="y">  v  </cookie></cookies></config>',
  );
  assert.deepEqual(subdomains, ['http://a.com']);
  assert.equal(cookies[0].value, 'v');
});

test('returns empty lists when sections are missing or empty', () => {
  assert.deepEqual(parseConfig('<config></config>'), { subdomains: [], cookies: [] });
  assert.deepEqual(
    parseConfig('<config><subdomains/><cookies></cookies></config>'),
    { subdomains: [], cookies: [] },
  );
});

test('allows a cookie with an empty value', () => {
  const { cookies } = parseConfig('<config><cookies><cookie name="a" host="b"/></cookies></config>');
  assert.deepEqual(cookies, [{ name: 'a', host: 'b', value: '' }]);
});

test('decodes XML entities', () => {
  const { subdomains } = parseConfig(
    '<config><subdomains><subdomain>http://a.com/?x=1&amp;y=2</subdomain></subdomains></config>',
  );
  assert.deepEqual(subdomains, ['http://a.com/?x=1&y=2']);
});

test('throws on malformed XML', () => {
  assert.throws(() => parseConfig('<config><subdomains></config>'), /Invalid XML/);
});

test('throws on empty input', () => {
  assert.throws(() => parseConfig(''), /empty/);
  assert.throws(() => parseConfig('   '), /empty/);
});

test('throws when root element is not <config>', () => {
  assert.throws(() => parseConfig('<other/>'), /missing <config>/);
});

test('throws when a cookie lacks name or host', () => {
  assert.throws(
    () => parseConfig('<config><cookies><cookie host="h">v</cookie></cookies></config>'),
    /cookie #1 must have non-empty "name" and "host"/,
  );
  assert.throws(
    () => parseConfig('<config><cookies><cookie name="n" host="h">v</cookie><cookie name="n">v</cookie></cookies></config>'),
    /cookie #2/,
  );
});

test('parses the real config.xml shipped with the project', async () => {
  const xml = await readFile(new URL('../config.xml', import.meta.url), 'utf8');
  const { subdomains, cookies } = parseConfig(xml);
  assert.equal(subdomains.length, 38);
  assert.equal(subdomains[0], 'http://secureline.tools.avast.com');
  assert.equal(subdomains.at(-1), 'https://bits.avcdn.net');
  assert.equal(cookies.length, 46);
  assert.ok(cookies.some((c) => c.name === 'dlp-avg' && c.host === 'filehippo' && c.value === 'Mmm_fhp_dlp_779_ppc_m'));
});
