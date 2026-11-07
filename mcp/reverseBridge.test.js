import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  configureReverseBridgeHandlers,
  getMcpRoots,
  rejectReverseApproval,
  resolveReverseApproval,
  setMcpRoots,
  waitForReverseApproval,
} from './reverseBridge.js';

describe('reverseBridge', () => {
  beforeEach(() => {
    setMcpRoots([{ uri: 'file:///', name: 'Filesystem root' }]);
  });

  it('stores editable roots', () => {
    setMcpRoots([{ uri: 'file:///tmp', name: 'Tmp' }]);
    expect(getMcpRoots()).toEqual([{ uri: 'file:///tmp', name: 'Tmp' }]);
  });

  it('waits for renderer approval', async () => {
    const push = vi.fn();
    configureReverseBridgeHandlers({ pushPending: push, pushInbound: () => {} });
    const pending = waitForReverseApproval({
      serverId: 's1',
      kind: 'elicitation',
      method: 'elicitation/create',
      params: { message: 'ok?' },
    });
    expect(push).toHaveBeenCalledTimes(1);
    const id = push.mock.calls[0][0].id;
    resolveReverseApproval(id, { action: 'accept', content: { confirm: true } });
    await expect(pending).resolves.toEqual({ action: 'accept', content: { confirm: true } });
  });

  it('rejects on deny', async () => {
    const push = vi.fn();
    configureReverseBridgeHandlers({ pushPending: push, pushInbound: () => {} });
    const pending = waitForReverseApproval({
      serverId: 's1',
      kind: 'sampling',
      method: 'sampling/createMessage',
      params: {},
    });
    const id = push.mock.calls[0][0].id;
    rejectReverseApproval(id, 'nope');
    await expect(pending).rejects.toThrow(/nope/);
  });
});
