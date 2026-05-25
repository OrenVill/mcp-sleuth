import { useState, useCallback } from 'react';
import type { ServerEntry } from '../types';
import {
  createScenario,
  addStep,
  runScenario,
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

function makeStepId(): string {
  return `step-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
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
}

function StepEditor({ servers, step, onChange, onRemove, index }: StepEditorProps) {
  const tools = allTools(servers);
  const [argsText, setArgsText] = useState(() => JSON.stringify(step.args, null, 2));
  const [argsError, setArgsError] = useState<string | null>(null);

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

  return (
    <div className="border border-zinc-800 rounded-lg p-3 space-y-2.5">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-medium text-zinc-400">Step {index + 1}</span>
        <button
          type="button"
          onClick={onRemove}
          className="text-zinc-600 hover:text-red-400 transition-colors text-xs"
        >
          Remove
        </button>
      </div>

      {/* Tool selector */}
      <div className="space-y-1">
        <label className="block text-[10px] text-zinc-500 uppercase tracking-wide">Tool</label>
        <select
          value={`${step.serverId}::${step.toolName}`}
          onChange={(e) => {
            const [serverId, toolName] = e.target.value.split('::');
            onChange({ ...step, serverId: serverId ?? '', toolName: toolName ?? '' });
          }}
          className="w-full bg-zinc-900 border border-zinc-700 rounded-md px-2 py-1.5 text-xs text-zinc-200 focus:outline-none focus:border-violet-500"
        >
          <option value="::">— select tool —</option>
          {tools.map((t) => (
            <option key={`${t.serverId}::${t.toolName}`} value={`${t.serverId}::${t.toolName}`}>
              {t.serverName} / {t.toolName}
            </option>
          ))}
        </select>
      </div>

      {/* Args */}
      <div className="space-y-1">
        <label className="block text-[10px] text-zinc-500 uppercase tracking-wide">
          Arguments (JSON)
        </label>
        <textarea
          rows={3}
          value={argsText}
          onChange={(e) => handleArgsChange(e.target.value)}
          className={[
            'w-full bg-zinc-950 border rounded-md px-2 py-1.5 text-xs font-mono text-zinc-200 focus:outline-none resize-y',
            argsError ? 'border-red-600' : 'border-zinc-700 focus:border-violet-500',
          ].join(' ')}
          spellCheck={false}
        />
        {argsError && <p className="text-red-400 text-[10px]">{argsError}</p>}
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
  onChange,
  onRemove,
}: {
  assertion: StepAssertion;
  onChange: (a: StepAssertion) => void;
  onRemove: () => void;
}) {
  return (
    <div className="flex items-start gap-2 bg-zinc-900/60 rounded-md p-2">
      <select
        value={assertion.type}
        onChange={(e) => {
          const type = e.target.value as StepAssertion['type'];
          if (type === 'status') onChange({ type, expected: 'success' });
          else if (type === 'field_exists') onChange({ type, path: '' });
          else if (type === 'field_missing') onChange({ type, path: '' });
          else if (type === 'json_path_equals') onChange({ type, path: '', expected: '' });
          else if (type === 'contains_text') onChange({ type, text: '' });
        }}
        className="bg-zinc-800 border border-zinc-700 rounded px-1.5 py-1 text-[11px] text-zinc-300 focus:outline-none focus:border-violet-500 shrink-0"
      >
        <option value="status">Status</option>
        <option value="field_exists">Field exists</option>
        <option value="field_missing">Field missing</option>
        <option value="json_path_equals">JSON path equals</option>
        <option value="contains_text">Contains text</option>
      </select>

      {/* Type-specific inputs */}
      {assertion.type === 'status' && (
        <select
          value={assertion.expected}
          onChange={(e) => onChange({ ...assertion, expected: e.target.value as 'success' | 'error' })}
          className="flex-1 bg-zinc-800 border border-zinc-700 rounded px-1.5 py-1 text-[11px] text-zinc-300 focus:outline-none focus:border-violet-500"
        >
          <option value="success">success</option>
          <option value="error">error</option>
        </select>
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
  const [runResults, setRunResults] = useState<Map<string, ScenarioRun>>(new Map());
  const [running, setRunning] = useState<string | null>(null);
  const [newName, setNewName] = useState('');

  const activeScenario = scenarios.find((s) => s.id === activeScenarioId) ?? null;

  function handleCreate() {
    const name = newName.trim() || 'New Scenario';
    const scenario = createScenario(name);
    setScenarios((prev) => [...prev, scenario]);
    setActiveScenarioId(scenario.id);
    setNewName('');
  }

  function handleUpdateScenario(updated: Scenario) {
    setScenarios((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
  }

  function handleAddStep() {
    if (!activeScenario) return;
    const firstTool = allTools(servers)[0];
    const step: ScenarioStep = {
      id: makeStepId(),
      serverId: firstTool?.serverId ?? '',
      toolName: firstTool?.toolName ?? '',
      args: {},
      assertions: [{ type: 'status', expected: 'success' }],
    };
    handleUpdateScenario(addStep(activeScenario, step));
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
    handleUpdateScenario({
      ...activeScenario,
      steps: activeScenario.steps.filter((s) => s.id !== stepId),
    });
  }

  const handleRun = useCallback(async () => {
    if (!activeScenario || running) return;
    setRunning(activeScenario.id);
    try {
      const run = await runScenario(activeScenario, async (step) => {
        try {
          const result = await onCallTool(step.serverId, step.toolName, step.args);
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
  }, [activeScenario, running, onCallTool]);

  const currentRun = activeScenario ? runResults.get(activeScenario.id) : null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="relative flex bg-zinc-900 border border-zinc-700/80 rounded-xl shadow-2xl w-full max-w-4xl mx-4 max-h-[90vh] overflow-hidden">
        {/* Sidebar — scenario list */}
        <div className="w-56 shrink-0 border-r border-zinc-800 flex flex-col">
          <div className="px-3 pt-4 pb-3 border-b border-zinc-800 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-zinc-100">Scenarios</h2>
            <button
              type="button"
              onClick={onClose}
              className="text-zinc-500 hover:text-zinc-200 transition-colors rounded-md p-1 -mr-1"
              aria-label="Close"
            >
              <svg viewBox="0 0 16 16" fill="currentColor" className="w-4 h-4" aria-hidden>
                <path d="M3.72 3.72a.75.75 0 0 1 1.06 0L8 6.94l3.22-3.22a.75.75 0 1 1 1.06 1.06L9.06 8l3.22 3.22a.75.75 0 1 1-1.06 1.06L8 9.06l-3.22 3.22a.75.75 0 0 1-1.06-1.06L6.94 8 3.72 4.78a.75.75 0 0 1 0-1.06Z" />
              </svg>
            </button>
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
                  onClick={() => setActiveScenarioId(scenario.id)}
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
        <div className="flex-1 flex flex-col min-w-0 max-h-[90vh]">
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
                    disabled={running === activeScenario.id || activeScenario.steps.length === 0}
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
  );
}
