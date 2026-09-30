import { createHash, randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import { lstat, mkdir, open, opendir, readdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { Config, Project } from './config.js';
import { inside } from './config.js';

const readable = new Set(['.c', '.h', '.cpp', '.gproj', '.et', '.ent', '.conf', '.layout', '.meta', '.json', '.txt', '.md', '.xml', '.csv', '.log', '.ini', '.world', '.layer', '.edds']);
const writable = new Set(['.c', '.gproj', '.et', '.ent', '.conf', '.layout', '.meta', '.json', '.txt', '.md', '.xml']);
const ignored = new Set(['node_modules', 'dist', 'build', 'cache', 'logs', 'profile']);
export const sha256 = (data: string | Buffer) => createHash('sha256').update(data).digest('hex');
export function isText(filename: string) { return readable.has(path.extname(filename).toLowerCase()); }

export class Workspace {
  private mutation: Promise<unknown> = Promise.resolve();
  constructor(readonly config: Config) {}

  project(id: string): Project {
    const project = this.config.projects.find(p => p.id === id);
    if (!project) throw new Error(`Unknown project '${id}'. Use enfusion_status to list configured projects.`);
    return project;
  }

  async resolve(id: string, relative: string, internal = false): Promise<string> {
    const root = this.project(id).root;
    // Reject Windows syntax on every platform, including alternate data streams and reserved devices.
    if (!relative || path.isAbsolute(relative) || /[:\u0000-\u001f"<>|?*]/u.test(relative)) throw new Error('A project-relative path is required');
    const parts = relative.replaceAll('\\', '/').split('/');
    if (parts.some(p => !p || p === '..' || p === '.' || /[. ]$/u.test(p) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(p) || (p.startsWith('.') && !(internal && p === '.enfusion-mcp')))) {
      throw new Error('Unsafe or hidden path component');
    }
    let current = root;
    // Check the configured root again: it could have been replaced since startup.
    if ((await lstat(root)).isSymbolicLink()) throw new Error('Project root became a symlink');
    for (const part of parts) {
      current = path.join(current, part);
      if (!inside(root, current)) throw new Error('Path leaves project root');
      try {
        if ((await lstat(current)).isSymbolicLink()) throw new Error('Symlink or junction paths are not supported');
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      }
    }
    return current;
  }

  async read(id: string, relative: string): Promise<{ text: string; sha256: string; bytes: number }> {
    if (!isText(relative)) throw new Error('Only supported text source formats can be read');
    const filename = await this.resolve(id, relative);
    const handle = await open(filename, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    try {
      const info = await handle.stat();
      if (!info.isFile()) throw new Error('Expected a regular file');
      if (info.size > this.config.maxFileBytes) throw new Error('File exceeds maxFileBytes');
      const buffer = Buffer.alloc(this.config.maxFileBytes + 1);
      let bytes = 0;
      while (bytes < buffer.length) {
        const result = await handle.read(buffer, bytes, buffer.length - bytes, null);
        if (result.bytesRead === 0) break;
        bytes += result.bytesRead;
      }
      if (bytes > this.config.maxFileBytes) throw new Error('File exceeds maxFileBytes');
      const data = buffer.subarray(0, bytes);
      if (data.includes(0)) throw new Error('Binary files are not supported');
      return { text: new TextDecoder('utf-8', { fatal: true }).decode(data), sha256: sha256(data), bytes };
    } finally { await handle.close(); }
  }

  async list(id: string) {
    const root = this.project(id).root;
    if ((await lstat(root)).isSymbolicLink()) throw new Error('Project root became a symlink');
    const files: string[] = [];
    const errors: string[] = [];
    let visited = 0;
    let truncated = false;
    const walk = async (relative: string, depth: number): Promise<void> => {
      if (depth > 40) { truncated = true; return; }
      try {
        const dir = await opendir(relative ? await this.resolve(id, relative) : root);
        for await (const entry of dir) {
          if (++visited > this.config.maxScanEntries) { truncated = true; return; }
          if (entry.name.startsWith('.') || entry.isSymbolicLink()) continue;
          const child = relative ? `${relative}/${entry.name}` : entry.name;
          if (entry.isDirectory() && !ignored.has(entry.name.toLowerCase())) await walk(child, depth + 1);
          else if (entry.isFile()) files.push(child);
          if (visited > this.config.maxScanEntries) return;
        }
      } catch (error) { if (errors.length < 100) errors.push(`${relative || '.'}: ${(error as Error).message}`); }
    };
    await walk('', 0);
    return { files: files.sort(), truncated, errors, visited };
  }

  async write(id: string, relative: string, content: string, expectedSha256?: string) {
    const task = this.mutation.then(() => this.writeUnlocked(id, relative, content, expectedSha256));
    this.mutation = task.catch(() => undefined);
    return task;
  }

  private async writeUnlocked(id: string, relative: string, content: string, expected?: string) {
    if (!this.project(id).writable) throw new Error('Project is read-only. Set writable in the local configuration to enable edits.');
    if (!writable.has(path.extname(relative).toLowerCase())) throw new Error('Unsupported writable source format');
    if (Buffer.byteLength(content) > this.config.maxFileBytes || content.includes('\0')) throw new Error('Content is binary or exceeds maxFileBytes');
    const filename = await this.resolve(id, relative);
    let previous: Awaited<ReturnType<Workspace['read']>> | undefined;
    try { previous = await this.read(id, relative); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
    if (previous && previous.sha256 !== expected) throw new Error('Edit conflict: read the current file and supply its sha256 as expectedSha256');
    if (!previous && expected) throw new Error('Edit conflict: expected file no longer exists');
    let backup: string | undefined;
    if (previous) {
      backup = `.enfusion-mcp/backups/${sha256(relative.replaceAll('\\', '/'))}/${previous.sha256}.bak`;
      const backupPath = await this.resolve(id, backup, true);
      await mkdir(path.dirname(backupPath), { recursive: true });
      // Preserve original bytes, including a UTF-8 BOM which TextDecoder removes.
      const original = await readFile(filename);
      if (sha256(original) !== previous.sha256) throw new Error('Edit conflict: file changed during backup');
      await writeFile(backupPath, original, { flag: 'wx' }).catch(error => {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      });
    }
    await mkdir(path.dirname(filename), { recursive: true });
    await this.resolve(id, relative);
    if (!previous) {
      await writeFile(filename, content, { flag: 'wx', encoding: 'utf8' });
    } else {
      const temp = `${filename}.${randomUUID()}.tmp`;
      try {
        await writeFile(temp, content, { flag: 'wx', encoding: 'utf8' });
        if (sha256(await readFile(filename)) !== previous.sha256) throw new Error('Edit conflict: file changed before replacement');
        await this.resolve(id, relative);
        await rename(temp, filename);
      } finally { await unlink(temp).catch(() => undefined); }
    }
    return { path: relative, sha256: sha256(content), bytes: Buffer.byteLength(content), created: !previous, backup };
  }

  async renameFile(id: string, from: string, to: string, expectedSha256: string) {
    const task = this.mutation.then(() => this.renameUnlocked(id, from, to, expectedSha256));
    this.mutation = task.catch(() => undefined);
    return task;
  }

  private async renameUnlocked(id: string, from: string, to: string, expected: string) {
    if (!this.project(id).writable) throw new Error('Project is read-only. Set writable in the local configuration to enable edits.');
    const srcFile = await this.resolve(id, from);
    const dstFile = await this.resolve(id, to);
    const current = await this.read(id, from);
    if (current.sha256 !== expected) throw new Error('Edit conflict: read the current file and supply its sha256 as expectedSha256');
    // Ensure destination doesn't exist
    try { await lstat(dstFile); throw new Error('Destination file already exists'); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
    // Backup the original
    const backupKey = `.enfusion-mcp/backups/${sha256(from.replaceAll('\\', '/'))}/${current.sha256}.bak`;
    const backupPath = await this.resolve(id, backupKey, true);
    await mkdir(path.dirname(backupPath), { recursive: true });
    const original = await readFile(srcFile);
    await writeFile(backupPath, original, { flag: 'wx' }).catch(error => {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    });
    // Create destination directory and rename
    await mkdir(path.dirname(dstFile), { recursive: true });
    await rename(srcFile, dstFile);
    return { from, to, sha256: current.sha256, bytes: current.bytes, backup: backupKey };
  }

  async deleteFile(id: string, relative: string, expectedSha256: string) {
    const task = this.mutation.then(() => this.deleteUnlocked(id, relative, expectedSha256));
    this.mutation = task.catch(() => undefined);
    return task;
  }

  private async deleteUnlocked(id: string, relative: string, expected: string) {
    if (!this.project(id).writable) throw new Error('Project is read-only. Set writable in the local configuration to enable edits.');
    const filename = await this.resolve(id, relative);
    const current = await this.read(id, relative);
    if (current.sha256 !== expected) throw new Error('Edit conflict: read the current file and supply its sha256 as expectedSha256');
    // Backup before deletion
    const backupKey = `.enfusion-mcp/backups/${sha256(relative.replaceAll('\\', '/'))}/${current.sha256}.bak`;
    const backupPath = await this.resolve(id, backupKey, true);
    await mkdir(path.dirname(backupPath), { recursive: true });
    const original = await readFile(filename);
    await writeFile(backupPath, original, { flag: 'wx' }).catch(error => {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    });
    await unlink(filename);
    return { path: relative, deleted: true, sha256: current.sha256, bytes: current.bytes, backup: backupKey };
  }

  async listBackups(id: string, relative: string) {
    const backupDir = `.enfusion-mcp/backups/${sha256(relative.replaceAll('\\', '/'))}`;
    let dirPath: string;
    try { dirPath = await this.resolve(id, backupDir, true); }
    catch { return { path: relative, backups: [], note: 'No backups directory found' }; }
    const backups: { sha256: string; filename: string }[] = [];
    try {
      const entries = await readdir(dirPath, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isFile() && entry.name.endsWith('.bak')) {
          const hash = entry.name.slice(0, -4);
          if (/^[a-f0-9]{64}$/.test(hash)) {
            backups.push({ sha256: hash, filename: entry.name });
          }
        }
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { path: relative, backups: [], note: 'No backups directory found' };
      throw error;
    }
    return { path: relative, backups, total: backups.length };
  }
}

