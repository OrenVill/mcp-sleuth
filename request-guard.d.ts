import type { IncomingMessage, ServerResponse } from 'node:http';

export interface LocalRequestGuardOptions {
  /** The host the server was bound to, when it is not a loopback literal. */
  host?: string;
  /** The port the server listens on. Omit to skip the port check. */
  port?: number | string;
  /** Extra hostnames an operator has allowlisted. */
  allowedHosts?: string[];
  /** Demand `application/json`, so the request cannot be a CORS simple request. */
  requireJson?: boolean;
}

export type LocalRequestVerdict =
  | { ok: true }
  | { ok: false; reason: 'host' | 'origin' | 'content-type' };

export declare const REFUSED_MESSAGE: string;
export declare function allowedHostsFromEnv(env?: NodeJS.ProcessEnv): string[];
export declare function isAllowedHost(
  req: IncomingMessage,
  options?: LocalRequestGuardOptions,
): boolean;
export declare function isSameOriginRequest(req: IncomingMessage): boolean;
export declare function guardLocalRequest(
  req: IncomingMessage,
  options?: LocalRequestGuardOptions,
): LocalRequestVerdict;
export declare function refuseLocalRequest(res: ServerResponse): void;
