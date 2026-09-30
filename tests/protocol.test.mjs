import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { call, connect, fixture } from './helpers.mjs';

for (const mode of ['legacy', { pin: '2026-07-28' }]) {
  test(`real stdio MCP session: ${JSON.stringify(mode)}`, async t => {
    const { configPath } = await fixture(t);
    const { client, stderr } = await connect(t, configPath, mode);
    const tools = await client.listTools();
    assert.equal(tools.tools.length, 45);
    assert(tools.tools.find(t => t.name === 'enfusion_write_file').annotations.destructiveHint);
    const status = await call(client, 'enfusion_status');
    assert.equal(status.projects[0].id, 'mod');
    assert.equal(status.workbench.allowLaunch, false);
    const created = await call(client, 'enfusion_create_project', { project: 'mod', id: 'TestMod', title: 'Protocol Test' });
    assert.match(created.guid, /^[A-F0-9]{16}$/);
    const info = await call(client, 'enfusion_project_info', { project: 'mod' });
    assert.equal(info.id, 'TestMod');
    const file = await call(client, 'enfusion_write_file', { project: 'mod', path: 'Scripts/Game/Test.c', content: 'class EMCP_Test {}\n' });
    assert.equal(file.created, true);
    const read = await call(client, 'enfusion_read_file', { project: 'mod', path: 'Scripts/Game/Test.c' });
    assert.equal(read.sha256, file.sha256);
    const symbols = await call(client, 'enfusion_script_symbols', { project: 'mod', path: 'Scripts/Game/Test.c' });
    assert.equal(symbols.symbols[0].name, 'EMCP_Test');
    const search = await call(client, 'enfusion_search', { project: 'mod', query: 'EMCP_Test' });
    assert.equal(search.matches[0].line, 1);
    assert.equal((await call(client, 'enfusion_install_companion', { project: 'mod' })).changed, true);
    assert.equal((await call(client, 'enfusion_install_companion', { project: 'mod' })).changed, false);
    const resources = await client.listResources(); assert.equal(resources.resources.length, 2);
    const doc = await client.readResource({ uri: 'enfusion://docs' }); assert(doc.contents[0].text.includes('bistudio.com'));
    const prompts = await client.listPrompts(); assert.equal(prompts.prompts.length, 1);
    const prompt = await client.getPrompt({ name: 'enfusion-review', arguments: { project: 'mod' } }); assert(prompt.messages[0].content.text.includes('mod'));
    assert.equal(stderr(), '');
  });
}

test('MCP rejects invalid arguments, unknown roots, traversal, stale writes and disabled execution', async t => {
  const { configPath } = await fixture(t);
  const { client } = await connect(t, configPath);
  for (const [name, args] of [
    ['enfusion_read_file', { project: 'mod', path: '../outside.c' }],
    ['enfusion_read_file', { project: 'unknown', path: 'Test.c' }],
    ['enfusion_read_file', { project: 'mod', path: 'Test.c', startLine: -1 }],
    ['enfusion_status', { arbitrary: true }],
    ['enfusion_workbench_validate', { project: 'mod' }],
  ]) {
    const result = await client.callTool({ name, arguments: args });
    assert.equal(result.isError, true, name);
  }
  await call(client, 'enfusion_create_project', { project: 'mod', id: 'Test', title: 'Test' });
  await assert.rejects(call(client, 'enfusion_create_project', { project: 'mod', id: 'Again', title: 'Again' }), /conflict/);
});

test('resource lookup identifies ownership instead of referenced GUIDs and reports missing loose assets honestly', async t => {
  const { root, configPath } = await fixture(t);
  await mkdir(path.join(root, 'Prefabs'));
  await writeFile(path.join(root, 'Prefabs', 'Test.et.meta'), 'MetaFileClass {\n Name "{AAAAAAAAAAAAAAAA}Prefabs/Test.et"\n Dependency "{BBBBBBBBBBBBBBBB}Other.et"\n}');
  const { client } = await connect(t, configPath);
  const found = await call(client, 'enfusion_find_resource', { project: 'mod', guid: 'aaaaaaaaaaaaaaaa' });
  assert.equal(found.matches[0].resource, 'Prefabs/Test.et');
  const missing = await call(client, 'enfusion_find_resource', { project: 'mod', guid: 'BBBBBBBBBBBBBBBB' });
  assert.equal(missing.matches.length, 0);
  assert(missing.scope.includes('no match does not establish'));
});

test('pagination, bounded search and source read ranges work end to end', async t => {
  const { root, configPath } = await fixture(t);
  await writeFile(path.join(root, 'A.c'), 'class Alpha {}\nclass Beta {}\nclass Gamma {}\n');
  await writeFile(path.join(root, 'B.c'), 'class Delta {}');
  const { client } = await connect(t, configPath);
  const first = await call(client, 'enfusion_list_files', { project: 'mod', limit: 1 });
  assert.deepEqual(first.files, ['A.c']); assert.equal(first.nextOffset, 1);
  const second = await call(client, 'enfusion_list_files', { project: 'mod', offset: 1, limit: 1 });
  assert.deepEqual(second.files, ['B.c']);
  const lines = await call(client, 'enfusion_read_file', { project: 'mod', path: 'A.c', startLine: 2, lineCount: 1 });
  assert.deepEqual(lines.lines, [{ line: 2, text: 'class Beta {}' }]);
  const search = await call(client, 'enfusion_search', { project: 'mod', query: 'class', limit: 1 });
  assert.equal(search.hasMore, true); assert.equal(search.matches.length, 1);
});
