# Security and privacy

This is a local stdio server. It opens no listening port, performs no network requests, uploads no projects and has no telemetry. Your MCP client receives the source and logs it requests and may send them to its model provider. Workbench itself can contact Steam and Bohemia services.

Configuration is a trusted local boundary. Project roots are explicit, read-only by default, and cannot be added through MCP tools. Write and launch permissions are separate. Do not configure a whole home directory, drive or secrets folder. Only allow Workbench execution for addons you trust: Enforce Workbench scripts can run external processes using the SDK's own APIs.

Paths reject traversal, symlinks/junctions, hidden components, Windows alternate streams and reserved devices. Reads accept selected UTF-8 text formats, enforce file limits and reject binary data. Scans have entry/depth limits. Writes require a current SHA-256 for existing files, serialize within a server instance, back up the original bytes and replace using a temporary file. Backups and validation logs consume disk space and may contain private project data. They are excluded from indexing and should be excluded from version control.

These checks protect against malformed tool arguments and accidental stale edits. This is not an OS sandbox against a hostile local process racing filesystem operations or modifying trusted configuration. Use normal OS isolation for adversarial workloads. Multiple independent server instances and an external editor cannot provide a filesystem-wide atomic compare-and-swap guarantee. Do not run this process elevated.

The server does not expose arbitrary executable selection or arbitrary shell commands to tools. Its configured Workbench executable is passed an argument array with `shell:false`. The filename check is a guardrail, not a publisher-signature check. Validation uses a new run directory each time and never accepts a stale marker from an earlier run. A malicious addon is outside this validation trust model.

Please report vulnerabilities through the repository's **Security > Report a vulnerability** page when available. Avoid posting private source, local paths, Steam identifiers or raw engine logs in public issues; share a minimal synthetic reproduction.
