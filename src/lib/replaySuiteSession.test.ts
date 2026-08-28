import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  addSessionSuite,
  getSessionSuites,
  resetSessionSuites,
  setSessionSuites,
  subscribeSessionSuites,
} from './replaySuiteSession';
import type { ReplaySuite } from './replaySuites';

const suite = (id: string): ReplaySuite => ({ id, name: id, createdAt: 1, cases: [] });

beforeEach(() => {
  resetSessionSuites();
});

describe('replaySuiteSession', () => {
  it('starts empty', () => {
    expect(getSessionSuites()).toEqual([]);
  });

  it('adds a suite to the front', () => {
    addSessionSuite(suite('a'));
    addSessionSuite(suite('b'));
    expect(getSessionSuites().map((s) => s.id)).toEqual(['b', 'a']);
  });

  it('replaces the whole list', () => {
    addSessionSuite(suite('a'));
    setSessionSuites([suite('c')]);
    expect(getSessionSuites().map((s) => s.id)).toEqual(['c']);
  });

  it('notifies subscribers on change', () => {
    const listener = vi.fn();
    subscribeSessionSuites(listener);
    addSessionSuite(suite('a'));
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('stops notifying after unsubscribe', () => {
    const listener = vi.fn();
    subscribeSessionSuites(listener)();
    addSessionSuite(suite('a'));
    expect(listener).not.toHaveBeenCalled();
  });
});
