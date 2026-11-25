/**
 * Fetching a plugin release and storing it (dms-plugin-system.md, P2 step "the installer"; design §3).
 *
 *   1. fetch the release's index.json (capped), validate it as a release (validateManifest);
 *   2. verify its signature: `verifySignature({ indexBytes, indexUrl })` must resolve true. In v1 only our CI may
 *      sign (D1, Sigstore against the allow-listed workflow identity). That verifier is not built yet, so without
 *      one every install is refused, unless DMS_PLUGIN_ALLOW_UNSIGNED=1 (development only; logged on every use);
 *   3. download each file the index lists, from beside the index (no other URL), refusing one whose size or sha512
 *      differs; nothing outside the list is fetched or kept;
 *   4. write them to `<dir>/<name>/<version>/` through a temp folder renamed into place, so a version folder is
 *      complete or absent. The same release installed again is a no-op; a different release under the same name
 *      and version is refused (versions are immutable).
 *
 * Nothing here loads the plugin's code: that is P2's loader, after the P0 hazards are settled.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { validateManifest } = require('./index');

const DEFAULT_DIR = process.env.DMS_PLUGINS_DIR || path.resolve(__dirname, '../../var/plugins');
const INDEX_MAX = 1024 * 1024;

async function fetchBytes(fetchImpl, url, max) {
  const res = await fetchImpl(url, { redirect: 'follow' });
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  const declared = Number(res.headers?.get?.('content-length'));
  if (Number.isFinite(declared) && declared > max) throw new Error(`${url}: ${declared} bytes, more than the ${max} expected`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length > max) throw new Error(`${url}: ${buf.length} bytes, more than the ${max} expected`);
  return buf;
}

function defaultVerifier() {
  if (process.env.DMS_PLUGIN_ALLOW_UNSIGNED === '1') {
    return async ({ indexUrl }) => {
      console.warn(`[plugins] WARNING: installing ${indexUrl} WITHOUT a signature check (DMS_PLUGIN_ALLOW_UNSIGNED=1)`);
      return true;
    };
  }
  return async () => { throw new Error('no signature verifier is configured: plugin installs are refused (DMS_PLUGIN_ALLOW_UNSIGNED=1 for development only)'); };
}

const sha512hex = (buf) => crypto.createHash('sha512').update(buf).digest('hex');
const digestMatches = (buf, want) => (/^[0-9a-f]{128}$/.test(want) ? sha512hex(buf) === want : crypto.createHash('sha512').update(buf).digest('base64') === want);

/**
 * @param {{ url: string, dir?: string, fetchImpl?: Function, verifySignature?: Function }} o
 * @returns {Promise<{ name, version, dir, files, indexSha256, already: boolean }>}
 */
async function installRelease({ url, dir = DEFAULT_DIR, fetchImpl = globalThis.fetch, verifySignature = defaultVerifier() }) {
  let indexUrl;
  try { indexUrl = new URL(url); } catch { throw new Error(`"${url}" is not a URL`); }
  if (!['https:', 'http:'].includes(indexUrl.protocol)) throw new Error(`${url}: only http(s) URLs`);

  const indexBytes = await fetchBytes(fetchImpl, indexUrl.href, INDEX_MAX);
  let index;
  try { index = JSON.parse(indexBytes.toString('utf8')); } catch { throw new Error(`${url}: index.json is not JSON`); }
  const problems = validateManifest(index, { release: true });
  if (problems.length) throw new Error(`${url}: not a valid release: ${problems.join('; ')}`);

  if (!(await verifySignature({ indexBytes, indexUrl: indexUrl.href, index }))) throw new Error(`${url}: the signature did not verify`);

  const indexSha256 = crypto.createHash('sha256').update(indexBytes).digest('hex');
  const target = path.join(dir, index.name, index.version);
  const marker = path.join(target, '.dms-release.json');
  if (fs.existsSync(target)) {
    const have = fs.existsSync(marker) ? JSON.parse(fs.readFileSync(marker, 'utf8')) : null;
    if (have && have.indexSha256 === indexSha256) return { name: index.name, version: index.version, dir: target, files: index.files.length, indexSha256, already: true };
    throw new Error(`${index.name} ${index.version} is already installed from a different release (versions are immutable)`);
  }

  fs.mkdirSync(path.join(dir, index.name), { recursive: true });
  const tmp = fs.mkdtempSync(path.join(dir, index.name, `.${index.version}-`));
  try {
    for (const f of index.files) {
      const fileUrl = new URL(f.path, indexUrl);
      // beside the index only: a path can't climb out (validateManifest), and the origin must stay the index's
      if (fileUrl.origin !== indexUrl.origin) throw new Error(`${f.path}: not beside the index`);
      const buf = await fetchBytes(fetchImpl, fileUrl.href, f.size);
      if (buf.length !== f.size) throw new Error(`${f.path}: ${buf.length} bytes, the index says ${f.size}`);
      if (!digestMatches(buf, f.sha512)) throw new Error(`${f.path}: sha512 does not match the index`);
      const out = path.join(tmp, f.path);
      if (!out.startsWith(tmp + path.sep)) throw new Error(`${f.path}: not inside the release`);
      fs.mkdirSync(path.dirname(out), { recursive: true });
      fs.writeFileSync(out, buf);
    }
    fs.writeFileSync(path.join(tmp, 'index.json'), indexBytes);
    fs.writeFileSync(path.join(tmp, '.dms-release.json'), JSON.stringify({ url: indexUrl.href, indexSha256, installedAt: new Date().toISOString() }));
    fs.renameSync(tmp, target);
  } catch (e) {
    fs.rmSync(tmp, { recursive: true, force: true });
    throw e;
  }
  return { name: index.name, version: index.version, dir: target, files: index.files.length, indexSha256, already: false };
}

module.exports = { installRelease, DEFAULT_DIR };
