/**
 * init.js — roxul Project Scaffolding
 *
 * Scaffolds a new roxul project by copying template files from the
 * shipped `src/defaultProject/` directory into the target location.
 */

import { join, resolve, relative, dirname } from 'node:path';
import {
    readFileSync, readdirSync, writeFileSync,
    mkdirSync, existsSync,
} from 'node:fs';
import { PACKAGE_ROOT } from './package.js';

/**
 * Load init templates from the defaultProject folder shipped with roxul.
 *
 * Returns a flat map of relative paths (using forward slashes) to file contents.
 *
 * @returns {Object.<string, string>}
 */
function getInitTemplates() {
    const templateRoot = join(PACKAGE_ROOT, 'src', 'defaultProject');
    const templates = {};

    function walk(dir) {
        const entries = readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
            const fullPath = join(dir, entry.name);
            if (entry.isDirectory()) {
                walk(fullPath);
            } else if (entry.isFile()) {
                const relPath = relative(templateRoot, fullPath).replace(/\\/g, '/');
                const content = readFileSync(fullPath, 'utf-8');
                templates[relPath] = content;
            }
        }
    }

    if (existsSync(templateRoot)) {
        walk(templateRoot);
    }
    return templates;
}

/**
 * Scaffold a new roxul project in the given directory.
 *
 * @param {string} dir      - Target directory (default: process.cwd())
 * @param {object} [opts]
 * @param {boolean} [opts.force] - Overwrite existing files (default: false)
 * @param {object}  [opts.log]   - Logger (default: console)
 */
export function initProject(dir, opts = {}) {
    const targetDir = resolve(dir || process.cwd());
    const log       = opts.log || console;
    const force     = opts.force || false;

    log.info('');
    log.info('  ╔══════════════════════════════════════╗');
    log.info('  ║   roxul — Init Project               ║');
    log.info('  ╚══════════════════════════════════════╝');
    log.info('');
    log.info(`  Scaffolding project in: ${targetDir}`);
    log.info('');

    let created = 0;
    let skipped = 0;

    const templates = getInitTemplates();
    for (const [filePath, content] of Object.entries(templates)) {
        const fullPath = join(targetDir, filePath);
        const dirPath  = dirname(fullPath);

        if (existsSync(fullPath) && !force) {
            log.info(`  ⏭️  ${filePath}  (already exists)`);
            skipped++;
            continue;
        }

        if (!existsSync(dirPath)) mkdirSync(dirPath, { recursive: true });
        writeFileSync(fullPath, content, 'utf-8');
        log.info(`  ✅  ${filePath}`);
        created++;
    }

    log.info('');
    log.info(
        `  Created ${created} file(s)` +
            (skipped > 0 ? ` (${skipped} skipped)` : ''),
    );
    log.info('');
    log.info('  Next steps:');
    log.info('    1. Run  roxul build to build the project');
    log.info('    2. Run  roxul serve to start the dev server');
    log.info('    3. Edit files in  src/ and components/');
    log.info('');
}
