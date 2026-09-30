import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { call, connect, fixture } from './helpers.mjs';

// ===== enfusion_todo_scan =====

test('enfusion_todo_scan finds annotations across files', async t => {
  const { root, configPath } = await fixture(t);
  await writeFile(path.join(root, 'A.c'), '// TODO: Fix collision\n// HACK: temp workaround\nclass Foo {}');
  await writeFile(path.join(root, 'B.c'), '// FIXME: memory leak\n// NOTE: reviewed by Cal');
  const { client } = await connect(t, configPath);
  const result = await call(client, 'enfusion_todo_scan', { project: 'mod' });
  assert(result.total >= 4);
  assert(result.summary.TODO >= 1);
  assert(result.summary.HACK >= 1);
  assert(result.summary.FIXME >= 1);
  assert(result.summary.NOTE >= 1);
  const todo = result.items.find(i => i.message.includes('Fix collision'));
  assert(todo);
  assert.equal(todo.tag, 'TODO');
});

// ===== enfusion_find_references =====

test('enfusion_find_references finds declarations and usages', async t => {
  const { root, configPath } = await fixture(t);
  await writeFile(path.join(root, 'Decl.c'), 'class MyClass : ScriptComponent\n{\n  void Init();\n}');
  await writeFile(path.join(root, 'Usage.c'), 'void Test()\n{\n  MyClass inst = new MyClass();\n}');
  const { client } = await connect(t, configPath);
  const result = await call(client, 'enfusion_find_references', { project: 'mod', symbol: 'MyClass' });
  assert(result.total >= 2);
  assert(result.declarations >= 1);
  // MyClass appears in both files
  const files = new Set(result.references.map(r => r.file));
  assert(files.size >= 2);
});

// ===== enfusion_duplicate_classes =====

test('enfusion_duplicate_classes detects non-modded duplicates', async t => {
  const { root, configPath } = await fixture(t);
  await writeFile(path.join(root, 'A.c'), 'class DupeClass\n{\n}');
  await writeFile(path.join(root, 'B.c'), 'class DupeClass\n{\n}');
  await writeFile(path.join(root, 'C.c'), 'class UniqueClass\n{\n}');
  const { client } = await connect(t, configPath);
  const result = await call(client, 'enfusion_duplicate_classes', { project: 'mod' });
  assert(result.duplicates.length >= 1);
  const dupe = result.duplicates.find(d => d.name === 'DupeClass');
  assert(dupe);
  assert.equal(dupe.occurrences.length, 2);
  assert(!result.duplicates.find(d => d.name === 'UniqueClass'));
});

// ===== enfusion_unused_resources =====

test('enfusion_unused_resources identifies orphaned meta entries', async t => {
  const { root, configPath } = await fixture(t);
  // Referenced resource
  await writeFile(path.join(root, 'Used.edds.meta'), 'MetaFile { Name "{AAAA111122223333}Textures/Used.edds" }');
  // Unreferenced resource
  await writeFile(path.join(root, 'Orphan.edds.meta'), 'MetaFile { Name "{BBBB444455556666}Textures/Orphan.edds" }');
  // Prefab that references only the first
  await writeFile(path.join(root, 'Car.et'), 'GenericEntity { material "{AAAA111122223333}Textures/Used.edds" }');
  const { client } = await connect(t, configPath);
  const result = await call(client, 'enfusion_unused_resources', { project: 'mod' });
  assert(result.unused.length >= 1);
  assert(result.unused.find(u => u.guid === 'BBBB444455556666'));
  assert(!result.unused.find(u => u.guid === 'AAAA111122223333'));
});

// ===== enfusion_script_complexity =====

test('enfusion_script_complexity reports function metrics', async t => {
  const { root, configPath } = await fixture(t);
  const code = `class Big
{
  void LongMethod()
  {
    if (true)
    {
      for (int i = 0; i < 10; i++)
      {
        Print("deep");
        Print("deep");
        Print("deep");
        Print("deep");
        Print("deep");
        Print("deep");
        Print("deep");
        Print("deep");
        Print("deep");
        Print("deep");
      }
    }
  }

  void ShortMethod()
  {
    Print("hi");
  }
}`;
  await writeFile(path.join(root, 'Big.c'), code);
  const { client } = await connect(t, configPath);
  const result = await call(client, 'enfusion_script_complexity', { project: 'mod', minLines: 5 });
  assert(result.functions.length >= 1);
  const long = result.functions.find(f => f.name === 'LongMethod');
  assert(long);
  assert(long.lineCount > 5);
  assert(long.maxNestingDepth >= 2);
  // ShortMethod should be filtered out at minLines=5
  assert(!result.functions.find(f => f.name === 'ShortMethod'));
});

// ===== enfusion_server_config =====

test('enfusion_server_config parses Reforger server JSON', async t => {
  const { root, configPath } = await fixture(t);
  const config = JSON.stringify({
    name: "Test Server",
    bindPort: 2001,
    game: {
      scenarioId: "{ECC61978EDCC2B5A}Missions/23_Campaign.conf",
      maxPlayers: 64,
      mods: [{ modId: "abc123", name: "ReforgedZ" }]
    }
  });
  await writeFile(path.join(root, 'server.json'), config);
  const { client } = await connect(t, configPath);
  const result = await call(client, 'enfusion_server_config', { project: 'mod', path: 'server.json' });
  assert.equal(result.maxPlayers, 64);
  assert(result.scenarioId.includes('Campaign'));
  assert.equal(result.mods.length, 1);
  assert.equal(result.mods[0].name, 'ReforgedZ');
  assert.equal(result.ports.bindPort, 2001);
});

// ===== enfusion_restore_backup =====

test('enfusion_restore_backup reverts to a previous version', async t => {
  const { root, configPath } = await fixture(t);
  await writeFile(path.join(root, 'Test.c'), 'class Original {}');
  const { client } = await connect(t, configPath);
  // Read original and get sha256
  const original = await call(client, 'enfusion_read_file', { project: 'mod', path: 'Test.c' });
  const origSha = original.sha256;
  // Overwrite with new content (creates a backup of original)
  await call(client, 'enfusion_write_file', { project: 'mod', path: 'Test.c', content: 'class Modified {}', expectedSha256: origSha });
  const modified = await call(client, 'enfusion_read_file', { project: 'mod', path: 'Test.c' });
  const modText = modified.lines.map(l => l.text).join('\n');
  assert(modText.includes('Modified'));
  // Restore the backup
  const result = await call(client, 'enfusion_restore_backup', { project: 'mod', path: 'Test.c', backupSha256: origSha, currentSha256: modified.sha256 });
  assert.equal(result.restoredFromSha256, origSha);
  // Verify content is back to original
  const restored = await call(client, 'enfusion_read_file', { project: 'mod', path: 'Test.c' });
  const restoredText = restored.lines.map(l => l.text).join('\n');
  assert(restoredText.includes('Original'));
});

// ===== enfusion_grep_context =====

test('enfusion_grep_context returns surrounding lines', async t => {
  const { root, configPath } = await fixture(t);
  await writeFile(path.join(root, 'Code.c'), 'line1\nline2\nTARGET_LINE\nline4\nline5\nline6');
  const { client } = await connect(t, configPath);
  const result = await call(client, 'enfusion_grep_context', { project: 'mod', query: 'TARGET_LINE', contextLines: 2 });
  assert.equal(result.matches.length, 1);
  const m = result.matches[0];
  assert.equal(m.line, 3);
  assert.deepEqual(m.before, ['line1', 'line2']);
  assert.deepEqual(m.after, ['line4', 'line5']);
  assert(m.match.includes('TARGET_LINE'));
});

// ===== enfusion_rename_symbol =====

test('enfusion_rename_symbol previews replacements without modifying files', async t => {
  const { root, configPath } = await fixture(t);
  await writeFile(path.join(root, 'A.c'), 'class OldName : ScriptComponent\n{\n  void Init();\n}');
  await writeFile(path.join(root, 'B.c'), 'void Test()\n{\n  OldName obj = new OldName();\n}');
  const { client } = await connect(t, configPath);
  const result = await call(client, 'enfusion_rename_symbol', { project: 'mod', oldName: 'OldName', newName: 'NewName' });
  assert(result.totalReplacements >= 2);
  for (const r of result.replacements) {
    assert(r.before.includes('OldName'));
    assert(r.after.includes('NewName'));
  }
  // Verify files are NOT modified (dry-run)
  const afterA = await call(client, 'enfusion_read_file', { project: 'mod', path: 'A.c' });
  const text = afterA.lines.map(l => l.text).join('\n');
  assert(text.includes('OldName'));
});

// ===== enfusion_entity_count =====

test('enfusion_entity_count tallies entity types in a prefab', async t => {
  const { root, configPath } = await fixture(t);
  const prefab = `GenericEntity {
 MeshComponent { mesh "box.xob" }
 MeshComponent { mesh "wheel.xob" }
 SCR_VehicleComponent { speed 100 }
 GenericEntity { MeshComponent { mesh "door.xob" } }
}`;
  await writeFile(path.join(root, 'Vehicle.et'), prefab);
  const { client } = await connect(t, configPath);
  const result = await call(client, 'enfusion_entity_count', { project: 'mod', path: 'Vehicle.et' });
  assert(result.totalEntities >= 5);
  assert.equal(result.entityTypes.MeshComponent, 3);
  assert(result.entityTypes.GenericEntity >= 2);
});
