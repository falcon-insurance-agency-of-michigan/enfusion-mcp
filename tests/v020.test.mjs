import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { call, connect, fixture } from './helpers.mjs';

// ===== PREFAB INFO =====

test('enfusion_prefab_info parses components, parent prefab and entity count', async t => {
  const { root, configPath } = await fixture(t);
  await mkdir(path.join(root, 'Prefabs'));
  await writeFile(path.join(root, 'Prefabs', 'Vehicle.et'), `SCR_Vehicle : "{AABB112233445566}Prefabs/Base.et" {
 MeshComponent {
  model "{1122334455667788}Models/Car.xob"
  material "{AABBCCDD11223344}Materials/Paint.emat"
 }
 RigidBodyComponent {
  mass 1200.5
 }
 SCR_VehicleDamageComponent {
  maxHealth 500
  canExplode 1
 }
}
`);
  const { client } = await connect(t, configPath);
  const info = await call(client, 'enfusion_prefab_info', { project: 'mod', path: 'Prefabs/Vehicle.et' });
  assert.equal(info.className, 'SCR_Vehicle');
  assert.equal(info.parentPrefab, '{AABB112233445566}Prefabs/Base.et');
  assert(info.components.length >= 2);
  assert(info.components.some(c => c.className === 'MeshComponent'));
  assert(info.components.some(c => c.className === 'RigidBodyComponent'));
  assert(info.entityCount > 0);
});

test('enfusion_prefab_info rejects non-.et files', async t => {
  const { root, configPath } = await fixture(t);
  await writeFile(path.join(root, 'Test.c'), 'class Foo {}');
  const { client } = await connect(t, configPath);
  const result = await client.callTool({ name: 'enfusion_prefab_info', arguments: { project: 'mod', path: 'Test.c' } });
  assert.equal(result.isError, true);
});

// ===== WORLD INFO =====

test('enfusion_world_info parses layers and referenced prefabs', async t => {
  const { root, configPath } = await fixture(t);
  await writeFile(path.join(root, 'World.ent'), `GenericWorldEntity {
 EditableEntityDefaultLayer "default" {
  GenericEntity : "{1111222233334444}Prefabs/Tree.et" {
   coords 100 0 200
  }
  GenericEntity : "{5555666677778888}Prefabs/Rock.et" {
   coords 50 0 150
  }
 }
 EditableEntityDefaultLayer "buildings" {
  GenericEntity : "{1111222233334444}Prefabs/Tree.et" {
  }
 }
}
`);
  const { client } = await connect(t, configPath);
  const info = await call(client, 'enfusion_world_info', { project: 'mod', path: 'World.ent' });
  assert.equal(info.className, 'GenericWorldEntity');
  assert(info.layers.length >= 2);
  assert(info.totalEntities > 0);
  assert(info.referencedPrefabs.length >= 1);
});

// ===== CONFIG INFO =====

test('enfusion_config_info parses key-value entries and blocks', async t => {
  const { root, configPath } = await fixture(t);
  await writeFile(path.join(root, 'server.conf'), `ServerConfig {
 name "My Server"
 maxPlayers 64
 password "secret123"
 Mods {
  ModEntry {
   modId "AABB112233445566"
  }
 }
}
`);
  const { client } = await connect(t, configPath);
  const info = await call(client, 'enfusion_config_info', { project: 'mod', path: 'server.conf' });
  assert(info.entries.length > 0);
  assert(info.entries.some(e => e.key === 'name' && e.value === 'My Server'));
  assert(info.entries.some(e => e.key === 'maxPlayers' && e.value === '64'));
});

// ===== LAYOUT INFO =====

test('enfusion_layout_info parses widgets and resource references', async t => {
  const { root, configPath } = await fixture(t);
  await writeFile(path.join(root, 'UI.layout'), `FrameWidget "RootFrame" {
 slot "0 0 1 1"
 ImageWidget "Background" {
  slot "0 0 1 1"
  texture "{AABB112233445566}UI/Textures/bg.edds"
 }
 ButtonWidget "PlayButton" {
  slot "0.4 0.8 0.2 0.1"
  TextWidget "PlayLabel" {
  }
 }
}
`);
  const { client } = await connect(t, configPath);
  const info = await call(client, 'enfusion_layout_info', { project: 'mod', path: 'UI.layout' });
  assert(info.widgets.length >= 2);
  assert(info.widgets.some(w => w.type === 'FrameWidget' && w.name === 'RootFrame'));
  assert(info.widgets.some(w => w.type === 'ButtonWidget'));
  assert(info.referencedResources.length >= 1);
});

// ===== DEPENDENCY GRAPH =====

test('enfusion_dependency_graph maps references and reports unresolved GUIDs', async t => {
  const { root, configPath } = await fixture(t);
  await mkdir(path.join(root, 'Prefabs'));
  await writeFile(path.join(root, 'Prefabs', 'A.et'), 'EntityA { ref "{AAAA111122223333}Models/Car.xob" }');
  await writeFile(path.join(root, 'Prefabs', 'A.et.meta'), 'MetaFileClass {\n Name "{1111AAAA2222BBBB}Prefabs/A.et"\n}');
  await writeFile(path.join(root, 'Prefabs', 'B.et'), 'EntityB { ref "{1111AAAA2222BBBB}Prefabs/A.et" }');
  const { client } = await connect(t, configPath);
  const graph = await call(client, 'enfusion_dependency_graph', { project: 'mod' });
  assert(graph.stats.edges > 0);
  assert(graph.stats.uniqueGuids > 0);
  // The reference from B.et -> A.et should resolve via meta ownership
  const resolved = graph.edges.find(e => e.source === 'Prefabs/B.et' && e.target === 'Prefabs/A.et');
  assert(resolved, 'Should resolve B.et reference to A.et via meta');
  // The reference from A.et -> Models/Car.xob should be unresolved (no meta)
  assert(graph.unresolvedGuids.includes('AAAA111122223333'));
});

// ===== RENAME FILE =====

test('enfusion_rename_file moves a file with backup', async t => {
  const { root, configPath } = await fixture(t);
  await writeFile(path.join(root, 'Old.c'), 'class OldName {}');
  const { client } = await connect(t, configPath);
  const read = await call(client, 'enfusion_read_file', { project: 'mod', path: 'Old.c' });
  const result = await call(client, 'enfusion_rename_file', { project: 'mod', from: 'Old.c', to: 'New.c', expectedSha256: read.sha256 });
  assert.equal(result.from, 'Old.c');
  assert.equal(result.to, 'New.c');
  assert(result.backup);
  // New file should be readable
  const readNew = await call(client, 'enfusion_read_file', { project: 'mod', path: 'New.c' });
  assert.equal(readNew.sha256, read.sha256);
  // Old file should be gone
  const oldResult = await client.callTool({ name: 'enfusion_read_file', arguments: { project: 'mod', path: 'Old.c' } });
  assert.equal(oldResult.isError, true);
});

// ===== DELETE FILE =====

test('enfusion_delete_file removes a file with backup', async t => {
  const { root, configPath } = await fixture(t);
  await writeFile(path.join(root, 'Victim.c'), 'class Victim {}');
  const { client } = await connect(t, configPath);
  const read = await call(client, 'enfusion_read_file', { project: 'mod', path: 'Victim.c' });
  const result = await call(client, 'enfusion_delete_file', { project: 'mod', path: 'Victim.c', expectedSha256: read.sha256 });
  assert.equal(result.deleted, true);
  assert(result.backup);
  // File should be gone
  const readResult = await client.callTool({ name: 'enfusion_read_file', arguments: { project: 'mod', path: 'Victim.c' } });
  assert.equal(readResult.isError, true);
});

// ===== DIFF FILE =====

test('enfusion_diff_file produces unified diff', async t => {
  const { root, configPath } = await fixture(t);
  await writeFile(path.join(root, 'Diff.c'), 'class Original {\n  int x;\n}\n');
  const { client } = await connect(t, configPath);
  const result = await call(client, 'enfusion_diff_file', { project: 'mod', path: 'Diff.c', proposed: 'class Modified {\n  int x;\n  int y;\n}\n' });
  assert.equal(result.identical, false);
  assert(result.hunks > 0);
  assert(result.diff.includes('-class Original'));
  assert(result.diff.includes('+class Modified'));
  assert(result.diff.includes('+  int y;'));
});

test('enfusion_diff_file reports identical files', async t => {
  const { root, configPath } = await fixture(t);
  await writeFile(path.join(root, 'Same.c'), 'class Same {}\n');
  const { client } = await connect(t, configPath);
  const result = await call(client, 'enfusion_diff_file', { project: 'mod', path: 'Same.c', proposed: 'class Same {}\n' });
  assert.equal(result.identical, true);
  assert.equal(result.hunks, 0);
});

// ===== BATCH SEARCH =====

test('enfusion_batch_search finds multiple queries simultaneously', async t => {
  const { root, configPath } = await fixture(t);
  await writeFile(path.join(root, 'Multi.c'), 'class Alpha {}\nclass Beta {}\nclass Gamma {}\n');
  const { client } = await connect(t, configPath);
  const result = await call(client, 'enfusion_batch_search', { project: 'mod', queries: ['Alpha', 'Beta', 'Missing'] });
  assert.equal(result.results.Alpha.matches.length, 1);
  assert.equal(result.results.Beta.matches.length, 1);
  assert.equal(result.results.Missing.matches.length, 0);
  assert.equal(result.queriesSearched, 3);
});

// ===== FILE HISTORY =====

test('enfusion_file_history lists backups after edits', async t => {
  const { root, configPath } = await fixture(t);
  await writeFile(path.join(root, 'History.c'), 'class V1 {}');
  const { client } = await connect(t, configPath);
  // Initial read
  const v1 = await call(client, 'enfusion_read_file', { project: 'mod', path: 'History.c' });
  // Edit to create a backup
  await call(client, 'enfusion_write_file', { project: 'mod', path: 'History.c', content: 'class V2 {}', expectedSha256: v1.sha256 });
  // Check history
  const history = await call(client, 'enfusion_file_history', { project: 'mod', path: 'History.c' });
  assert(history.backups.length >= 1);
  assert(history.backups.some(b => b.sha256 === v1.sha256));
});

test('enfusion_file_history returns empty for files without backups', async t => {
  const { root, configPath } = await fixture(t);
  await writeFile(path.join(root, 'Fresh.c'), 'class Fresh {}');
  const { client } = await connect(t, configPath);
  const history = await call(client, 'enfusion_file_history', { project: 'mod', path: 'Fresh.c' });
  assert.equal(history.backups.length, 0);
});
