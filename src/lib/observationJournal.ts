import type { ServerEntry } from '../types';

export type TrustDecision = 'unset' | 'approved' | 'rejected' | 'needs_review';

export interface ToolAnnotation {
  toolName: string;
  note: string;
  flagged: boolean;
  updatedAt: number;
}

export interface InvocationObservation {
  id: string;
  toolName: string;
  note: string;
  flagged: boolean;
  timestamp: number;
}

export interface ObservationJournal {
  serverId: string;
  serverName: string;
  decision: TrustDecision;
  decisionReason?: string;
  decisionUpdatedAt?: number;
  generalNotes: string;
  toolAnnotations: ToolAnnotation[];
  invocationObservations: InvocationObservation[];
  updatedAt: number;
}

export type ObservationJournalsStore = Record<string, ObservationJournal>;

export function createEmptyJournal(serverId: string, serverName: string): ObservationJournal {
  const now = Date.now();
  return {
    serverId,
    serverName,
    decision: 'unset',
    generalNotes: '',
    toolAnnotations: [],
    invocationObservations: [],
    updatedAt: now,
  };
}

export function mergeJournalServerName(
  journal: ObservationJournal,
  serverName: string,
): ObservationJournal {
  return { ...journal, serverName, updatedAt: Date.now() };
}

export function upsertToolAnnotation(
  journal: ObservationJournal,
  toolName: string,
  patch: Pick<ToolAnnotation, 'note' | 'flagged'>,
): ObservationJournal {
  const now = Date.now();
  const existing = journal.toolAnnotations.find((a) => a.toolName === toolName);
  const next: ToolAnnotation = {
    toolName,
    note: patch.note,
    flagged: patch.flagged,
    updatedAt: now,
  };
  const toolAnnotations = existing
    ? journal.toolAnnotations.map((a) => (a.toolName === toolName ? next : a))
    : [...journal.toolAnnotations, next];

  return { ...journal, toolAnnotations, updatedAt: now };
}

export function addInvocationObservation(
  journal: ObservationJournal,
  input: Pick<InvocationObservation, 'toolName' | 'note' | 'flagged'>,
): ObservationJournal {
  const entry: InvocationObservation = {
    id: `obs-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    toolName: input.toolName,
    note: input.note,
    flagged: input.flagged,
    timestamp: Date.now(),
  };
  return {
    ...journal,
    invocationObservations: [entry, ...journal.invocationObservations].slice(0, 200),
    updatedAt: Date.now(),
  };
}

export function setTrustDecision(
  journal: ObservationJournal,
  decision: Exclude<TrustDecision, 'unset'>,
  reason: string,
): ObservationJournal {
  const now = Date.now();
  return {
    ...journal,
    decision,
    decisionReason: reason.trim() || undefined,
    decisionUpdatedAt: now,
    updatedAt: now,
  };
}

export function setGeneralNotes(journal: ObservationJournal, generalNotes: string): ObservationJournal {
  return { ...journal, generalNotes, updatedAt: Date.now() };
}

export function ensureJournal(
  store: ObservationJournalsStore,
  server: Pick<ServerEntry, 'id' | 'name'>,
): ObservationJournal {
  const existing = store[server.id];
  if (existing) {
    if (existing.serverName !== server.name) {
      return mergeJournalServerName(existing, server.name);
    }
    return existing;
  }
  return createEmptyJournal(server.id, server.name);
}

export function exportJournalMarkdown(journal: ObservationJournal): string {
  const lines: string[] = [
    `# Observation Journal — ${journal.serverName}`,
    '',
    `**Server ID:** \`${journal.serverId}\``,
    `**Last updated:** ${new Date(journal.updatedAt).toISOString()}`,
    '',
    '## Trust decision',
    '',
  ];

  if (journal.decision === 'unset') {
    lines.push('_No decision recorded yet._');
  } else {
    lines.push(`- **Status:** ${journal.decision}`);
    if (journal.decisionReason) lines.push(`- **Reason:** ${journal.decisionReason}`);
    if (journal.decisionUpdatedAt) {
      lines.push(`- **Decided at:** ${new Date(journal.decisionUpdatedAt).toISOString()}`);
    }
  }

  lines.push('', '## General notes', '', journal.generalNotes.trim() || '_None_', '');

  lines.push('## Tool annotations', '');
  if (journal.toolAnnotations.length === 0) {
    lines.push('_None_');
  } else {
    for (const ann of journal.toolAnnotations) {
      const flag = ann.flagged ? ' ⚠️ flagged' : '';
      lines.push(`### \`${ann.toolName}\`${flag}`, '', ann.note.trim() || '_Empty note_', '');
    }
  }

  lines.push('## Invocation observations', '');
  if (journal.invocationObservations.length === 0) {
    lines.push('_None_');
  } else {
    lines.push('| When | Tool | Flagged | Note |', '| --- | --- | --- | --- |');
    for (const obs of journal.invocationObservations) {
      const when = new Date(obs.timestamp).toISOString();
      const flagged = obs.flagged ? 'yes' : 'no';
      const note = obs.note.replace(/\|/g, '\\|').replace(/\n/g, ' ');
      lines.push(`| ${when} | \`${obs.toolName}\` | ${flagged} | ${note} |`);
    }
  }

  lines.push('');
  return lines.join('\n');
}

export function decisionLabel(decision: TrustDecision): string {
  switch (decision) {
    case 'unset':
      return 'Not decided';
    case 'approved':
      return 'Approved';
    case 'rejected':
      return 'Rejected';
    case 'needs_review':
      return 'Needs review';
  }
}
