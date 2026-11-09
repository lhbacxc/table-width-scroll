import * as esbuild from 'esbuild';
import { builtinModules } from 'node:module';
import { readFile } from 'node:fs/promises';

const license = await readFile(new URL('../LICENSE', import.meta.url), 'utf8');

const options = {
  entryPoints: ['src/main.ts'],
  bundle: true,
  platform: 'browser',
  format: 'cjs',
  target: 'es2021',
  external: ['obsidian', 'electron', '@codemirror/state', '@codemirror/view', ...builtinModules],
  outfile: 'main.js',
  banner: { js: `/*! Table Width Scroll\n${license.trim()}\n*/` },
  minify: !process.argv.includes('--watch'),
  logLevel: 'info',
};
if (process.argv.includes('--watch')) {
  const ctx = await esbuild.context({ ...options, sourcemap: 'inline' });
  await ctx.watch();
} else {
  await esbuild.build(options);
}
