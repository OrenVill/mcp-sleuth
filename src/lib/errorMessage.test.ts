import { describe, expect, it } from 'vitest';
import { formatCrash } from './errorMessage';

describe('formatCrash', () => {
  it('uses the error message', () => {
    expect(formatCrash(new Error('boom')).detail).toBe('boom');
  });

  it('names the failing region when given context', () => {
    expect(formatCrash(new Error('boom'), 'The result pane').title).toBe(
      'The result pane stopped responding',
    );
  });

  it('falls back to a generic title without context', () => {
    expect(formatCrash(new Error('boom')).title).toBe('Something went wrong');
  });

  it('keeps the stack when there is one', () => {
    expect(formatCrash(new Error('boom')).stack).toContain('Error: boom');
  });

  it('truncates a huge message rather than flooding the UI', () => {
    // A server can return an enormous string; the boundary must stay readable.
    const detail = formatCrash(new Error('x'.repeat(5000))).detail;
    expect(detail.length).toBeLessThan(450);
    expect(detail.endsWith('…')).toBe(true);
  });

  it('handles a thrown string', () => {
    expect(formatCrash('plain failure').detail).toBe('plain failure');
  });

  it('handles a thrown object, null, and undefined', () => {
    for (const thrown of [{ nope: true }, null, undefined, 0]) {
      expect(formatCrash(thrown).detail).toBe('An unknown error occurred.');
    }
  });

  it('falls back to the error name when the message is empty', () => {
    const err = new Error('');
    expect(formatCrash(err).detail).toBe('Error');
  });
});
