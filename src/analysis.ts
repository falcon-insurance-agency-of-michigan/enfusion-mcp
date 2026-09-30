export function maskComments(text: string, strings = false): string {
  return text.replace(/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|\/\/[^\r\n]*|\/\*[\s\S]*?(?:\*\/|$)/g, token => {
    if (!strings && (token.startsWith('"') || token.startsWith("'"))) return token;
    return token.replace(/[^\r\n]/g, ' ');
  });
}

export function projectInfo(text: string) {
  const clean = maskComments(text);
  if (!/^\s*GameProject\s*\{/u.test(clean)) throw new Error('Not a GameProject descriptor');
  const field = (key: string) => new RegExp(`\\b${key}\\s+"([^"\\r\\n]*)"`).exec(clean)?.[1] ?? null;
  const block = /\bDependencies\s*\{([^}]*)\}/u.exec(clean)?.[1] ?? '';
  const dependencies = [...block.matchAll(/"([^"]*)"/g)].map(m => m[1]!);
  const warnings: string[] = [];
  const guid = field('GUID');
  if (!guid || !/^[A-Fa-f0-9]{16}$/u.test(guid)) warnings.push('Missing or invalid project GUID');
  if (dependencies.some(d => !/^[A-Fa-f0-9]{16}$/u.test(d))) warnings.push('Empty or invalid dependency GUID');
  if (!field('ID')) warnings.push('Missing project ID');
  return { id: field('ID'), guid, title: field('TITLE'), dependencies, warnings, parser: 'text inspection; Workbench is authoritative' };
}

export function resourceReferences(text: string) {
  const clean = maskComments(text);
  return [...clean.matchAll(/\{([0-9A-Fa-f]{16})\}([^"\r\n{}]*)/g)].slice(0, 1000).map(m => ({
    guid: m[1]!.toUpperCase(), path: m[2]!, line: clean.slice(0, m.index).split('\n').length,
  }));
}

export function scriptSymbols(text: string) {
  const clean = maskComments(text, true);
  return [...clean.matchAll(/\b(?:(modded)\s+)?(class|enum)\s+([A-Za-z_]\w*)(?:\s*:\s*([A-Za-z_]\w*))?/g)].slice(0, 1000).map(m => ({
    kind: m[2], name: m[3], base: m[4] ?? null, modded: Boolean(m[1]), line: clean.slice(0, m.index).split('\n').length,
  }));
}

export type Diagnostic = { severity: 'error' | 'warning'; line: number; message: string; source?: string; sourceLine?: number };
export function parseDiagnostics(text: string): Diagnostic[] {
  const output: Diagnostic[] = [];
  text.split(/\r?\n/u).forEach((message, i) => {
    const error = /\(E\)|\b(error|fatal)\b|can't compile|cannot compile/i.test(message);
    const warning = /\(W\)|\bwarning\b/i.test(message);
    if (!error && !warning) return;
    const location = /@"([^"\r\n]+\.c),(\d+)"/iu.exec(message)
      ?? /([^\s()]+\.c)\((\d+)\)/iu.exec(message);
    output.push({ severity: error ? 'error' : 'warning', line: i + 1, message: message.slice(0, 2000), ...(location ? { source: location[1], sourceLine: Number(location[2]) } : {}) });
  });
  return output.slice(0, 1000);
}

export type PrefabComponent = { className: string; properties: Record<string, string>; line: number };
export type PrefabInfo = { className: string | null; parentPrefab: string | null; components: PrefabComponent[]; entityCount: number; warnings: string[]; parser: string };

export function prefabInfo(text: string): PrefabInfo {
  const clean = maskComments(text);
  const classMatch = /^\s*(\w+)\s*(?::\s*"([^"]*)")?\s*\{/u.exec(clean);
  const className = classMatch?.[1] ?? null;
  const parentPrefab = classMatch?.[2] ?? null;
  const components: PrefabComponent[] = [];
  const warnings: string[] = [];
  const componentRe = /\b(\w+Component\w*)\s*\{([^{}]*(?:\{[^{}]*\}[^{}]*)*)\}/g;
  for (const m of clean.matchAll(componentRe)) {
    const props: Record<string, string> = {};
    for (const p of m[2]!.matchAll(/\b(\w+)\s+"([^"]*)"/g)) props[p[1]!] = p[2]!;
    for (const p of m[2]!.matchAll(/\b(\w+)\s+(\d+(?:\.\d+)?)/g)) if (!props[p[1]!]) props[p[1]!] = p[2]!;
    components.push({ className: m[1]!, properties: props, line: clean.slice(0, m.index).split('\n').length });
  }
  const entityCount = (clean.match(/\b\w+\s*(?::\s*"[^"]*")?\s*\{/g) || []).length;
  if (!className) warnings.push('Could not determine root class name');
  if (components.length === 0 && entityCount > 2) warnings.push('No component blocks detected; file may use a different format');
  return { className, parentPrefab, components, entityCount, warnings, parser: 'text inspection; Workbench is authoritative' };
}

export type WorldLayer = { name: string; entityCount: number; line: number };
export type WorldInfo = { className: string | null; layers: WorldLayer[]; totalEntities: number; referencedPrefabs: string[]; warnings: string[]; parser: string };

export function worldInfo(text: string): WorldInfo {
  const clean = maskComments(text);
  const classMatch = /^\s*(\w+)\s*\{/u.exec(clean);
  const className = classMatch?.[1] ?? null;
  const layers: WorldLayer[] = [];
  const warnings: string[] = [];
  for (const m of clean.matchAll(/\b(\w*Layer\w*)\s*"([^"]*)"\s*\{/g)) {
    const layerBlock = clean.slice(m.index!);
    const depth1 = layerBlock.indexOf('}');
    const blockContent = depth1 > 0 ? layerBlock.slice(0, depth1 + 1) : layerBlock.slice(0, 2000);
    const entities = (blockContent.match(/\b\w+\s*(?::\s*"[^"]*")?\s*\{/g) || []).length - 1;
    layers.push({ name: m[2]!, entityCount: Math.max(0, entities), line: clean.slice(0, m.index).split('\n').length });
  }
  const totalEntities = Math.max(0, (clean.match(/\b\w+\s*(?::\s*"[^"]*")?\s*\{/g) || []).length - 1);
  const prefabRefs = [...clean.matchAll(/\{([0-9A-Fa-f]{16})\}([^\s"{}]*\.et)/g)].map(m => `{${m[1]!.toUpperCase()}}${m[2]}`);
  const referencedPrefabs = [...new Set(prefabRefs)].slice(0, 500);
  if (!className) warnings.push('Could not determine root class name');
  return { className, layers, totalEntities, referencedPrefabs, warnings, parser: 'text inspection; Workbench is authoritative' };
}

export type ConfigEntry = { key: string; value: string | null; children: ConfigEntry[]; line: number };

export function configInfo(text: string): { entries: ConfigEntry[]; warnings: string[] } {
  const clean = maskComments(text);
  const entries: ConfigEntry[] = [];
  const warnings: string[] = [];
  const seen = new Set<string>();
  for (const m of clean.matchAll(/^\s*(\w+)\s+"([^"]*)"/gm)) {
    const key = `${m[1]!}:${clean.slice(0, m.index).split('\n').length}`;
    if (!seen.has(key)) { seen.add(key); entries.push({ key: m[1]!, value: m[2]!, children: [], line: clean.slice(0, m.index).split('\n').length }); }
  }
  for (const m of clean.matchAll(/^\s*(\w+)\s+(\d+(?:\.\d+)?)\s*$/gm)) {
    const key = `${m[1]!}:${clean.slice(0, m.index).split('\n').length}`;
    if (!seen.has(key)) { seen.add(key); entries.push({ key: m[1]!, value: m[2]!, children: [], line: clean.slice(0, m.index).split('\n').length }); }
  }
  for (const m of clean.matchAll(/^\s*(\w+)\s*\{/gm)) {
    entries.push({ key: m[1]!, value: null, children: [], line: clean.slice(0, m.index).split('\n').length });
  }
  if (entries.length === 0) warnings.push('No parseable entries found');
  return { entries: entries.slice(0, 500), warnings };
}

export type LayoutWidget = { type: string; name: string | null; slot: string | null; line: number };

export function layoutInfo(text: string): { widgets: LayoutWidget[]; referencedResources: string[]; warnings: string[] } {
  const clean = maskComments(text);
  const widgets: LayoutWidget[] = [];
  const warnings: string[] = [];
  for (const m of clean.matchAll(/(\w+(?:Widget|Button|Image|Text|Panel|Frame|Overlay|List|Scroll|Grid|Size|Spacer)\w*)\s*(?:"([^"]*)")?\s*\{/g)) {
    const block = clean.slice(m.index!, Math.min(m.index! + 500, clean.length));
    const slot = /slot\s+"([^"]*)"/i.exec(block)?.[1] ?? null;
    widgets.push({ type: m[1]!, name: m[2] ?? null, slot, line: clean.slice(0, m.index).split('\n').length });
  }
  const refs = [...clean.matchAll(/\{([0-9A-Fa-f]{16})\}([^\s"{}]+)/g)].map(m => `{${m[1]!.toUpperCase()}}${m[2]}`);
  const referencedResources = [...new Set(refs)].slice(0, 200);
  if (widgets.length === 0) warnings.push('No widget blocks detected');
  return { widgets: widgets.slice(0, 500), referencedResources, warnings };
}

export type DepEdge = { source: string; guid: string; target: string | null; targetPath: string };
export type DepGraph = { edges: DepEdge[]; unresolvedGuids: string[]; stats: { files: number; edges: number; uniqueGuids: number } };

export function buildDependencyGraph(
  fileContents: { path: string; text: string }[],
  metaOwnership: Map<string, { resource: string; name: string }>
): DepGraph {
  const edges: DepEdge[] = [];
  const allGuids = new Set<string>();
  for (const file of fileContents) {
    const refs = resourceReferences(file.text);
    for (const ref of refs) {
      const owner = metaOwnership.get(ref.guid);
      edges.push({ source: file.path, guid: ref.guid, target: owner?.resource ?? null, targetPath: ref.path });
      allGuids.add(ref.guid);
    }
  }
  const resolvedGuids = new Set([...metaOwnership.keys()].map(g => g.toUpperCase()));
  const unresolvedGuids = [...allGuids].filter(g => !resolvedGuids.has(g)).slice(0, 200);
  return { edges: edges.slice(0, 2000), unresolvedGuids, stats: { files: fileContents.length, edges: edges.length, uniqueGuids: allGuids.size } };
}

export const DOCS = [
  { title: 'Mod project setup', topics: 'project gproj dependencies steam install', url: 'https://community.bistudio.com/wiki/Arma_Reforger:Mod_Project_Setup' },
  { title: 'Workbench startup parameters', topics: 'cli launch module plugin profile logs build', url: 'https://community.bistudio.com/wiki/Arma_Reforger:Startup_Parameters' },
  { title: 'Workbench plugins', topics: 'plugin workbench enforce scripting', url: 'https://community.bistudio.com/wiki/Arma_Reforger:Workbench_Plugin' },
  { title: 'Workbench plugin tutorial', topics: 'plugin commandline RunCommandline scripting', url: 'https://community.bistudio.com/wiki/Arma_Reforger:Workbench_Plugin_Tutorial' },
  { title: 'Enforce Script syntax', topics: 'script class enum types syntax', url: 'https://community.bistudio.com/wiki/Arma_Reforger:Enforce_Script_Syntax' },
  { title: 'Enfusion Script API', topics: 'api reference engine class methods', url: 'https://community.bistudio.com/wikidata/external-data/arma-reforger/EnfusionScriptAPIPublic/index.html' },
  { title: 'Arma Reforger Script API', topics: 'api reference game SCR components', url: 'https://community.bistudio.com/wikidata/external-data/arma-reforger/ArmaReforgerScriptAPIPublic/index.html' },
  { title: 'Official samples', topics: 'samples examples prefabs scripts world mods', url: 'https://github.com/BohemiaInteractive/Arma-Reforger-Samples' },
  { title: 'Prefab editing guide', topics: 'prefab entity component inherit parent et', url: 'https://community.bistudio.com/wiki/Arma_Reforger:Prefab_Editing' },
  { title: 'World Editor guide', topics: 'world editor terrain layer entity placement ent', url: 'https://community.bistudio.com/wiki/Arma_Reforger:World_Editor' },
  { title: 'UI layout system', topics: 'layout widget ui button image text panel frame', url: 'https://community.bistudio.com/wiki/Arma_Reforger:UI_Layouts' },
  { title: 'Resource Manager', topics: 'resource manager import export asset texture model', url: 'https://community.bistudio.com/wiki/Arma_Reforger:Resource_Manager' },
  { title: 'Server configuration', topics: 'server config hosting dedicated multiplayer', url: 'https://community.bistudio.com/wiki/Arma_Reforger:Server_Hosting' },
  { title: 'Modding fundamentals', topics: 'modding basics overview structure addon', url: 'https://community.bistudio.com/wiki/Arma_Reforger:Modding_Basics' },
  { title: 'SCR_BaseGameMode', topics: 'gamemode scenario mission scripting SCR', url: 'https://community.bistudio.com/wiki/Arma_Reforger:SCR_BaseGameMode' },
  { title: 'Component architecture', topics: 'component entity system ECS composition', url: 'https://community.bistudio.com/wiki/Arma_Reforger:Component_Architecture' },
];

