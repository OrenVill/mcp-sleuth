import { readFile } from 'node:fs/promises';
import { gunzip } from 'node:zlib';
import { promisify } from 'node:util';
import { getAppDataFilePath } from '../../../app-data-handler.js';
import type { CallRecord } from '../../lib/history';

const gunzipAsync = promisify(gunzip);

type AppDataBlob = {
  callHistory?: Record<string, CallRecord[]>;
};

export async function loadCallHistoryForServer(serverId: string): Promise<CallRecord[]> {
  try {
    const compressed = await readFile(getAppDataFilePath());
    const json = (await gunzipAsync(compressed)).toString('utf8');
    const data = JSON.parse(json) as AppDataBlob;
    return data.callHistory?.[serverId] ?? [];
  } catch {
    return [];
  }
}
