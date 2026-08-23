import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'

export default [
  { ignores: ['dist/**', 'assets/**', 'server/**', 'node_modules/**', 'public/**', '.vercel/**'] },
  {
    files: ['**/*.{js,jsx}'],
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...js.configs.recommended.rules,
      ...reactHooks.configs.flat.recommended.rules,
      ...reactRefresh.configs.vite.rules,
      // eslint-plugin-reactを入れない軽量構成ではJSX内参照をcore ruleが解決できない。
      'no-unused-vars': 'off',
      // 日本語UI文言では意図した全角スペースを使う。
      'no-irregular-whitespace': 'off',
      // 既存アプリは永続化データをeffect内で復元する設計。
      'react-hooks/set-state-in-effect': 'off',
    },
    languageOptions: {
      ecmaVersion: 'latest',
      globals: {
        ...globals.browser,
        ...globals.node,
        __BUILD_ID__: 'readonly',
      },
      parserOptions: {
        ecmaVersion: 'latest',
        ecmaFeatures: { jsx: true },
        sourceType: 'module',
      },
    },
  },
]
