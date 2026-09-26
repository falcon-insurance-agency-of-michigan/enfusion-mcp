import { zipSync } from 'fflate';
import { createHash } from 'node:crypto';
import { lstat, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const pkg = JSON.parse(await readFile('package.json', 'utf8'));
const archive = {};
const allowed = ['README.md', 'LICENSE', 'SECURITY.md', 'CHANGELOG.md', 'plugin.json', 'mcp.json', '.mcp.json', '.codex-plugin', 'skills', 'workbench', 'docs', 'examples', 'dist/server.cjs', 'dist/THIRD-PARTY-NOTICES.txt'];
async function add(relative) {
  const info = await lstat(relative);
  if (info.isSymbolicLink()) throw new Error(`Symlink in release: ${relative}`);
  if (info.isDirectory()) {
    for (const file of (await readdir(relative)).sort()) await add(path.join(relative, file));
  } else if (info.isFile()) {
    archive[`enfusion-mcp/${relative.replaceAll('\\', '/')}`] = [new Uint8Array(await readFile(relative)), { mtime: new Date('2026-01-01T00:00:00Z') }];
  }
}
for (const entry of allowed) await add(entry);
await mkdir('release', { recursive: true });
const filename = `enfusion-mcp-${pkg.version}.zip`;
const data = zipSync(archive, { level: 9 });
await writeFile(path.join('release', filename), data);
const digest = createHash('sha256').update(data).digest('hex');
await writeFile('release/SHA256SUMS.txt', `${digest}  ${filename}\n`);
console.log(`Built release/${filename} (${data.length} bytes, ${Object.keys(archive).length} files)\nSHA-256 ${digest}`);
