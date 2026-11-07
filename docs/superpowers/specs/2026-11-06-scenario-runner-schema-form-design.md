# Scenario Runner — Schema-Based Step Arguments

**Date:** 2026-11-06  
**Status:** Approved (implemented in this branch)

## Summary

Scenario Runner step editing today requires users to type **raw JSON** for tool arguments. The main **Invoke** flow already uses `SchemaForm` from each tool's `inputSchema`. This change makes the Scenario Runner reuse that form by default and keeps **JSON editing** as an explicit override.

## Goals

- Match **Invoke** for tools whose schema lists `properties`: typed fields, enums, booleans, etc.
- Avoid surprising optional-field behavior: the same **empty string / undefined** stripping as `ToolDetail` before `tools/call`.
- Preserve a path for edge cases: tools with no `properties` (or missing schema) still edit JSON; advanced users can switch **Edit as JSON** when a schema exists.

## Behavior

1. **Resolve tool definition** from the selected server's `tools` + `discovered` lists by name.
2. If `inputSchema.properties` is non-empty → show **`SchemaForm`** inside the step card.
3. Otherwise → show the **JSON textarea** (unchanged ergonomics for schema-less tools).
4. **Edit as JSON** / **Form fields** toggles when a schema-backed form is shown. JSON mode parses on switch back to form; invalid JSON shows **Invalid JSON** and blocks leaving JSON until fixed (or user corrects inline).
5. **Changing the tool** resets `args` to `{}`, clears JSON errors, and returns to form mode when applicable (avoids carrying wrong keys across tools).
6. **`runScenario`** passes `cleanToolArgs(step.args)` to the MCP caller (same filter as Invoke).
7. **Step collapse** — **+ Add Step** collapses every previous step and expands only the new one (so the list stays scannable). You can expand several steps at once via the chevron if you need to compare or edit in parallel. Collapsed steps show *server / tool* in one line, or **Select a tool…** until the user picks.
8. **No default tool** — New steps start with no server/tool chosen; **Run** stays disabled until every step has a tool (tooltip explains why).

## Testing

- Vitest: `cleanToolArgs` unit test in `scenarioRunner.test.ts`.
- Playwright §3.21: assert schema form visible for the expanded step (`message` label); open **Edit as JSON**, assert invalid JSON surfaces **Invalid JSON**; assert a second **Add Step** leaves the first step collapsed (`scenario-step-collapsed-0`).

## Non-goals

- Persisting scenarios (still in-memory only).
- Filling args from call history or duplicating the full **Invoke** layout (e.g. live result preview) inside the runner.
