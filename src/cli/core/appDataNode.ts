import { readFile } from 'node:fs/promises';
import { gunzip } from 'node:zlib';
import { promisify } from 'node:util';
import { getAppDataFilePath } from '../../../app-data-handler.js';
import { parseAppDataJson, type AppData } from '../../lib/appData';
import type { CallRecord } from '../../lib/history';

const gunzipAsync = promisify(gunzip);

export async function loadAppDataFromDisk(): Promise<AppData | null> {
  try {
    const compressed = await readFile(getAppDataFilePath());
    const json = (await gunzipAsync(compressed)).toString('utf8');
    return parseAppDataJson(JSON.parse(json) as unknown);
  } catch (err) {
    if (err && typeof err === 'object' && 'code' in err && err.code === 'ENOENT') {
      return null;
    }
    return null;
  }
}

export async function loadCallHistoryForServer(serverId: string): Promise<CallRecord[]> {
  const data = await loadAppDataFromDisk();
  if (!data) return [];
  return data.history.filter((rec) => rec.serverId === serverId);
}
