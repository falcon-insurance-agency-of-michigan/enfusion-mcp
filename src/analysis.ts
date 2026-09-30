import path from 'node:path';

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

export type FunctionDecl = { name: string; returnType: string | null; params: string; className: string | null; modifiers: string[]; line: number };

export function scriptFunctions(text: string): FunctionDecl[] {
  const clean = maskComments(text, true);
  const results: FunctionDecl[] = [];
  // Match function declarations: [modifiers] ReturnType FunctionName(params)
  // Enforce script uses C-like syntax with optional modifiers like override, protected, static, private
  const funcRe = /\b((?:(?:static|override|protected|private|proto|sealed|event)\s+)*)(\w+)\s+(\w+)\s*\(([^)]*)\)\s*(?:\{|;)/g;
  let currentClass: string | null = null;
  // Track class context by scanning class declarations
  const classStarts: { name: string; line: number }[] = [];
  for (const m of clean.matchAll(/\b(?:modded\s+)?class\s+(\w+)/g)) {
    classStarts.push({ name: m[1]!, line: clean.slice(0, m.index).split('\n').length });
  }
  for (const m of clean.matchAll(funcRe)) {
    const line = clean.slice(0, m.index).split('\n').length;
    // Determine enclosing class
    currentClass = null;
    for (const cs of classStarts) { if (cs.line < line) currentClass = cs.name; else break; }
    const modifiers = m[1]!.trim().split(/\s+/).filter(Boolean);
    const returnType = m[2]!;
    const name = m[3]!;
    const params = m[4]!.trim();
    // Skip false positives: control flow like if(), while(), for(), switch()
    if (/^(if|else|while|for|switch|return|new|delete|foreach|do)$/.test(name)) continue;
    // Skip type-only matches where return type is a type declaration keyword
    if (/^(class|enum|typedef)$/.test(returnType) && !modifiers.length) continue;
    results.push({ name, returnType, params, className: currentClass, modifiers, line });
  }
  return results.slice(0, 1000);
}

export type ClassNode = { name: string; base: string | null; modded: boolean; file: string; line: number; methods: string[] };
export type ClassTree = { classes: ClassNode[]; roots: string[]; orphans: string[] };

export function buildClassHierarchy(files: { path: string; text: string }[]): ClassTree {
  const classes: ClassNode[] = [];
  for (const file of files) {
    const symbols = scriptSymbols(file.text);
    const functions = scriptFunctions(file.text);
    for (const sym of symbols) {
      if (sym.kind === 'class') {
        const methods = functions.filter(f => f.className === sym.name).map(f => f.name);
        classes.push({ name: sym.name!, base: sym.base, modded: sym.modded, file: file.path, line: sym.line, methods });
      }
    }
  }
  const classNames = new Set(classes.map(c => c.name));
  const roots = classes.filter(c => !c.base || !classNames.has(c.base)).map(c => c.name);
  const orphans = classes.filter(c => c.base && !classNames.has(c.base) && !c.modded).map(c => c.name);
  return { classes: classes.slice(0, 500), roots, orphans };
}

export type MetaFileInfo = { guid: string | null; resourcePath: string | null; resourceName: string | null; dependencies: { guid: string; path: string }[]; warnings: string[] };

export function metaInfo(text: string): MetaFileInfo {
  const clean = maskComments(text);
  const warnings: string[] = [];
  const nameMatch = /\bName\s+"\{([A-Fa-f0-9]{16})\}([^"\r\n]*)"/u.exec(clean);
  const guid = nameMatch?.[1]?.toUpperCase() ?? null;
  const resourcePath = nameMatch?.[2] ?? null;
  const resourceName = nameMatch ? `{${nameMatch[1]}}${nameMatch[2]}` : null;
  // Extract dependency references (everything except the Name field)
  const dependencies: { guid: string; path: string }[] = [];
  const depRe = /\bDependency\s+"\{([A-Fa-f0-9]{16})\}([^"\r\n]*)"/gu;
  for (const m of clean.matchAll(depRe)) {
    dependencies.push({ guid: m[1]!.toUpperCase(), path: m[2]! });
  }
  // Also catch non-Name GUID references
  const allRefs = resourceReferences(clean);
  for (const ref of allRefs) {
    if (ref.guid !== guid && !dependencies.find(d => d.guid === ref.guid)) {
      dependencies.push({ guid: ref.guid, path: ref.path });
    }
  }
  if (!guid) warnings.push('No ownership GUID found in Name field');
  if (!resourcePath) warnings.push('No resource path found');
  return { guid, resourcePath, resourceName, dependencies: dependencies.slice(0, 200), warnings };
}

export function extractStrings(text: string): { value: string; line: number; context: string }[] {
  const results: { value: string; line: number; context: string }[] = [];
  const lines = text.split(/\r?\n/u);
  for (let i = 0; i < lines.length; i++) {
    for (const m of lines[i]!.matchAll(/"([^"\\]*(?:\\.[^"\\]*)*)"/g)) {
      const value = m[1]!;
      // Skip GUIDs, empty strings, single chars, and obvious non-localizable content
      if (!value || value.length < 2 || /^[A-Fa-f0-9]{16}$/.test(value) || /^\{[A-Fa-f0-9]{16}\}/.test(value)) continue;
      if (/^[.\/\\]/.test(value) || /\.\w{1,5}$/.test(value)) continue; // file paths
      results.push({ value, line: i + 1, context: lines[i]!.trim().slice(0, 200) });
    }
  }
  return results.slice(0, 1000);
}

export type FileStats = { totalFiles: number; byExtension: Record<string, number>; scriptFiles: number; prefabFiles: number; worldFiles: number; layoutFiles: number; configFiles: number; metaFiles: number; totalScriptLines: number };

export function computeFileStats(files: string[], lineCountsByFile?: Map<string, number>): FileStats {
  const byExtension: Record<string, number> = {};
  let scriptFiles = 0, prefabFiles = 0, worldFiles = 0, layoutFiles = 0, configFiles = 0, metaFiles = 0, totalScriptLines = 0;
  for (const f of files) {
    const ext = path.extname(f).toLowerCase();
    byExtension[ext] = (byExtension[ext] ?? 0) + 1;
    if (ext === '.c' || ext === '.h' || ext === '.cpp') { scriptFiles++; totalScriptLines += lineCountsByFile?.get(f) ?? 0; }
    if (ext === '.et') prefabFiles++;
    if (ext === '.ent') worldFiles++;
    if (ext === '.layout') layoutFiles++;
    if (ext === '.conf') configFiles++;
    if (ext === '.meta') metaFiles++;
  }
  return { totalFiles: files.length, byExtension, scriptFiles, prefabFiles, worldFiles, layoutFiles, configFiles, metaFiles, totalScriptLines };
}


export const SCRIPT_TEMPLATES: Record<string, { description: string; template: string }> = {
  'modded-class': {
    description: 'Modded class override for an existing game class',
    template: `modded class {{BASE_CLASS}}
{
\toverride void {{METHOD}}()
\t{
\t\tsuper.{{METHOD}}();
\t\t// Custom logic here
\t}
}
`,
  },
  'component': {
    description: 'New entity component class',
    template: `[ComponentEditorProps({{CLASS_NAME}}Class, description: "{{DESCRIPTION}}")]
class {{CLASS_NAME}}Class : ScriptComponentClass
{
}

class {{CLASS_NAME}} : ScriptComponent
{
\toverride void OnPostInit(IEntity owner)
\t{
\t\tsuper.OnPostInit(owner);
\t\tSetEventMask(owner, EntityEvent.INIT);
\t}

\toverride void EOnInit(IEntity owner)
\t{
\t\t// Initialization logic
\t}
}
`,
  },
  'game-mode': {
    description: 'Custom game mode extending SCR_BaseGameMode',
    template: `[BaseContainerProps()]
modded class SCR_BaseGameMode
{
\toverride void OnGameStart()
\t{
\t\tsuper.OnGameStart();
\t\t// Game start logic
\t}

\toverride void OnPlayerConnected(int playerId)
\t{
\t\tsuper.OnPlayerConnected(playerId);
\t\t// Player connected logic
\t}

\toverride void OnPlayerDisconnected(int playerId, KickCauseGroup cause, int timeout)
\t{
\t\tsuper.OnPlayerDisconnected(playerId, cause, timeout);
\t\t// Player disconnected logic
\t}
}
`,
  },
  'rpc-component': {
    description: 'Component with RPC (Remote Procedure Call) methods for multiplayer',
    template: `class {{CLASS_NAME}} : ScriptComponent
{
\t[RplProp()]
\tprotected int m_iSyncedValue;

\toverride void OnPostInit(IEntity owner)
\t{
\t\tsuper.OnPostInit(owner);
\t\tRplComponent.ShouldNotify(this);
\t}

\t[RplRpc(RplChannel.Reliable, RplRcver.Server)]
\tvoid RpcAsk_ServerAction(int param)
\t{
\t\t// Runs on server
\t\tm_iSyncedValue = param;
\t\tBroadcast_ClientUpdate(param);
\t}

\t[RplRpc(RplChannel.Reliable, RplRcver.Broadcast)]
\tvoid Broadcast_ClientUpdate(int param)
\t{
\t\t// Runs on all clients
\t}
}
`,
  },
  'action': {
    description: 'Custom user action (interact prompt)',
    template: `class {{CLASS_NAME}} : ScriptedUserAction
{
\toverride void PerformAction(IEntity pOwnerEntity, IEntity pUserEntity)
\t{
\t\t// Action logic when player interacts
\t}

\toverride bool CanBePerformedScript(IEntity user)
\t{
\t\treturn true;
\t}

\toverride bool CanBeShownScript(IEntity user)
\t{
\t\treturn true;
\t}

\toverride bool GetActionNameScript(out string outName)
\t{
\t\toutName = "{{ACTION_NAME}}";
\t\treturn true;
\t}
}
`,
  },
  'inventory-item': {
    description: 'Custom inventory item component',
    template: `[ComponentEditorProps({{CLASS_NAME}}Class, description: "{{DESCRIPTION}}")]
class {{CLASS_NAME}}Class : SCR_InventoryItemComponentClass
{
}

class {{CLASS_NAME}} : SCR_InventoryItemComponent
{
\toverride bool CanBeInserted(InventoryStorageSlot slot)
\t{
\t\treturn true;
\t}

\toverride void OnItemUsed(IEntity owner, IEntity user)
\t{
\t\t// Item use logic
\t}
}
`,
  },
  'workbench-plugin': {
    description: 'Workbench editor plugin',
    template: `[WorkbenchPluginAttribute(name: "{{PLUGIN_NAME}}", description: "{{DESCRIPTION}}", shortcut: "", color: "0 0 0 0", icon: "", wbModules: {"ResourceManager", "ScriptEditor"})]
class {{CLASS_NAME}} : WorkbenchPlugin
{
\toverride void Run()
\t{
\t\t// Plugin logic
\t\tPrint("{{PLUGIN_NAME}} executed");
\t}

\t[ButtonAttribute("OK")]
\tvoid OkButton()
\t{
\t}
}
`,
  },
};

export type TodoItem = { tag: string; message: string; file: string; line: number };

export function todoScan(files: { path: string; text: string }[]): TodoItem[] {
  const results: TodoItem[] = [];
  const re = /\b(TODO|FIXME|HACK|NOTE|BUG|XXX|WORKAROUND)\b[:\s]*(.*)/gi;
  for (const file of files) {
    const lines = file.text.split(/\r?\n/u);
    for (let i = 0; i < lines.length; i++) {
      for (const m of lines[i]!.matchAll(re)) {
        results.push({ tag: m[1]!.toUpperCase(), message: m[2]!.trim().slice(0, 500), file: file.path, line: i + 1 });
      }
    }
  }
  return results.slice(0, 1000);
}

export type SymbolRef = { file: string; line: number; context: string; kind: 'declaration' | 'usage' };

export function findSymbolReferences(files: { path: string; text: string }[], symbol: string): SymbolRef[] {
  const results: SymbolRef[] = [];
  const escapedSymbol = symbol.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`\\b${escapedSymbol}\\b`, 'g');
  for (const file of files) {
    const clean = maskComments(file.text, true);
    const lines = clean.split(/\r?\n/u);
    const origLines = file.text.split(/\r?\n/u);
    for (let i = 0; i < lines.length; i++) {
      if (re.test(lines[i]!)) {
        re.lastIndex = 0;
        // Determine if this is a declaration or usage
        const isDecl = /(?:class|enum)\s+/.test(lines[i]!.slice(0, lines[i]!.indexOf(symbol))) ||
          new RegExp(`\\b\\w+\\s+${escapedSymbol}\\s*\\(`).test(lines[i]!);
        results.push({ file: file.path, line: i + 1, context: origLines[i]!.trim().slice(0, 300), kind: isDecl ? 'declaration' : 'usage' });
      }
    }
  }
  return results.slice(0, 1000);
}

export type DuplicateGroup = { name: string; occurrences: { file: string; line: number; modded: boolean }[] };

export function detectDuplicateClasses(files: { path: string; text: string }[]): DuplicateGroup[] {
  const classMap = new Map<string, { file: string; line: number; modded: boolean }[]>();
  for (const file of files) {
    for (const sym of scriptSymbols(file.text)) {
      if (sym.kind === 'class') {
        const key = sym.name!;
        if (!classMap.has(key)) classMap.set(key, []);
        classMap.get(key)!.push({ file: file.path, line: sym.line, modded: sym.modded });
      }
    }
  }
  const duplicates: DuplicateGroup[] = [];
  for (const [name, occs] of classMap) {
    // Only flag as duplicate if there are multiple non-modded declarations, or multiple declarations total
    const nonModded = occs.filter(o => !o.modded);
    if (nonModded.length > 1 || occs.length > 2) {
      duplicates.push({ name, occurrences: occs });
    }
  }
  return duplicates.slice(0, 200);
}

export type UnusedResource = { metaFile: string; guid: string; resourceName: string };

export function findUnusedResources(
  metaOwnership: Map<string, { resource: string; name: string; file: string }>,
  referencedGuids: Set<string>
): UnusedResource[] {
  const unused: UnusedResource[] = [];
  for (const [guid, info] of metaOwnership) {
    if (!referencedGuids.has(guid)) {
      unused.push({ metaFile: info.file, guid, resourceName: info.name });
    }
  }
  return unused.slice(0, 500);
}

export type FunctionComplexity = { name: string; className: string | null; file: string; line: number; lineCount: number; maxNestingDepth: number; paramCount: number };

export function scriptComplexity(files: { path: string; text: string }[]): FunctionComplexity[] {
  const results: FunctionComplexity[] = [];
  for (const file of files) {
    const funcs = scriptFunctions(file.text);
    const lines = file.text.split(/\r?\n/u);
    for (const func of funcs) {
      // Estimate function body by counting lines until brace depth returns to 0
      let depth = 0, started = false, lineCount = 0, maxDepth = 0;
      for (let i = func.line - 1; i < lines.length && lineCount < 500; i++) {
        const line = lines[i]!;
        for (const ch of line) {
          if (ch === '{') { depth++; started = true; }
          if (ch === '}') depth--;
        }
        if (started) {
          lineCount++;
          if (depth > maxDepth) maxDepth = depth;
          if (depth <= 0) break;
        }
      }
      const paramCount = func.params ? func.params.split(',').filter(p => p.trim()).length : 0;
      results.push({ name: func.name, className: func.className, file: file.path, line: func.line, lineCount, maxNestingDepth: maxDepth, paramCount });
    }
  }
  return results.sort((a, b) => b.lineCount - a.lineCount).slice(0, 500);
}

export type ServerConfigInfo = { scenarioId: string | null; maxPlayers: number | null; name: string | null; mods: { modId: string; name: string }[]; ports: Record<string, number>; warnings: string[] };

export function serverConfigInfo(text: string): ServerConfigInfo {
  const warnings: string[] = [];
  let parsed: Record<string, unknown>;
  try { parsed = JSON.parse(text); }
  catch { throw new Error('Invalid JSON: not a valid server configuration file'); }
  const game = (parsed as any).game ?? (parsed as any).Game ?? {};
  const scenarioId = game.scenarioId ?? game.ScenarioId ?? null;
  const maxPlayers = game.maxPlayers ?? game.MaxPlayers ?? (parsed as any).maxPlayers ?? null;
  const name = game.name ?? game.Name ?? (parsed as any).serverName ?? (parsed as any).name ?? null;
  const mods: { modId: string; name: string }[] = [];
  const modList = game.mods ?? (parsed as any).mods ?? [];
  if (Array.isArray(modList)) {
    for (const m of modList) {
      if (m && typeof m === 'object') {
        mods.push({ modId: m.modId ?? m.id ?? '', name: m.name ?? '' });
      }
    }
  }
  const ports: Record<string, number> = {};
  // Standard Reforger server ports
  for (const key of ['bindPort', 'publicPort', 'a2sPort', 'rconPort', 'steamQueryPort']) {
    const val = (parsed as any)[key] ?? game[key];
    if (typeof val === 'number') ports[key] = val;
  }
  if (!scenarioId) warnings.push('No scenarioId found');
  if (!name) warnings.push('No server name found');
  return { scenarioId, maxPlayers, name, mods, ports, warnings };
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

