const dns = require('node:dns').promises;
const net = require('node:net');
const http = require('node:http');
const https = require('node:https');
const blocked = new net.BlockList();
for (const [ip, bits] of [['0.0.0.0',8],['10.0.0.0',8],['100.64.0.0',10],['127.0.0.0',8],['169.254.0.0',16],['172.16.0.0',12],['192.0.0.0',24],['192.0.2.0',24],['192.168.0.0',16],['198.18.0.0',15],['198.51.100.0',24],['203.0.113.0',24],['224.0.0.0',4],['240.0.0.0',4]]) blocked.addSubnet(ip,bits);
async function validateDestination(value, lookup = dns.lookup) {
  const url = new URL(value);
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || (url.port && !['80','443'].includes(url.port))) throw Error('Unsupported URL scheme, credentials or port. Use a public HTTP(S) source.');
  const host = url.hostname.toLowerCase();
  if (host === 'localhost' || host.endsWith('.local') || host.endsWith('.localhost') || host.includes(':')) throw Error('Private or unsupported destination blocked.');
  const records = await lookup(host, { family: 4, all: true });
  if (!records.length || records.some(record => !net.isIPv4(record.address) || blocked.check(record.address))) throw Error('Private or reserved network destination blocked.');
  return { url, address: records[0].address };
}
function requestBuffer(url, address, headers, signal) {
  return new Promise((resolve, reject) => {
    const request = (url.protocol === 'https:' ? https : http).request(url, {
      headers, signal,
      // Pin the validated DNS answer for this connection, including TLS hostname verification.
      lookup: (_host, options, callback) => callback(null, ...(options.all ? [[{address, family:4}]] : [address, 4])),
    }, response => {
      const chunks = []; let size = 0;
      response.on('data', chunk => {
        size += chunk.length;
        if (size > 20_000_000) { response.destroy(Error('Source exceeds the 20 MB reading limit.')); return; }
        chunks.push(chunk);
      });
      response.on('error', reject);
      response.on('end', () => resolve({ status: response.statusCode, headers: response.headers, buffer: Buffer.concat(chunks) }));
    });
    request.on('error', reject); request.end();
  });
}
async function readPublicResource(value, { canvasOrigin = '', token = '', lookup, transport = requestBuffer } = {}) {
  const signal = AbortSignal.timeout(20000);
  let current = value;
  for (let hop = 0; hop <= 5; hop++) {
    const { url, address } = await validateDestination(current, lookup);
    const headers = { Accept: '*/*', 'Accept-Encoding': 'identity' };
    if (canvasOrigin && url.origin === canvasOrigin && token) headers.Authorization = `Bearer ${token}`;
    const result = await transport(url, address, headers, signal);
    if ([301,302,303,307,308].includes(result.status)) {
      if (!result.headers.location) throw Error('Redirect has no destination.');
      current = new URL(result.headers.location, url).href;
      if (url.protocol === 'https:' && new URL(current).protocol !== 'https:') throw Error('Insecure redirect blocked.');
      continue;
    }
    return { ...result, url: url.href };
  }
  throw Error('Too many redirects. Open the source in Canvas to check access.');
}
module.exports = { validateDestination, readPublicResource };
