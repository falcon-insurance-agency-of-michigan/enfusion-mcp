import { serveStdio } from '@modelcontextprotocol/server/stdio';
import { loadConfig, VERSION } from './config.js';
import { createServer } from './server.js';

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 1 && args[0] === '--version') { console.log(VERSION); return; }
  if (args.length === 1 && args[0] === '--help') {
    console.log('enfusion-mcp [--config <absolute-config.json>]\nLocal stdio MCP server for Arma Reforger SDK. Node.js >=22.\nConfig: --config, then ENFUSION_MCP_CONFIG, then ~/.config/enfusion-mcp/config.json.\nWithout configuration the server exposes status/docs but no filesystem roots.');
    return;
  }
  if (args.length && !(args.length === 2 && args[0] === '--config' && args[1])) throw new Error('Usage: enfusion-mcp [--config <config.json>]');
  const config = await loadConfig(args[1]);
  const handle = serveStdio(() => createServer(config), { onerror: error => console.error(`enfusion-mcp: ${error.message}`) });
  process.once('SIGINT', () => { void handle.close(); });
  process.once('SIGTERM', () => { void handle.close(); });
}
main().catch(error => { console.error(`enfusion-mcp: ${error.message}`); process.exitCode = 1; });
