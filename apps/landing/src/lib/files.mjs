// Size and type of the downloadable proposal forms in src/downloads/.
import { statSync } from 'node:fs';
import { dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const DOWNLOADS_DIR = join(dirname(fileURLToPath(import.meta.url)), '../downloads');

const TYPES = { '.pdf': 'PDF', '.docx': 'Word document' };

export function fileInfo(name) {
  const bytes = statSync(join(DOWNLOADS_DIR, name)).size;
  const size =
    bytes >= 1_000_000
      ? `${(bytes / 1_000_000).toFixed(1)} MB`
      : `${Math.max(1, Math.round(bytes / 1000))} KB`;
  return { name, bytes, size, type: TYPES[extname(name)] ?? extname(name).slice(1).toUpperCase() };
}
