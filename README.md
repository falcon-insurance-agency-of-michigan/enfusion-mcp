# Enfusion MCP

[![CI](https://github.com/s0wingseason/enfusion-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/s0wingseason/enfusion-mcp/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

A local **Model Context Protocol server and Codex plugin for Enfusion Engine / Arma Reforger SDK**. Give an MCP client access to your configured addon folders, Enforce Script, prefab/world source, resource GUIDs, and real Workbench startup diagnostics.

**15 tools, 2 resources, 1 review prompt.** Runs over stdio using the official MCP TypeScript SDK. Supports legacy MCP clients and protocol revision `2026-07-28`.

Unofficial community project. Not affiliated with Bohemia Interactive. Arma Reforger, Enfusion and related marks belong to their owners. No SDK executables or game assets are redistributed.

## What it does

- Inspect `.gproj` identity and dependencies; browse and search source with file/line results.
- Read Enforce Script classes/enums and `{GUID}path` references; resolve loose `.meta` ownership records.
- Create addon descriptors and edit scripts, prefabs, worlds and configs with stale-edit detection and original-byte backups.
- Preview or launch Resource Manager, Script Editor and World Editor with documented CLI parameters.
- Install an original Enforce Script companion into your mod, start a separate Workbench validation run, and collect compiler/engine diagnostics.
- Find official documentation links and use a reusable addon-review prompt.

This release focuses on source workflows and SDK startup validation. It does **not** automate terrain sculpting, place entities through a live world API, unpack PAKs, run a language server/debugger, compile all resource assets or publish to Workshop. World/prefab edits are text edits; finish resource import, visual inspection and play-testing in Workbench.

## Quick start

Requires **Node.js 22 or newer**. Native Workbench execution requires Windows, Arma Reforger and Arma Reforger Tools from Steam. Source inspection works on Windows, Linux and macOS; Windows and Linux are tested in CI.

1. Download `enfusion-mcp-0.1.0.zip` from [Releases](https://github.com/s0wingseason/enfusion-mcp/releases), verify it against `SHA256SUMS.txt`, and extract it. The ZIP includes the server and its dependencies in a single bundle; no `npm install` is needed to run it.
2. Create an addon directory, or choose an existing one. Copy [the Windows configuration example](examples/config.windows.json) to a private path and edit the paths. Directories must already exist. SDK paths vary across Steam installations; select the executable actually installed on your system.
3. Configure your MCP client with the absolute server and config paths:

```json
{
  "mcpServers": {
    "enfusion": {
      "command": "node",
      "args": [
        "C:/Tools/enfusion-mcp/dist/server.cjs",
        "--config",
        "C:/ArmaMods/enfusion-mcp.config.json"
      ]
    }
  }
}
```

If your client uses a `servers` root (for example VS Code), put the same entry there and add `"type":"stdio"`. Set the client's tool timeout above your chosen Workbench validation timeout; 330 seconds accommodates the server's maximum of 300 seconds.

4. Restart the MCP connection and ask: **“Use Enfusion to inspect my-mod and its dependencies.”** Call `enfusion_status` to verify the roots and permissions.

The process waits for MCP requests on stdin. Starting it alone is not an interactive console. `node dist/server.cjs --help` prints command-line usage.

### Codex plugin

The release contains a portable `plugin.json` / `mcp.json` package plus a `.codex-plugin/plugin.json` compatibility manifest and bundled `enfusion-sdk` skill. Select the extracted **enfusion-mcp** folder when loading it through a local plugin install surface. Plugin launch reads `~/.config/enfusion-mcp/config.json` by default (on Windows, under your user profile). Create this private file before using the tools. An unconfigured server still starts, but exposes no filesystem roots.

For a direct Codex MCP setup, use absolute paths in your Codex config:

```toml
[mcp_servers.enfusion]
command = "node"
args = ["C:/Tools/enfusion-mcp/dist/server.cjs", "--config", "C:/ArmaMods/enfusion-mcp.config.json"]
tool_timeout_sec = 330
```

The GitHub release is the public distribution. This project is not listed in OpenAI's public plugin directory and does not provide a remote HTTPS MCP endpoint. See the [plugin packaging documentation](https://developers.openai.com/plugins/build/plugins) for supported local package formats.

## Configuration

Config precedence: `--config`, then `ENFUSION_MCP_CONFIG`, then `~/.config/enfusion-mcp/config.json`. Only the default file may be absent; an invalid or missing explicit config fails startup. Unknown keys fail validation to catch typos.

| Key | Default | Meaning |
| --- | --- | --- |
| `projects` | `[]` | Up to 32 `{id, root, writable}` entries with existing absolute roots |
| `projects[].writable` | `false` | Permit supported text writes and validation artifacts in this project |
| `workbenchPath` | absent | Absolute installed Workbench `.exe`; required for preview/launch/validation |
| `addonRoots` | `[]` | Absolute dependency addon folders, e.g. the game's `addons` directory |
| `allowLaunch` | `false` | Allow native Workbench processes; preview remains available without it |
| `maxFileBytes` | `1048576` | Maximum text file size; configurable from 1 KiB to 8 MiB |
| `maxScanEntries` | `20000` | Scan budget, 100–100000 entries; truncated scans are reported |

The server does not infer roots from the current folder. Add SDK source folders as separate read-only roots if you have loose source to inspect. PAKs and `resourceDatabase.rdb` are not indexed. Overlapping roots cannot have conflicting write policies.

## Example workflow

1. Configure an existing empty writable folder as `my-mod`.
2. Call `enfusion_create_project` with `{"project":"my-mod","id":"MyMod","title":"My Mod"}`. The default dependency is the base Arma Reforger project GUID; pass your own dependencies when appropriate.
3. Create `Scripts/Game/MyComponent.c` with `enfusion_write_file`, or read existing source and pass the returned `sha256` as `expectedSha256` when editing.
4. Enable `allowLaunch` in the private config and restart the connection. Install the companion with `enfusion_install_companion`, then run `enfusion_workbench_validate`.
5. Inspect diagnostics and open the relevant resource in Workbench with `enfusion_workbench_launch` using `dryRun:false`.

Validation writes `.enfusion-mcp/runs/<unique-id>/` under the configured addon; backup edits live under `.enfusion-mcp/backups/`. Add `.enfusion-mcp/` to your mod's `.gitignore`. Retain or remove old runs/backups manually as needed.

### Interpreting validation

| Field | What it establishes |
| --- | --- |
| `loaded` | The companion produced a fresh valid result marker during this run |
| `scriptStartupPassed` | Marker, normal exit and no detected script compiler errors |
| `cleanLogs` | No error diagnostics were detected in the collected logs |
| `success` | Both script startup and log checks passed |
| `timedOut` | The server terminated its own process after the configured deadline |
| `logsTruncated` | Log/diagnostic limits were reached; positive validation is withheld |
| `aborted` | The MCP request was canceled and its validation process was terminated |

A normal process exit alone never proves compilation. Missing markers, timeouts and compiler errors never return `success:true`. Native Workbench can wait after a script failure; the validation deadline bounds that wait. `-noThrow` is passed, but editor behavior still depends on the installed SDK version. Validation does not terminate an already-open user Workbench session.

Real SDK testing found that a valid addon could load successfully while the installed SDK emitted an asset-schema error and shutdown resource-leak diagnostics. These remain visible and keep `success:false`; see [validation evidence](docs/VALIDATION.md).

## Tool reference

See [all tools, arguments, resources and prompts](docs/TOOLS.md), the [implementation plan](docs/PLAN.md), and [security/privacy boundaries](SECURITY.md).

## Build and test

```sh
git clone https://github.com/s0wingseason/enfusion-mcp.git
cd enfusion-mcp
npm ci
npm run check
npm run release
```

`npm run check` type-checks TypeScript, builds bundled artifacts and runs unit/integration tests. Tests use a real MCP client and temporary synthetic mod folders. CI runs on Windows and Linux with Node 22 and 24 and verifies an extracted release without `node_modules`.

For the optional SDK smoke test on Windows:

```powershell
npm run test:live -- "C:/Program Files (x86)/Steam/steamapps/common/Arma Reforger Tools/Workbench/ArmaReforgerWorkbenchSteamDiag.exe" "C:/Program Files (x86)/Steam/steamapps/common/Arma Reforger/addons"
```

This creates isolated good/broken test addons under ignored `local/`, runs both through Workbench, and preserves raw logs locally. The smoke test expects script startup for the good addon and rejection of the deliberately broken addon. It reports unrelated engine errors separately and does not assert that the installed SDK has clean asset logs. Do not publish raw local logs without removing private paths and identifiers.

## References and licensing

Integration follows Bohemia's [startup parameters](https://community.bistudio.com/wiki/Arma_Reforger:Startup_Parameters), [Workbench plugin interface](https://community.bistudio.com/wiki/Arma_Reforger:Workbench_Plugin), [plugin tutorial](https://community.bistudio.com/wiki/Arma_Reforger:Workbench_Plugin_Tutorial), and [mod project setup](https://community.bistudio.com/wiki/Arma_Reforger:Mod_Project_Setup). MCP uses the [official TypeScript SDK](https://ts.sdk.modelcontextprotocol.io/v2/).

Original code and companion: [MIT](LICENSE). Bundled dependencies retain their licenses in `dist/THIRD-PARTY-NOTICES.txt`. Arma Reforger and its SDK remain subject to Bohemia's terms.
