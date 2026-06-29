#!/usr/bin/env node
/**
 * roxul
 * =============================
 *
 * Entry point. Re-exports the public API and runs the CLI.
 *
 * Usage (CLI):
 *   roxul build        Build the project
 *   roxul serve        Start dev server with auto-rebuild
 *   roxul dev          Alias for serve
 *   roxul init         Scaffold a new project
 *   roxul --help       Show help
 *   roxul --version    Show version
 *
 * Usage (programmatic):
 *   import { build, serve, initProject } from 'roxul';
 *   await build({ input: 'src', output: 'dist' });
 */

import { cli } from './src/scripts/cli.js';

export { build } from './src/scripts/builder.js';
export { serve } from './src/scripts/server.js';
export { initProject } from './src/scripts/init.js';
export { PACKAGE_ROOT, PKG_VERSION } from './src/scripts/package.js';

cli(process.argv);
