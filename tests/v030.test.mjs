import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { call, connect, fixture } from './helpers.mjs';

// ===== enfusion_script_functions =====

test('enfusion_script_functions extracts function declarations with class context and modifiers', async t => {
  const { root, configPath } = await fixture(t);
  const code = `
class MyComponent : ScriptComponent
{
  override void OnPostInit(IEntity owner)
  {
    super.OnPostInit(owner);
  }

  static int GetCount()
  {
    return 0;
  }

  protected void DoStuff(int a, string b)
  {
  }
}

class OtherClass
{
  void SimpleMethod();
}
`;
  await writeFile(path.join(root, 'Test.c'), code);
  const { client } = await connect(t, configPath);
  const result = await call(client, 'enfusion_script_functions', { project: 'mod', path: 'Test.c' });
  assert(result.functions.length >= 3);
  const onPostInit = result.functions.find(f => f.name === 'OnPostInit');
  assert(onPostInit);
  assert.equal(onPostInit.className, 'MyComponent');
  assert.deepEqual(onPostInit.modifiers, ['override']);
  assert.equal(onPostInit.returnType, 'void');
  const getCount = result.functions.find(f => f.name === 'GetCount');
  assert(getCount);
  assert.deepEqual(getCount.modifiers, ['static']);
  assert.equal(getCount.returnType, 'int');
  const doStuff = result.functions.find(f => f.name === 'DoStuff');
  assert(doStuff);
  assert(doStuff.params.includes('int a'));
  const simple = result.functions.find(f => f.name === 'SimpleMethod');
  assert(simple);
  assert.equal(simple.className, 'OtherClass');
});

test('enfusion_script_functions rejects non-.c files', async t => {
  const { root, configPath } = await fixture(t);
  await writeFile(path.join(root, 'Test.et'), 'GenericEntity {}');
  const { client } = await connect(t, configPath);
  const result = await client.callTool({ name: 'enfusion_script_functions', arguments: { project: 'mod', path: 'Test.et' } });
  assert(result.isError);
});

// ===== enfusion_class_hierarchy =====

test('enfusion_class_hierarchy builds inheritance tree across files', async t => {
  const { root, configPath } = await fixture(t);
  await writeFile(path.join(root, 'Base.c'), 'class Animal\n{\n  void Speak();\n}');
  await writeFile(path.join(root, 'Dog.c'), 'class Dog : Animal\n{\n  override void Speak();\n  void Fetch();\n}');
  await writeFile(path.join(root, 'Cat.c'), 'class Cat : Animal\n{\n  override void Speak();\n}');
  await writeFile(path.join(root, 'Puppy.c'), 'class Puppy : Dog\n{\n  void Yip();\n}');
  await writeFile(path.join(root, 'Modded.c'), 'modded class Dog\n{\n  override void Fetch();\n}');
  const { client } = await connect(t, configPath);
  const result = await call(client, 'enfusion_class_hierarchy', { project: 'mod' });
  assert(result.classes.length >= 5);
  assert(result.roots.includes('Animal'));
  assert.equal(result.filesScanned, 5);
  const puppy = result.classes.find(c => c.name === 'Puppy');
  assert(puppy);
  assert.equal(puppy.base, 'Dog');
  assert(puppy.methods.includes('Yip'));
  const moddedDog = result.classes.find(c => c.name === 'Dog' && c.modded);
  assert(moddedDog);
});

// ===== enfusion_meta_info =====

test('enfusion_meta_info parses ownership GUID and dependencies', async t => {
  const { root, configPath } = await fixture(t);
  const meta = `MetaFile {
 Name "{AABBCCDD11223344}Models/Vehicle.xob"
 Dependency "{1122334455667788}Textures/Camo.edds"
}`;
  await writeFile(path.join(root, 'Vehicle.xob.meta'), meta);
  const { client } = await connect(t, configPath);
  const result = await call(client, 'enfusion_meta_info', { project: 'mod', path: 'Vehicle.xob.meta' });
  assert.equal(result.guid, 'AABBCCDD11223344');
  assert.equal(result.resourcePath, 'Models/Vehicle.xob');
  assert(result.dependencies.length >= 1);
  assert.equal(result.dependencies[0].guid, '1122334455667788');
});

test('enfusion_meta_info rejects non-.meta files', async t => {
  const { root, configPath } = await fixture(t);
  await writeFile(path.join(root, 'Test.c'), 'class Foo {}');
  const { client } = await connect(t, configPath);
  const result = await client.callTool({ name: 'enfusion_meta_info', arguments: { project: 'mod', path: 'Test.c' } });
  assert(result.isError);
});

// ===== enfusion_regex_search =====

test('enfusion_regex_search finds pattern matches across files', async t => {
  const { root, configPath } = await fixture(t);
  await writeFile(path.join(root, 'A.c'), 'class FooComponent : ScriptComponent {}\nclass BarHelper {}');
  await writeFile(path.join(root, 'B.c'), 'class BazComponent : ScriptComponent {}');
  const { client } = await connect(t, configPath);
  const result = await call(client, 'enfusion_regex_search', { project: 'mod', pattern: '\\w+Component\\s*:\\s*ScriptComponent' });
  assert(result.matches.length >= 2);
  assert(result.matches[0].match.includes('Component'));
});

test('enfusion_regex_search rejects invalid regex', async t => {
  const { root, configPath } = await fixture(t);
  await writeFile(path.join(root, 'A.c'), 'test');
  const { client } = await connect(t, configPath);
  const result = await client.callTool({ name: 'enfusion_regex_search', arguments: { project: 'mod', pattern: '[invalid(' } });
  assert(result.isError);
});

// ===== enfusion_extract_strings =====

test('enfusion_extract_strings extracts localizable strings and filters GUIDs/paths', async t => {
  const { root, configPath } = await fixture(t);
  const code = `
string label = "Pick up item";
string path = "./Data/Textures/wood.edds";
string guid = "{AABBCCDD11223344}Prefabs/Car.et";
string msg = "Hello World";
string x = "A";
`;
  await writeFile(path.join(root, 'UI.c'), code);
  const { client } = await connect(t, configPath);
  const result = await call(client, 'enfusion_extract_strings', { project: 'mod', path: 'UI.c' });
  const values = result.strings.map(s => s.value);
  assert(values.includes('Pick up item'));
  assert(values.includes('Hello World'));
  // Should filter out file paths and GUIDs
  assert(!values.includes('./Data/Textures/wood.edds'));
  assert(!values.includes('AABBCCDD11223344'));
});

// ===== enfusion_file_stats =====

test('enfusion_file_stats computes correct extension counts', async t => {
  const { root, configPath } = await fixture(t);
  await writeFile(path.join(root, 'A.c'), 'line1\nline2\nline3');
  await writeFile(path.join(root, 'B.c'), 'line1\nline2');
  await writeFile(path.join(root, 'Entity.et'), 'GenericEntity {}');
  await writeFile(path.join(root, 'World.ent'), 'BaseWorld {}');
  await writeFile(path.join(root, 'UI.layout'), 'FrameWidget {}');
  await writeFile(path.join(root, 'server.conf'), 'maxPlayers 64');
  await writeFile(path.join(root, 'Tex.edds.meta'), 'MetaFile { Name "{0000000000000001}Tex.edds" }');
  const { client } = await connect(t, configPath);
  const result = await call(client, 'enfusion_file_stats', { project: 'mod' });
  assert.equal(result.scriptFiles, 2);
  assert.equal(result.prefabFiles, 1);
  assert.equal(result.worldFiles, 1);
  assert.equal(result.layoutFiles, 1);
  assert.equal(result.configFiles, 1);
  assert.equal(result.metaFiles, 1);
  assert(result.totalScriptLines >= 5);
});

// ===== enfusion_scaffold_script =====

test('enfusion_scaffold_script generates component template with variables', async t => {
  const { configPath } = await fixture(t);
  const { client } = await connect(t, configPath);
  const result = await call(client, 'enfusion_scaffold_script', {
    template: 'component',
    variables: { CLASS_NAME: 'MyDoorComponent', DESCRIPTION: 'Custom door handler' },
  });
  assert(result.code.includes('class MyDoorComponent : ScriptComponent'));
  assert(result.code.includes('Custom door handler'));
  assert.equal(result.unresolvedPlaceholders.length, 0);
});

test('enfusion_scaffold_script reports unresolved placeholders', async t => {
  const { configPath } = await fixture(t);
  const { client } = await connect(t, configPath);
  const result = await call(client, 'enfusion_scaffold_script', { template: 'modded-class' });
  assert(result.unresolvedPlaceholders.includes('BASE_CLASS'));
  assert(result.unresolvedPlaceholders.includes('METHOD'));
});

// ===== enfusion_compare_files =====

test('enfusion_compare_files produces diff between two project files', async t => {
  const { root, configPath } = await fixture(t);
  await writeFile(path.join(root, 'v1.c'), 'class Foo {\n  void Run() {}\n}');
  await writeFile(path.join(root, 'v2.c'), 'class Foo {\n  void Run() { Print("hello"); }\n  void Stop() {}\n}');
  const { client } = await connect(t, configPath);
  const result = await call(client, 'enfusion_compare_files', { project: 'mod', pathA: 'v1.c', pathB: 'v2.c' });
  assert(!result.identical);
  assert(result.hunks >= 1);
  assert(result.diff.includes('-  void Run() {}'));
  assert(result.diff.includes('+  void Run() { Print("hello"); }'));
});

test('enfusion_compare_files reports identical files', async t => {
  const { root, configPath } = await fixture(t);
  await writeFile(path.join(root, 'same1.c'), 'class Same {}');
  await writeFile(path.join(root, 'same2.c'), 'class Same {}');
  const { client } = await connect(t, configPath);
  const result = await call(client, 'enfusion_compare_files', { project: 'mod', pathA: 'same1.c', pathB: 'same2.c' });
  assert(result.identical);
});

// ===== enfusion_validate_references =====

test('enfusion_validate_references resolves known GUIDs and flags unknown ones', async t => {
  const { root, configPath } = await fixture(t);
  // Create a meta file so one GUID resolves
  await writeFile(path.join(root, 'Tex.edds.meta'), 'MetaFile {\n Name "{AAAA111122223333}Textures/Tex.edds"\n}');
  // Create a prefab that references both a known and unknown GUID
  await writeFile(path.join(root, 'Car.et'), 'GenericEntity {\n material "{AAAA111122223333}Textures/Tex.edds"\n model "{FFFF888899990000}Models/Missing.xob"\n}');
  const { client } = await connect(t, configPath);
  const result = await call(client, 'enfusion_validate_references', { project: 'mod', path: 'Car.et' });
  assert.equal(result.totalReferences, 2);
  assert(result.resolved.length >= 1);
  assert.equal(result.resolved[0].guid, 'AAAA111122223333');
  assert(result.unresolved.length >= 1);
  assert.equal(result.unresolved[0].guid, 'FFFF888899990000');
});

test('enfusion_validate_references handles files with no references', async t => {
  const { root, configPath } = await fixture(t);
  await writeFile(path.join(root, 'Empty.c'), 'class Empty {}');
  const { client } = await connect(t, configPath);
  const result = await call(client, 'enfusion_validate_references', { project: 'mod', path: 'Empty.c' });
  assert.equal(result.totalReferences, 0);
});

// ===== enfusion_find_implementations =====

test('enfusion_find_implementations finds subclasses and modded overrides', async t => {
  const { root, configPath } = await fixture(t);
  await writeFile(path.join(root, 'Base.c'), 'class Vehicle\n{\n  void Drive();\n}');
  await writeFile(path.join(root, 'Car.c'), 'class Car : Vehicle\n{\n  override void Drive();\n}');
  await writeFile(path.join(root, 'Truck.c'), 'class Truck : Vehicle\n{\n  void Haul();\n}');
  await writeFile(path.join(root, 'Modded.c'), 'modded class Vehicle\n{\n  void Repair();\n}');
  await writeFile(path.join(root, 'Unrelated.c'), 'class Weapon : ScriptComponent\n{\n}');
  const { client } = await connect(t, configPath);
  const result = await call(client, 'enfusion_find_implementations', { project: 'mod', className: 'Vehicle' });
  assert.equal(result.className, 'Vehicle');
  assert(result.implementations.length >= 2); // Car, Truck
  const car = result.implementations.find(i => i.name === 'Car');
  assert(car);
  assert(!car.modded);
  const truck = result.implementations.find(i => i.name === 'Truck');
  assert(truck);
  // modded Vehicle has no ': Vehicle' so it's not an implementation
  // Unrelated class should NOT appear
  assert(!result.implementations.find(i => i.name === 'Weapon'));
});
