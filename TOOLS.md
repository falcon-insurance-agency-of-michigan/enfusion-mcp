# Enfusion MCP — Tool Reference & Roadmap

> **Version 0.5.0** · Local MCP server for Enfusion Engine / Arma Reforger SDK
> Repo: [github.com/s0wingseason/enfusion-mcp](https://github.com/s0wingseason/enfusion-mcp)

---

## Quick Start

```jsonc
// Claude Code (~/.claude/settings.json)
{
  "mcpServers": {
    "enfusion-mcp": {
      "command": "node",
      "args": ["C:/Users/Calvin D. Roberts/plugins/enfusion-mcp/dist/server.cjs"]
    }
  }
}
```

```toml
# Codex (~/.codex/config.toml)
[mcp_servers.enfusion-mcp]
command = "node"
args = ["C:/Users/Calvin D. Roberts/plugins/enfusion-mcp/dist/server.cjs"]
```

The server auto-discovers your Enfusion SDK projects from `~/.config/enfusion-mcp/config.json`.

---

## Tool Reference (55 tools)

### Core / Status

| Tool | Description | Read-only |
|------|-------------|-----------|
| `enfusion_status` | Show server version, configured projects, and capabilities | ✅ |
| `enfusion_docs` | Search Enfusion SDK documentation by topic keyword | ✅ |

### File Operations

| Tool | Description | Read-only |
|------|-------------|-----------|
| `enfusion_read_file` | Read a UTF-8 file with line numbers and SHA-256 digest | ✅ |
| `enfusion_list_files` | List project files with optional glob filtering | ✅ |
| `enfusion_search` | Case-insensitive literal search across project | ✅ |
| `enfusion_write_file` | Write/create a file with SHA-256 conflict detection + backup | ❌ |
| `enfusion_rename_file` | Rename/move with backup and collision check | ❌ |
| `enfusion_delete_file` | Delete with backup preservation | ❌ |
| `enfusion_diff_file` | Preview a diff against proposed new content | ✅ |
| `enfusion_batch_search` | Multi-query literal search in a single scan | ✅ |
| `enfusion_file_history` | List backup versions of a file | ✅ |
| `enfusion_restore_backup` | Restore a file from a backup SHA-256 | ❌ |

### Project Management

| Tool | Description | Read-only |
|------|-------------|-----------|
| `enfusion_project_info` | Parse .gproj: ID, GUID, dependencies, warnings | ✅ |
| `enfusion_create_project` | Generate a new mod .gproj with platform dependencies | ❌ |
| `enfusion_file_stats` | Project health: file counts by type, LOC, etc. | ✅ |
| `enfusion_git_status` | Show git branch, porcelain changes, and recent commits | ✅ |
| `enfusion_config_template` | Generate a server configuration JSON template for Reforger | ✅ |

### Script Analysis (Enforce Script / .c)

| Tool | Description | Read-only |
|------|-------------|-----------|
| `enfusion_script_symbols` | Index class/enum declarations in a file | ✅ |
| `enfusion_script_functions` | Extract function declarations: name, type, params, class, modifiers | ✅ |
| `enfusion_class_hierarchy` | Build project-wide class inheritance tree | ✅ |
| `enfusion_find_implementations` | Find all subclasses of a given base class | ✅ |
| `enfusion_find_references` | Find all declarations and usages of a symbol | ✅ |
| `enfusion_duplicate_classes` | Detect duplicate class declarations (compile error source) | ✅ |
| `enfusion_script_complexity` | Function complexity metrics: line count, nesting depth, params | ✅ |
| `enfusion_extract_strings` | Extract string literals for localization review | ✅ |
| `enfusion_todo_scan` | Find TODO/FIXME/HACK/NOTE annotations project-wide | ✅ |
| `enfusion_lint_script` | Enforce Script linter: catch blocks, missing super, naming, magic numbers | ✅ |
| `enfusion_dead_code` | Find potentially unused classes/functions (excluding engine callbacks) | ✅ |
| `enfusion_api_doc` | Generate markdown API documentation from codebase symbols | ✅ |
| `enfusion_modded_overrides` | Catalog all modded class overrides and their modified methods | ✅ |
| `enfusion_file_outline` | IDE-style structured outline of declarations and methods with lines | ✅ |
| `enfusion_parse_diagnostics` | Parse Workbench compiler output for errors/warnings | ✅ |

### Resource & Prefab Analysis

| Tool | Description | Read-only |
|------|-------------|-----------|
| `enfusion_resource_refs` | Extract {GUID}path references from a file | ✅ |
| `enfusion_find_resource` | Resolve a GUID to its owning .meta file and resource path | ✅ |
| `enfusion_prefab_info` | Parse .et prefab: class, parent, components, properties | ✅ |
| `enfusion_world_info` | Parse .ent world: layers, entity counts, prefab refs | ✅ |
| `enfusion_config_info` | Parse .conf config files: key-value entries, blocks | ✅ |
| `enfusion_layout_info` | Parse .layout UI files: widgets, slots, resources | ✅ |
| `enfusion_meta_info` | Parse .meta files: ownership GUID, resource path, deps | ✅ |
| `enfusion_entity_count` | Count and summarize entity types in prefab/world files | ✅ |
| `enfusion_dependency_graph` | Build GUID reference graph across all project files | ✅ |
| `enfusion_validate_references` | Check {GUID}path refs against .meta records — resolved vs missing | ✅ |
| `enfusion_unused_resources` | Find orphaned .meta resources not referenced anywhere | ✅ |
| `enfusion_server_config` | Parse Reforger server JSON: scenario, mods, ports, players | ✅ |
| `enfusion_prefab_tree` | Build prefab inheritance hierarchy, roots, and orphan chains | ✅ |
| `enfusion_summarize` | High-level summary of any file (type, symbols, entities, refs, LOC) | ✅ |

### Search & Refactoring

| Tool | Description | Read-only |
|------|-------------|-----------|
| `enfusion_regex_search` | Regex search across project files (validated, case-insensitive) | ✅ |
| `enfusion_grep_context` | Literal search with surrounding context lines (grep -C style) | ✅ |
| `enfusion_compare_files` | Unified diff between two project files | ✅ |
| `enfusion_rename_symbol` | Dry-run preview: rename a symbol across all files | ✅ |
| `enfusion_bulk_replace` | In-place multi-file text replacement with automatic backups | ❌ |

### Code Generation

| Tool | Description | Read-only |
|------|-------------|-----------|
| `enfusion_scaffold_script` | Generate boilerplate from 7 Enforce Script templates | ✅ |

**Templates:** `modded-class`, `component`, `game-mode`, `rpc-component`, `action`, `inventory-item`, `workbench-plugin`

### Workbench Integration

| Tool | Description | Read-only |
|------|-------------|-----------|
| `enfusion_workbench_launch` | Launch Enfusion Workbench with arguments | ❌ |
| `enfusion_workbench_validate` | Validate Workbench installation | ✅ |
| `enfusion_install_companion` | Install companion plugin into Workbench | ❌ |

---

## Version History

### v0.5.0 (current)
- `enfusion_lint_script` — Enforce Script static analysis & linter
- `enfusion_dead_code` — Detect dead/unreferenced functions and classes
- `enfusion_api_doc` — Markdown documentation generator from symbols
- `enfusion_modded_overrides` — Catalog all modded class overrides
- `enfusion_prefab_tree` — Prefab inheritance hierarchy tree & orphan audit
- `enfusion_summarize` — Single-file structural inspector & census
- `enfusion_bulk_replace` — Multi-file batch replacement with backups
- `enfusion_git_status` — Local repository branch, diff, and commit log
- `enfusion_config_template` — Arma Reforger dedicated server JSON boilerplate generator
- `enfusion_file_outline` — IDE outline / symbol view with line numbers
- 74 integration tests across 6 suites

### v0.4.0
- `enfusion_todo_scan` — Find TODO/FIXME/HACK/NOTE annotations
- `enfusion_find_references` — Symbol usage search (declarations vs usages)
- `enfusion_duplicate_classes` — Detect duplicate class declarations
- `enfusion_unused_resources` — Find orphaned .meta resources
- `enfusion_script_complexity` — Function complexity analysis
- `enfusion_server_config` — Parse Reforger server config JSON
- `enfusion_restore_backup` — Restore files from backup versions
- `enfusion_grep_context` — Context-aware search (grep -C)
- `enfusion_rename_symbol` — Dry-run symbol rename preview
- `enfusion_entity_count` — Entity type census in prefab/world files
- 64 integration tests

### v0.3.0
- `enfusion_script_functions` — Function/method declaration parser
- `enfusion_class_hierarchy` — Project-wide inheritance tree
- `enfusion_meta_info` — .meta file parser
- `enfusion_regex_search` — Regex-based search
- `enfusion_extract_strings` — String literal extraction
- `enfusion_file_stats` — Project statistics
- `enfusion_scaffold_script` — Code generation from 7 templates
- `enfusion_compare_files` — Two-file diff
- `enfusion_validate_references` — GUID reference validation
- `enfusion_find_implementations` — Subclass finder
- 54 integration tests

### v0.2.0
- `enfusion_prefab_info`, `enfusion_world_info`, `enfusion_config_info`, `enfusion_layout_info`
- `enfusion_dependency_graph`, `enfusion_rename_file`, `enfusion_delete_file`
- `enfusion_diff_file`, `enfusion_batch_search`, `enfusion_file_history`
- 38 integration tests

### v0.1.0
- Initial release: 15 core tools for read/write/search/project/workbench

---

## Feature Roadmap

### Near-term (v0.6.0)
- [ ] **LSP integration** — Basic Language Server Protocol support for IDE code completion
- [ ] **`enfusion_test_runner`** — Run Enforce script unit tests via Workbench CLI
- [ ] **`enfusion_profiler`** — Parse Workbench profiling and memory output
- [ ] **`enfusion_mod_publish`** — Automate Steam Workshop upload preparation & manifest check
- [ ] **`enfusion_config_validate`** — Schema-based validation for .conf/.json files

### Long-term
- [ ] **Multi-project workspaces** — Cross-project dependency resolution
- [ ] **AI-powered refactoring** — Suggest modded class patterns based on intent
- [ ] **Workbench RPC bridge** — Direct communication with running Workbench instance
- [ ] **Prefab visual tree** — Mermaid diagram generation for entity hierarchies
- [ ] **Performance advisor** — Flag entity-heavy prefabs, large scripts, deep nesting

---

## Configuration

Config file: `~/.config/enfusion-mcp/config.json`

```json
{
  "projects": [
    {
      "id": "my-mod",
      "root": "C:/path/to/your/mod",
      "writable": true
    }
  ]
}
```

- **`id`** — Unique project identifier (used in all tool calls as `project` parameter)
- **`root`** — Absolute path to the mod's root directory
- **`writable`** — Set `true` to enable file write/rename/delete operations

---

## Architecture

```
src/
  cli.ts         — Entry point (stdio transport)
  config.ts      — Zod schema validation, version constant
  server.ts      — All 55 tool registrations on McpServer
  analysis.ts    — Parsing/analysis functions (pure, no I/O)
  workspace.ts   — File I/O with path safety, backup, conflict detection
  workbench.ts   — Workbench process spawning and validation
  library.ts     — Library re-export barrel
tests/
  helpers.mjs    — Test utilities (fixture, connect, call)
  protocol.test.mjs  — Core MCP protocol tests
  v020.test.mjs  — v0.2.0 tool tests
  v030.test.mjs  — v0.3.0 tool tests
  v040.test.mjs  — v0.4.0 tool tests
  v050.test.mjs  — v0.5.0 tool tests
  package.test.mjs   — Release zip validation
  workspace.test.mjs — Workspace security/safety tests
```

### Safety Features
- **Path traversal protection** — All file ops sanitized against `..`, drive paths, symlink escapes
- **SHA-256 conflict detection** — Optimistic concurrency control on writes
- **Automatic backups** — Every write/rename/delete preserves the previous version
- **32 MB scan budget** — Project-wide operations cap I/O to prevent runaway reads
- **Read-only by default** — Projects must explicitly opt into writes

---

*Built by Cal (s0wingseason) for ReforgedZ modding. Not affiliated with Bohemia Interactive.*
