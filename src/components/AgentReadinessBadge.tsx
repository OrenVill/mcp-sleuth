import { readinessLabel, type AgentReadinessVerdict } from '../lib/agentReadiness';

interface Props {
  score: number;
  verdict: AgentReadinessVerdict;
  compact?: boolean;
}

function badgeClass(verdict: AgentReadinessVerdict): string {
  switch (verdict) {
    case 'excellent':
      return 'border-emerald-700/70 bg-emerald-950/40 text-emerald-200';
    case 'agent-ready':
      return 'border-sky-700/70 bg-sky-950/40 text-sky-200';
    case 'needs-work':
      return 'border-amber-700/70 bg-amber-950/40 text-amber-200';
    case 'not-ready':
      return 'border-red-800/70 bg-red-950/40 text-red-200';
  }
}

export function AgentReadinessBadge({ score, verdict, compact = false }: Props) {
  const label = readinessLabel(verdict);

  return (
    <span
      title={`Agent Readiness: ${label} (${score})`}
      className={[
        'inline-flex shrink-0 items-center rounded-full border font-mono font-medium',
        compact ? 'px-1.5 py-0.5 text-[10px]' : 'px-2 py-1 text-[11px]',
        badgeClass(verdict),
      ].join(' ')}
    >
      {compact ? score : `${score} ${label}`}
    </span>
  );
}
