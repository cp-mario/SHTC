/**
 * builder.js — roxul Build Engine
 *
 * Orchestrates a full build: loading config, cleaning the output directory,
 * and walking the source tree to produce the final site.
 */

import { resolve } from 'node:path';
import { existsSync, rmSync, mkdirSync } from 'node:fs';
import { loadConfig } from './config.js';
import { processDirectory } from './processor.js';

/**
 * Run a full roxul build.
 *
 * @param {object}  [opts]
 * @param {string}  [opts.input]    - Input directory (default: 'src' or from config)
 * @param {string}  [opts.output]   - Output directory (default: 'output' or from config)
 * @param {string}  [opts.root]     - Project root (default: process.cwd())
 * @param {boolean} [opts.clean]    - Clean output directory first (default: true)
 * @param {object}  [opts.log]      - Logger { info, warn } (default: console)
 * @returns {Promise<{ inputDir: string, outputDir: string }>}
 */
export async function build(opts = {}) {
    const projectRoot = resolve(opts.root || process.cwd());
    const config      = loadConfig(projectRoot);
    const baseRoot    = config.baseRoot || projectRoot;
    const log         = opts.log || console;

    const inputDir  = resolve(baseRoot, opts.input || config.input);
    const outputDir = resolve(baseRoot, opts.output || config.output);

    // ── Header ───────────────────────────────────────────────────────────────
    log.info('');
    log.info('  ╔══════════════════════════════════════╗');
    log.info('  ║   roxul                              ║');
    log.info('  ║   Static site generator (build-time) ║');
    log.info('  ╚══════════════════════════════════════╝');
    log.info('');
    log.info(`  Input:   ${inputDir}`);
    log.info(`  Output:  ${outputDir}`);
    if (config.configPath) log.info(`  Config:  ${config.configPath}`);
    log.info('');

    // ── Validate ─────────────────────────────────────────────────────────────
    if (!existsSync(inputDir)) {
        log.warn(`[roxul] Input directory does not exist: ${inputDir}`);
        log.warn('       Create it or change "input" in config.cfg');
        return { inputDir, outputDir };
    }

    // ── Clean & prepare output ──────────────────────────────────────────────
    if (opts.clean !== false) {
        if (existsSync(outputDir)) {
            rmSync(outputDir, { recursive: true, force: true });
        }
    }
    if (!existsSync(outputDir)) {
        mkdirSync(outputDir, { recursive: true });
    }

    // ── Process ──────────────────────────────────────────────────────────────
    log.info('  Processing files...\n');
    processDirectory(inputDir, inputDir, outputDir, baseRoot, log);

    log.info('');
    log.info('  ✨ Build complete!');
    log.info(`  Output: ${outputDir}`);
    log.info('');

    return { inputDir, outputDir };
}
