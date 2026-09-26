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

export const DOCS = [
  { title: 'Mod project setup', topics: 'project gproj dependencies steam install', url: 'https://community.bistudio.com/wiki/Arma_Reforger:Mod_Project_Setup' },
  { title: 'Workbench startup parameters', topics: 'cli launch module plugin profile logs build', url: 'https://community.bistudio.com/wiki/Arma_Reforger:Startup_Parameters' },
  { title: 'Workbench plugins', topics: 'plugin workbench enforce scripting', url: 'https://community.bistudio.com/wiki/Arma_Reforger:Workbench_Plugin' },
  { title: 'Workbench plugin tutorial', topics: 'plugin commandline RunCommandline scripting', url: 'https://community.bistudio.com/wiki/Arma_Reforger:Workbench_Plugin_Tutorial' },
  { title: 'Enforce Script syntax', topics: 'script class enum types syntax', url: 'https://community.bistudio.com/wiki/Arma_Reforger:Enforce_Script_Syntax' },
  { title: 'Enfusion Script API', topics: 'api reference engine class methods', url: 'https://community.bistudio.com/wikidata/external-data/arma-reforger/EnfusionScriptAPIPublic/index.html' },
  { title: 'Arma Reforger Script API', topics: 'api reference game SCR components', url: 'https://community.bistudio.com/wikidata/external-data/arma-reforger/ArmaReforgerScriptAPIPublic/index.html' },
  { title: 'Official samples', topics: 'samples examples prefabs scripts world mods', url: 'https://github.com/BohemiaInteractive/Arma-Reforger-Samples' },
];
