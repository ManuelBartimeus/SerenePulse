import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['**/dist/**', '**/.wrangler/**', '**/node_modules/**', 'supabase/functions/**', 'coverage/**'],
  },
  js.configs.recommended,
  ...tseslint.configs.strict,
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      // Free text from customers is rendered as text only (threat model A, XSS).
      'no-restricted-properties': ['error', { property: 'innerHTML', message: 'Render text, never HTML.' }],
    },
  },
  {
    files: ['scripts/**/*.mjs'],
    languageOptions: {
      globals: {
        process: 'readonly',
        console: 'readonly',
        Buffer: 'readonly',
        fetch: 'readonly',
        URL: 'readonly',
      },
    },
  },
);
