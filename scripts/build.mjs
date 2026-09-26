import { build } from 'esbuild';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
const common = { bundle: true, platform: 'node', format: 'cjs', target: 'node22', loader: { '.c': 'text' }, legalComments: 'eof', logLevel: 'info' };
await mkdir('dist', { recursive: true });
await build({ ...common, entryPoints: ['src/cli.ts'], outfile: 'dist/server.cjs', banner: { js: '#!/usr/bin/env node' } });
await build({ ...common, entryPoints: ['src/library.ts'], outfile: 'dist/library.cjs' });
let notices = '# Bundled third-party licenses\n\n';
for (const name of ['@modelcontextprotocol/server', '@modelcontextprotocol/core', 'zod']) {
  const pkg = JSON.parse(await readFile(`node_modules/${name}/package.json`, 'utf8'));
  notices += `## ${name} ${pkg.version}\n\n${await readFile(`node_modules/${name}/LICENSE`, 'utf8')}\n\n`;
}
await writeFile('dist/THIRD-PARTY-NOTICES.txt', notices);
