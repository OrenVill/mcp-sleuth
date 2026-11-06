import { useState, useCallback, useEffect } from 'react';
import type { JsonSchema, ServerEntry, ToolDef } from '../types';
import { Select } from './Select';
import { SchemaForm } from './SchemaForm';
import {
  createScenario,
  addStep,
  runScenario,
  cleanToolArgs,
  type Scenario,
  type ScenarioStep,
  type StepAssertion,
  type ScenarioRun,
  type StepResult,
} from '../lib/scenarioRunner';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Props {
  servers: ServerEntry[];
  onClose: () => void;
  onCallTool: (serverId: string, toolName: string, args: Record<string, unknown>) => Promise<unknown>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function allTools(servers: ServerEntry[]): { serverId: string; serverName: string; toolName: string }[] {
  return servers.flatMap((s) => [
    ...(s.tools ?? []).map((t) => ({ serverId: s.id, serverName: s.name, toolName: t.name })),
    ...(s.discovered ?? []).map((t) => ({ serverId: s.id, serverName: s.name, toolName: t.name })),
  ]);
}

function findToolDef(server: ServerEntry, toolName: string): ToolDef | null {
  const list = [...(server.tools ?? []), ...(server.discovered ?? [])];
  return list.find((t) => t.name === toolName) ?? null;
}

function jsonSchemaHasProperties(schema: JsonSchema | undefined): boolean {
  const props = schema?.properties;
  return !!props && Object.keys(props).length > 0;
}

function makeStepId(): string {
  return `step-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}

function stepSummaryLine(servers: ServerEntry[], step: ScenarioStep): string {
  if (!step.serverId || !step.toolName) {
    return 'Select a tool…';
  }
  const server = servers.find((s) => s.id === step.serverId);
  const serverName = server?.name?.trim() || step.serverId || '—';
  const tool = step.toolName.trim();
  return `${serverName} / ${tool}`;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function AssertionBadge({ result }: { result: { pass: boolean; message?: string } }) {
  return (
    <span
      className={[
        'inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium',
        result.pass
          ? 'bg-green-900/40 text-green-300 border border-green-700/40'
          : 'bg-red-900/40 text-red-300 border border-red-700/40',
      ].join(' ')}
      title={result.message}
    >
      {result.pass ? '✓' : '✗'} {result.message ?? (result.pass ? 'pass' : 'fail')}
    </span>
  );
}

function StepResultRow({ result }: { result: StepResult }) {
  return (
    <div className={[
      'rounded-lg border p-3 text-xs',
      result.pass
        ? 'border-green-700/40 bg-green-950/30'
        : 'border-red-700/40 bg-red-950/30',
    ].join(' ')}>
      <div className="flex items-center gap-2 mb-1.5">
        <span className={result.pass ? 'text-green-400' : 'text-red-400'}>
          {result.pass ? '✓ Pass' : '✗ Fail'}
        </span>
        {result.durationMs !== undefined && (
          <span className="text-zinc-500">{result.durationMs}ms</span>
        )}
        {result.error && (
          <span className="text-red-400 font-mono">{result.error}</span>
        )}
      </div>
      {result.assertionResults.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {result.assertionResults.map((ar, i) => (
            <AssertionBadge key={i} result={ar} />
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step editor
// ---------------------------------------------------------------------------

interface StepEditorProps {
  servers: ServerEntry[];
  step: ScenarioStep;
  onChange: (step: ScenarioStep) => void;
  onRemove: () => void;
  index: number;
  collapsed: boolean;
  onExpand: () => void;
  onCollapse: () => void;
}

function StepEditor({
  servers,
  step,
  onChange,
  onRemove,
  index,
  collapsed,
  onExpand,
  onCollapse,
}: StepEditorProps) {
  const tools = allTools(servers);
  const server = servers.find((s) => s.id === step.serverId) ?? null;
  const toolDef = server && step.toolName ? findToolDef(server, step.toolName) : null;
  const inputSchema: JsonSchema = toolDef?.inputSchema ?? { type: 'object' };
  const hasSchemaFields = jsonSchemaHasProperties(inputSchema);
  const [jsonMode, setJsonMode] = useState(false);
  const [argsText, setArgsText] = useState(() => JSON.stringify(step.args, null, 2));
  const [argsError, setArgsError] = useState<string | null>(null);

  const showJsonEditor = !hasSchemaFields || jsonMode;

  function handleArgsChange(text: string) {
    setArgsText(text);
    try {
      const parsed = JSON.parse(text) as Record<string, unknown>;
      onChange({ ...step, args: parsed });
      setArgsError(null);
    } catch {
      setArgsError('Invalid JSON');
    }
  }

  function addAssertion() {
    const assertion: StepAssertion = { type: 'status', expected: 'success' };
    onChange({ ...step, assertions: [...step.assertions, assertion] });
  }

  function updateAssertion(i: number, updated: StepAssertion) {
    const assertions = step.assertions.map((a, idx) => (idx === i ? updated : a));
    onChange({ ...step, assertions });
  }

  function removeAssertion(i: number) {
    onChange({ ...step, assertions: step.assertions.filter((_, idx) => idx !== i) });
  }

  if (collapsed) {
    return (
      <div
        data-testid={`scenario-step-collapsed-${index}`}
        className="border border-zinc-800 rounded-lg px-3 py-2 flex items-center gap-2 min-h-[40px]"
      >
        <button
          type="button"
          onClick={onExpand}
          aria-expanded={false}
          aria-label={`Expand step ${index + 1}`}
          className="shrink-0 text-zinc-500 hover:text-zinc-200 rounded p-0.5 hover:bg-zinc-800 transition-colors"
        >
          <svg viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5" aria-hidden>
            <path
              fillRule="evenodd"
              d="M6.22 3.22a.75.75 0 0 1 1.06 0l4.25 4.25a.75.75 0 0 1 0 1.06L7.28 12.78a.75.75 0 0 1-1.06-1.06L9.94 8 6.22 4.28a.75.75 0 0 1 0-1.06Z"
              clipRule="evenodd"
            />
          </svg>
        </button>
        <span className="text-[11px] font-medium text-zinc-500 shrink-0">Step {index + 1}</span>
        <span className="text-xs text-zinc-300 truncate flex-1 min-w-0" title={stepSummaryLine(servers, step)}>
          {stepSummaryLine(servers, step)}
        </span>
        <button
          type="button"
          onClick={onRemove}
          className="text-zinc-600 hover:text-red-400 transition-colors text-xs shrink-0"
        >
          Remove
        </button>
      </div>
    );
  }

  return (
    <div className="border border-zinc-800 rounded-lg p-3 space-y-2.5">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <button
            type="button"
            onClick={onCollapse}
            aria-expanded
            aria-label={`Collapse step ${index + 1}`}
            className="shrink-0 text-zinc-500 hover:text-zinc-200 rounded p-0.5 hover:bg-zinc-800 transition-colors"
          >
            <svg viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5" aria-hidden>
              <path
                fillRule="evenodd"
                d="M4.22 6.22a.75.75 0 0 1 1.06 0L8 8.94l2.72-2.72a.75.75 0 1 1 1.06 1.06l-3.25 3.25a.75.75 0 0 1-1.06 0L4.22 7.28a.75.75 0 0 1 0-1.06Z"
                clipRule="evenodd"
              />
            </svg>
          </button>
          <span className="text-[11px] font-medium text-zinc-400">Step {index + 1}</span>
        </div>
        <button
          type="button"
          onClick={onRemove}
          className="text-zinc-600 hover:text-red-400 transition-colors text-xs shrink-0"
        >
          Remove
        </button>
      </div>

      {/* Tool selector */}
      <div className="space-y-1">
        <label className="block text-[10px] text-zinc-500 uppercase tracking-wide">Tool</label>
        <Select
          value={`${step.serverId}::${step.toolName}`}
          onChange={(value) => {
            const [serverId, toolName] = value.split('::');
            onChange({ ...step, serverId: serverId ?? '', toolName: toolName ?? '', args: {} });
            setJsonMode(false);
            setArgsText('{}');
            setArgsError(null);
          }}
          options={[
            { value: '::', label: '— select tool —' },
            ...tools.map((t) => ({
              value: `${t.serverId}::${t.toolName}`,
              label: `${t.serverName} / ${t.toolName}`,
            })),
          ]}
          aria-label="Tool"
          testId={`scenario-step-tool-select-${index}`}
          className="w-full"
        />
      </div>

      {/* Args — same SchemaForm as Invoke when the tool lists properties */}
      <div className="space-y-1">
        <div className="flex items-center justify-between gap-2">
          <label className="block text-[10px] text-zinc-500 uppercase tracking-wide">
            {showJsonEditor ? 'Arguments (JSON)' : 'Arguments'}
          </label>
          {hasSchemaFields && !jsonMode && (
            <button
              type="button"
              onClick={() => {
                setJsonMode(true);
                setArgsText(JSON.stringify(step.args, null, 2));
                setArgsError(null);
              }}
              className="text-[10px] text-violet-400 hover:text-violet-300 transition-colors shrink-0"
            >
              Edit as JSON
            </button>
          )}
          {hasSchemaFields && jsonMode && (
            <button
              type="button"
              onClick={() => {
                try {
                  const parsed = JSON.parse(argsText) as Record<string, unknown>;
                  onChange({ ...step, args: parsed });
                  setJsonMode(false);
                  setArgsError(null);
                } catch {
                  setArgsError('Invalid JSON');
                }
              }}
              className="text-[10px] text-violet-400 hover:text-violet-300 transition-colors shrink-0"
            >
              Form fields
            </button>
          )}
        </div>
        {showJsonEditor ? (
          <>
            <textarea
              data-testid={`scenario-step-args-json-${index}`}
              rows={4}
              value={argsText}
              onChange={(e) => handleArgsChange(e.target.value)}
              className={[
                'w-full bg-zinc-950 border rounded-md px-2 py-1.5 text-xs font-mono text-zinc-200 focus:outline-none resize-y',
                argsError ? 'border-red-600' : 'border-zinc-700 focus:border-violet-500',
              ].join(' ')}
              spellCheck={false}
            />
            {argsError && <p className="text-red-400 text-[10px]">{argsError}</p>}
          </>
        ) : (
          <div
            data-testid={`scenario-step-args-form-${index}`}
            className="rounded-md border border-zinc-800/80 bg-zinc-950/40 p-3"
          >
            <SchemaForm
              schema={inputSchema}
              values={step.args}
              onChange={(key, v) => onChange({ ...step, args: { ...step.args, [key]: v } })}
            />
          </div>
        )}
      </div>

      {/* Assertions */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <label className="text-[10px] text-zinc-500 uppercase tracking-wide">Assertions</label>
          <button
            type="button"
            onClick={addAssertion}
            className="text-[10px] text-violet-400 hover:text-violet-300 transition-colors"
          >
            + Add
          </button>
        </div>
        {step.assertions.map((assertion, i) => (
          <AssertionEditor
            key={i}
            assertion={assertion}
            index={i}
            onChange={(updated) => updateAssertion(i, updated)}
            onRemove={() => removeAssertion(i)}
          />
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Assertion editor
// ---------------------------------------------------------------------------

function AssertionEditor({
  assertion,
  index,
  onChange,
  onRemove,
}: {
  assertion: StepAssertion;
  index: number;
  onChange: (a: StepAssertion) => void;
  onRemove: () => void;
}) {
  return (
    <div className="flex items-start gap-2 bg-zinc-900/60 rounded-md p-2">
      <Select
        value={assertion.type}
        onChange={(value) => {
          const type = value as StepAssertion['type'];
          if (type === 'status') onChange({ type, expected: 'success' });
          else if (type === 'field_exists') onChange({ type, path: '' });
          else if (type === 'field_missing') onChange({ type, path: '' });
          else if (type === 'json_path_equals') onChange({ type, path: '', expected: '' });
          else if (type === 'contains_text') onChange({ type, text: '' });
        }}
        options={[
          { value: 'status', label: 'Status' },
          { value: 'field_exists', label: 'Field exists' },
          { value: 'field_missing', label: 'Field missing' },
          { value: 'json_path_equals', label: 'JSON path equals' },
          { value: 'contains_text', label: 'Contains text' },
        ]}
        aria-label="Assertion type"
        testId={`scenario-assertion-type-select-${index}`}
        className="shrink-0"
      />

      {/* Type-specific inputs */}
      {assertion.type === 'status' && (
        <Select
          value={assertion.expected}
          onChange={(value) => onChange({ ...assertion, expected: value as 'success' | 'error' })}
          options={[
            { value: 'success', label: 'success' },
            { value: 'error', label: 'error' },
          ]}
          aria-label="Expected status"
          testId={`scenario-assertion-status-select-${index}`}
          className="flex-1"
        />
      )}

      {(assertion.type === 'field_exists' || assertion.type === 'field_missing') && (
        <input
          type="text"
          placeholder="dot.path"
          value={assertion.path}
          onChange={(e) => onChange({ ...assertion, path: e.target.value })}
          className="flex-1 bg-zinc-800 border border-zinc-700 rounded px-1.5 py-1 text-[11px] font-mono text-zinc-300 focus:outline-none focus:border-violet-500"
        />
      )}

      {assertion.type === 'json_path_equals' && (
        <>
          <input
            type="text"
            placeholder="dot.path"
            value={assertion.path}
            onChange={(e) => onChange({ ...assertion, path: e.target.value })}
            className="flex-1 bg-zinc-800 border border-zinc-700 rounded px-1.5 py-1 text-[11px] font-mono text-zinc-300 focus:outline-none focus:border-violet-500"
          />
          <input
            type="text"
            placeholder="expected value"
            value={typeof assertion.expected === 'string' ? assertion.expected : JSON.stringify(assertion.expected)}
            onChange={(e) => {
              let val: unknown = e.target.value;
              try { val = JSON.parse(e.target.value) as unknown; } catch { /* keep string */ }
              onChange({ ...assertion, expected: val });
            }}
            className="flex-1 bg-zinc-800 border border-zinc-700 rounded px-1.5 py-1 text-[11px] font-mono text-zinc-300 focus:outline-none focus:border-violet-500"
          />
        </>
      )}

      {assertion.type === 'contains_text' && (
        <input
          type="text"
          placeholder="search text"
          value={assertion.text}
          onChange={(e) => onChange({ ...assertion, text: e.target.value })}
          className="flex-1 bg-zinc-800 border border-zinc-700 rounded px-1.5 py-1 text-[11px] text-zinc-300 focus:outline-none focus:border-violet-500"
        />
      )}

      <button
        type="button"
        onClick={onRemove}
        className="text-zinc-600 hover:text-red-400 text-[11px] shrink-0 mt-0.5"
      >
        ×
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main panel
// ---------------------------------------------------------------------------

export function ScenarioRunnerPanel({ servers, onClose, onCallTool }: Props) {
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [activeScenarioId, setActiveScenarioId] = useState<string | null>(null);
  /** Step ids with expanded editors. Adding a step collapses all others (set becomes only the new id). */
  const [expandedStepIds, setExpandedStepIds] = useState<Set<string>>(() => new Set());
  const [runResults, setRunResults] = useState<Map<string, ScenarioRun>>(new Map());
  const [running, setRunning] = useState<string | null>(null);
  const [newName, setNewName] = useState('');

  const activeScenario = scenarios.find((s) => s.id === activeScenarioId) ?? null;

  function expandLastStepOfScenario(scenario: Scenario) {
    setExpandedStepIds(
      scenario.steps.length > 0
        ? new Set([scenario.steps[scenario.steps.length - 1].id])
        : new Set(),
    );
  }

  function handleSelectScenario(scenario: Scenario) {
    setActiveScenarioId(scenario.id);
    expandLastStepOfScenario(scenario);
  }

  function handleCreate() {
    const name = newName.trim() || 'New Scenario';
    const scenario = createScenario(name);
    setScenarios((prev) => [...prev, scenario]);
    handleSelectScenario(scenario);
    setNewName('');
  }

  function handleUpdateScenario(updated: Scenario) {
    setScenarios((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
  }

  function handleAddStep() {
    if (!activeScenario) return;
    const step: ScenarioStep = {
      id: makeStepId(),
      serverId: '',
      toolName: '',
      args: {},
      assertions: [{ type: 'status', expected: 'success' }],
    };
    handleUpdateScenario(addStep(activeScenario, step));
    setExpandedStepIds(new Set([step.id]));
  }

  function handleUpdateStep(stepId: string, updated: ScenarioStep) {
    if (!activeScenario) return;
    handleUpdateScenario({
      ...activeScenario,
      steps: activeScenario.steps.map((s) => (s.id === stepId ? updated : s)),
    });
  }

  function handleRemoveStep(stepId: string) {
    if (!activeScenario) return;
    const nextSteps = activeScenario.steps.filter((s) => s.id !== stepId);
    handleUpdateScenario({
      ...activeScenario,
      steps: nextSteps,
    });
    setExpandedStepIds((prev) => {
      const next = new Set(prev);
      next.delete(stepId);
      if (next.size === 0 && nextSteps.length > 0) {
        next.add(nextSteps[nextSteps.length - 1].id);
      }
      return next;
    });
  }

  const allStepsHaveTool =
    !!activeScenario &&
    activeScenario.steps.length > 0 &&
    activeScenario.steps.every((s) => s.serverId && s.toolName);

  const handleRun = useCallback(async () => {
    if (!activeScenario || running || !allStepsHaveTool) return;
    setRunning(activeScenario.id);
    try {
      const run = await runScenario(activeScenario, async (step) => {
        try {
          const result = await onCallTool(step.serverId, step.toolName, cleanToolArgs(step.args));
          return { status: 'success', result };
        } catch (err) {
          return {
            status: 'error',
            error: err instanceof Error ? err.message : String(err),
          };
        }
      });
      setRunResults((prev) => new Map(prev).set(activeScenario.id, run));
    } finally {
      setRunning(null);
    }
  }, [activeScenario, running, onCallTool, allStepsHaveTool]);

  const currentRun = activeScenario ? runResults.get(activeScenario.id) : null;

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      // Select portals its listbox to `document.body`; close that first — do not dismiss this panel.
      if (document.querySelector('[role="listbox"]')) return;
      onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        data-selectable
        data-testid="scenario-runner-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="scenario-runner-title"
        className="relative flex flex-col bg-zinc-900 border border-zinc-700/80 rounded-xl shadow-2xl w-full max-w-4xl mx-4 h-[84vh] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800/80 shrink-0">
          <div>
            <h2 id="scenario-runner-title" className="text-sm font-semibold text-zinc-100">
              Scenario Runner
            </h2>
            <p className="text-xs text-zinc-500 mt-0.5 max-w-2xl">
              Build ordered tool-call chains, run them, and inspect pass/fail per step.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-zinc-500 hover:text-zinc-200 transition-colors rounded-md p-1 hover:bg-zinc-800"
            aria-label="Close scenario runner"
          >
            <svg viewBox="0 0 16 16" fill="currentColor" className="w-4 h-4" aria-hidden>
              <path d="M3.72 3.72a.75.75 0 0 1 1.06 0L8 6.94l3.22-3.22a.75.75 0 1 1 1.06 1.06L9.06 8l3.22 3.22a.75.75 0 1 1-1.06 1.06L8 9.06l-3.22 3.22a.75.75 0 0 1-1.06-1.06L6.94 8 3.72 4.78a.75.75 0 0 1 0-1.06Z" />
            </svg>
          </button>
        </div>

        <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Sidebar — scenario list */}
        <div className="w-56 shrink-0 border-r border-zinc-800 flex flex-col min-h-0">
          <div className="px-3 pt-3 pb-2 border-b border-zinc-800 shrink-0">
            <h3 className="text-[11px] font-semibold tracking-[0.08em] uppercase text-zinc-500">Scenarios</h3>
          </div>

          {/* New scenario form */}
          <div className="p-2 border-b border-zinc-800/60 flex gap-1">
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleCreate(); }}
              placeholder="Scenario name…"
              className="flex-1 bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-xs text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-violet-500"
            />
            <button
              type="button"
              onClick={handleCreate}
              className="px-2 py-1 bg-violet-600 hover:bg-violet-500 text-white text-xs rounded transition-colors"
            >
              +
            </button>
          </div>

          {/* Scenario list */}
          <div className="flex-1 overflow-y-auto py-1">
            {scenarios.length === 0 && (
              <p className="px-3 py-4 text-xs text-zinc-600 text-center">No scenarios yet</p>
            )}
            {scenarios.map((scenario) => {
              const run = runResults.get(scenario.id);
              return (
                <button
                  key={scenario.id}
                  type="button"
                  onClick={() => handleSelectScenario(scenario)}
                  className={[
                    'w-full text-left px-3 py-2 text-xs transition-colors',
                    scenario.id === activeScenarioId
                      ? 'bg-zinc-800 text-zinc-100'
                      : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50',
                  ].join(' ')}
                >
                  <div className="flex items-center gap-1.5">
                    {run && (
                      <span className={run.status === 'pass' ? 'text-green-400' : 'text-red-400'}>
                        {run.status === 'pass' ? '✓' : '✗'}
                      </span>
                    )}
                    <span className="truncate">{scenario.name}</span>
                  </div>
                  <span className="text-zinc-600 text-[10px]">{scenario.steps.length} steps</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Main pane */}
        <div className="flex-1 flex flex-col min-w-0 min-h-0">
          {!activeScenario ? (
            <div className="flex-1 flex items-center justify-center text-zinc-600 text-sm">
              Select or create a scenario
            </div>
          ) : (
            <>
              {/* Scenario header */}
              <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800 shrink-0">
                <div>
                  <h3 className="text-sm font-semibold text-zinc-100">{activeScenario.name}</h3>
                  <p className="text-[10px] text-zinc-500">{activeScenario.steps.length} steps</p>
                </div>
                <div className="flex items-center gap-2">
                  {currentRun && (
                    <span className={[
                      'text-xs font-medium px-2 py-1 rounded-md',
                      currentRun.status === 'pass'
                        ? 'bg-green-900/40 text-green-300'
                        : 'bg-red-900/40 text-red-300',
                    ].join(' ')}>
                      {currentRun.passCount}/{currentRun.passCount + currentRun.failCount} passed
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => void handleRun()}
                    disabled={
                      running === activeScenario.id ||
                      activeScenario.steps.length === 0 ||
                      !allStepsHaveTool
                    }
                    title={
                      !allStepsHaveTool && activeScenario.steps.length > 0
                        ? 'Choose a server and tool for every step before running'
                        : undefined
                    }
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-violet-600 hover:bg-violet-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs rounded-md transition-colors"
                  >
                    {running === activeScenario.id ? 'Running…' : '▶ Run'}
                  </button>
                </div>
              </div>

              {/* Steps + results */}
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {activeScenario.steps.length === 0 && (
                  <div className="text-center py-8 text-zinc-600 text-sm">
                    No steps yet. Add a step below.
                  </div>
                )}

                {activeScenario.steps.map((step, i) => (
                  <div key={step.id} className="space-y-2">
                    <StepEditor
                      servers={servers}
                      step={step}
                      index={i}
                      collapsed={!expandedStepIds.has(step.id)}
                      onExpand={() =>
                        setExpandedStepIds((prev) => new Set(prev).add(step.id))
                      }
                      onCollapse={() =>
                        setExpandedStepIds((prev) => {
                          const n = new Set(prev);
                          n.delete(step.id);
                          return n;
                        })
                      }
                      onChange={(updated) => handleUpdateStep(step.id, updated)}
                      onRemove={() => handleRemoveStep(step.id)}
                    />
                    {currentRun && (
                      <StepResultRow
                        result={
                          currentRun.stepResults.find((r) => r.stepId === step.id) ?? {
                            stepId: step.id,
                            pass: false,
                            assertionResults: [],
                          }
                        }
                      />
                    )}
                  </div>
                ))}

                <button
                  type="button"
                  onClick={handleAddStep}
                  className="w-full py-2 border border-dashed border-zinc-700 rounded-lg text-xs text-zinc-500 hover:text-zinc-300 hover:border-zinc-500 transition-colors"
                >
                  + Add Step
                </button>
              </div>
            </>
          )}
        </div>
        </div>
      </div>
    </div>
  );
}
