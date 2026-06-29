/**
 * cli.js — roxul CLI Entry Point
 *
 * Parses command-line arguments and dispatches to the appropriate
 * sub-command (build, serve, init).
 */

import { build } from './builder.js';
import { serve } from './server.js';
import { initProject } from './init.js';
import { PKG_VERSION } from './package.js';
import { runtime, runtimeVersion } from './runtime.js';
import { red } from './color.js';

/** Human-readable runtime label for display (e.g. "Node v24.6.0", "Bun 1.2.3") */
const runtimeLabel =
    runtime === 'node' ? `Node ${runtimeVersion}`
    : runtime === 'bun' ? `Bun ${runtimeVersion}`
    : runtime === 'deno' ? `Deno ${runtimeVersion}`
    : `${runtime} ${runtimeVersion}`;

/**
 * Print the help / usage message.
 */
function printHelp() {
    console.log(`
  roxul v${PKG_VERSION} — running in ${runtimeLabel}

  Usage:
    roxul <command> [options]

  Commands:
    build             Build the project
    serve             Start dev server with live reload
    dev               Alias for serve
    init [directory]  Scaffold a new roxul project (The directory is optional, if its blank it will use the terminal location)

  Options:
    -h, --help        Show this help message (default)
    -v, --version     Show version number
    --port <port>     Port for dev server (default: 3000)
    --host <host>     Host for dev server (default: localhost)
    --input <dir>     Input directory (default: src or from config)
    --output <dir>    Output directory (default: output or from config)
    --no-clean        Don't clean output directory before build
    --force           Overwrite files on init
    -noExample        Init project without example files (empty components/ and src/ folders)

  Examples:
    roxul build
    roxul serve --port 8080
    roxul init my-project
    roxul init my-project -noExample
    roxul --help
`);
}

/** Print version, runtime, and working-directory banner */
function printBanner() {
    console.log(`  roxul v${PKG_VERSION} — running in ${runtimeLabel}`);
    console.log(`  Working directory: ${process.cwd()}`);
    console.log('');
}

/**
 * Parse CLI options for the `build` command.
 *
 * @param {string[]} args
 * @returns {object}
 */
function parseBuildOptions(args) {
    const opts = {};
    for (let i = 0; i < args.length; i++) {
        switch (args[i]) {
            case '--input':
                opts.input = args[++i];
                break;
            case '--output':
                opts.output = args[++i];
                break;
            case '--root':
                opts.root = args[++i];
                break;
            case '--no-clean':
                opts.clean = false;
                break;
        }
    }
    return opts;
}

/**
 * Parse CLI options for the `serve` / `dev` command.
 *
 * @param {string[]} args
 * @returns {object}
 */
function parseServeOptions(args) {
    const opts = {};
    for (let i = 0; i < args.length; i++) {
        switch (args[i]) {
            case '--port':
                opts.port = parseInt(args[++i], 10);
                break;
            case '--host':
                opts.host = args[++i];
                break;
            case '--input':
                opts.input = args[++i];
                break;
            case '--output':
                opts.output = args[++i];
                break;
            case '--root':
                opts.root = args[++i];
                break;
            case '--open':
                opts.open = true;
                break;
        }
    }
    return opts;
}

/**
 * CLI entry point. Parses `process.argv` and dispatches the command.
 *
 * @param {string[]} argv - Typically `process.argv`
 */
export function cli(argv) {
    const args = argv.slice(2);

    // ── Help / Version ───────────────────────────────────────────────────────
    if (args.length === 0) {
        printHelp();
        return;
    }

    if (args[0] === '--help' || args[0] === '-h') {
        printHelp();
        return;
    }

    if (args[0] === '--version' || args[0] === '-v') {
        console.log(`roxul v${PKG_VERSION} (${runtimeLabel})`);
        return;
    }

    if (args[0] === 'build') {
        printBanner();
        const opts = parseBuildOptions(args.slice(1));
        build(opts).catch((err) => console.error(`  ${red('✘')} ${err.message}`));
        return;
    }

    // ── Commands ─────────────────────────────────────────────────────────────
    const cmd = args[0];

    if (cmd === 'serve' || cmd === 'dev') {
        printBanner();
        const opts = parseServeOptions(args.slice(1));
        serve(opts).catch((err) => console.error(`  ${red('✘')} ${err.message}`));
        return;
    }

    if (cmd === 'init') {
        printBanner();
        const dir       = args[1] || process.cwd();
        const force     = args.includes('--force');
        const noExample = args.includes('-noExample');
        initProject(dir, { force, noExample });
        return;
    }

    // ── Unknown command ──────────────────────────────────────────────────────
    console.error(`\n  ${red('✘')} Unknown command: "${cmd}"\n`);
    printHelp();
    process.exit(1);
}
