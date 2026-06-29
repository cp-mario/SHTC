/**
 * processor.js — roxul HTML Processor
 *
 * Resolves <component> tags recursively in HTML files and
 * walks the source directory tree to produce the build output.
 */

import { readFileSync, readdirSync, writeFileSync, copyFileSync, existsSync, mkdirSync, join, relative, dirname } from './runtime.js';
import { MAX_COMPONENT_DEPTH } from './constants.js';
import { resolveComponentPath } from './resolver.js';
import { findComponentTags } from './parser.js';

/**
 * Process an HTML string: resolve all <component> tags recursively.
 *
 * @param {string} html         - Raw HTML
 * @param {string} projectRoot  - Project root for path resolution
 * @param {number} depth        - Recursion depth (internal)
 * @param {object} [log]        - Optional logger { info, warn }
 * @returns {string} Processed HTML
 */
export function processHtml(html, projectRoot, depth = 0, log = null) {
    const logger = log || console;

    if (depth > MAX_COMPONENT_DEPTH) {
        logger.warn(
            `[roxul] Max depth (${MAX_COMPONENT_DEPTH}) reached — possible circular reference.`,
        );
        return html;
    }

    const tags = findComponentTags(html);
    if (tags.length === 0) return html;

    let result = html;

    for (let i = tags.length - 1; i >= 0; i--) {
        const { start, end, src } = tags[i];
        const resolved = resolveComponentPath(src, projectRoot);

        if (!resolved.path) {
            logger.warn(`[roxul] Component not found: src="${src}"`);
            const comment = `\n<!-- roxul: component not found "${src}" -->\n`;
            result = result.slice(0, start) + comment + result.slice(end);
            continue;
        }

        let content;
        try {
            content = readFileSync(resolved.path, 'utf-8');
        } catch (err) {
            logger.warn(`[roxul] Error reading component "${src}": ${err.message}`);
            const comment = `\n<!-- roxul: error reading component "${src}" -->\n`;
            result = result.slice(0, start) + comment + result.slice(end);
            continue;
        }

        // Replace %%placeholder%% tokens with the corresponding attribute values
        const { attrs } = tags[i];
        content = content.replace(/%%([^%]+)%%/g, (match, name) => {
            return name in attrs ? attrs[name] : match;
        });

        content = processHtml(content, projectRoot, depth + 1, logger);

        // ── Indentation handling ─────────────────────────────────────────────
        // Preserve original indentation of the <component> tag and prepend it
        // to each line of the inserted content.
        let lineStart = result.lastIndexOf('\n', start - 1);
        let baseIndent = '';
        if (lineStart !== -1) {
            const beforeTag = result.slice(lineStart + 1, start);
            const m = beforeTag.match(/^[ \t]*/);
            baseIndent = m ? m[0] : '';
        } else {
            const beforeTag = result.slice(0, start);
            const m = beforeTag.match(/^[ \t]*/);
            baseIndent = m ? m[0] : '';
        }

        // Remove common leading indentation from the component content to avoid
        // double indentation on the first line.
        const lines = content.split('\n');
        let minIndent = null;
        for (const l of lines) {
            if (l.trim() === '') continue;
            const m = l.match(/^[ \t]*/);
            const indent = m ? m[0].length : 0;
            if (minIndent === null || indent < minIndent) minIndent = indent;
        }
        const dedentedLines = lines.map((l) => {
            if (minIndent && l.length >= minIndent) {
                return l.slice(minIndent);
            }
            return l;
        });

        // Build the final content: first line stays as-is, subsequent lines
        // get the baseIndent prefixed.
        let indentedContent = '';
        if (dedentedLines.length > 0) {
            indentedContent = dedentedLines[0];
            if (dedentedLines.length > 1) {
                const rest = dedentedLines
                    .slice(1)
                    .map((line) => baseIndent + line)
                    .join('\n');
                indentedContent += '\n' + rest;
            }
        }

        result = result.slice(0, start) + indentedContent + result.slice(end);

        if (logger.info) {
            const indent = '  '.repeat(depth + 1);
            logger.info(`${indent}├─ ${relative(projectRoot, resolved.path)}`);
        }
    }

    return result;
}

/**
 * Recursively process a directory: build HTML files, copy non-HTML assets.
 *
 * @param {string} rootDir      - Root input directory (for computing relative paths)
 * @param {string} currentDir   - Current directory being processed
 * @param {string} outputDir    - Output directory root
 * @param {string} projectRoot  - Project root for component resolution
 * @param {object} log          - Logger { info, warn }
 */
export function processDirectory(rootDir, currentDir, outputDir, projectRoot, log) {
    let entries;
    try {
        entries = readdirSync(currentDir, { withFileTypes: true });
    } catch (err) {
        log.warn(`[roxul] Error reading directory "${currentDir}": ${err.message}`);
        return;
    }

    for (const entry of entries) {
        const fullPath     = join(currentDir, entry.name);
        const relativePath = relative(rootDir, fullPath);
        const outputPath   = join(outputDir, relativePath);

        if (entry.isDirectory()) {
            if (!existsSync(outputPath)) {
                mkdirSync(outputPath, { recursive: true });
            }
            processDirectory(rootDir, fullPath, outputDir, projectRoot, log);
        } else if (entry.isFile() && /\.html?$/i.test(entry.name)) {
            log.info(`  ${'  '.repeat(1)}📄 ${relativePath}`);
            try {
                const html      = readFileSync(fullPath, 'utf-8');
                const processed = processHtml(html, projectRoot, 0, log);
                const outDir    = dirname(outputPath);
                if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
                writeFileSync(outputPath, processed, 'utf-8');
            } catch (err) {
                log.warn(`[roxul] Error processing "${relativePath}": ${err.message}`);
            }
        } else if (entry.isFile()) {
            const outDir = dirname(outputPath);
            if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
            try {
                copyFileSync(fullPath, outputPath);
            } catch {
                /* ignore */
            }
        }
    }
}
