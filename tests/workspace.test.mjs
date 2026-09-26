import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, readFile, symlink, writeFile, rename } from 'node:fs/promises';
import path from 'node:path';
import { fixture, lib } from './helpers.mjs';

test('creates files, rejects blind overwrites and preserves original bytes in backups', async t => {
  const { workspace, root } = await fixture(t);
  const initial = await workspace.write('mod', 'Scripts/Game/Test.c', 'class Test {}\r\n');
  assert.equal(initial.created, true);
  await assert.rejects(workspace.write('mod', 'Scripts/Game/Test.c', 'bad'), /conflict/);
  const changed = await workspace.write('mod', 'Scripts/Game/Test.c', 'class Test { int value; }', initial.sha256);
  assert.equal(await readFile(path.join(root, changed.backup), 'utf8'), 'class Test {}\r\n');
  assert.equal((await workspace.read('mod', 'Scripts/Game/Test.c')).sha256, changed.sha256);
  await assert.rejects(workspace.write('mod', 'Scripts/Game/Test.c', 'stale', initial.sha256), /conflict/);
});

test('BOM and CRLF bytes survive backup', async t => {
  const { workspace, root } = await fixture(t);
  const original = Buffer.from('\uFEFFclass Original {}\r\n');
  await writeFile(path.join(root, 'Test.c'), original);
  const read = await workspace.read('mod', 'Test.c');
  const write = await workspace.write('mod', 'Test.c', 'class Changed {}', read.sha256);
  assert.deepEqual(await readFile(path.join(root, write.backup)), original);
});

test('concurrent edits using one digest allow only one writer', async t => {
  const { workspace } = await fixture(t);
  const initial = await workspace.write('mod', 'Test.c', 'class A {}');
  const results = await Promise.allSettled(['class B {}', 'class C {}'].map(content => workspace.write('mod', 'Test.c', content, initial.sha256)));
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
});

test('rejects traversal, drive paths, alternate streams, hidden paths and Windows devices on every platform', async t => {
  const { workspace } = await fixture(t);
  for (const value of ['../outside.c', 'Scripts/../../outside.c', '/tmp/file.c', 'C:\\private.c', '\\\\server\\share\\file.c', 'safe.c:secret', '.git/config', 'Scripts/.env', 'NUL.c', 'a/COM1.c', 'file.c.', 'a /file.c', './file.c', 'a//file.c']) {
    await assert.rejects(workspace.resolve('mod', value), undefined, value);
  }
  await assert.rejects(workspace.read('unknown', 'file.c'), /Unknown project/);
});

test('directory symlinks/junctions cannot expose or modify outside files', async t => {
  const { base, root, workspace } = await fixture(t);
  const outside = path.join(base, 'outside');
  await mkdir(outside); await writeFile(path.join(outside, 'Secret.c'), 'private');
  await symlink(outside, path.join(root, 'escape'), process.platform === 'win32' ? 'junction' : 'dir');
  await assert.rejects(workspace.read('mod', 'escape/Secret.c'), /Symlink/);
  await assert.rejects(workspace.write('mod', 'escape/New.c', 'bad'), /Symlink/);
  assert.deepEqual((await workspace.list('mod')).files, []);
});

test('root replaced by a junction is rejected after configuration', async t => {
  const { base, root, workspace } = await fixture(t);
  const moved = path.join(base, 'moved');
  await rename(root, moved);
  await symlink(moved, root, process.platform === 'win32' ? 'junction' : 'dir');
  await assert.rejects(workspace.resolve('mod', 'Test.c'), /root became/);
});

test('read-only roots, binary/oversized files and unsupported writes are rejected', async t => {
  const { root, workspace, config } = await fixture(t, { maxFileBytes: 1024 });
  await writeFile(path.join(root, 'large.c'), 'a'.repeat(1025));
  await writeFile(path.join(root, 'binary.c'), Buffer.from([0, 1, 2]));
  await assert.rejects(workspace.read('mod', 'large.c'), /maxFileBytes/);
  await assert.rejects(workspace.read('mod', 'binary.c'), /Binary/);
  await assert.rejects(workspace.write('mod', 'run.ps1', 'bad'), /Unsupported/);
  await assert.rejects(workspace.write('mod', 'huge.c', 'a'.repeat(1025)), /maxFileBytes/);
  config.projects[0].writable = false;
  await assert.rejects(workspace.write('mod', 'New.c', 'x'), /read-only/);
});

test('bounded directory scan reports truncation and ignores private/build directories', async t => {
  const { workspace, root } = await fixture(t, { maxScanEntries: 100 });
  await mkdir(path.join(root, '.git')); await writeFile(path.join(root, '.git', 'private.c'), 'secret');
  for (let i = 0; i < 105; i++) await writeFile(path.join(root, `Test${i}.c`), 'class A {}');
  const scan = await workspace.list('mod');
  assert.equal(scan.truncated, true);
  assert(scan.files.length <= 100);
  assert(!scan.files.some(p => p.includes('private')));
});

test('configuration rejects duplicate ids, overlapping write policies, arbitrary executables and unknown keys', async t => {
  const { root } = await fixture(t);
  await assert.rejects(lib.validateConfig({ projects: [{ id: 'x', root }, { id: 'x', root }] }), /Duplicate/);
  await assert.rejects(lib.validateConfig({ projects: [{ id: 'x', root }, { id: 'y', root, writable: true }] }), /Overlapping/);
  await assert.rejects(lib.validateConfig({ workbenchPath: process.execPath }), /Workbench executable/);
  await assert.rejects(lib.validateConfig({ allowLauch: true }));
  await assert.rejects(lib.validateConfig({ projects: [{ id: 'x', root: './relative' }] }));
});

test('explicit config errors fail startup instead of exposing an empty workspace', async t => {
  const { base } = await fixture(t);
  const configPath = path.join(base, 'invalid.json');
  await writeFile(configPath, JSON.stringify({ projects: [{ id: 'missing', root: path.join(base, 'absent') }] }));
  await assert.rejects(lib.loadConfig(configPath), /ENOENT/);
  await assert.rejects(lib.loadConfig(path.join(base, 'missing-config.json')), /ENOENT/);
});

test('internal backup directories cannot redirect writes through junctions', async t => {
  const { workspace, root, base } = await fixture(t);
  const outside = path.join(base, 'outside'); await mkdir(outside);
  const initial = await workspace.write('mod', 'Test.c', 'class A {}');
  await symlink(outside, path.join(root, '.enfusion-mcp'), process.platform === 'win32' ? 'junction' : 'dir');
  await assert.rejects(workspace.write('mod', 'Test.c', 'class B {}', initial.sha256), /Symlink/);
  assert.equal((await workspace.read('mod', 'Test.c')).text, 'class A {}');
});
