import { createHash } from 'node:crypto';
import { strFromU8, unzipSync } from 'fflate';
import { describe, expect, it, vi } from 'vitest';
import type { Supabase } from '../../lib/supabase';
import type { ProposalFileRow } from './api';
import { buildAttachmentsZip, manifestText, planZip, safeSegment, zipName } from './attachments';

const file = (over: Partial<ProposalFileRow>): ProposalFileRow => ({
  id: over.id ?? crypto.randomUUID(),
  proposal_id: 'p1',
  customer_id: 'c1',
  field_id: 'photo_front',
  kind: 'vehicle_front',
  storage_path: `c1/p1/${over.id ?? 'x'}.png`,
  mime: 'image/png',
  size: 3,
  original_name: 'photo.png',
  created_at: '2026-11-06T13:01:02Z',
  ...over,
});

describe('safeSegment', () => {
  it('removes characters Windows, macOS and zip tools reject', () => {
    expect(safeSegment('a/b\\c:d*e?f"g<h>i|j')).toBe('a b c d e f g h i j');
    expect(safeSegment('..hidden. ')).toBe('hidden');
    expect(safeSegment('\u0000\u001f')).toBe('file');
    expect(safeSegment('x'.repeat(200), 10)).toBe('xxxxxxxxxx');
  });
});

describe('planZip', () => {
  it('numbers files in upload order and labels them with the form question', () => {
    const plan = planZip(
      [
        file({
          id: 'b',
          field_id: 'photo_front',
          kind: 'vehicle_front',
          original_name: 'front.png',
          created_at: '2026-11-06T13:01:05Z',
        }),
        file({
          id: 'a',
          field_id: 'id_selfie',
          kind: 'id_selfie',
          original_name: 'face.png',
          created_at: '2026-11-06T13:01:02Z',
        }),
      ],
      'motor',
    );
    expect(plan.map((p) => p.name)).toEqual([
      '01 A photo of your face - face.png',
      '02 Front, with the number plate - front.png',
    ]);
  });

  it('falls back to the kind, keeps names unique and picks the extension from the type', () => {
    const plan = planZip(
      [
        file({
          id: 'a',
          field_id: 'gone',
          kind: 'proof_of_value',
          original_name: 'scan',
          mime: 'application/pdf',
        }),
        file({
          id: 'b',
          field_id: 'gone',
          kind: 'proof_of_value',
          original_name: 'scan',
          mime: 'application/pdf',
        }),
        file({ id: 'c', field_id: 'gone', kind: 'proof_of_value', original_name: null, mime: 'image/jpeg' }),
      ],
      undefined,
    );
    const names = plan.map((p) => p.name);
    expect(names[0]).toBe('01 Proof of value - scan.pdf');
    expect(names[1]).toBe('02 Proof of value - scan.pdf');
    expect(names[2]).toBe('03 Proof of value.jpg');
    expect(new Set(names.map((n) => n.toLowerCase())).size).toBe(names.length);
  });

  it('names the zip after the proposal', () => {
    expect(zipName('PRP-26-000027')).toBe('PRP-26-000027 documents.zip');
  });
});

describe('manifestText', () => {
  it('records each file and whether its fingerprint matched', () => {
    const f = file({ sha256: 'ab'.repeat(32) });
    const text = manifestText(
      'PRP-26-000001',
      [
        { name: '01 a.png', file: f, integrity: 'verified' },
        { name: '02 b.png', file: f, integrity: 'mismatch' },
        { name: '03 c.png', file: f, integrity: 'unrecorded' },
      ],
      new Date('2026-11-09T10:00:00Z'),
    );
    expect(text).toContain('proposal PRP-26-000001');
    expect(text).toContain('Downloaded 2026-11-09 10:00:00 UTC');
    expect(text).toContain(`checked (SHA-256 ${'ab'.repeat(32)})`);
    expect(text).toContain('DOES NOT MATCH');
    expect(text).toContain('none recorded at upload');
  });
});

describe('buildAttachmentsZip', () => {
  const bytes: Record<string, Uint8Array> = {
    'c1/p1/a.png': new Uint8Array([137, 80, 78, 71, 1, 2, 3]),
    'c1/p1/b.pdf': new TextEncoder().encode('%PDF-1.7 test'),
  };
  const sha = (b: Uint8Array) => createHash('sha256').update(b).digest('hex');
  const fakeSupabase = (fail?: string) =>
    ({
      storage: {
        from: () => ({
          download: vi.fn(async (path: string) =>
            path === fail || !bytes[path]
              ? { data: null, error: new Error('Object not found') }
              : { data: new Blob([bytes[path] as BlobPart]), error: null },
          ),
        }),
      },
    }) as unknown as Supabase;

  const rows = [
    file({
      id: 'a',
      field_id: 'id_selfie',
      kind: 'id_selfie',
      storage_path: 'c1/p1/a.png',
      original_name: 'face.png',
      sha256: sha(bytes['c1/p1/a.png']!),
    }),
    file({
      id: 'b',
      field_id: 'registration_document',
      kind: 'vehicle_registration',
      storage_path: 'c1/p1/b.pdf',
      mime: 'application/pdf',
      original_name: 'dvla.pdf',
      sha256: 'f'.repeat(64),
      created_at: '2026-11-06T13:02:00Z',
    }),
  ];

  it('packs every file byte-for-byte with a contents list, and flags a fingerprint mismatch', async () => {
    const progress: number[] = [];
    const zip = await buildAttachmentsZip(
      fakeSupabase(),
      { proposal_no: 'PRP-26-000027', form_id: 'motor' },
      rows,
      (d) => progress.push(d),
    );
    expect(zip.name).toBe('PRP-26-000027 documents.zip');
    expect(zip.count).toBe(2);
    expect(progress.at(-1)).toBe(2);
    const entries = unzipSync(zip.bytes);
    expect(Object.keys(entries).sort()).toEqual([
      '01 A photo of your face - face.png',
      '02 Vehicle registration document (DVLA) - dvla.pdf',
      'Contents.txt',
    ]);
    expect(entries['01 A photo of your face - face.png']).toEqual(bytes['c1/p1/a.png']);
    expect(entries['02 Vehicle registration document (DVLA) - dvla.pdf']).toEqual(bytes['c1/p1/b.pdf']);
    const contents = strFromU8(entries['Contents.txt']!);
    expect(contents).toContain('checked (SHA-256');
    expect(zip.mismatched).toEqual(['02 Vehicle registration document (DVLA) - dvla.pdf']);
  });

  it('fails as a whole (no partial zip) when any file cannot be read', async () => {
    await expect(
      buildAttachmentsZip(fakeSupabase('c1/p1/b.pdf'), { proposal_no: 'PRP-1' }, rows),
    ).rejects.toThrow(/dvla\.pdf.*could not be downloaded/);
  });

  it('refuses an empty set', async () => {
    await expect(buildAttachmentsZip(fakeSupabase(), { proposal_no: 'PRP-1' }, [])).rejects.toThrow(
      /no documents/,
    );
  });
});
