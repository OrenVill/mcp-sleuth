/**
 * Bookmarks, call history, and observation journals, stored gzip-compressed at the
 * same path the CLI uses (`getAppDataFilePath()`), so both share one file.
 */
import { gunzip, gzip } from 'node:zlib';
import { promisify } from 'node:util';
import { dirname } from 'node:path';

const gzipAsync = promisify(gzip);
const gunzipAsync = promisify(gunzip);

export function createAppDataStore({ fs, filePath }) {
  return {
    async read() {
      try {
        const compressed = await fs.readFile(filePath);
        return JSON.parse((await gunzipAsync(compressed)).toString('utf8'));
      } catch {
        return null;
      }
    },

    async write(data) {
      await fs.mkdir(dirname(filePath), { recursive: true });
      await fs.writeFile(filePath, await gzipAsync(Buffer.from(JSON.stringify(data), 'utf8')));
    },
  };
}
