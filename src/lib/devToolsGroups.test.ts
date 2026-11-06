import { describe, expect, it } from 'vitest';
import { tabToDevToolsGroup } from './devToolsGroups';

describe('tabToDevToolsGroup', () => {
  it('maps protocol and reverse to traffic', () => {
    expect(tabToDevToolsGroup('protocol')).toBe('traffic');
    expect(tabToDevToolsGroup('reverse')).toBe('traffic');
  });

  it('maps replay, schema, contract to testing', () => {
    expect(tabToDevToolsGroup('replay')).toBe('testing');
    expect(tabToDevToolsGroup('schema')).toBe('testing');
    expect(tabToDevToolsGroup('contract')).toBe('testing');
  });

  it('maps trust evaluators to trust', () => {
    expect(tabToDevToolsGroup('permission')).toBe('trust');
    expect(tabToDevToolsGroup('readiness')).toBe('trust');
  });
});
