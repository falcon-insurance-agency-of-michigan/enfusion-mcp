# Release plan

Build a local stdio MCP server and a Codex-compatible plugin for a balanced Arma Reforger SDK workflow. Public distribution is a GitHub repository and a versioned release, not a hosted service or a Workshop upload.

1. Verify Bohemia's Workbench CLI and native plugin interfaces, current MCP SDK, and local tools.
2. Implement explicit project roots, read-only defaults, bounded source inspection, resource lookup, script symbols, reference extraction, hash-checked writes with backups, and addon scaffolding.
3. Integrate documented Workbench launches and an original Enforce Script validation companion. Separate a successful process launch from successful project validation.
4. Test paths, symlinks, read/write boundaries, stale edits, malformed inputs, real MCP sessions, clean release installation, and a local SDK smoke run.
5. Publish original source only, MIT licensing, setup and tool documentation, automated Windows/Linux checks, release archives and checksums. Verify public visibility and CI results.

## Architecture

MCP client -> stdio server -> configured filesystem roots / fixed Workbench command builder -> Enforce Script companion -> fresh validation marker and engine logs.

No arbitrary shell execution, network listener, third-party telemetry, proprietary game assets, debugger injection, binary PAK editing, or claimed world simulation. World/prefab source can be inspected and edited; rendering, terrain editing, resource import/build, and play-testing remain in Workbench.

## Acceptance criteria

- A real MCP client discovers and invokes tools, resources and prompts in modern and legacy protocol modes.
- Traversal, alternate streams, symlink escapes, unauthorized writes and stale edits fail safely.
- A failed, timed-out or unverified Workbench run never returns validation success.
- Release runs using Node.js alone without a source checkout or dependency install.
- Public repo and release are reachable and CI passes.
