import js from '@eslint/js';
import { FlatCompat } from '@eslint/eslintrc';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import pluginVue from 'eslint-plugin-vue';
import prettierConfig from 'eslint-config-prettier';
import tseslint from 'typescript-eslint';
import vueParser from 'vue-eslint-parser';

const compat = new FlatCompat({
  baseDirectory: path.dirname(fileURLToPath(import.meta.url)),
});

export default [
  { ignores: ['dist', 'node_modules'] },
  js.configs.recommended,
  ...compat
    .extends('airbnb-base')
    .map((config) => ({ ...config, files: ['src/**/*.{js,ts}'] })),
  ...pluginVue.configs['flat/recommended'],
  ...tseslint.configs.recommended,
  {
    files: ['**/*.vue'],
    languageOptions: {
      parser: vueParser,
      parserOptions: {
        parser: tseslint.parser,
        extraFileExtensions: ['.vue'],
      },
    },
  },
  {
    rules: {
      'vue/multi-word-component-names': 'off',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_' },
      ],
      'import/extensions': 'off',
      'import/no-unresolved': 'off',
      'import/prefer-default-export': 'off',
      'no-alert': 'off',
      'no-await-in-loop': 'off',
      'no-continue': 'off',
      'no-nested-ternary': 'off',
      'no-param-reassign': 'off',
      'no-restricted-syntax': 'off',
      'no-return-assign': 'off',
      'no-shadow': 'off',
      'no-use-before-define': 'off',
      'prefer-destructuring': 'off',
      'consistent-return': 'off',
    },
  },
  prettierConfig,
];
