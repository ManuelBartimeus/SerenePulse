import { describe, expect, it } from 'vitest';
import { formatBytes } from './format';

describe('formatBytes', () => {
  it('uses binary units', () => {
    expect(formatBytes(null)).toBe('—');
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(524288000)).toBe('500.0 MB');
    expect(formatBytes(1073741824)).toBe('1.00 GB');
  });
});
