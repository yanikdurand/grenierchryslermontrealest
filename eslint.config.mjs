import eslint from '@eslint/js'
import tseslint from 'typescript-eslint'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import globals from 'globals'

export default tseslint.config(
  { ignores: ['dist/**'] },
  {
    files: ['src/**/*.{ts,tsx}'],
    extends: [eslint.configs.recommended, ...tseslint.configs.recommended],
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'error',
      // Le contexte exporte aussi son hook, ce que Fast Refresh accepte ici.
      'react-refresh/only-export-components': 'off',
    },
  },
  {
    files: ['tests/**/*.mjs'],
    extends: [eslint.configs.recommended],
    languageOptions: {
      globals: { ...globals.node, ...globals.browser },
      sourceType: 'module',
    },
  },
  {
    files: ['vite.config.ts'],
    extends: [eslint.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: {
      globals: globals.node,
    },
  },
  {
    files: ['eslint.config.mjs'],
    extends: [eslint.configs.recommended],
    languageOptions: {
      globals: globals.node,
      sourceType: 'module',
    },
  },
)
