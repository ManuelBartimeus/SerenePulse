#!/usr/bin/env node
// Fails if any built browser or Worker bundle contains a Supabase secret key (threat model C).
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import path from 'node:path';
import { root } from './lib/env.mjs';

const dirs = [
  'apps/portal/dist',
  'apps/survey-worker/dist',
  'apps/landing/dist',
  'apps/survey-worker/public',
].map((d) => path.join(root, d));
const SECRET_PREFIX = /sb_secret_[A-Za-z0-9_-]{10,}/;
const JWT = /eyJ[A-Za-z0-9_-]{10,}\.(eyJ[A-Za-z0-9_-]{10,})\.[A-Za-z0-9_-]{10,}/g;

function* files(dir) {
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) yield* files(p);
    else if (/\.(js|mjs|cjs|html|css|json|map|txt)$/.test(name)) yield p;
  }
}

const findings = [];
let scanned = 0;
for (const dir of dirs.filter(existsSync)) {
  for (const file of files(dir)) {
    scanned++;
    const text = readFileSync(file, 'utf8');
    if (SECRET_PREFIX.test(text)) findings.push(`${path.relative(root, file)}: sb_secret_ key`);
    for (const m of text.matchAll(JWT)) {
      try {
        const payload = JSON.parse(Buffer.from(m[1], 'base64url').toString('utf8'));
        if (payload.role === 'service_role') findings.push(`${path.relative(root, file)}: service_role JWT`);
      } catch {
        // not a JWT we can decode; ignore
      }
    }
  }
}

if (findings.length) {
  console.error('Secret keys found in built bundles:\n' + findings.map((f) => `  ! ${f}`).join('\n'));
  process.exit(1);
}
console.log(`Bundle scan clean (${scanned} files).`);
