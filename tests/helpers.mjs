import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import lib from '../dist/library.cjs';
export { lib };

export async function fixture(t, overrides = {}) {
  const base = await mkdtemp(path.join(os.tmpdir(), 'enfusion-mcp-test-'));
  t.after(async () => {
    if (path.dirname(base) !== os.tmpdir() || !path.basename(base).startsWith('enfusion-mcp-test-')) throw new Error('Unsafe test cleanup target');
    await rm(base, { recursive: true, force: true });
  });
  const root = path.join(base, 'mod');
  await mkdir(root);
  const config = await lib.validateConfig({ projects: [{ id: 'mod', root, writable: true }], ...overrides });
  const configPath = path.join(base, 'config.json');
  await writeFile(configPath, JSON.stringify(config));
  return { base, root, config, configPath, workspace: new lib.Workspace(config) };
}

export async function connect(t, configPath, mode = 'legacy', serverPath = path.resolve('dist/server.cjs')) {
  const client = new Client({ name: 'enfusion-integration-test', version: '1.0.0' }, { versionNegotiation: { mode } });
  const transport = new StdioClientTransport({ command: process.execPath, args: [serverPath, '--config', configPath], stderr: 'pipe' });
  let stderr = '';
  transport.stderr.on('data', chunk => { stderr += chunk; });
  await client.connect(transport);
  t.after(() => client.close());
  return { client, stderr: () => stderr };
}

export async function call(client, name, args = {}) {
  const result = await client.callTool({ name, arguments: args });
  if (result.isError) throw new Error(result.content?.[0]?.text ?? 'Tool error');
  return result.structuredContent ?? JSON.parse(result.content[0].text);
}
