import type { IncomingMessage, ServerResponse } from 'node:http';

export declare const APP_DATA_URL_PATH: string;
export declare function isAppDataRequest(url: string | undefined): boolean;
export declare function getAppDataFilePath(): string;
export declare function handleAppData(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void>;
