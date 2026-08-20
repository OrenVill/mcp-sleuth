import type { FilesHost } from '../types';

/** Same-origin HTTP path; Node/Vite serve the app-data file (see `app-data-handler.js`). */
const APP_DATA_PATH = '/__app_data';

export const browserFilesHost: FilesHost = {
  saveFile(filename, content, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  },

  // A 404 means "nothing stored yet" and must stay distinguishable from a failure:
  // the caller migrates localStorage data on null, but keeps localStorage as the
  // source of truth when the request throws.
  async readAppData() {
    const res = await fetch(APP_DATA_PATH, { headers: { Accept: 'application/json' } });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`App data read failed (${res.status})`);
    return (await res.json()) as unknown;
  },

  async writeAppData(data) {
    const res = await fetch(APP_DATA_PATH, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error(`App data write failed (${res.status})`);
  },
};
