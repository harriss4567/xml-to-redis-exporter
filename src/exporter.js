export const SUBDOMAINS_KEY = 'subdomains';
export const COOKIE_KEY_PREFIX = 'cookie:';

/**
 * Builds the Redis key for a cookie: "cookie:%NAME%:%HOST%".
 */
export function cookieKey(name, host) {
  return `${COOKIE_KEY_PREFIX}${name}:${host}`;
}

/**
 * Converts a parsed config into an ordered Map of Redis key -> string value.
 * If the same cookie name/host pair appears twice, the last one wins.
 *
 * @param {{ subdomains: string[], cookies: { name: string, host: string, value: string }[] }} config
 * @returns {Map<string, string>}
 */
export function buildEntries(config) {
  const entries = new Map();
  entries.set(SUBDOMAINS_KEY, JSON.stringify(config.subdomains));
  for (const { name, host, value } of config.cookies) {
    entries.set(cookieKey(name, host), value);
  }
  return entries;
}

/**
 * Collects all existing keys matching a pattern using SCAN (non-blocking, unlike KEYS).
 * Handles both node-redis v4 (yields single keys) and v5 (yields arrays of keys).
 */
async function scanKeys(client, pattern) {
  const keys = [];
  for await (const chunk of client.scanIterator({ MATCH: pattern, COUNT: 100 })) {
    keys.push(...[].concat(chunk));
  }
  return keys;
}

/**
 * Writes entries to Redis. Previously exported keys ("subdomains" and every "cookie:*" key)
 * are removed first so Redis mirrors the XML file exactly. Deletion and writes run in a
 * single MULTI/EXEC transaction, so readers never see a half-exported state.
 *
 * @param {import('redis').RedisClientType} client - connected Redis client
 * @param {Map<string, string>} entries
 * @returns {Promise<string[]>} keys that were saved
 */
export async function exportToRedis(client, entries) {
  const staleKeys = await scanKeys(client, `${COOKIE_KEY_PREFIX}*`);
  staleKeys.push(SUBDOMAINS_KEY);

  const tx = client.multi();
  tx.del(staleKeys);
  for (const [key, value] of entries) {
    tx.set(key, value);
  }
  await tx.exec();

  return [...entries.keys()];
}
