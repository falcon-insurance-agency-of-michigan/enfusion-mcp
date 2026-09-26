# MCP reference

All tools return a text JSON block and a structured object on success. Operational failures return `isError:true`; schema validation rejects unknown arguments and out-of-range values. Filesystem tools require a configured `project` id. Paths are relative to that root, and hidden components/symlinks are rejected. Reads and writes are bounded by `maxFileBytes`.

| Tool | Arguments | Result / behavior |
| --- | --- | --- |
| `enfusion_status` | none | Configured roots, permissions, Workbench availability, limits |
| `enfusion_list_files` | `project`, optional `query`, `extension`, `offset=0`, `limit=50` | Sorted paths, total, nextOffset, scanTruncated, errors |
| `enfusion_read_file` | `project`, `path`, `startLine=1`, `lineCount=200` | Full-file SHA-256, bytes, selected numbered lines, totalLines |
| `enfusion_search` | `project`, `query`, `caseSensitive=false`, optional `extension`, `limit=50` | Literal text matches, file/line context, hasMore, skipped and scan flags |
| `enfusion_project_info` | `project`, `path=addon.gproj` | ID, GUID, title, dependencies, basic warnings |
| `enfusion_script_symbols` | `project`, `.c` `path` | Classes, enums, base classes, modded flag and line locations |
| `enfusion_resource_references` | `project`, `path` | Up to 1000 `{GUID}path` references and line locations |
| `enfusion_find_resource` | `project`, 16-hex `guid` | Matching .meta owners or .gproj identity; max 200 |
| `enfusion_write_file` | `project`, `path`, `content`, optional `expectedSha256` | Creates a new source file or replaces an existing file only when hash matches; backup location |
| `enfusion_create_project` | `project`, `id`, `title`, optional `dependencies` | New addon.gproj and random project GUID; default dependency Arma Reforger |
| `enfusion_parse_diagnostics` | `text` (up to 1 MiB) | Up to 1000 heuristic errors/warnings, log line and script location |
| `enfusion_docs` | `query=""` | Offline catalog of official links filtered by topic words |
| `enfusion_install_companion` | `project` | Installs Scripts/WorkbenchGame/EMCP_ValidatePlugin.c; refuses different existing content |
| `enfusion_workbench_launch` | `project`, `gproj=addon.gproj`, `module=ResourceManager`, optional `load`, `dryRun=true` | Exact executable/argument preview or started PID; module can also be ScriptEditor or WorldEditor |
| `enfusion_workbench_validate` | `project`, `gproj=addon.gproj`, `timeoutSeconds=90` (5–300) | Fresh marker, process outcome, scriptStartupPassed, cleanLogs, strict success, diagnostics and run directory |

`limit` is 1–200; `lineCount` is 1–1000. Search queries are literal strings, not regex. Class/enum and .gproj inspection use lightweight text parsing rather than an Enforce AST. Documentation search retrieves links, not page contents. Scans skip hidden, node_modules, dist, build, cache, logs and profile directories, and stop after depth 40 or the configured entry limit.

Content search stops after inspecting roughly 32 MiB (plus the last bounded file) and reports `byteBudgetReached`. Validation reads up to 256 KiB from the start of each log, up to 2 MiB and 512 entries overall, to depth 2. A truncated log/diagnostic collection sets `logsTruncated:true` and prevents a success result. MCP request cancellation terminates the validation process started by that request.

Writable extensions: `.c`, `.gproj`, `.et`, `.ent`, `.conf`, `.layout`, `.meta`, `.json`. Readable extensions additionally include `.h`, `.cpp`, `.txt`, `.md`, `.xml`, `.csv`, `.log`, `.ini`. Binary and invalid UTF-8 files are rejected. Root policies and tool annotations are visible to clients; tools cannot grant themselves extra permissions.

## Resources

- `enfusion://status` — JSON capability/configuration summary.
- `enfusion://docs` — JSON official documentation catalog.

## Prompt

`enfusion-review` accepts a `project` string and optional `focus` string. It guides source inspection, dependency/reference review and truthful validation reporting. It does not grant edit or execution permission.

## Restore an edit

`enfusion_write_file` returns the backup's relative path after a replacement. With your local editor, review that `.bak` file and restore the desired bytes to the original file. Backups preserve original bytes including BOM/CRLF; normal tool writes use UTF-8. No automatic delete or rollback tool is exposed.
