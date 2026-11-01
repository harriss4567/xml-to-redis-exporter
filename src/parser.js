import { XMLParser, XMLValidator } from 'fast-xml-parser';

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  textNodeName: '#text',
  // Keep every value as a string ("01net" must not become a number, etc.).
  parseTagValue: false,
  parseAttributeValue: false,
  trimValues: true,
  // Always return arrays for repeatable elements, even if only one is present.
  isArray: (tagName) => tagName === 'subdomain' || tagName === 'cookie',
});

/**
 * Returns the text content of a parsed node (string or {#text: ...} object).
 */
function textOf(node) {
  if (node === undefined || node === null) return '';
  if (typeof node === 'object') return String(node['#text'] ?? '');
  return String(node);
}

/**
 * Parses the XML config and returns its subdomains and cookies.
 *
 * @param {string} xml - XML document contents
 * @returns {{ subdomains: string[], cookies: { name: string, host: string, value: string }[] }}
 * @throws {Error} if the XML is malformed or a cookie is missing required attributes
 */
export function parseConfig(xml) {
  if (typeof xml !== 'string' || xml.trim() === '') {
    throw new Error('XML input is empty');
  }

  const validation = XMLValidator.validate(xml);
  if (validation !== true) {
    const { msg, line, col } = validation.err;
    throw new Error(`Invalid XML: ${msg} (line ${line}, column ${col})`);
  }

  const doc = parser.parse(xml);
  const config = doc.config;
  if (config === undefined) {
    throw new Error('Invalid config: missing <config> root element');
  }

  const subdomains = (config.subdomains?.subdomain ?? [])
    .map(textOf)
    .filter((s) => s !== '');

  const cookies = (config.cookies?.cookie ?? []).map((node, index) => {
    const name = node?.['@_name'];
    const host = node?.['@_host'];
    if (!name || !host) {
      throw new Error(
        `Invalid config: cookie #${index + 1} must have non-empty "name" and "host" attributes`,
      );
    }
    return { name, host, value: textOf(node) };
  });

  return { subdomains, cookies };
}
