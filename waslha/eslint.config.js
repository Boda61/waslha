import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist', 'functions', 'tools', 'node_modules', '*.log', 'build.log', 'lint.log']),
  {
    files: ['**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    rules: {
      // Intentional resets (e.g. on round change) — run with React 19 hooks lint
      // which flags synchronous setState in effects; these are deliberate.
      'react-hooks/set-state-in-effect': 'off',
      // Context files legitimately export a Provider + hook together.
      'react-refresh/only-export-components': 'off',
    },
  },
])

