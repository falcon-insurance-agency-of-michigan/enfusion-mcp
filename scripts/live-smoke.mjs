import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';

const [workbenchPath, gameAddons] = process.argv.slice(2);
if (!workbenchPath || !gameAddons) throw new Error('Usage: node scripts/live-smoke.mjs <Workbench.exe> <game/addons>');
const runRoot = path.resolve('local', `live-${Date.now()}`);
await mkdir(runRoot, { recursive: true });
const projects = ['good', 'bad'].map(id => ({ id, root: path.join(runRoot, id), writable: true }));
for (const project of projects) await mkdir(project.root);
const configPath = path.join(runRoot, 'config.json');
await writeFile(configPath, JSON.stringify({ projects, workbenchPath, addonRoots: [gameAddons], allowLaunch: true }));
const client = new Client({ name: 'enfusion-live-smoke', version: '0.1.0' });
await client.connect(new StdioClientTransport({ command: process.execPath, args: [path.resolve('dist/server.cjs'), '--config', configPath] }));
async function call(name, args) {
  const result = await client.callTool({ name, arguments: args }, { timeout: 180000 });
  if (result.isError) throw new Error(result.content[0].text);
  return result.structuredContent ?? JSON.parse(result.content[0].text);
}
try {
  const results = {};
  for (const { id } of projects) {
    await call('enfusion_create_project', { project: id, id: `EMCP_Smoke_${id}`, title: `Enfusion MCP ${id} test` });
    await call('enfusion_install_companion', { project: id });
    await call('enfusion_write_file', { project: id, path: 'Scripts/Game/EMCP_Test.c', content: id === 'good' ? 'class EMCP_Test { static string Message() { return "Enfusion MCP smoke test"; } }\n' : 'class EMCP_Test : EMCP_MissingBase_IntentionalTest {}\n' });
    console.log(`Validating ${id} addon in an isolated Workbench process...`);
    results[id] = await call('enfusion_workbench_validate', { project: id, timeoutSeconds: id === 'good' ? 120 : 30 });
    console.log(JSON.stringify({ project: id, exitCode: results[id].exitCode, timedOut: results[id].timedOut, loaded: results[id].loaded, scriptStartupPassed: results[id].scriptStartupPassed, cleanLogs: results[id].cleanLogs, success: results[id].success, diagnostics: results[id].diagnostics.filter(d => d.message.includes('EMCP_') || d.message.includes("compile")).slice(0, 10) }, null, 2));
  }
  await writeFile(path.join(runRoot, 'results.json'), JSON.stringify(results, null, 2));
  console.log(`Results: ${runRoot}`);
  // This is an integration smoke test. All engine diagnostics remain available in the report.
  if (!results.good.scriptStartupPassed || results.bad.success || results.bad.loaded) process.exitCode = 1;
} finally { await client.close(); }
