import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { unzipSync } from 'fflate';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { call, connect, fixture, lib } from './helpers.mjs';

test('versioned release contains only distributable files and works without installed dependencies', async t => {
  const { base, configPath } = await fixture(t);
  execFileSync(process.execPath, ['scripts/package.mjs']);
  const pkg = JSON.parse(await readFile('package.json', 'utf8'));
  const archive = await readFile(`release/enfusion-mcp-${pkg.version}.zip`);
  assert((await readFile('release/SHA256SUMS.txt', 'utf8')).startsWith(lib.sha256(archive)));
  const files = unzipSync(archive);
  assert(files['enfusion-mcp/dist/server.cjs']);
  assert(files['enfusion-mcp/dist/THIRD-PARTY-NOTICES.txt']);
  assert(!Object.keys(files).some(f => /(?:^|\/)(local|node_modules|\.git)\//.test(f) || /\.(pak|exe|rdb|log)$/.test(f)));
  for (const [name, bytes] of Object.entries(files)) {
    assert(name.startsWith('enfusion-mcp/') && !name.includes('..'));
    const filename = path.join(base, name); await mkdir(path.dirname(filename), { recursive: true }); await writeFile(filename, bytes);
  }
  const root = path.join(base, 'enfusion-mcp');
  for (const manifest of ['plugin.json', '.codex-plugin/plugin.json']) assert.equal(JSON.parse(await readFile(path.join(root, manifest), 'utf8')).version, pkg.version);
  const { client } = await connect(t, configPath, 'legacy', path.join(root, 'dist/server.cjs'));
  assert.equal((await call(client, 'enfusion_status')).version, pkg.version);
  assert.equal((await client.listTools()).tools.length, 25);
});
