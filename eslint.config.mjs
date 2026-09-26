import { createRequire } from 'node:module';
import tseslint from 'typescript-eslint';
import polarityPlugin from './scripts/eslint-plugin-polarity.mjs';

const require = createRequire(import.meta.url);
const commentsBaseline = (() => {
  try {
    return require('./scripts/ci/comments.baseline.json');
  } catch {
    return {};
  }
})();

export default [
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/build/**',
      '**/build-rel/**',
      '**/.next/**',
      '**/coverage/**',
      '**/.cache/**',
      '**/.turbo/**',
      '**/.expo/**',
      '**/snapshots/**',
      '**/parity-web/**',
      '**/parity-diff/**',
    ],
  },
  {
    files: ['**/*.{js,mjs,cjs,ts,tsx}'],
    plugins: { polarity: polarityPlugin },
    linterOptions: { noInlineConfig: true },
    rules: { 'polarity/no-comments': 'error' },
  },
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: { parser: tseslint.parser },
  },
  ...(Object.keys(commentsBaseline).length
    ? [
        {
          files: Object.keys(commentsBaseline)
            .filter((f) => /\.(js|mjs|cjs|ts|tsx)$/.test(f))
            .map((f) => f.replace(/[\\[\]{}()*?!|,+@^$]/g, '\\$&')),
          rules: { 'polarity/no-comments': 'off' },
        },
      ]
    : []),
];
