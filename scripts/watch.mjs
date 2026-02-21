#!/usr/bin/env node
/**
 * scripts/watch.mjs
 *
 * esbuild watch wrapper that prints the exact markers VS Code tasks.json
 * problemMatcher listens for:
 *   [watch] build started
 *   [watch] build finished
 *
 * Without these markers the preLaunchTask in launch.json never signals
 * completion and the Extension Host does not start correctly.
 */

import esbuild from 'esbuild';

const ctx = await esbuild.context({
  entryPoints: ['./src/extension.ts'],
  bundle: true,
  outfile: 'dist/extension.js',
  external: ['vscode'],
  format: 'cjs',
  platform: 'node',
  sourcemap: true,
  keepNames: true,
  plugins: [
    {
      name: 'watch-notify',
      setup(build) {
        build.onStart(() => {
          process.stdout.write('[watch] build started\n');
        });
        build.onEnd((result) => {
          for (const err of result.errors) {
            const loc = err.location;
            if (loc) {
              process.stderr.write(`✘ [ERROR] ${err.text}\n`);
              process.stderr.write(`  ${loc.file}:${loc.line}:${loc.column}:\n`);
            } else {
              process.stderr.write(`✘ [ERROR] ${err.text}\n`);
            }
          }
          process.stdout.write('[watch] build finished\n');
        });
      },
    },
  ],
});

await ctx.watch();
