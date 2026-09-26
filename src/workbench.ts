import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { lstat, mkdir, open, readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import type { Config } from './config.js';
import { Workspace, sha256 } from './workspace.js';
import { parseDiagnostics } from './analysis.js';
import companion from '../workbench/EMCP_ValidatePlugin.c';

export const COMPANION_PATH = 'Scripts/WorkbenchGame/EMCP_ValidatePlugin.c';
export const COMPANION_SOURCE = companion;
export type Module = 'ResourceManager' | 'ScriptEditor' | 'WorldEditor';

export function commandArgs(gproj: string, addonRoots: string[], module: Module, load?: string) {
  const args = ['-gproj', gproj];
  if (addonRoots.length) args.push('-addonsDir', addonRoots.join(';'));
  args.push(`-wbModule=${module}`, '-run');
  if (load) args.push('-load', load);
  return args;
}

export async function runProcess(executable: string, args: string[], timeoutMs: number, cwd: string, signal?: AbortSignal) {
  signal?.throwIfAborted();
  return new Promise<{ exitCode: number | null; timedOut: boolean; aborted: boolean; stdout: string; stderr: string }>((resolve, reject) => {
    const child = spawn(executable, args, { cwd, shell: false, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '', stderr = '', timedOut = false, aborted = false;
    child.stdout.on('data', (chunk: Buffer) => { stdout = (stdout + chunk.toString()).slice(-32768); });
    child.stderr.on('data', (chunk: Buffer) => { stderr = (stderr + chunk.toString()).slice(-32768); });
    const timer = setTimeout(() => { timedOut = true; child.kill('SIGKILL'); }, timeoutMs);
    const abort = () => { aborted = true; child.kill('SIGKILL'); };
    signal?.addEventListener('abort', abort, { once: true });
    const cleanup = () => { clearTimeout(timer); signal?.removeEventListener('abort', abort); };
    child.once('error', error => { cleanup(); reject(error); });
    // 'exit' is used because grandchildren can keep inherited stdio handles open.
    child.once('exit', exitCode => {
      cleanup();
      child.stdout.destroy(); child.stderr.destroy();
      resolve({ exitCode, timedOut, aborted, stdout, stderr });
    });
  });
}

export class Workbench {
  private validating = false;
  constructor(private config: Config, private workspace: Workspace) {}

  private executable() {
    if (!this.config.workbenchPath) throw new Error('Set workbenchPath in the local configuration');
    return this.config.workbenchPath;
  }

  private allowRun() {
    if (!this.config.allowLaunch) throw new Error('Workbench execution is disabled. Set allowLaunch in the local configuration.');
    if (process.platform !== 'win32') throw new Error('Native Workbench execution requires Windows; inspection tools work on other platforms');
  }

  private async descriptor(project: string, gproj: string) {
    if (path.extname(gproj).toLowerCase() !== '.gproj') throw new Error('Expected a .gproj file');
    await this.workspace.read(project, gproj);
    return this.workspace.resolve(project, gproj);
  }

  async launch(project: string, gproj: string, module: Module, load?: string, dryRun = true) {
    const executable = this.executable();
    const descriptor = await this.descriptor(project, gproj);
    const resource = load ? await this.workspace.resolve(project, load) : undefined;
    if (resource && !(await lstat(resource)).isFile()) throw new Error('Load target must be a file');
    const args = commandArgs(descriptor, this.config.addonRoots, module, resource);
    if (dryRun) return { dryRun, executable, args, executed: false };
    this.allowRun();
    const child = spawn(executable, args, { cwd: path.dirname(executable), shell: false, windowsHide: true, detached: true, stdio: 'ignore' });
    await new Promise<void>((resolve, reject) => { child.once('spawn', resolve); child.once('error', reject); });
    child.unref();
    return { dryRun: false, executed: true, pid: child.pid, executable, args, status: 'process_started', note: 'Process start does not establish that the project loaded or compiled. Workbench may display its editor.' };
  }

  async installCompanion(project: string) {
    let previous: Awaited<ReturnType<Workspace['read']>> | undefined;
    try { previous = await this.workspace.read(project, COMPANION_PATH); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
    if (previous?.sha256 === sha256(companion)) return { path: COMPANION_PATH, installed: true, changed: false };
    if (previous) throw new Error('Companion path contains a different file. Review it before using enfusion_write_file to replace it.');
    return { ...await this.workspace.write(project, COMPANION_PATH, companion), installed: true, changed: true };
  }

  async validate(project: string, gproj: string, timeoutSeconds: number, signal?: AbortSignal) {
    this.allowRun();
    if (!this.workspace.project(project).writable) throw new Error('Validation needs a writable project for its isolated profile and logs');
    if (this.validating) throw new Error('A validation run is already in progress');
    const executable = this.executable();
    const descriptor = await this.descriptor(project, gproj);
    if ((await this.workspace.read(project, COMPANION_PATH)).sha256 !== sha256(companion)) throw new Error('Install the matching validation companion first');
    const run = `.enfusion-mcp/runs/${randomUUID()}`;
    const runPath = await this.workspace.resolve(project, run, true);
    await mkdir(runPath, { recursive: true });
    const logs = path.join(runPath, 'logs');
    await mkdir(logs);
    const args = ['-gproj', descriptor, '-profile', path.join(runPath, 'profile'), '-logsDir', logs, '-noThrow', '-noSplash', '-noSound'];
    if (this.config.addonRoots.length) args.push('-addonsDir', this.config.addonRoots.join(';'));
    args.push('-wbModule=ResourceManager', '-plugin=EMCP_ValidatePlugin');
    if (this.validating) throw new Error('A validation run is already in progress');
    this.validating = true;
    try {
      const result = await runProcess(executable, args, timeoutSeconds * 1000, path.dirname(executable), signal);
      const logCollection = await collectLogs(logs);
      const diagnosticLogs = logCollection.files;
      const allDiagnostics = diagnosticLogs.flatMap(log => parseDiagnostics(log.text).map(d => ({ ...d, log: log.path })));
      if (allDiagnostics.length >= 1000) logCollection.truncated = true;
      const diagnostics = allDiagnostics.slice(0, 1000);
      let marker: unknown = null;
      try { marker = JSON.parse(await readFile(path.join(logs, 'enfusion-mcp-validation.json'), 'utf8')); } catch { /* Absent or malformed output is not success. */ }
      const loaded = Boolean(marker && typeof marker === 'object' && 'plugin' in marker && marker.plugin === 'EMCP_ValidatePlugin' && 'loaded' in marker && marker.loaded === true && 'schemaVersion' in marker && marker.schemaVersion === 1);
      const scriptCompileErrors = diagnostics.filter(d => d.severity === 'error' && (/\bSCRIPT\s*\(E\)|can't compile|cannot compile/i.test(d.message) || d.source));
      const scriptStartupPassed = loaded && !result.timedOut && !result.aborted && result.exitCode === 0 && scriptCompileErrors.length === 0 && !logCollection.truncated;
      const cleanLogs = diagnosticLogs.length > 0 && !logCollection.truncated && !diagnostics.some(d => d.severity === 'error');
      return {
        ...result, loaded, scriptStartupPassed, cleanLogs, success: scriptStartupPassed && cleanLogs,
        runDirectory: run, diagnostics, logFiles: diagnosticLogs.map(l => l.path), logsTruncated: logCollection.truncated,
        scope: 'Workbench startup and companion execution; not asset compilation, world simulation or gameplay validation',
      };
    } finally { this.validating = false; }
  }
}

async function collectLogs(directory: string) {
  const output = { files: [] as { path: string; text: string }[], truncated: false };
  let entries = 0, bytes = 0;
  async function walk(current: string, depth: number): Promise<void> {
    if (depth > 2) { output.truncated = true; return; }
    for (const entry of await readdir(current, { withFileTypes: true })) {
      if (++entries > 512 || bytes >= 2 * 1024 * 1024) { output.truncated = true; return; }
      if (entry.isSymbolicLink()) { output.truncated = true; continue; }
      const filename = path.join(current, entry.name);
      if (entry.isDirectory()) await walk(filename, depth + 1);
      else if (entry.isFile() && entry.name.endsWith('.log')) {
        const handle = await open(filename, 'r');
        try {
          const size = (await handle.stat()).size;
          const buffer = Buffer.alloc(Math.min(size, 256 * 1024));
          const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
          bytes += bytesRead;
          if (size > bytesRead) output.truncated = true;
          output.files.push({ path: path.relative(directory, filename), text: buffer.subarray(0, bytesRead).toString('utf8') });
        } finally { await handle.close(); }
      }
    }
  }
  await walk(directory, 0);
  return output;
}
