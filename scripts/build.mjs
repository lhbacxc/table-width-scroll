import * as esbuild from 'esbuild';
import { builtinModules } from 'node:module';

const options = {
  entryPoints: ['src/main.ts'],
  bundle: true,
  platform: 'browser',
  format: 'cjs',
  target: 'es2021',
  external: ['obsidian', 'electron', '@codemirror/state', '@codemirror/view', ...builtinModules],
  outfile: 'main.js',
  banner: { js: '/*! Table Width Scroll | MIT | Includes adaptations of Gridlock Tables (c) 2026 Michael Sciscenti. See LICENSE and THIRD_PARTY_NOTICES.md. */' },
  minify: !process.argv.includes('--watch'),
  logLevel: 'info',
};
if (process.argv.includes('--watch')) {
  const ctx = await esbuild.context({ ...options, sourcemap: 'inline' });
  await ctx.watch();
} else {
  await esbuild.build(options);
}
