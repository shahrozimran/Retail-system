import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { planRelease, stampVersion, validateArtifacts, publishRelease } from './release.mjs';

const sha = 'a'.repeat(40), older = 'b'.repeat(40);
const release = (version, extra = {}) => ({ tag_name: `desktop-v${version}`, draft: false, prerelease: false, ...extra });
const body = `<!-- desktop-source:${sha} -->`;

test('versions advance past published releases without requiring source version commits', () => {
  assert.equal(planRelease('1.0.1', [], sha).version, '1.0.1');
  assert.equal(planRelease('1.0.1', [release('1.0.1')], sha).version, '1.0.2');
  assert.equal(planRelease('1.0.1', [release('1.0.9'), release('1.0.2')], sha).version, '1.0.10');
  assert.equal(planRelease('2.0.0', [release('1.0.9')], sha).version, '2.0.0');
  assert.equal(planRelease('1.0.1', [release('9.0.0', { prerelease: true })], sha).version, '1.0.1');
  assert.throws(() => planRelease('01.0.0', [], sha));
});

test('retries skip published commits, recover their draft and reject stale drafts', () => {
  assert.deepEqual(planRelease('1.0.1', [release('1.0.2', { body })], sha), { skip: true });
  assert.equal(planRelease('1.0.1', [release('1.0.2', { body, draft: true })], sha).version, '1.0.2');
  assert.equal(planRelease('1.0.1', [release('1.0.2', { draft: true })], sha).version, '1.0.3');
  assert.throws(() => planRelease('1.0.1', [release('1.0.2', { body, draft: true }), release('1.0.3')], sha), /newer release/);
});

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'retail-release-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const native = path.join(root, 'desktop/src-tauri');
  const artifacts = path.join(root, 'desktop/artifacts');
  fs.mkdirSync(native, { recursive: true });
  fs.mkdirSync(artifacts, { recursive: true });
  fs.writeFileSync(path.join(native, 'tauri.conf.json'), JSON.stringify({ version: '1.0.1', productName: 'Global Auto Parts', plugins: { updater: { pubkey: 'unchanged-key' } } }));
  fs.writeFileSync(path.join(native, 'Cargo.toml'), '[package]\r\nname = "global-auto-parts"\r\nversion = "1.0.1"\r\n');
  fs.writeFileSync(path.join(native, 'Cargo.lock'), 'version = 4\n\n[[package]]\nname = "global-auto-parts"\nversion = "1.0.1"\n\n[[package]]\nname = "other-crate"\nversion = "1.0.1"\n');
  return { root, native, artifacts };
}

test('version stamping changes only the app version and preserves the updater key', t => {
  const { root, native } = fixture(t);
  stampVersion(root, '1.0.2');
  const config = JSON.parse(fs.readFileSync(path.join(native, 'tauri.conf.json')));
  assert.equal(config.version, '1.0.2');
  assert.equal(config.plugins.updater.pubkey, 'unchanged-key');
  assert.match(fs.readFileSync(path.join(native, 'Cargo.toml'), 'utf8'), /version = "1.0.2"/);
  assert.match(fs.readFileSync(path.join(native, 'Cargo.lock'), 'utf8'), /name = "other-crate"\nversion = "1.0.1"/);
  fs.appendFileSync(path.join(native, 'Cargo.toml'), '# unchanged\n');
  fs.writeFileSync(path.join(native, 'Cargo.lock'), 'invalid');
  assert.throws(() => stampVersion(root, '1.0.3'), /Cargo.lock/);
  assert.equal(JSON.parse(fs.readFileSync(path.join(native, 'tauri.conf.json'))).version, '1.0.2');
});

test('only current-version files are released; mismatched URLs, signatures and checksums fail', t => {
  const { root, artifacts } = fixture(t);
  const installer = 'Global.Auto.Parts_1.0.1_x64-setup.exe';
  const manifest = { version: '1.0.1', platforms: { 'windows-x86_64': {
    signature: 'c2lnbmF0dXJl',
    url: `https://github.com/shahrozimran/Retail-system/releases/download/desktop-v1.0.1/${installer}`,
  } } };
  fs.writeFileSync(path.join(artifacts, installer), 'installer fixture');
  fs.writeFileSync(path.join(artifacts, installer + '.sig'), 'c2lnbmF0dXJl\n');
  // An old installer must never be included through a directory-wide glob.
  fs.writeFileSync(path.join(artifacts, 'old-installer.exe'), 'old');
  function writeManifest() {
    fs.writeFileSync(path.join(artifacts, 'latest.json'), JSON.stringify(manifest));
    fs.writeFileSync(path.join(artifacts, 'SHA256SUMS.txt'), [installer, installer + '.sig', 'latest.json'].map(name => `${createHash('sha256').update(fs.readFileSync(path.join(artifacts, name))).digest('hex')}  ${name}`).join('\n') + '\n');
  }
  writeManifest();
  assert.equal(validateArtifacts(root).files.length, 4);
  manifest.platforms['windows-x86_64'].url = 'https://example.com/wrong.exe';
  writeManifest();
  assert.throws(() => validateArtifacts(root));
  manifest.platforms['windows-x86_64'].url = `https://github.com/shahrozimran/Retail-system/releases/download/desktop-v1.0.1/${installer}`;
  manifest.platforms['windows-x86_64'].signature = 'd3Jvbmc=';
  writeManifest();
  assert.throws(() => validateArtifacts(root));
  manifest.platforms['windows-x86_64'].signature = 'c2lnbmF0dXJl';
  writeManifest();
  fs.appendFileSync(path.join(artifacts, installer), 'tampered');
  assert.throws(() => validateArtifacts(root), /checksums/);
});

function fakeGithub({ failUpload = false, existing = null } = {}) {
  const calls = [], assets = existing ? [{ id: 21, name: 'partial.exe' }] : [];
  const api = async (route, options = {}) => {
    calls.push({ route, ...options });
    if (route === '/releases') return { id: 10, draft: true, ...options.body };
    if (options.method === 'DELETE') { assets.splice(0); return null; }
    if (route.includes('?name=')) {
      if (failUpload) throw new Error('Upload interrupted');
      const asset = { name: decodeURIComponent(route.split('?name=')[1]), state: 'uploaded', size: options.bytes.length };
      assets.push(asset);
      return asset;
    }
    if (options.method === 'PATCH') return { html_url: 'https://github.com/test/release', ...options.body };
    return [...assets];
  };
  return { api, calls };
}

const files = ['installer.exe', 'installer.exe.sig', 'latest.json', 'SHA256SUMS.txt'].map(name => ({ name, bytes: Buffer.from(name) }));

test('publication is atomic: upload all files before making the draft latest', async () => {
  const { api, calls } = fakeGithub();
  await publishRelease(api, [], sha, { version: '1.0.2', files });
  assert.equal(calls[0].body.target_commitish, sha);
  assert.equal(calls[0].body.draft, true);
  assert.equal(calls.filter(c => c.bytes).length, 4);
  assert.deepEqual(calls.at(-1).body, { draft: false, make_latest: 'true' });
});

test('failed upload never publishes an incomplete update; own partial drafts can be retried', async () => {
  const failed = fakeGithub({ failUpload: true });
  await assert.rejects(publishRelease(failed.api, [], sha, { version: '1.0.2', files }), /interrupted/);
  assert.ok(!failed.calls.some(c => c.method === 'PATCH'));
  const draft = release('1.0.2', { id: 10, draft: true, body });
  const retry = fakeGithub({ existing: draft });
  await publishRelease(retry.api, [draft], sha, { version: '1.0.2', files });
  assert.ok(retry.calls.some(c => c.method === 'DELETE'));
  assert.ok(!retry.calls.some(c => c.route === '/releases'));
});

test('published releases and another source commit\'s drafts cannot be overwritten', async () => {
  const { api, calls } = fakeGithub();
  for (const extra of [{ body, draft: false }, { body: `<!-- desktop-source:${older} -->`, draft: true }]) {
    await assert.rejects(publishRelease(api, [release('1.0.2', extra)], sha, { version: '1.0.2', files }), /overwrite/);
  }
  assert.equal(calls.length, 0);
});
