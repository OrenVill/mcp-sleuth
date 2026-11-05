import {
  CreateMessageRequestSchema,
  ElicitRequestSchema,
  ListRootsRequestSchema,
  LoggingMessageNotificationSchema,
  ProgressNotificationSchema,
} from '@modelcontextprotocol/sdk/types.js';
import type { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { listMcpRoots } from './mcpRoots';
import { enqueueReverseRequest } from './mcpReverseRequests';
import { recordInboundProtocolTrace } from './protocolTrace';

export const DETECTIVE_CLIENT_CAPABILITIES = {
  sampling: {},
  elicitation: { form: {} },
  roots: { listChanged: true },
};

export function attachReverseRequestHandlers(client: Client, serverId: string): void {
  client.setRequestHandler(ListRootsRequestSchema, async () => ({
    roots: listMcpRoots(),
  }));

  client.setRequestHandler(CreateMessageRequestSchema, async (request) => {
    const params = request.params;
    recordInboundProtocolTrace({
      serverId,
      method: 'sampling/createMessage',
      params,
    });
    return enqueueReverseRequest({
      serverId,
      kind: 'sampling',
      method: 'sampling/createMessage',
      params,
    }) as Promise<{
      model: string;
      role: 'assistant';
      content: { type: 'text'; text: string };
    }>;
  });

  client.setRequestHandler(ElicitRequestSchema, async (request) => {
    const params = request.params;
    if (params.mode && params.mode !== 'form') {
      return { action: 'decline' as const };
    }
    recordInboundProtocolTrace({
      serverId,
      method: 'elicitation/create',
      params,
    });
    const result = await enqueueReverseRequest({
      serverId,
      kind: 'elicitation',
      method: 'elicitation/create',
      params,
    });
    return result as { action: 'accept'; content: Record<string, unknown> } | { action: 'decline' };
  });

  client.setNotificationHandler(LoggingMessageNotificationSchema, (notification) => {
    recordInboundProtocolTrace({
      serverId,
      method: 'notifications/message',
      params: notification.params,
    });
  });

  client.setNotificationHandler(ProgressNotificationSchema, (notification) => {
    recordInboundProtocolTrace({
      serverId,
      method: 'notifications/progress',
      params: notification.params,
    });
  });
}
