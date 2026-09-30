#!/usr/bin/env node

/**
 * Enfusion Engine SDK MCP — Multi-IDE Installer
 *
 * Configures the Enfusion MCP server across all supported AI coding agents,
 * IDEs, and extensions on the user's system.
 *
 * Supports interactive checklist selection and automated CLI flags:
 *   --all         Install into all supported clients
 *   --detected    Install into all detected clients
 *   --select <id> Comma-separated list of client IDs to install into
 *   --dry-run     Show what would be modified without changing files
 *   --server <p>  Custom path to dist/server.cjs
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..');
const DEFAULT_SERVER_PATH = path.join(REPO_ROOT, 'dist', 'server.cjs');
const TOOLS_DOC_PATH = path.join(REPO_ROOT, 'TOOLS.md');

// Helper to strip comments from JSONC if present
export function parseJsonc(text) {
  try {
    return JSON.parse(text);
  } catch {
    // Strip /* block */ and // line comments
    const stripped = text
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/[^\r\n]*/g, '');
    return JSON.parse(stripped);
  }
}

/**
 * Registry of supported IDEs, agents, and MCP clients
 */
export const CLIENT_REGISTRY = [
  {
    id: 'claude-code',
    name: 'Claude Code CLI',
    category: 'CLI Agent',
    description: 'Anthropic Claude Code command-line tool (~/.claude/settings.json)',
    getConfigPath: (home, appData) => path.join(home, '.claude', 'settings.json'),
    detect: (home, appData) => fs.existsSync(path.join(home, '.claude')),
    format: 'json-mcpservers',
    restartHint: 'Restart active terminal or run `claude`'
  },
  {
    id: 'codex',
    name: 'OpenAI Codex',
    category: 'Desktop / CLI',
    description: 'OpenAI Codex CLI & desktop runtime (~/.codex/config.toml)',
    getConfigPath: (home, appData) => path.join(home, '.codex', 'config.toml'),
    detect: (home, appData) => fs.existsSync(path.join(home, '.codex')),
    format: 'codex-toml',
    restartHint: 'Restart Codex CLI or desktop app'
  },
  {
    id: 'claude-desktop',
    name: 'Claude Desktop',
    category: 'Desktop App',
    description: 'Anthropic Claude Desktop application',
    getConfigPath: (home, appData) => {
      if (process.platform === 'win32') {
        return path.join(appData || path.join(home, 'AppData', 'Roaming'), 'Claude', 'claude_desktop_config.json');
      } else if (process.platform === 'darwin') {
        return path.join(home, 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json');
      }
      return path.join(home, '.config', 'Claude', 'claude_desktop_config.json');
    },
    detect: (home, appData) => {
      const p = process.platform === 'win32'
        ? path.join(appData || path.join(home, 'AppData', 'Roaming'), 'Claude')
        : process.platform === 'darwin'
        ? path.join(home, 'Library', 'Application Support', 'Claude')
        : path.join(home, '.config', 'Claude');
      return fs.existsSync(p);
    },
    format: 'json-mcpservers',
    restartHint: 'Fully quit Claude Desktop (Ctrl+Q or Cmd+Q) and relaunch'
  },
  {
    id: 'cursor',
    name: 'Cursor',
    category: 'IDE',
    description: 'Cursor AI code editor (~/.cursor/mcp.json)',
    getConfigPath: (home, appData) => path.join(home, '.cursor', 'mcp.json'),
    detect: (home, appData) => fs.existsSync(path.join(home, '.cursor')) || (appData && fs.existsSync(path.join(appData, 'Cursor'))),
    format: 'json-mcpservers',
    restartHint: 'In Cursor: press Ctrl+Shift+P > Developer: Reload Window'
  },
  {
    id: 'windsurf',
    name: 'Windsurf / Cascade',
    category: 'IDE',
    description: 'Codeium Windsurf IDE (~/.codeium/windsurf/mcp_config.json)',
    getConfigPath: (home, appData) => path.join(home, '.codeium', 'windsurf', 'mcp_config.json'),
    detect: (home, appData) => fs.existsSync(path.join(home, '.codeium', 'windsurf')),
    format: 'json-mcpservers',
    restartHint: 'In Windsurf: press Ctrl+Shift+P > Developer: Reload Window'
  },
  {
    id: 'vscode-cline',
    name: 'VS Code (Cline Extension)',
    category: 'Extension',
    description: 'Cline AI assistant extension for VS Code',
    getConfigPath: (home, appData) => {
      const base = appData || path.join(home, '.config');
      return path.join(base, 'Code', 'User', 'globalStorage', 'saoudrizwan.claude-dev', 'settings', 'cline_mcp_settings.json');
    },
    detect: (home, appData) => {
      const base = appData || path.join(home, '.config');
      return fs.existsSync(path.join(base, 'Code', 'User', 'globalStorage', 'saoudrizwan.claude-dev'));
    },
    format: 'json-cline',
    restartHint: 'In VS Code: open Cline > MCP Servers tab > refresh'
  },
  {
    id: 'vscode-roo',
    name: 'VS Code (Roo Code)',
    category: 'Extension',
    description: 'Roo Code AI agent extension for VS Code',
    getConfigPath: (home, appData) => {
      const base = appData || path.join(home, '.config');
      return path.join(base, 'Code', 'User', 'globalStorage', 'rooveterinaryinc.roo-cline', 'settings', 'cline_mcp_settings.json');
    },
    detect: (home, appData) => {
      const base = appData || path.join(home, '.config');
      return fs.existsSync(path.join(base, 'Code', 'User', 'globalStorage', 'rooveterinaryinc.roo-cline'));
    },
    format: 'json-cline',
    restartHint: 'In VS Code: open Roo Code > Prompts/MCP tab > refresh'
  },
  {
    id: 'continue',
    name: 'Continue.dev',
    category: 'Extension / IDE',
    description: 'Continue open-source AI assistant (~/.continue/config.json)',
    getConfigPath: (home, appData) => path.join(home, '.continue', 'config.json'),
    detect: (home, appData) => fs.existsSync(path.join(home, '.continue')),
    format: 'continue-json',
    restartHint: 'In VS Code / JetBrains: reload window or restart IDE'
  },
  {
    id: 'antigravity',
    name: 'Google Antigravity',
    category: 'Agent Platform',
    description: 'Google Antigravity autonomous agent system',
    getConfigPath: (home, appData) => path.join(home, '.gemini', 'antigravity', 'mcp', 'enfusion-mcp'),
    detect: (home, appData) => fs.existsSync(path.join(home, '.gemini', 'antigravity')),
    format: 'antigravity-dir',
    restartHint: 'Antigravity auto-discovers updated MCP tools on new tasks'
  },
  {
    id: 'zed',
    name: 'Zed Editor',
    category: 'IDE',
    description: 'Zed high-performance code editor',
    getConfigPath: (home, appData) => {
      if (process.platform === 'win32') {
        return path.join(appData || path.join(home, 'AppData', 'Roaming'), 'Zed', 'settings.json');
      }
      return path.join(home, '.config', 'zed', 'settings.json');
    },
    detect: (home, appData) => {
      const p = process.platform === 'win32'
        ? path.join(appData || path.join(home, 'AppData', 'Roaming'), 'Zed')
        : path.join(home, '.config', 'zed');
      return fs.existsSync(p);
    },
    format: 'zed-json',
    restartHint: 'In Zed: save settings or restart editor'
  },
  {
    id: 'enfusion-config',
    name: 'Enfusion Workspace Config',
    category: 'Engine SDK',
    description: 'Enfusion MCP server project config (~/.config/enfusion-mcp/config.json)',
    getConfigPath: (home, appData) => path.join(home, '.config', 'enfusion-mcp', 'config.json'),
    detect: (home, appData) => fs.existsSync(path.join(home, '.config', 'enfusion-mcp')),
    format: 'enfusion-json',
    restartHint: 'Enfusion MCP server reads this configuration on startup'
  }
];

/**
 * Configure a single client
 */
export async function installClient(client, serverPath, options = {}) {
  const home = options.home || os.homedir();
  const appData = options.appData || process.env.APPDATA || path.join(home, 'AppData', 'Roaming');
  const dryRun = Boolean(options.dryRun);
  const targetPath = client.getConfigPath(home, appData);
  const result = {
    id: client.id,
    name: client.name,
    targetPath,
    action: 'none',
    backupPath: null,
    error: null
  };

  try {
    const parentDir = client.format === 'antigravity-dir' ? targetPath : path.dirname(targetPath);
    if (!dryRun) {
      fs.mkdirSync(parentDir, { recursive: true });
    }

    if (client.format === 'antigravity-dir') {
      result.action = 'configured-dir';
      if (!dryRun && fs.existsSync(TOOLS_DOC_PATH)) {
        const destDoc = path.join(targetPath, 'TOOLS.md');
        fs.copyFileSync(TOOLS_DOC_PATH, destDoc);
      }
      return result;
    }

    // Read existing file if present
    let existingContent = '';
    let exists = false;
    if (fs.existsSync(targetPath)) {
      exists = true;
      existingContent = fs.readFileSync(targetPath, 'utf8');
      if (!dryRun) {
        // Create backup
        const backupPath = `${targetPath}.bak`;
        fs.writeFileSync(backupPath, existingContent, 'utf8');
        result.backupPath = backupPath;
      }
    }

    let updatedContent = '';

    if (client.format === 'json-mcpservers') {
      let data = {};
      if (exists && existingContent.trim()) {
        data = parseJsonc(existingContent);
      }
      if (!data || typeof data !== 'object' || Array.isArray(data)) data = {};
      if (!data.mcpServers || typeof data.mcpServers !== 'object') data.mcpServers = {};
      data.mcpServers['enfusion-mcp'] = {
        command: 'node',
        args: [serverPath]
      };
      updatedContent = JSON.stringify(data, null, 2) + '\n';
      result.action = exists ? 'updated' : 'created';
    } else if (client.format === 'json-cline') {
      let data = {};
      if (exists && existingContent.trim()) {
        data = parseJsonc(existingContent);
      }
      if (!data || typeof data !== 'object' || Array.isArray(data)) data = {};
      if (!data.mcpServers || typeof data.mcpServers !== 'object') data.mcpServers = {};
      data.mcpServers['enfusion-mcp'] = {
        command: 'node',
        args: [serverPath],
        disabled: false,
        autoApprove: []
      };
      updatedContent = JSON.stringify(data, null, 2) + '\n';
      result.action = exists ? 'updated' : 'created';
    } else if (client.format === 'continue-json') {
      let data = {};
      if (exists && existingContent.trim()) {
        data = parseJsonc(existingContent);
      }
      if (!data || typeof data !== 'object' || Array.isArray(data)) data = {};
      if (!Array.isArray(data.mcpServers)) {
        data.mcpServers = [];
      }
      // Remove any existing entry
      data.mcpServers = data.mcpServers.filter(s => s && s.name !== 'enfusion-mcp');
      data.mcpServers.push({
        name: 'enfusion-mcp',
        command: 'node',
        args: [serverPath]
      });
      updatedContent = JSON.stringify(data, null, 2) + '\n';
      result.action = exists ? 'updated' : 'created';
    } else if (client.format === 'zed-json') {
      let data = {};
      if (exists && existingContent.trim()) {
        data = parseJsonc(existingContent);
      }
      if (!data || typeof data !== 'object' || Array.isArray(data)) data = {};
      if (!data.context_servers || typeof data.context_servers !== 'object') data.context_servers = {};
      data.context_servers['enfusion-mcp'] = {
        command: 'node',
        args: [serverPath]
      };
      updatedContent = JSON.stringify(data, null, 2) + '\n';
      result.action = exists ? 'updated' : 'created';
    } else if (client.format === 'enfusion-json') {
      if (!exists || !existingContent.trim()) {
        const defaultData = {
          projects: [
            {
              id: 'my-mod',
              root: 'C:/path/to/your/mod',
              writable: true
            }
          ],
          workbenchPath: '',
          addonRoots: [],
          allowLaunch: false
        };
        updatedContent = JSON.stringify(defaultData, null, 2) + '\n';
        result.action = 'created';
      } else {
        result.action = 'verified';
        updatedContent = existingContent;
      }
    } else if (client.format === 'codex-toml') {
      const escapedPath = JSON.stringify(serverPath);
      const mcpBlock = `[mcp_servers.enfusion-mcp]\ncommand = "node"\nargs = [${escapedPath}]`;
      const pluginBlock = `[plugins."enfusion-mcp@personal"]\nenabled = true`;

      let toml = existingContent || '';
      // Update or append mcp_servers.enfusion-mcp
      const mcpRegex = /\[mcp_servers\.enfusion-mcp\][\s\S]*?(?=\r?\n\[|$)/;
      if (mcpRegex.test(toml)) {
        toml = toml.replace(mcpRegex, mcpBlock);
      } else {
        toml = toml.trimEnd() + (toml.trim() ? '\n\n' : '') + mcpBlock + '\n';
      }

      // Check plugin enablement
      if (!/\[plugins\."enfusion-mcp@personal"\]/.test(toml)) {
        toml = toml.trimEnd() + '\n\n' + pluginBlock + '\n';
      }

      updatedContent = toml;
      result.action = exists ? 'updated' : 'created';

      // Also deploy to Codex plugin cache if release zip is present
      if (!dryRun) {
        try {
          const pkgJsonPath = path.join(REPO_ROOT, 'package.json');
          if (fs.existsSync(pkgJsonPath)) {
            const pkg = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8'));
            const cacheDir = path.join(home, '.codex', 'plugins', 'cache', 'personal', 'enfusion-mcp', pkg.version);
            const releaseZip = path.join(REPO_ROOT, 'release', `enfusion-mcp-${pkg.version}.zip`);
            if (fs.existsSync(releaseZip)) {
              fs.mkdirSync(path.join(cacheDir, 'release'), { recursive: true });
              fs.mkdirSync(path.join(cacheDir, 'local', 'downloaded'), { recursive: true });
              fs.copyFileSync(releaseZip, path.join(cacheDir, 'release', `enfusion-mcp-${pkg.version}.zip`));
              fs.copyFileSync(releaseZip, path.join(cacheDir, 'local', 'downloaded', `enfusion-mcp-${pkg.version}.zip`));
              result.cacheDeployed = cacheDir;
            }
          }
        } catch {
          // Non-fatal
        }
      }
    }

    if (!dryRun && updatedContent && result.action !== 'verified') {
      fs.writeFileSync(targetPath, updatedContent, 'utf8');
    }

    // Deploy adjacent TOOLS.md for quick user reference
    if (!dryRun && fs.existsSync(TOOLS_DOC_PATH) && client.format !== 'antigravity-dir') {
      try {
        const destDoc = path.join(parentDir, 'enfusion-mcp-TOOLS.md');
        fs.copyFileSync(TOOLS_DOC_PATH, destDoc);
        result.docDeployed = destDoc;
      } catch {
        // Non-fatal
      }
    }
  } catch (err) {
    result.error = err.message;
  }

  return result;
}

/**
 * Interactive checklist UI
 */
export async function runInteractivePrompt(clients, serverPath) {
  const home = os.homedir();
  const appData = process.env.APPDATA || path.join(home, 'AppData', 'Roaming');

  // Detect which clients are present
  const detectedMap = new Map();
  for (const c of clients) {
    detectedMap.set(c.id, c.detect(home, appData));
  }

  // Initial selection: check all detected ones by default
  const selectedMap = new Map();
  let anyDetected = false;
  for (const c of clients) {
    const isDet = detectedMap.get(c.id);
    if (isDet) anyDetected = true;
    selectedMap.set(c.id, Boolean(isDet));
  }
  // If nothing was detected, select all by default so user can choose
  if (!anyDetected) {
    for (const c of clients) selectedMap.set(c.id, true);
  }

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  const question = query => new Promise(resolve => rl.question(query, resolve));

  const render = () => {
    console.clear();
    console.log('========================================================================');
    console.log('              Enfusion Engine SDK MCP — Multi-IDE Installer             ');
    console.log('========================================================================');
    console.log(`Server: ${serverPath}`);
    console.log('');
    console.log('Select the clients / IDEs where you want to install Enfusion MCP:');
    console.log('');

    clients.forEach((c, idx) => {
      const num = String(idx + 1).padStart(2, ' ');
      const checked = selectedMap.get(c.id) ? '[*]' : '[ ]';
      const isDet = detectedMap.get(c.id);
      const tag = isDet ? ' (Detected)' : '';
      const cfgPath = c.getConfigPath(home, appData);
      console.log(`  ${num}. ${checked} ${c.name.padEnd(26, ' ')}${tag.padEnd(14, ' ')} -> ${cfgPath}`);
    });

    console.log('');
    console.log('Commands:');
    console.log('  [1-11]      Toggle an option (or comma-separated, e.g. "1, 3, 5")');
    console.log('  [A]         Select ALL clients');
    console.log('  [D]         Select DETECTED clients only');
    console.log('  [N]         Select NONE (clear all)');
    console.log('  [ENTER]     Confirm and install selected clients');
    console.log('  [Q]         Quit / Cancel');
    console.log('------------------------------------------------------------------------');
  };

  while (true) {
    render();
    const answer = (await question('Your choice > ')).trim().toLowerCase();

    if (answer === 'q' || answer === 'quit' || answer === 'exit') {
      rl.close();
      console.log('\nInstallation cancelled. No changes were made.');
      return [];
    }

    if (answer === '') {
      // Confirm selection
      const chosen = clients.filter(c => selectedMap.get(c.id));
      rl.close();
      return chosen;
    }

    if (answer === 'a' || answer === 'all') {
      for (const c of clients) selectedMap.set(c.id, true);
      continue;
    }

    if (answer === 'd' || answer === 'detected') {
      for (const c of clients) selectedMap.set(c.id, Boolean(detectedMap.get(c.id)));
      continue;
    }

    if (answer === 'n' || answer === 'none' || answer === 'clear') {
      for (const c of clients) selectedMap.set(c.id, false);
      continue;
    }

    // Parse numbers e.g. "1, 3, 5" or "1 3 5"
    const parts = answer.split(/[\s,]+/).filter(Boolean);
    let matchedAny = false;
    for (const part of parts) {
      const val = parseInt(part, 10);
      if (!isNaN(val) && val >= 1 && val <= clients.length) {
        const client = clients[val - 1];
        selectedMap.set(client.id, !selectedMap.get(client.id));
        matchedAny = true;
      }
    }

    if (!matchedAny) {
      console.log(`Unknown input: "${answer}". Press Enter to continue...`);
      await question('');
    }
  }
}

/**
 * Main entry point
 */
export async function main() {
  const args = process.argv.slice(2);
  const home = os.homedir();
  const appData = process.env.APPDATA || path.join(home, 'AppData', 'Roaming');

  let serverPath = DEFAULT_SERVER_PATH;
  let dryRun = false;
  let mode = 'interactive';
  let selectedIds = null;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--server' && args[i + 1]) {
      serverPath = path.resolve(args[++i]);
    } else if (arg === '--dry-run') {
      dryRun = true;
    } else if (arg === '--all') {
      mode = 'all';
    } else if (arg === '--detected') {
      mode = 'detected';
    } else if (arg === '--select' && args[i + 1]) {
      mode = 'select';
      selectedIds = args[++i].split(',').map(s => s.trim().toLowerCase());
    } else if (arg === '--help' || arg === '-h') {
      console.log('Enfusion MCP Multi-IDE Installer');
      console.log('');
      console.log('Usage:');
      console.log('  node scripts/installer.mjs [options]');
      console.log('');
      console.log('Options:');
      console.log('  --all          Install to all supported clients');
      console.log('  --detected     Install to detected clients only');
      console.log('  --select <ids> Comma-separated list of IDs to install to');
      console.log('  --dry-run      Preview actions without modifying files');
      console.log('  --server <path> Specify path to dist/server.cjs');
      console.log('  --help, -h     Show this help');
      console.log('');
      console.log('Supported Client IDs:');
      CLIENT_REGISTRY.forEach(c => console.log(`  - ${c.id.padEnd(18, ' ')} : ${c.name}`));
      process.exit(0);
    }
  }

  // Verify server binary exists
  if (!fs.existsSync(serverPath)) {
    console.error(`\n[WARNING] Server binary not found at: ${serverPath}`);
    console.error('Make sure to build the project first with: npm run build\n');
  }

  let targets = [];

  if (mode === 'all') {
    targets = CLIENT_REGISTRY;
  } else if (mode === 'detected') {
    targets = CLIENT_REGISTRY.filter(c => c.detect(home, appData));
  } else if (mode === 'select') {
    const set = new Set(selectedIds || []);
    targets = CLIENT_REGISTRY.filter(c => set.has(c.id));
    if (targets.length === 0) {
      console.error(`No matching clients found for selection: ${selectedIds?.join(', ')}`);
      process.exit(1);
    }
  } else {
    // Interactive mode
    if (!process.stdin.isTTY) {
      console.log('Non-interactive environment detected. Installing to detected clients...');
      targets = CLIENT_REGISTRY.filter(c => c.detect(home, appData));
    } else {
      targets = await runInteractivePrompt(CLIENT_REGISTRY, serverPath);
    }
  }

  if (targets.length === 0) {
    console.log('\nNo clients selected for installation. Exiting.');
    return;
  }

  console.log(`\nInstalling Enfusion MCP into ${targets.length} client(s)${dryRun ? ' (DRY RUN)' : ''}...\n`);

  const results = [];
  for (const client of targets) {
    const res = await installClient(client, serverPath, { home, appData, dryRun });
    results.push({ client, res });

    if (res.error) {
      console.log(`  [✗] ${client.name.padEnd(25, ' ')}: ERROR - ${res.error}`);
    } else {
      const actionLabel = res.action === 'created' ? 'Created' : res.action === 'updated' ? 'Updated' : 'Configured';
      console.log(`  [✓] ${client.name.padEnd(25, ' ')}: ${actionLabel} -> ${res.targetPath}`);
      if (res.backupPath) {
        console.log(`      (Backup: ${res.backupPath})`);
      }
      if (res.cacheDeployed) {
        console.log(`      (Plugin cache deployed: ${res.cacheDeployed})`);
      }
    }
  }

  console.log('\n------------------------------------------------------------------------');
  console.log('                          NEXT STEPS & RESTART                         ');
  console.log('------------------------------------------------------------------------');

  for (const { client, res } of results) {
    if (!res.error) {
      console.log(`* ${client.name}:`);
      console.log(`  -> ${client.restartHint}`);
    }
  }

  console.log('\nTools reference and documentation:');
  console.log(`  file://${TOOLS_DOC_PATH.replaceAll('\\', '/')}`);
  console.log('\nDone!\n');
}

// Run if called directly
if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  main().catch(err => {
    console.error('Fatal installer error:', err);
    process.exit(1);
  });
}
