import { readFile, realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { z } from 'zod';

export const VERSION = '0.1.0';
const rootPath = z.string().min(1).refine(path.isAbsolute, 'Use an absolute filesystem path');
const schema = z.object({
  projects: z.array(z.object({
    id: z.string().regex(/^[a-zA-Z0-9_-]{1,64}$/),
    root: rootPath,
    writable: z.boolean().default(false),
  }).strict()).max(32).default([]),
  workbenchPath: rootPath.optional(),
  addonRoots: z.array(rootPath).max(32).default([]),
  allowLaunch: z.boolean().default(false),
  maxFileBytes: z.number().int().min(1024).max(8 * 1024 * 1024).default(1024 * 1024),
  maxScanEntries: z.number().int().min(100).max(100000).default(20000),
}).strict();
export type Config = z.infer<typeof schema>;
export type Project = Config['projects'][number];

export async function validateConfig(input: unknown): Promise<Config> {
  const config = schema.parse(input);
  const ids = new Set<string>();
  for (const project of config.projects) {
    if (ids.has(project.id)) throw new Error(`Duplicate project id: ${project.id}`);
    ids.add(project.id);
    project.root = await realpath(project.root);
    if (!(await stat(project.root)).isDirectory()) throw new Error(`Project root must be a directory: ${project.id}`);
  }
  // Overlapping roots must not silently turn an SDK source root writable.
  for (const a of config.projects) for (const b of config.projects) {
    if (a !== b && a.writable !== b.writable && inside(a.root, b.root)) {
      throw new Error('Overlapping project roots must have the same write policy');
    }
  }
  if (config.workbenchPath) {
    config.workbenchPath = await realpath(config.workbenchPath);
    if (!(await stat(config.workbenchPath)).isFile()) throw new Error('Workbench path must be a file');
    if (!/^ArmaReforgerWorkbench(?:Steam)?(?:Diag)?\.exe$/i.test(path.basename(config.workbenchPath))) {
      throw new Error('workbenchPath must name an Arma Reforger Workbench executable');
    }
  }
  config.addonRoots = await Promise.all(config.addonRoots.map(async root => {
    const resolved = await realpath(root);
    if (!(await stat(resolved)).isDirectory()) throw new Error('addonRoots must be directories');
    if (/[;\r\n"]/u.test(resolved)) throw new Error('Unsupported character in addon root');
    return resolved;
  }));
  return config;
}

export function inside(root: string, target: string): boolean {
  const relative = path.relative(root, target);
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}

export async function loadConfig(configFile?: string): Promise<Config> {
  const explicit = configFile ?? process.env.ENFUSION_MCP_CONFIG;
  const filename = explicit ?? path.join(os.homedir(), '.config', 'enfusion-mcp', 'config.json');
  let contents: string;
  try {
    contents = await readFile(filename, 'utf8');
  } catch (error) {
    if (!explicit && (error as NodeJS.ErrnoException).code === 'ENOENT') return validateConfig({});
    throw error;
  }
  return validateConfig(JSON.parse(contents.replace(/^\uFEFF/, '')));
}
