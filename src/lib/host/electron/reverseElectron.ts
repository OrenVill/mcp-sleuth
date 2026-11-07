import {
  registerBridgedReverseRequest,
} from '../../mcpReverseRequests';
import { recordInboundProtocolTrace } from '../../protocolTrace';
import type { ElectronBridge } from './mcpElectron';

export function bindElectronReverseBridge(bridge: ElectronBridge): () => void {
  const onReversePending = bridge.onReversePending;
  const onReverseInbound = bridge.onReverseInbound;
  if (!onReversePending && !onReverseInbound) return () => {};

  const unsubs: Array<() => void> = [];

  if (onReversePending) {
    unsubs.push(
      onReversePending((payload) => {
        recordInboundProtocolTrace({
          serverId: payload.serverId,
          method: payload.method,
          params: payload.params,
          status: 'pending',
        });
        registerBridgedReverseRequest({
          id: payload.id,
          serverId: payload.serverId,
          kind: payload.kind,
          method: payload.method,
          params: payload.params,
          complete: async (result, errorMessage) => {
            if (errorMessage) {
              await bridge.invoke('mcp:reverseReject', payload.id, errorMessage);
              recordInboundProtocolTrace({
                serverId: payload.serverId,
                method: payload.method,
                params: payload.params,
                status: 'error',
                error: errorMessage,
              });
              return;
            }
            await bridge.invoke('mcp:reverseResolve', payload.id, result);
            recordInboundProtocolTrace({
              serverId: payload.serverId,
              method: payload.method,
              params: payload.params,
              status: 'ok',
              result,
            });
          },
        });
      }),
    );
  }

  if (onReverseInbound) {
    unsubs.push(
      onReverseInbound((entry) => {
        recordInboundProtocolTrace({
          serverId: entry.serverId,
          method: entry.method,
          params: entry.params,
          status: 'ok',
        });
      }),
    );
  }

  return () => {
    for (const u of unsubs) u();
  };
}
