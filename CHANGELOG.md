# Changelog

## [0.5.2](https://github.com/OrenVill/mcp-explorer/compare/v0.5.1...v0.5.2) (2026-05-23)


### Bug Fixes

* use NPM_TOKEN for npm publish authentication ([#19](https://github.com/OrenVill/mcp-explorer/issues/19)) ([a1c6546](https://github.com/OrenVill/mcp-explorer/commit/a1c654692359eeeb59c3a28a19c25a667ca234df))

## [0.5.1](https://github.com/OrenVill/mcp-explorer/compare/v0.5.0...v0.5.1) (2026-05-23)


### Bug Fixes

* remove registry-url from setup-node to unblock OIDC npm publish ([#17](https://github.com/OrenVill/mcp-explorer/issues/17)) ([8a12763](https://github.com/OrenVill/mcp-explorer/commit/8a1276394f4283f672cc445eabda21f36992f1d8))

## [0.5.0](https://github.com/OrenVill/mcp-explorer/compare/v0.4.0...v0.5.0) (2026-05-23)


### Features

* publish @orenvill/mcp-explorer to npm registry ([#15](https://github.com/OrenVill/mcp-explorer/issues/15)) ([a667a6c](https://github.com/OrenVill/mcp-explorer/commit/a667a6c096b4fd178927ca64c25f49fc50eed25c))

## [0.4.0](https://github.com/OrenVill/mcp-explorer/compare/v0.3.0...v0.4.0) (2026-05-22)


### Features

* call history with expand and side-by-side comparison ([#10](https://github.com/OrenVill/mcp-explorer/issues/10)) ([eae8df4](https://github.com/OrenVill/mcp-explorer/commit/eae8df4b90d8b912a2c119acc3908890d3743069))
* cross-server search (⌘K) and tool bookmarks ([#11](https://github.com/OrenVill/mcp-explorer/issues/11)) ([730a73c](https://github.com/OrenVill/mcp-explorer/commit/730a73ce292ec867204dba1737f940a75d3617c4))
* persist bookmarks and call history to ~/.mcp-explorer/data.gz ([#14](https://github.com/OrenVill/mcp-explorer/issues/14)) ([66bc326](https://github.com/OrenVill/mcp-explorer/commit/66bc32691f3b42eb2e1a3f25ad23f66953053ea6))
* server export and documentation generation ([#12](https://github.com/OrenVill/mcp-explorer/issues/12)) ([c94abfc](https://github.com/OrenVill/mcp-explorer/commit/c94abfc4c55dd59296edb1c307e6a7477bc7da3f))

## [0.3.0](https://github.com/OrenVill/mcp-explorer/compare/v0.2.0...v0.3.0) (2026-05-22)


### Features

* add MCP resources and prompts support ([#7](https://github.com/OrenVill/mcp-explorer/issues/7)) ([de1e153](https://github.com/OrenVill/mcp-explorer/commit/de1e153fa0ccc16387dfa106537d9ff7c79cdff3))
* add MCP resources and prompts support ([#7](https://github.com/OrenVill/mcp-explorer/issues/7)) ([#9](https://github.com/OrenVill/mcp-explorer/issues/9)) ([284bc98](https://github.com/OrenVill/mcp-explorer/commit/284bc98aaa05d1d566753830474d57761475ae2b))

## [0.2.0](https://github.com/OrenVill/mcp-explorer/compare/v0.1.0...v0.2.0) (2026-05-20)


### Features

* **discovery:** accept hyphenated names and broader aggregator nouns ([dcc2814](https://github.com/OrenVill/mcp-explorer/commit/dcc2814b180357f111c8ba33b91ce46376e43949))
* **discovery:** bulk_list strategy ([9266862](https://github.com/OrenVill/mcp-explorer/commit/92668626a546953f7f9c9b47c1ad3ea15ec7eafd))
* **discovery:** category_index strategy with per-category fan-out ([e5f34b4](https://github.com/OrenVill/mcp-explorer/commit/e5f34b4a2a231f8a1f5092c372ccb291aea3bc28))
* **discovery:** enable_capability strategy (enum-driven) ([ed24ba0](https://github.com/OrenVill/mcp-explorer/commit/ed24ba0bc7a6a7539265152ad6c52c04c4288fc0))
* **discovery:** foundation — types, constants, strategy interface, parse, detect ([11b031e](https://github.com/OrenVill/mcp-explorer/commit/11b031ed3a49521dc4e4cccdb8fc901a5f85a8a8))
* **discovery:** hybrid_index strategy (list + per-tool describe fan-out) ([2e33829](https://github.com/OrenVill/mcp-explorer/commit/2e338299cb0c5b3dd202bd99790634c0369f77c9))
* **discovery:** invoke routing, UI components, mcpClient helpers ([580ce8d](https://github.com/OrenVill/mcp-explorer/commit/580ce8d4ce3e96f4af447a563731483d7710b9a7))
* **discovery:** manifest strategy (multi-shape parser) ([1ac212e](https://github.com/OrenVill/mcp-explorer/commit/1ac212e22527e86fef610fdb2c0b2056ec6b9286))
* **discovery:** paginated_list strategy with cursor/page/offset support ([c2d2f62](https://github.com/OrenVill/mcp-explorer/commit/c2d2f6265448daa7467fc422c0548ef5b306c9b3))
* **discovery:** proxy strategy + orchestrator ([2b09192](https://github.com/OrenVill/mcp-explorer/commit/2b09192bbf02278ce4106780b45e2f5ee5508bba))
* **discovery:** search strategy with probe sequence and alphabet sweep ([8dbb0e5](https://github.com/OrenVill/mcp-explorer/commit/8dbb0e54be12e1435b08ccb90a6406f26d5f044c))
* **discovery:** wire detection, orchestrator, and routing into App + ToolDetail + ToolList ([38ef600](https://github.com/OrenVill/mcp-explorer/commit/38ef6004a997c786c6e0f7bb0dddd759fbba95cc))
* **vault:** add constants and envelope types ([90ee95f](https://github.com/OrenVill/mcp-explorer/commit/90ee95f3084b2594053aa4833ad0749312b26362))
* **vault:** add Web Crypto derive and AES-GCM helpers ([82cf436](https://github.com/OrenVill/mcp-explorer/commit/82cf436a2d3e300ccda0e7e4423c5b16674878b0))
* **vault:** IndexedDB read/write/delete envelope ([09c0850](https://github.com/OrenVill/mcp-explorer/commit/09c08504f4b691989f4ec113bcd18e4755b9df4d))
* **vault:** integrate vault file handling and enhance server response management ([1508b73](https://github.com/OrenVill/mcp-explorer/commit/1508b73bae8a4d28cddfe544c058aaf8e337cd8d))
* **vault:** service, UI, and App vault gate ([15d3059](https://github.com/OrenVill/mcp-explorer/commit/15d30595af77097d9881124e876dab18b55ad758))


### Documentation

* add browser encrypted vault design spec ([f7c589e](https://github.com/OrenVill/mcp-explorer/commit/f7c589e12f6f109485fd39a1be099580f32f003a))
* add browser vault implementation plan ([733212c](https://github.com/OrenVill/mcp-explorer/commit/733212c305881aaa76f8e743e7ef6e1094100732))
* add meta-tool discovery design spec ([34d562d](https://github.com/OrenVill/mcp-explorer/commit/34d562dfefdddd975534cd5cda412bf557e73917))
* add meta-tool discovery implementation plan ([402ddb9](https://github.com/OrenVill/mcp-explorer/commit/402ddb9bffc843218844e0ef447366233e3178bc))
* mention meta-tool discovery in README features ([a9ea9bc](https://github.com/OrenVill/mcp-explorer/commit/a9ea9bcbb002819ac7217f1b7013ef1a5b71fa51))

## Changelog

All notable changes to this project will be documented in this file. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the version scheme follows
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

This file is maintained automatically by
[release-please](https://github.com/googleapis/release-please) based on
[Conventional Commit](https://www.conventionalcommits.org/) messages. Do not edit it by
hand — edit the Release PR before merging instead.
