import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const repository = 'shahrozimran/Retail-system';
const marker = sha => `<!-- desktop-source:${sha} -->`;
const sourceOf = release => release.body?.match(/<!-- desktop-source:([a-f0-9]{40}) -->/)?.[1];

function parseVersion(version) {
  assert.match(version, /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/, 'Expected a stable desktop version.');
  const parts = version.split('.').map(Number);
  assert.ok(parts.every(Number.isSafeInteger), 'Version is too large.');
  return parts;
}

function compare(a, b) {
  const left = parseVersion(a), right = parseVersion(b);
  for (let i = 0; i < 3; i++) if (left[i] !== right[i]) return left[i] > right[i] ? 1 : -1;
  return 0;
}

export function planRelease(sourceVersion, releases, sha) {
  parseVersion(sourceVersion);
  assert.match(sha, /^[a-f0-9]{40}$/);
  const stable = releases.filter(r => !r.prerelease && /^desktop-v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(r.tag_name));
  if (stable.some(r => !r.draft && sourceOf(r) === sha)) return { skip: true };
  const versionOf = r => r.tag_name.slice('desktop-v'.length);
  const published = stable.filter(r => !r.draft).sort((a, b) => compare(versionOf(b), versionOf(a)));
  const latest = published[0];
  const ownDraft = stable.find(r => r.draft && sourceOf(r) === sha);
  if (ownDraft) {
    assert.ok(!latest || compare(versionOf(ownDraft), versionOf(latest)) > 0, 'A newer release exists; build the latest main commit instead.');
    assert.ok(compare(versionOf(ownDraft), sourceVersion) >= 0, 'Draft version is older than the source.');
    return { skip: false, version: versionOf(ownDraft), tag: ownDraft.tag_name };
  }
  const highest = stable.sort((a, b) => compare(versionOf(b), versionOf(a)))[0];
  let version = sourceVersion;
  if (highest && compare(version, versionOf(highest)) <= 0) {
    const [major, minor, patch] = parseVersion(versionOf(highest));
    version = `${major}.${minor}.${patch + 1}`;
  }
  parseVersion(version);
  return { skip: false, version, tag: `desktop-v${version}`, previousSource: latest && sourceOf(latest) };
}

export function stampVersion(project, version) {
  parseVersion(version);
  const folder = path.join(project, 'desktop/src-tauri');
  const configPath = path.join(folder, 'tauri.conf.json');
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  const tomlPath = path.join(folder, 'Cargo.toml');
  const lockPath = path.join(folder, 'Cargo.lock');
  const toml = fs.readFileSync(tomlPath, 'utf8');
  const lock = fs.readFileSync(lockPath, 'utf8');
  const packageVersion = /(^\[package\]\r?\nname = "global-auto-parts"\r?\nversion = ")([^"]+)(")/m;
  const lockedVersion = /(^\[\[package\]\]\r?\nname = "global-auto-parts"\r?\nversion = ")([^"]+)(")/m;
  assert.equal(toml.match(packageVersion)?.[2], config.version, 'Cargo and Tauri versions differ.');
  assert.equal(lock.match(lockedVersion)?.[2], config.version, 'Cargo.lock and Tauri versions differ.');
  config.version = version;
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n');
  fs.writeFileSync(tomlPath, toml.replace(packageVersion, (_, prefix, old, suffix) => prefix + version + suffix));
  fs.writeFileSync(lockPath, lock.replace(lockedVersion, (_, prefix, old, suffix) => prefix + version + suffix));
}

export function validateArtifacts(project) {
  const config = JSON.parse(fs.readFileSync(path.join(project, 'desktop/src-tauri/tauri.conf.json'), 'utf8'));
  parseVersion(config.version);
  const installer = `${config.productName.replace(/ /g, '.')}_${config.version}_x64-setup.exe`;
  assert.match(installer, /^[A-Za-z0-9._-]+$/);
  const names = [installer, installer + '.sig', 'latest.json'];
  const folder = path.join(project, 'desktop/artifacts');
  const files = names.map(name => ({ name, bytes: fs.readFileSync(path.join(folder, name)) }));
  assert.ok(files.every(f => f.bytes.length > 0), 'An update artifact is empty.');
  const manifest = JSON.parse(files[2].bytes.toString('utf8'));
  assert.equal(manifest.version, config.version);
  assert.deepEqual(Object.keys(manifest.platforms), ['windows-x86_64']);
  assert.equal(manifest.platforms['windows-x86_64'].signature, files[1].bytes.toString('utf8').trim());
  assert.match(manifest.platforms['windows-x86_64'].signature, /^[A-Za-z0-9+/=]+$/);
  assert.equal(manifest.platforms['windows-x86_64'].url, `https://github.com/${repository}/releases/download/desktop-v${config.version}/${installer}`);
  const checksumBytes = fs.readFileSync(path.join(folder, 'SHA256SUMS.txt'));
  const expected = files.map(f => `${createHash('sha256').update(f.bytes).digest('hex')}  ${f.name}`).join('\n') + '\n';
  assert.equal(checksumBytes.toString('utf8').replace(/\r\n/g, '\n'), expected, 'Artifacts do not match their checksums.');
  return { version: config.version, files: [...files, { name: 'SHA256SUMS.txt', bytes: checksumBytes }] };
}

function githubClient(token) {
  assert.ok(token, 'GITHUB_TOKEN is required.');
  return async (route, { method = 'GET', body, bytes } = {}) => {
    const base = bytes ? 'https://uploads.github.com' : 'https://api.github.com';
    const response = await fetch(`${base}/repos/${repository}${route}`, {
      method, redirect: 'error', signal: AbortSignal.timeout(120_000),
      headers: {
        Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        ...(body || bytes ? { 'Content-Type': bytes ? 'application/octet-stream' : 'application/json' } : {}),
      },
      body: bytes ?? (body && JSON.stringify(body)),
    });
    if (!response.ok) throw new Error(`GitHub ${method} ${route.split('?')[0]} failed (${response.status}).`);
    return response.status === 204 ? null : response.json();
  };
}

async function listReleases(api) {
  const releases = [];
  for (let page = 1; ; page++) {
    const batch = await api(`/releases?per_page=100&page=${page}`);
    releases.push(...batch);
    if (batch.length < 100) return releases;
  }
}

export async function publishRelease(api, releases, sha, artifacts) {
  const tag = `desktop-v${artifacts.version}`;
  let release = releases.find(r => r.tag_name === tag);
  if (release) {
    assert.ok(release.draft && sourceOf(release) === sha, 'Refusing to overwrite an existing release from another build.');
  } else {
    release = await api('/releases', { method: 'POST', body: {
      tag_name: tag, target_commitish: sha, name: `Global Auto Parts Desktop v${artifacts.version}`,
      body: `Windows x64 desktop update.\n\nUse **Check for updates** in the app, or download the installer below.\n\nBuilt from [${sha.slice(0, 7)}](https://github.com/${repository}/commit/${sha}).\n\n${marker(sha)}`,
      draft: true, prerelease: false,
    } });
  }
  assert.ok(release.draft, 'Only a draft release may receive assets.');
  // A retry may replace this build's partial draft, never a published release.
  const existing = await api(`/releases/${release.id}/assets?per_page=100`);
  for (const asset of existing) await api(`/releases/assets/${asset.id}`, { method: 'DELETE' });
  for (const file of artifacts.files) {
    const asset = await api(`/releases/${release.id}/assets?name=${encodeURIComponent(file.name)}`, { method: 'POST', bytes: file.bytes });
    assert.equal(asset.name, file.name);
    assert.equal(asset.size, file.bytes.length);
    assert.equal(asset.state, 'uploaded');
    if (asset.digest) assert.equal(asset.digest, `sha256:${createHash('sha256').update(file.bytes).digest('hex')}`);
  }
  const uploaded = await api(`/releases/${release.id}/assets?per_page=100`);
  assert.deepEqual(uploaded.map(a => a.name).sort(), artifacts.files.map(f => f.name).sort());
  // Publish only after all four verified files are present. Until then the
  // public latest.json continues to point to the previous complete release.
  return api(`/releases/${release.id}`, { method: 'PATCH', body: { draft: false, make_latest: 'true' } });
}

async function main() {
  assert.equal(process.env.GITHUB_REPOSITORY, repository, 'Run through this repository\'s Actions workflow.');
  assert.equal(process.env.GITHUB_REF, 'refs/heads/main', 'Desktop releases must come from main.');
  const sha = process.env.GITHUB_SHA;
  assert.match(sha ?? '', /^[a-f0-9]{40}$/);
  assert.equal(execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(), sha, 'Checkout differs from the workflow commit.');
  const api = githubClient(process.env.GITHUB_TOKEN);
  const releases = await listReleases(api);
  if (process.argv[2] === 'prepare') {
    const config = JSON.parse(fs.readFileSync(path.join(root, 'desktop/src-tauri/tauri.conf.json'), 'utf8'));
    const plan = planRelease(config.version, releases, sha);
    if (!plan.skip) {
      if (plan.previousSource) execFileSync('git', ['merge-base', '--is-ancestor', plan.previousSource, sha], { cwd: root });
      stampVersion(root, plan.version);
    }
    fs.appendFileSync(process.env.GITHUB_OUTPUT, `skip=${plan.skip}\nversion=${plan.version ?? ''}\n`);
    console.log(plan.skip ? 'This source commit is already released.' : `Building ${plan.tag} from ${sha.slice(0, 7)}.`);
  } else if (process.argv[2] === 'publish') {
    const result = await publishRelease(api, releases, sha, validateArtifacts(root));
    console.log(`Published ${result.html_url}`);
    if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `Desktop update published: [${result.tag_name}](${result.html_url})\n`);
  } else throw new Error('Expected prepare or publish.');
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
