import typescript from 'rollup-plugin-typescript2';

export default [
  {
    input: 'src/index.ts',
    output: ['cjs', 'esm'].map((format) => ({
      file: `dist/${format}/index.js`,
      format,
      name: 'google-iap-auth',
      sourcemap: true,
      exports: 'named',
    })),
    external: ['fs', 'https', 'jwt-simple', 'lodash.camelcase'],
    plugins: [typescript({ useTsconfigDeclarationDir: true })],
  },
];
