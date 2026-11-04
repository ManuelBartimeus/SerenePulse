// Shared .env parsing for the repo scripts. Values are never logged by anything in scripts/.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const envPath = path.join(root, '.env');

/** Parses KEY=value lines, strips trailing ` # comments`, expands ${OTHER} references. */
export function parseEnv(text) {
  const raw = {};
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=(.*)$/);
    if (!m) continue;
    raw[m[1]] = m[2]
      .replace(/\s+#.*$/, '')
      .trim()
      .replace(/^"(.*)"$/, '$1');
  }
  const expand = (v, depth = 0) =>
    depth > 5 ? v : v.replace(/\$\{([A-Z0-9_]+)\}/g, (_, k) => expand(raw[k] ?? '', depth + 1));
  return Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, expand(v)]));
}

export function readEnv() {
  return parseEnv(readFileSync(envPath, 'utf8'));
}

/** Picks KEY_STAGING / KEY_PRODUCTION for an environment, falling back to the shared KEY. */
export function forEnv(env, key, target) {
  return env[`${key}_${target.toUpperCase()}`] ?? env[key] ?? '';
}
