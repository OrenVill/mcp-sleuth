import type { FilesHost } from '../types';

export const browserFilesHost: FilesHost = {
  saveFile() {
    throw new Error('browserFilesHost is not implemented yet');
  },
};
