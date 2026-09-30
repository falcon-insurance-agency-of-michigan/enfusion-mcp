import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { CLIENT_REGISTRY, installClient, parseJsonc } from '../scripts/installer.mjs';

test('parseJsonc strips comments and parses JSON', () => {
  const jsonc = `
  {
    // This is a comment
    "key": "value", /* inline comment */
    "num": 42
  }
  `;
  const parsed = parseJsonc(jsonc);
  assert.equal(parsed.key, 'value');
  assert.equal(parsed.num, 42);
});

test('installClient: json-mcpservers creates new file with mcpServers block', async t => {
  const tmp = await mkdtemp(path.join(os.tmpdir(), 'enfusion-installer-test-'));
  t.after(async () => { await rm(tmp, { recursive: true, force: true }); });

  const client = CLIENT_REGISTRY.find(c => c.id === 'claude-code');
  assert(client);

  const serverPath = 'C:\\fake\\server.cjs';
  const res = await installClient(client, serverPath, { home: tmp, appData: tmp });
  assert.equal(res.action, 'created');
  assert.equal(res.error, null);

  const written = JSON.parse(await readFile(res.targetPath, 'utf8'));
  assert(written.mcpServers);
  assert.equal(written.mcpServers['enfusion-mcp'].command, 'node');
  assert.deepEqual(written.mcpServers['enfusion-mcp'].args, [serverPath]);
});

test('installClient: json-mcpservers preserves existing settings and creates backup', async t => {
  const tmp = await mkdtemp(path.join(os.tmpdir(), 'enfusion-installer-test-'));
  t.after(async () => { await rm(tmp, { recursive: true, force: true }); });

  const client = CLIENT_REGISTRY.find(c => c.id === 'cursor');
  assert(client);

  const targetPath = client.getConfigPath(tmp, tmp);
  await mkdir(path.dirname(targetPath), { recursive: true });
  await writeFile(targetPath, JSON.stringify({ theme: 'dark', mcpServers: { other: { command: 'other' } } }));

  const serverPath = 'C:\\fake\\server.cjs';
  const res = await installClient(client, serverPath, { home: tmp, appData: tmp });
  assert.equal(res.action, 'updated');
  assert(res.backupPath);

  // Backup exists and contains original
  const backup = JSON.parse(await readFile(res.backupPath, 'utf8'));
  assert.equal(backup.theme, 'dark');
  assert(!backup.mcpServers['enfusion-mcp']);

  // Target file has both original and new server
  const updated = JSON.parse(await readFile(targetPath, 'utf8'));
  assert.equal(updated.theme, 'dark');
  assert.equal(updated.mcpServers.other.command, 'other');
  assert.equal(updated.mcpServers['enfusion-mcp'].command, 'node');
  assert.deepEqual(updated.mcpServers['enfusion-mcp'].args, [serverPath]);
});

test('installClient: codex-toml updates mcp_servers and plugins block', async t => {
  const tmp = await mkdtemp(path.join(os.tmpdir(), 'enfusion-installer-test-'));
  t.after(async () => { await rm(tmp, { recursive: true, force: true }); });

  const client = CLIENT_REGISTRY.find(c => c.id === 'codex');
  assert(client);

  const targetPath = client.getConfigPath(tmp, tmp);
  await mkdir(path.dirname(targetPath), { recursive: true });
  const initialToml = 'model = "gpt-5"\nsandbox_mode = "danger"\n\n[features]\nmemories = true\n';
  await writeFile(targetPath, initialToml);

  const serverPath = 'C:\\dev\\enfusion-mcp\\dist\\server.cjs';
  const res = await installClient(client, serverPath, { home: tmp, appData: tmp });
  assert.equal(res.action, 'updated');
  assert(res.backupPath);

  const updatedToml = await readFile(targetPath, 'utf8');
  assert(updatedToml.includes('model = "gpt-5"'));
  assert(updatedToml.includes('[mcp_servers.enfusion-mcp]'));
  assert(updatedToml.includes('command = "node"'));
  assert(updatedToml.includes('[plugins."enfusion-mcp@personal"]'));
  assert(updatedToml.includes('enabled = true'));

  // Updating again replaces the block instead of duplicating it
  const res2 = await installClient(client, 'C:\\dev\\new-path\\server.cjs', { home: tmp, appData: tmp });
  assert.equal(res2.action, 'updated');
  const updatedToml2 = await readFile(targetPath, 'utf8');
  const occurrences = (updatedToml2.match(/\[mcp_servers\.enfusion-mcp\]/g) || []).length;
  assert.equal(occurrences, 1);
  assert(updatedToml2.includes('new-path'));
});

test('installClient: json-cline adds disabled: false and autoApprove: []', async t => {
  const tmp = await mkdtemp(path.join(os.tmpdir(), 'enfusion-installer-test-'));
  t.after(async () => { await rm(tmp, { recursive: true, force: true }); });

  const client = CLIENT_REGISTRY.find(c => c.id === 'vscode-cline');
  assert(client);

  const serverPath = 'C:\\fake\\server.cjs';
  const res = await installClient(client, serverPath, { home: tmp, appData: tmp });
  assert.equal(res.action, 'created');

  const written = JSON.parse(await readFile(res.targetPath, 'utf8'));
  assert.equal(written.mcpServers['enfusion-mcp'].disabled, false);
  assert.deepEqual(written.mcpServers['enfusion-mcp'].autoApprove, []);
});

test('installClient: continue-json updates mcpServers array', async t => {
  const tmp = await mkdtemp(path.join(os.tmpdir(), 'enfusion-installer-test-'));
  t.after(async () => { await rm(tmp, { recursive: true, force: true }); });

  const client = CLIENT_REGISTRY.find(c => c.id === 'continue');
  assert(client);

  const targetPath = client.getConfigPath(tmp, tmp);
  await mkdir(path.dirname(targetPath), { recursive: true });
  await writeFile(targetPath, JSON.stringify({ models: [], mcpServers: [{ name: 'existing', command: 'cmd' }] }));

  const serverPath = 'C:\\fake\\server.cjs';
  const res = await installClient(client, serverPath, { home: tmp, appData: tmp });
  assert.equal(res.action, 'updated');

  const written = JSON.parse(await readFile(targetPath, 'utf8'));
  assert.equal(written.mcpServers.length, 2);
  const enfusion = written.mcpServers.find(s => s.name === 'enfusion-mcp');
  assert(enfusion);
  assert.equal(enfusion.command, 'node');
  assert.deepEqual(enfusion.args, [serverPath]);
});

test('installClient: dry-run does not write files or create backups', async t => {
  const tmp = await mkdtemp(path.join(os.tmpdir(), 'enfusion-installer-test-'));
  t.after(async () => { await rm(tmp, { recursive: true, force: true }); });

  const client = CLIENT_REGISTRY.find(c => c.id === 'windsurf');
  assert(client);

  const serverPath = 'C:\\fake\\server.cjs';
  const res = await installClient(client, serverPath, { home: tmp, appData: tmp, dryRun: true });
  assert.equal(res.action, 'created');
  assert.equal(res.backupPath, null);

  // File was not actually created
  await assert.rejects(async () => await readFile(res.targetPath, 'utf8'));
});
