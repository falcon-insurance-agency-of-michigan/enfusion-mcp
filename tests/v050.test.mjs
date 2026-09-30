import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { call, connect, fixture } from './helpers.mjs';

// ===== enfusion_lint_script =====

test('enfusion_lint_script finds lint issues', async t => {
  const { root, configPath } = await fixture(t);
  const code = `class badName : ScriptComponent
{
  override void EOnInit(IEntity owner)
  {
    Print("debug");
  }
  void HandleError()
  {
    try { DoSomething(); }
    catch (Exception e) {}
  }
}`;
  await writeFile(path.join(root, 'Bad.c'), code);
  const { client } = await connect(t, configPath);
  const result = await call(client, 'enfusion_lint_script', { project: 'mod' });
  assert(result.total >= 2);
  assert(result.issues.find(i => i.rule === 'class-naming'));
  assert(result.issues.find(i => i.rule === 'no-empty-catch'));
  assert(result.issues.find(i => i.rule === 'no-print'));
});

// ===== enfusion_dead_code =====

test('enfusion_dead_code finds unreferenced symbols', async t => {
  const { root, configPath } = await fixture(t);
  await writeFile(path.join(root, 'Alive.c'), 'class AliveClass {}\nvoid UseIt() { AliveClass a = new AliveClass(); }');
  await writeFile(path.join(root, 'Dead.c'), 'class NobodyUsesThis {}\nvoid LonelyFunction() { Print("alone"); }');
  const { client } = await connect(t, configPath);
  const result = await call(client, 'enfusion_dead_code', { project: 'mod' });
  assert(result.items.find(i => i.name === 'NobodyUsesThis'));
  assert(result.items.find(i => i.name === 'LonelyFunction'));
  // AliveClass is referenced in UseIt, so should NOT be dead
  assert(!result.items.find(i => i.name === 'AliveClass'));
});

// ===== enfusion_api_doc =====

test('enfusion_api_doc generates markdown documentation', async t => {
  const { root, configPath } = await fixture(t);
  await writeFile(path.join(root, 'Api.c'), 'class Vehicle : ScriptComponent\n{\n  void Start(int speed)\n  {\n  }\n  bool IsMoving()\n  {\n    return true;\n  }\n}');
  const { client } = await connect(t, configPath);
  const result = await call(client, 'enfusion_api_doc', { project: 'mod' });
  assert(result.markdown.includes('Vehicle'));
  assert(result.markdown.includes('Start'));
  assert(result.markdown.includes('IsMoving'));
  assert(result.totalEntries >= 3);
});

// ===== enfusion_modded_overrides =====

test('enfusion_modded_overrides finds modded classes', async t => {
  const { root, configPath } = await fixture(t);
  await writeFile(path.join(root, 'Mod.c'), 'modded class SCR_CharacterControllerComponent\n{\n  override void OnDeath()\n  {\n    Print("custom death");\n  }\n}');
  await writeFile(path.join(root, 'Normal.c'), 'class MyComponent : ScriptComponent {}');
  const { client } = await connect(t, configPath);
  const result = await call(client, 'enfusion_modded_overrides', { project: 'mod' });
  assert.equal(result.total, 1);
  assert.equal(result.overrides[0].name, 'SCR_CharacterControllerComponent');
  assert(result.overrides[0].methods.includes('OnDeath'));
});

// ===== enfusion_prefab_tree =====

test('enfusion_prefab_tree builds hierarchy', async t => {
  const { root, configPath } = await fixture(t);
  await writeFile(path.join(root, 'Base.et'), 'GenericEntity { BaseProp "val" }');
  await writeFile(path.join(root, 'Child.et'), 'GenericEntity : "Base.et" { ChildProp "val" }');
  const { client } = await connect(t, configPath);
  const result = await call(client, 'enfusion_prefab_tree', { project: 'mod' });
  assert.equal(result.stats.total, 2);
  assert(result.roots.length >= 1);
});

// ===== enfusion_summarize =====

test('enfusion_summarize gives file overview', async t => {
  const { root, configPath } = await fixture(t);
  await writeFile(path.join(root, 'Code.c'), 'class Foo { void Bar() {} }\nclass Baz {}');
  const { client } = await connect(t, configPath);
  const result = await call(client, 'enfusion_summarize', { project: 'mod', path: 'Code.c' });
  assert.equal(result.type, 'script');
  assert.deepEqual(result.classes, ['Foo', 'Baz']);
  assert(result.functions >= 1);
});

// ===== enfusion_bulk_replace =====

test('enfusion_bulk_replace modifies files in place with backup', async t => {
  const { root, configPath } = await fixture(t);
  await writeFile(path.join(root, 'A.c'), 'class OldThing { OldThing ref; }');
  await writeFile(path.join(root, 'B.c'), 'void Use() { OldThing x; }');
  const { client } = await connect(t, configPath);
  const result = await call(client, 'enfusion_bulk_replace', { project: 'mod', oldText: 'OldThing', newText: 'NewThing' });
  assert(result.totalReplacements >= 3);
  assert.equal(result.totalFiles, 2);
  // Verify actual file content changed
  const after = await call(client, 'enfusion_read_file', { project: 'mod', path: 'A.c' });
  const text = after.lines.map(l => l.text).join('\n');
  assert(text.includes('NewThing'));
  assert(!text.includes('OldThing'));
});

// ===== enfusion_git_status =====

test('enfusion_git_status reports non-git directory gracefully', async t => {
  const { configPath } = await fixture(t);
  const { client } = await connect(t, configPath);
  const result = await call(client, 'enfusion_git_status', { project: 'mod' });
  // Our temp fixture isn't a git repo
  assert.equal(result.isGitRepo, false);
});

// ===== enfusion_config_template =====

test('enfusion_config_template generates valid server JSON', async t => {
  const { configPath } = await fixture(t);
  const { client } = await connect(t, configPath);
  const result = await call(client, 'enfusion_config_template', { name: 'Test Server', maxPlayers: 32, bindPort: 3000, mods: [{ modId: 'abc', name: 'TestMod' }] });
  assert(result.json.includes('Test Server'));
  const parsed = JSON.parse(result.json);
  assert.equal(parsed.game.maxPlayers, 32);
  assert.equal(parsed.bindPort, 3000);
  assert.equal(parsed.game.mods.length, 1);
  assert.equal(parsed.rcon.password, 'CHANGE_ME');
  assert.equal(parsed.a2s.port, 3016);
});

// ===== enfusion_file_outline =====

test('enfusion_file_outline returns ordered declarations', async t => {
  const { root, configPath } = await fixture(t);
  await writeFile(path.join(root, 'Outline.c'), 'enum Color { RED, GREEN, BLUE }\n\nclass Vehicle : Entity\n{\n  void Start() {}\n  int GetSpeed() { return 0; }\n}');
  const { client } = await connect(t, configPath);
  const result = await call(client, 'enfusion_file_outline', { project: 'mod', path: 'Outline.c' });
  assert(result.totalSymbols >= 4);
  const names = result.outline.map(o => o.name);
  assert(names.includes('Color'));
  assert(names.includes('Vehicle'));
  assert(names.includes('Start'));
  assert(names.includes('GetSpeed'));
  // Should be sorted by line
  for (let i = 1; i < result.outline.length; i++) {
    assert(result.outline[i].line >= result.outline[i - 1].line);
  }
});
