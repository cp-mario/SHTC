/**
 * init.js — roxul Project Scaffolding
 *
 * Scaffolds a new roxul project by copying template files from the
 * shipped `src/defaultProject/` directory into the target location.
 */

import { join, resolve, relative, dirname, readFileSync, readdirSync, writeFileSync, mkdirSync, existsSync } from './runtime.js';
import { PACKAGE_ROOT } from './package.js';
import { bold, green, yellow, cyan, dim } from './color.js';

/**
 * Load init templates from the defaultProject folder shipped with roxul.
 *
 * Returns a flat map of relative paths (using forward slashes) to file contents.
 *
 * @param {object} [opts]
 * @param {boolean} [opts.noExample] - Skip example files inside components/ and src/
 * @returns {Object.<string, string>}
 */
function getInitTemplates(opts = {}) {
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
                // Skip example files inside components/ or src/ when --noExample is set
                if (opts.noExample && (relPath.startsWith('components/') || relPath.startsWith('src/'))) {
                    continue;
                }
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
 * @param {boolean} [opts.force]     - Overwrite existing files (default: false)
 * @param {boolean} [opts.noExample] - Skip example files inside components/ and src/
 * @param {object}  [opts.log]       - Logger (default: console)
 */
export function initProject(dir, opts = {}) {
    const targetDir = resolve(dir || process.cwd());
    const log       = opts.log || console;
    const force     = opts.force || false;
    const noExample = opts.noExample || false;

    log.info('');
    log.info(`  ${bold('roxul')} — ${cyan('Init Project')}`);
    log.info('');
    log.info(`  ${cyan('Target:')} ${targetDir}`);
    log.info('');

    let created = 0;
    let skipped = 0;

    const templates = getInitTemplates({ noExample });
    for (const [filePath, content] of Object.entries(templates)) {
        const fullPath = join(targetDir, filePath);
        const dirPath  = dirname(fullPath);

        if (existsSync(fullPath) && !force) {
            log.info(`  ${yellow('↻')} ${filePath}  (already exists)`);
            skipped++;
            continue;
        }

        if (!existsSync(dirPath)) mkdirSync(dirPath, { recursive: true });
        writeFileSync(fullPath, content, 'utf-8');
        log.info(`  ${green('+')} ${filePath}`);
        created++;
    }

    // When --noExample is set, create empty components/ and src/ directories
    // (and any subdirectories found in the template) so the project structure
    // is ready without example files.
    if (noExample) {
        const templateRoot = join(PACKAGE_ROOT, 'src', 'defaultProject');
        function ensureEmptyDirs(dir) {
            const entries = readdirSync(dir, { withFileTypes: true });
            for (const entry of entries) {
                const fullPath = join(dir, entry.name);
                if (entry.isDirectory()) {
                    const relPath = relative(templateRoot, fullPath).replace(/\\/g, '/');
                    const targetPath = join(targetDir, relPath);
                    if (!existsSync(targetPath)) {
                        mkdirSync(targetPath, { recursive: true });
                        log.info(`  ${dim('+')} ${dim(relPath + '/')}`);
                    }
                    ensureEmptyDirs(fullPath);
                }
            }
        }
        // Only create directories that are inside components/ or src/
        const topDirs = ['components', 'src'];
        for (const dirName of topDirs) {
            const srcDir = join(templateRoot, dirName);
            if (existsSync(srcDir)) {
                const targetPath = join(targetDir, dirName);
                if (!existsSync(targetPath)) {
                    mkdirSync(targetPath, { recursive: true });
                    log.info(`  ${dim('+')} ${dim(dirName + '/')}`);
                }
                ensureEmptyDirs(srcDir);
            }
        }
    }

    log.info('');
    log.info(
        `  ${green(`Created ${created} file(s)`)}` +
            (skipped > 0 ? ` ${yellow(`(${skipped} skipped)`)}` : ''),
    );
    log.info('');
    log.info('  Next steps:');
    log.info('    1. Run  roxul build to build the project');
    log.info('    2. Run  roxul serve to start the dev server');
    log.info('    3. Edit files in  src/ and components/');
    log.info('');
}
