import { describe, expect, test, beforeEach } from 'vitest';
import {
  createEmptyJournal,
  upsertToolAnnotation,
  addInvocationObservation,
  setTrustDecision,
  exportJournalMarkdown,
  mergeJournalServerName,
} from './observationJournal';

describe('observationJournal', () => {
  let journal: ReturnType<typeof createEmptyJournal>;

  beforeEach(() => {
    journal = createEmptyJournal('srv-1', 'Fixture');
  });

  test('createEmptyJournal starts unset with no annotations', () => {
    expect(journal.decision).toBe('unset');
    expect(journal.toolAnnotations).toEqual([]);
    expect(journal.invocationObservations).toEqual([]);
  });

  test('upsertToolAnnotation adds and updates notes', () => {
    const j1 = upsertToolAnnotation(journal, 'search', { note: 'Looks safe', flagged: false });
    expect(j1.toolAnnotations).toHaveLength(1);
    const j2 = upsertToolAnnotation(j1, 'search', { note: 'Re-reviewed', flagged: true });
    expect(j2.toolAnnotations).toHaveLength(1);
    expect(j2.toolAnnotations[0].note).toBe('Re-reviewed');
    expect(j2.toolAnnotations[0].flagged).toBe(true);
  });

  test('addInvocationObservation appends with unique ids', () => {
    const j1 = addInvocationObservation(journal, { toolName: 'ping', note: 'OK', flagged: false });
    const j2 = addInvocationObservation(j1, { toolName: 'ping', note: 'Slow', flagged: true });
    expect(j2.invocationObservations).toHaveLength(2);
    expect(j2.invocationObservations[0].id).not.toBe(j2.invocationObservations[1].id);
  });

  test('setTrustDecision records reason and timestamp', () => {
    const j = setTrustDecision(journal, 'approved', 'Manual review passed');
    expect(j.decision).toBe('approved');
    expect(j.decisionReason).toBe('Manual review passed');
    expect(j.decisionUpdatedAt).toBeTypeOf('number');
  });

  test('exportJournalMarkdown includes decision and tool notes', () => {
    let j = upsertToolAnnotation(journal, 'search', { note: 'Benign', flagged: false });
    j = setTrustDecision(j, 'needs_review', 'Pending security review');
    const md = exportJournalMarkdown(j);
    expect(md).toContain('Fixture');
    expect(md).toContain('needs_review');
    expect(md).toContain('search');
    expect(md).toContain('Benign');
  });

  test('mergeJournalServerName updates display name', () => {
    const j = mergeJournalServerName(journal, 'Renamed Server');
    expect(j.serverName).toBe('Renamed Server');
  });
});
