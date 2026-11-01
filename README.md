# XML → Redis exporter

A small Node.js app that reads an XML config file and exports its data to Redis.
It runs with docker compose: one container for the Node.js app and one for Redis.

## What it writes

| Redis key                | Value                                                              |
|--------------------------|--------------------------------------------------------------------|
| `subdomains`             | JSON array of all `<subdomain>` values, e.g. `["http://secureline.tools.avast.com", ...]` |
| `cookie:%NAME%:%HOST%`   | Text of each `<cookie name="..." host="...">`, e.g. `cookie:dlp-avast:amazon` → `mmm_amz_dlp_777_ppc_m` |

Each run replaces the previous export. The `subdomains` key and every existing `cookie:*`
key are deleted, then the new values are written. Both steps run in one `MULTI/EXEC`
transaction, so Redis always matches the latest file and is never left half-written.
Other keys are not touched.

## Requirements

- Docker with Compose v2 (`docker compose`) or the older `docker-compose`

## Usage

```bash
./export.sh /path/to/config.xml       # export
./export.sh -v /path/to/config.xml    # export and print every key saved to Redis
```

Example:

```text
$ ./export.sh -v ./config.xml
subdomains
cookie:dlp-avast:amazon
cookie:dlp-avast:baixaki
...
cookie:dlp-avg:vector
Exported 47 keys to Redis.
```

`export.sh` builds the app image, starts Redis (waiting for its healthcheck), mounts the
XML file read-only into the app container, and runs the export.

To look at the data:

```bash
docker compose exec redis redis-cli GET subdomains
docker compose exec redis redis-cli GET cookie:dlp-avast:amazon
```

To stop Redis: `docker compose down` (add `-v` to also delete the stored data).

## Tests

Unit tests use Node's built-in test runner and an in-memory Redis fake, so they don't need
a running Redis.

```bash
npm install
npm test
```

Or inside Docker:

```bash
docker compose run --rm --entrypoint npm exporter test
```

## Project layout

```
src/parser.js     XML → { subdomains, cookies } (validation, string-only values)
src/exporter.js   builds key/value entries and writes them to Redis
src/cli.js        argument parsing and wiring (REDIS_URL env, default redis://localhost:6379)
test/             unit tests + fixtures
export.sh         entry point that runs everything through docker compose
```

## Error handling

- Malformed XML, a missing `<config>` root, or a cookie without `name`/`host` stops the run
  before Redis is touched, and the script exits with a non-zero code.
- A missing file or bad arguments print usage and exit with a non-zero code.
