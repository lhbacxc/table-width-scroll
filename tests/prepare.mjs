import { build } from 'esbuild';
import { mkdir } from 'node:fs/promises';
export default async function prepare() {
  await mkdir('tests/.generated', { recursive: true });
  await build({
    entryPoints: ['tests/harness.ts'], bundle: true, format: 'iife', platform: 'browser',
    alias: { obsidian: './tests/mockObsidian.ts' }, outfile: 'tests/.generated/harness.js',
  });
}
