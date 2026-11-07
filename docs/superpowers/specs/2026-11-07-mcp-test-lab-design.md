# MCP Test Lab (Scenario persistence + CLI)

**Date:** 2026-11-07  
**Status:** Implemented

## Summary

Scenario Runner scenarios persist in `appData.scenarios`, export as `mcp-detective-scenario` v1 JSON, and run via `mcp-detective scenario run`.

See README Scenario Runner / Test Lab bullet and `src/lib/scenarioFile.ts` for the file format.

## Non-goals (v1)

- Step arg threading from prior results
- `check --scenario`
- Persisted run history
