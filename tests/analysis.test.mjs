import test from 'node:test';
import assert from 'node:assert/strict';
import { lib } from './helpers.mjs';

test('gproj inspector handles comments, dependencies and invalid empty dependencies', () => {
  const result = lib.projectInfo('GameProject {\n// ID "fake"\nID "Example"\nGUID "0123456789ABCDEF"\nTITLE "Example"\nDependencies { "58D0FB3206B6F859" "" }\n}');
  assert.equal(result.id, 'Example');
  assert.equal(result.dependencies.length, 2);
  assert(result.warnings.some(w => w.includes('dependency')));
  assert.throws(() => lib.projectInfo('not a descriptor'));
});

test('class and enum index ignores comments and string contents, preserving line numbers', () => {
  const result = lib.scriptSymbols('// class Fake {}\n/* enum False {} */\nstring s = "class Hidden {}";\nmodded class SCR_Example : Base\n{ }\nenum EMCP_State { Ready }');
  assert.deepEqual(result.map(s => [s.kind, s.name, s.line]), [['class', 'SCR_Example', 4], ['enum', 'EMCP_State', 6]]);
  assert.equal(result[0].modded, true);
  assert.equal(result[0].base, 'Base');
});

test('resource references keep actual strings and omit comments', () => {
  const result = lib.resourceReferences('// "{0000000000000000}Ignore.et"\nResourceName name = "{ABCDEF0123456789}Prefabs/Example.et";');
  assert.deepEqual(result, [{ guid: 'ABCDEF0123456789', path: 'Prefabs/Example.et', line: 2 }]);
});

test('diagnostics include script file and line for engine compiler errors', () => {
  const errors = lib.parseDiagnostics('SCRIPT (E): Scripts/Game/Test.c(23): Unknown type\nSCRIPT (W): deprecated method\nINIT : ready');
  assert.equal(errors.length, 2); assert.equal(errors[0].sourceLine, 23); assert.equal(errors[1].severity, 'warning');
});

test('diagnostics parse the current quoted Workbench source location format', () => {
  const [error] = lib.parseDiagnostics('18:33:24.859 SCRIPT (E): @"Scripts/Game/My File.c,17": Unknown type');
  assert.equal(error.source, 'Scripts/Game/My File.c');
  assert.equal(error.sourceLine, 17);
});

test('Workbench argument arrays preserve spaced paths without shell interpolation', () => {
  const args = lib.commandArgs('C:\\My Mods\\addon.gproj', ['C:\\Game\\addons', 'D:\\Other Mods'], 'WorldEditor', 'C:\\My Mods\\world.ent');
  assert.deepEqual(args, ['-gproj', 'C:\\My Mods\\addon.gproj', '-addonsDir', 'C:\\Game\\addons;D:\\Other Mods', '-wbModule=WorldEditor', '-run', '-load', 'C:\\My Mods\\world.ent']);
});

test('process runner handles success, failure, output limits and timeout', async () => {
  const success = await lib.runProcess(process.execPath, ['-e', 'process.stdout.write("a".repeat(100000));'], 5000, process.cwd());
  assert.equal(success.exitCode, 0); assert(success.stdout.length <= 32768);
  const failure = await lib.runProcess(process.execPath, ['-e', 'process.exit(7)'], 5000, process.cwd());
  assert.equal(failure.exitCode, 7);
  const timeout = await lib.runProcess(process.execPath, ['-e', 'setInterval(()=>{},1000)'], 100, process.cwd());
  assert.equal(timeout.timedOut, true);
});

test('process runner honors cancellation and refuses already-aborted requests', async () => {
  const controller = new AbortController();
  const promise = lib.runProcess(process.execPath, ['-e', 'setInterval(()=>{},1000)'], 5000, process.cwd(), controller.signal);
  controller.abort();
  const result = await promise;
  assert.equal(result.aborted, true);
  assert.equal(result.timedOut, false);
  await assert.rejects(lib.runProcess(process.execPath, ['-e', 'process.exit(0)'], 5000, process.cwd(), controller.signal));
});
