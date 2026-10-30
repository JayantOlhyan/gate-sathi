import nextConfig from 'eslint-config-next';
import prettierConfig from 'eslint-config-prettier';

const eslintConfig = [
  ...nextConfig,
  prettierConfig,
  {
    ignores: [
      '.next/**',
      'node_modules/**',
      'dist/**',
      'public/sw.js',
      'public/scrollcraft/**',
    ],
  },
];

export default eslintConfig;
