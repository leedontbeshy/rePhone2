import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';

export function createConfig({ tsconfigRootDir }) {
  return tseslint.config(
    {
      ignores: [
        '**/node_modules/**',
        '**/.next/**',
        '**/.next-*/**',
        '**/.sandbox-dist/**',
        '**/.local/**',
        '**/secrets/**',
        '**/.turbo/**',
        '**/dist/**',
        '**/.test-dist/**',
        '**/coverage/**',
        '**/src/generated/**',
        '**/src/schema.d.ts',
        'docs/**',
        'handbook/**',
        'uml/**',
        '.understand-anything/**',
        'output/**',
      ],
    },
    eslint.configs.recommended,
    ...tseslint.configs.strictTypeChecked,
    {
      files: ['**/*.ts', '**/*.tsx', '**/*.mts'],
      languageOptions: {
        parserOptions: {
          projectService: true,
          tsconfigRootDir,
        },
      },
      rules: {
        '@typescript-eslint/consistent-type-imports': [
          'error',
          { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
        ],
        '@typescript-eslint/no-explicit-any': 'error',
        '@typescript-eslint/no-floating-promises': 'error',
        '@typescript-eslint/no-misused-promises': 'error',
        '@typescript-eslint/no-extraneous-class': ['error', { allowWithDecorator: true }],
      },
    },
    {
      files: ['**/*.js', '**/*.mjs'],
      ...tseslint.configs.disableTypeChecked,
      languageOptions: {
        ...tseslint.configs.disableTypeChecked.languageOptions,
        globals: {
          console: 'readonly',
          process: 'readonly',
          URL: 'readonly',
        },
      },
    },
  );
}
