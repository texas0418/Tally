const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ['node_modules/**', 'ios/**', 'android/**', '.expo/**'],
  },
  {
    // Deterministic guards against common LLM failure modes:
    // sprawling functions, deep nesting, and unstructured complexity.
    rules: {
      // Compiler-powered rule; only exists in eslint-plugin-react-hooks v6+
      // (Expo SDK 57). Removed below automatically on SDK 54 (plugin v5).
      'react-hooks/purity': 'warn',
      complexity: ['error', 15],
      'max-depth': ['error', 5],
      'max-lines-per-function': [
        'error',
        { max: 300, skipBlankLines: true, skipComments: true },
      ],
      'max-lines': ['error', { max: 1000, skipBlankLines: true, skipComments: true }],
    },
  },
]);
