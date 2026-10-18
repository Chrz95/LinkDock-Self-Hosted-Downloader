import typescriptParser from '@typescript-eslint/parser';
import react from 'eslint-plugin-react';
import unsupportedRules from './unsupported-rules.json' with { type: 'json' };

/** Oxlint 1.88 cannot run these five requested rules; ESLint supplies their exact original values. */
export default [
  {
    files: ['src/**/*.{ts,tsx}', 'server/**/*.ts', 'shared/**/*.ts', 'tests/**/*.{ts,tsx}'],
    languageOptions: { parser: typescriptParser, parserOptions: { ecmaFeatures: { jsx: true } } },
    plugins: { react },
    settings: { react: { version: '19.3' } },
    rules: unsupportedRules,
  },
];
