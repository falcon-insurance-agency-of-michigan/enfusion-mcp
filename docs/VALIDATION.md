# Validation evidence

Recorded 2026-09-26 for version 0.1.0. The automated suite and CI are rerunnable from source; real SDK tests require the proprietary SDK installed locally.

## Automated checks

- Strict TypeScript compilation and bundled server build.
- Real stdio MCP client sessions in legacy and pinned 2026-07-28 modes: tools, source edits, resource reads and prompts.
- Traversal, Windows drive/UNC/alternate-stream/device paths, hidden paths, symlinks/junctions, replaced root junctions and redirected backup paths.
- Read-only/overlapping roots, malformed configuration, binary and oversized inputs, concurrent and stale edits.
- Original-byte backup preservation, including UTF-8 BOM and CRLF.
- Bounded source listing/search, line ranges, Enforce declarations, .meta ownership and compiler diagnostic locations.
- Process exit failures, output limits and timeout cleanup.
- Release checksum/allowlist verification and an extracted bundled server running outside the checkout without node_modules.

GitHub Actions runs the suite on Windows and Ubuntu with Node.js 22 and 24. The CI badge and run history are the current source of truth for those results.

## Real Workbench smoke test

Environment: Windows, Node.js 24.12.0, Arma Reforger Workbench executable version **1.8.0.13**. The test used generated synthetic addon folders, an isolated profile/log directory for each process, and the installed base Arma Reforger dependency. An existing unrelated Workbench session was left running.

| Case | Observed outcome |
| --- | --- |
| Valid addon with a simple Enforce class and the companion | Companion compiled and ran; fresh JSON marker; exit code 0; `loaded:true`, `scriptStartupPassed:true` |
| Deliberately invalid class inheriting from an absent type | Workbench logged the exact synthetic source path and line 1, reported failure to compile Game, produced no marker; `loaded:false`, `scriptStartupPassed:false`, `success:false` |
| Workbench waited after compiler failure | The test's 30-second deadline terminated only its child process; `timedOut:true` |

The valid case was **not a clean engine-log run**. The installed SDK logged `Unknown keyword/data 'm_aCatalogTypes'`, base-game deprecation warnings, and resource leaks during shutdown. The server preserved these diagnostics and returned `cleanLogs:false` and `success:false` while separately reporting successful script startup. These observations do not establish their cause or that arbitrary user addons are error-free.

No asset-packaging, world-rendering, mission simulation, multiplayer or Workshop publication test is claimed. The validation companion establishes script startup and callback execution only. Raw logs, Steam identifiers and machine-specific paths are intentionally excluded from the public repository.
