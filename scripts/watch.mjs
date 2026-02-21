#!/usr/bin/env node
/**
 * scripts/watch.mjs
 *
 * Two esbuild watch contexts running in parallel:
 *   1. extension  → dist/extension.js   (CJS, Node)
 *   2. webview    → media/chat.js       (IIFE, browser)
 *
 * Prints [watch] build started / [watch] build finished so VS Code
 * tasks.json problemMatcher can signal completion to the Extension Host.
 */

import esbuild from 'esbuild';

const notifyPlugin = (label) => ({
  name: 'watch-notify',
  setup(build) {
    build.onStart(() => process.stdout.write(`[watch] build started\n`));
    build.onEnd((result) => {
      for (const err of result.errors) {
        const loc = err.location;
        const where = loc ? `  ${loc.file}:${loc.line}:${loc.column}:\n` : '';
        process.stderr.write(`✘ [ERROR][${label}] ${err.text}\n${where}`);
      }
      process.stdout.write(`[watch] build finished\n`);
    });
  },
});

// 1. Extension host bundle
const extCtx = await esbuild.context({
  entryPoints: ['./src/extension.ts'],
  bundle: true,
  outfile: 'dist/extension.js',
  external: ['vscode'],
  format: 'cjs',
  platform: 'node',
  sourcemap: true,
  keepNames: true,
  plugins: [notifyPlugin('ext')],
});

// 2. Webview bundle (browser, IIFE — no require/import at runtime)
const webviewCtx = await esbuild.context({
  entryPoints: ['./src/webview/index.ts'],
  bundle: true,
  outfile: 'media/chat.js',
  format: 'iife',
  platform: 'browser',
  target: ['es2020'],
  minify: false,
  keepNames: true,
  plugins: [notifyPlugin('webview')],
});

await Promise.all([extCtx.watch(), webviewCtx.watch()]);
