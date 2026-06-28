/**
 * SHTC — Simple Hyper Text Components
 * =============================
 * 
 * Core module.
 * Provides the build engine, CLI, dev server, and project scaffolding.
 * 
 * Usage (CLI):
 *   shtc build        Build the project
 *   shtc serve        Start dev server with auto-rebuild
 *   shtc dev          Alias for serve
 *   shtc init         Scaffold a new project
 *   shtc --help       Show help
 *   shtc --version    Show version
 * 
 * Usage (programmatic):
 *   import { build, serve, initProject } from 'shtc';
 *   await build({ input: 'src', output: 'dist' });
 */

import { fileURLToPath } from 'node:url';
import { dirname, join, relative, resolve, basename } from 'node:path';
import {
    existsSync, readFileSync, writeFileSync,
    readdirSync, copyFileSync, mkdirSync, rmSync,
    statSync, watch
} from 'node:fs';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { findConfig } from './src/scripts/cfgParser.js';

// ═══════════════════════════════════════════════════════════════════════════════
//  Package paths
// ═══════════════════════════════════════════════════════════════════════════════

const __filename = fileURLToPath(import.meta.url);
const __dirname   = dirname(__filename);
export const PACKAGE_ROOT = resolve(__dirname, '..');

// ═══════════════════════════════════════════════════════════════════════════════
//  Constants
// ═══════════════════════════════════════════════════════════════════════════════

const MAX_COMPONENT_DEPTH   = 10;
const COMPONENT_EXTENSIONS  = ['', '.html', '.htm'];
const PKG_VERSION           = (() => {
    try {
        const pkg = readFileSync(join(PACKAGE_ROOT, 'package.json'), 'utf-8');
        return JSON.parse(pkg).version || '0.0.0';
    } catch { return '0.0.0'; }
})();

// ═══════════════════════════════════════════════════════════════════════════════
//  Config loading
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Load configuration from the project root.
 * Tries config.cfg, falls back to defaults.
 * @param {string} projectRoot
 * @returns {{ input: string, output: string, configPath: string|null }}
 */
function loadConfig(projectRoot) {
    const { path: cfgPath, config } = findConfig(projectRoot);
    return {
        input:      config.input  || 'src',
        output:     config.output || 'output',
        configPath: cfgPath,
    };
}

// ═══════════════════════════════════════════════════════════════════════════════
//  Path resolution
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Resolve a component src attribute to the first existing file.
 *
 * Prefix rules:
 *   No prefix  →  components/<path>  →  SHTC/BIComponents/<path>  →  <PACKAGE>/SHTC/BIComponents/<path>
 *   # prefix   →  src/<path>
 *   % prefix   →  <path>  (project root)
 *
 * @param {string} src         - Raw src attribute value
 * @param {string} projectRoot - User project root
 * @returns {{ path: string|null, searchLocations: string[] }}
 */
function resolveComponentPath(src, projectRoot) {
    const searchLocations = [];

    if (src.startsWith('#')) {
        const relative = src.slice(1);
        const base = join(projectRoot, 'src', relative);
        for (const ext of COMPONENT_EXTENSIONS) searchLocations.push(base + ext);
    } else if (src.startsWith('%')) {
        const relative = src.slice(1);
        const base = join(projectRoot, relative);
        for (const ext of COMPONENT_EXTENSIONS) searchLocations.push(base + ext);
    } else {
        // 1) User's components/
        const userBase = join(projectRoot, 'components', src);
        for (const ext of COMPONENT_EXTENSIONS) searchLocations.push(userBase + ext);
        // 2) User's SHTC/BIComponents/ (local override)
        const localBiBase = join(projectRoot, 'SHTC', 'BIComponents', src);
        for (const ext of COMPONENT_EXTENSIONS) searchLocations.push(localBiBase + ext);
        // 3) Package SHTC/BIComponents/ (built-ins shipped with shtc)
        const pkgBiBase = join(PACKAGE_ROOT, 'SHTC', 'BIComponents', src);
        for (const ext of COMPONENT_EXTENSIONS) searchLocations.push(pkgBiBase + ext);
    }

    for (const loc of searchLocations) {
        if (existsSync(loc) && statSync(loc).isFile()) {
            return { path: loc, searchLocations };
        }
    }
    return { path: null, searchLocations };
}

// ═══════════════════════════════════════════════════════════════════════════════
//  HTML processing
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Find all <component> tags in an HTML string.
 * Handles self-closing, explicit closing, and implicit closing forms.
 */
function findComponentTags(html) {
    const tags = [];
    const openTagRegex = /<component\s+/gi;
    let match;

    while ((match = openTagRegex.exec(html)) !== null) {
        const tagStart = match.index;
        const rest = html.slice(openTagRegex.lastIndex);

        const attrMatch = rest.match(/([\s\S]*?)(\/>|>|<\/component>)/);
        if (!attrMatch) continue;

        const attrString     = attrMatch[1];
        const closingSeq     = attrMatch[2];

        let tagEnd;
        if (closingSeq === '/>') {
            tagEnd = openTagRegex.lastIndex + attrMatch[0].length;
        } else if (closingSeq === '</component>') {
            tagEnd = openTagRegex.lastIndex + attrMatch[0].length;
        } else {
            const closeIdx = html.indexOf('</component>', openTagRegex.lastIndex);
            tagEnd = closeIdx === -1
                ? openTagRegex.lastIndex + attrMatch[0].length
                : closeIdx + '</component>'.length;
        }

        const srcMatch = attrString.match(/src\s*=\s*"([^"]*)"|src\s*=\s*'([^']*)'/);
        if (!srcMatch) {
            openTagRegex.lastIndex = tagEnd;
            continue;
        }

        const src = srcMatch[1] !== undefined ? srcMatch[1] : srcMatch[2];
        tags.push({ start: tagStart, end: tagEnd, src, fullTag: html.slice(tagStart, tagEnd) });
        openTagRegex.lastIndex = tagEnd;
    }
    return tags;
}

/**
 * Process an HTML string: resolve all <component> tags recursively.
 * @param {string} html         - Raw HTML
 * @param {string} projectRoot  - Project root for path resolution
 * @param {number} depth        - Recursion depth (internal)
 * @param {object} [log]        - Optional logger { info, warn }
 * @returns {string} Processed HTML
 */
function processHtml(html, projectRoot, depth = 0, log = null) {
    const logger = log || console;

    if (depth > MAX_COMPONENT_DEPTH) {
        logger.warn(`[SHTC] Max depth (${MAX_COMPONENT_DEPTH}) reached — possible circular reference.`);
        return html;
    }

    const tags = findComponentTags(html);
    if (tags.length === 0) return html;

    let result = html;
    for (let i = tags.length - 1; i >= 0; i--) {
        const { start, end, src } = tags[i];
        const resolved = resolveComponentPath(src, projectRoot);

        if (!resolved.path) {
            logger.warn(`[SHTC] Component not found: src="${src}"`);
            const comment = `\n<!-- SHTC: component not found "${src}" -->\n`;
            result = result.slice(0, start) + comment + result.slice(end);
            continue;
        }

        let content;
        try {
            content = readFileSync(resolved.path, 'utf-8');
        } catch (err) {
            logger.warn(`[SHTC] Error reading component "${src}": ${err.message}`);
            const comment = `\n<!-- SHTC: error reading component "${src}" -->\n`;
            result = result.slice(0, start) + comment + result.slice(end);
            continue;
        }

        content = processHtml(content, projectRoot, depth + 1, logger);
        result = result.slice(0, start) + content + result.slice(end);

        if (logger.info) {
            const indent = '  '.repeat(depth + 1);
            logger.info(`${indent}├─ ${relative(projectRoot, resolved.path)}`);
        }
    }
    return result;
}

// ═══════════════════════════════════════════════════════════════════════════════
//  Directory processing
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Recursively process a directory: build HTML files, copy others.
 */
function processDirectory(rootDir, currentDir, outputDir, projectRoot, log) {
    let entries;
    try {
        entries = readdirSync(currentDir, { withFileTypes: true });
    } catch (err) {
        log.warn(`[SHTC] Error reading directory "${currentDir}": ${err.message}`);
        return;
    }

    for (const entry of entries) {
        const fullPath     = join(currentDir, entry.name);
        const relativePath = relative(rootDir, fullPath);
        const outputPath   = join(outputDir, relativePath);

        if (entry.isDirectory()) {
            if (!existsSync(outputPath)) mkdirSync(outputPath, { recursive: true });
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
                log.warn(`[SHTC] Error processing "${relativePath}": ${err.message}`);
            }
        } else if (entry.isFile()) {
            const outDir = dirname(outputPath);
            if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
            try { copyFileSync(fullPath, outputPath); } catch { /* ignore */ }
        }
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
//  Build
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Run a full SHTC build.
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
    const log         = opts.log || console;

    const inputDir  = resolve(projectRoot, opts.input  || config.input);
    const outputDir = resolve(projectRoot, opts.output || config.output);

    // ── Header ───────────────────────────────────────────────────────────────
    log.info('');
    log.info('  ╔══════════════════════════════════════╗');
    log.info('  ║   SHTC — Simple Hyper Text Components║');
    log.info('  ║   Static site generator (build-time) ║');
    log.info('  ╚══════════════════════════════════════╝');
    log.info('');
    log.info(`  Input:   ${inputDir}`);
    log.info(`  Output:  ${outputDir}`);
    if (config.configPath) log.info(`  Config:  ${config.configPath}`);
    log.info('');

    // ── Validate ─────────────────────────────────────────────────────────────
    if (!existsSync(inputDir)) {
        log.warn(`[SHTC] Input directory does not exist: ${inputDir}`);
        log.warn('       Create it or change "input" in config.cfg');
        return { inputDir, outputDir };
    }

    // ── Clean & prepare output ──────────────────────────────────────────────
    if (opts.clean !== false) {
        if (existsSync(outputDir)) rmSync(outputDir, { recursive: true, force: true });
    }
    if (!existsSync(outputDir)) mkdirSync(outputDir, { recursive: true });

    // ── Process ──────────────────────────────────────────────────────────────
    log.info('  Processing files...\n');
    processDirectory(inputDir, inputDir, outputDir, projectRoot, log);

    log.info('');
    log.info('  ✨ Build complete!');
    log.info(`  Output: ${outputDir}`);
    log.info('');

    return { inputDir, outputDir };
}

// ═══════════════════════════════════════════════════════════════════════════════
//  Dev server
// ═══════════════════════════════════════════════════════════════════════════════

const MIME_TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.htm':  'text/html; charset=utf-8',
    '.css':  'text/css; charset=utf-8',
    '.js':   'application/javascript; charset=utf-8',
    '.mjs':  'application/javascript; charset=utf-8',
    '.json': 'application/json',
    '.png':  'image/png',
    '.jpg':  'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif':  'image/gif',
    '.svg':  'image/svg+xml',
    '.ico':  'image/x-icon',
    '.webp': 'image/webp',
    '.woff': 'font/woff',
    '.woff2':'font/woff2',
    '.ttf':  'font/ttf',
    '.txt':  'text/plain; charset=utf-8',
    '.xml':  'application/xml',
    '.pdf':  'application/pdf',
};

function getMimeType(filePath) {
    const ext = filePath.substring(filePath.lastIndexOf('.')).toLowerCase();
    return MIME_TYPES[ext] || 'application/octet-stream';
}

/**
 * Start a development server with live rebuild.
 *
 * @param {object}  [opts]
 * @param {number}  [opts.port]      - Server port (default: 3000)
 * @param {string}  [opts.host]      - Server host (default: 'localhost')
 * @param {boolean} [opts.open]      - Open browser (default: false)
 * @param {string}  [opts.root]      - Project root (default: process.cwd())
 * @param {object}  [opts.log]       - Logger { info, warn, error } (default: console)
 * @returns {Promise<{ server: import('http').Server, close: Function }>}
 */
export async function serve(opts = {}) {
    const projectRoot = resolve(opts.root || process.cwd());
    const config      = loadConfig(projectRoot);
    const log         = opts.log || console;
    const port        = opts.port  || 3000;
    const host        = opts.host  || 'localhost';

    const inputDir   = resolve(projectRoot, opts.input  || config.input);
    const outputDir  = resolve(projectRoot, opts.output || config.output);

    // ── Initial build ────────────────────────────────────────────────────────
    log.info('');
    log.info('  ╔══════════════════════════════════════╗');
    log.info('  ║   SHTC — Dev Server                    ║');
    log.info('  ╚══════════════════════════════════════╝');
    log.info('');

    await build({ input: inputDir, output: outputDir, root: projectRoot, clean: true, log });

    // ── File watcher ─────────────────────────────────────────────────────────
    const clients = new Set();
    let rebuildTimer = null;

    function rebuild() {
        if (rebuildTimer) clearTimeout(rebuildTimer);
        rebuildTimer = setTimeout(() => {
            log.info('  🔄 Change detected, rebuilding...');
            try {
                // Clean rebuild
                if (existsSync(outputDir)) rmSync(outputDir, { recursive: true, force: true });
                mkdirSync(outputDir, { recursive: true });
                processDirectory(inputDir, inputDir, outputDir, projectRoot, log);

                // Notify clients
                for (const res of clients) {
                    try { res.write('data: reload\n\n'); } catch { clients.delete(res); }
                }
                log.info('  ✅ Rebuild complete, reloading browsers.\n');
            } catch (err) {
                log.warn(`  ⚠️ Rebuild error: ${err.message}`);
            }
        }, 200);
    }

    // Watch input directory recursively
    function watchDir(dir) {
        try {
            const watcher = watch(dir, { recursive: true }, (eventType, filename) => {
                if (filename && /\.html?$/i.test(filename)) rebuild();
            });
            return watcher;
        } catch { return null; }
    }

    // Watch top-level input and common source directories
    const watchers = [watchDir(inputDir)];
    const componentsDir = join(projectRoot, 'components');
    if (existsSync(componentsDir)) watchers.push(watchDir(componentsDir));

    // ── HTTP server ──────────────────────────────────────────────────────────
    const server = createServer(async (req, res) => {
        // SSE endpoint for live reload
        if (req.url === '/__shtc_livereload') {
            res.writeHead(200, {
                'Content-Type': 'text/event-stream',
                'Cache-Control': 'no-cache',
                'Connection': 'keep-alive',
            });
            res.write('data: connected\n\n');
            clients.add(res);
            req.on('close', () => clients.delete(res));
            return;
        }

        // Serve files
        let urlPath = req.url.split('?')[0];
        if (urlPath === '/') urlPath = '/index.html';

        const filePath = join(outputDir, urlPath);

        try {
            const stats = await statSync(filePath); // synchronous for simplicity
            if (stats.isFile()) {
                const content = readFileSync(filePath);

                // Inject live reload script into HTML files
                const mime = getMimeType(filePath);
                if (mime.startsWith('text/html')) {
                    const liveReloadScript = `<script>
(function(){
    var es = new EventSource('/__shtc_livereload');
    es.addEventListener('message', function(e){
        if(e.data === 'reload') location.reload();
    });
})();
</script>`;
                    const body = content.toString('utf-8').replace('</body>', liveReloadScript + '\n</body>');
                    res.writeHead(200, { 'Content-Type': mime });
                    res.end(body);
                } else {
                    res.writeHead(200, { 'Content-Type': mime });
                    res.end(content);
                }
            } else {
                res.writeHead(404);
                res.end('Not found');
            }
        } catch {
            res.writeHead(404);
            res.end('Not found');
        }
    });

    server.listen(port, host, () => {
        log.info(`  🌐 Server running at http://${host}:${port}/`);
        log.info('  📁 Watching for changes...');
        log.info('');
    });

    return {
        server,
        close: () => {
            server.close();
            for (const w of watchers) if (w) w.close();
        },
    };
}

// ═══════════════════════════════════════════════════════════════════════════════
//  Init — scaffold a new project
// ═══════════════════════════════════════════════════════════════════════════════

const INIT_TEMPLATES = {
    'config.cfg': `# SHTC Configuration
# https://github.com/yourusername/shtc

input  = src
output = output
`,

    'src/index.html': `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>My SHTC Project</title>
</head>
<body>
    <h1>Hello, SHTC!</h1>
    <p>This page was built with Simple Hyper Text Components.</p>

    <!-- Your components will be resolved here -->
    <component src="example/hello" />

    <script type="module" src="/main.js"></script>
</body>
</html>
`,

    'src/main.js': `// SHTC processes HTML at build time.
// This JavaScript file is copied as-is to the output.
console.log('Hello from SHTC!');
`,

    'src/main.css': `/* Your styles here */
body {
    font-family: system-ui, sans-serif;
    max-width: 800px;
    margin: 2rem auto;
    padding: 0 1rem;
    line-height: 1.6;
    color: #333;
}
`,

    'components/example/hello.html': `<div style="background:#f0f7ff;border:1px solid #cce4ff;border-radius:8px;padding:1.5rem;margin:1rem 0;">
    <h2>👋 Hello from a component!</h2>
    <p>This content was injected at <strong>build time</strong> — no flickering!</p>
    <p>Edit this file in <code>components/example/hello.html</code>.</p>
</div>
`,
};

/**
 * Scaffold a new SHTC project in the given directory.
 *
 * @param {string} dir     - Target directory (default: process.cwd())
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
    log.info('  ║   SHTC — Init Project                  ║');
    log.info('  ╚══════════════════════════════════════╝');
    log.info('');
    log.info(`  Scaffolding project in: ${targetDir}`);
    log.info('');

    let created = 0;
    let skipped = 0;

    for (const [filePath, content] of Object.entries(INIT_TEMPLATES)) {
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
    log.info(`  Created ${created} file(s)` + (skipped > 0 ? ` (${skipped} skipped)` : ''));
    log.info('');
    log.info('  Next steps:');
    log.info('    1. Run  shtc build   to build the project');
    log.info('    2. Run  shtc serve   to start the dev server');
    log.info('    3. Edit files in  src/  and  components/');
    log.info('');
}

// ═══════════════════════════════════════════════════════════════════════════════
//  CLI
// ═══════════════════════════════════════════════════════════════════════════════

function printHelp() {
    console.log(`
  SHTC — Simple Hyper Text Components  v${PKG_VERSION}

  Usage:
    shtc <command> [options]

  Commands:
    build             Build the project
    serve             Start dev server with live reload
    dev               Alias for serve
    init [directory]  Scaffold a new SHTC project (The directory is optional, if its blank it will use the terminal location)

  Options:
    -h, --help        Show this help message (default)
    -v, --version     Show version number
    --port <port>     Port for dev server (default: 3000)
    --host <host>     Host for dev server (default: localhost)
    --input <dir>     Input directory (default: src or from config)
    --output <dir>    Output directory (default: output or from config)
    --no-clean        Don't clean output directory before build
    --force           Overwrite files on init

  Examples:
    shtc build
    shtc serve --port 8080
    shtc init my-project
    shtc --help
`);
}

/**
 * CLI entry point. Parses process.argv and dispatches the command.
 * @param {string[]} argv - Typically process.argv
 */
function cli(argv) {
    const args = argv.slice(2);

    // ── Help / Version ───────────────────────────────────────────────────────
    if (args.length === 0) {
        // Default to help when no arguments
        printHelp();
        return;
    }

    if (args[0] === '--help' || args[0] === '-h') {
        printHelp();
        return;
    }

    if (args[0] === '--version' || args[0] === '-v') {
        console.log(PKG_VERSION);
        return;
    }

    if (args[0] === 'build') {
        const opts = parseBuildOptions(args.slice(1));
        build(opts).catch(err => console.error(`[SHTC] Error: ${err.message}`));
        return;
    }

    // ── Commands ─────────────────────────────────────────────────────────────
    const cmd = args[0];

    if (cmd === 'serve' || cmd === 'dev') {
        const opts = parseServeOptions(args.slice(1));
        serve(opts).catch(err => console.error(`[SHTC] Error: ${err.message}`));
        return;
    }

    if (cmd === 'init') {
        const dir    = args[1] || process.cwd();
        const force  = args.includes('--force');
        initProject(dir, { force });
        return;
    }

    // ── Unknown command ──────────────────────────────────────────────────────
    console.error(`\n  ❌ Unknown command: "${cmd}"\n`);
    printHelp();
    process.exit(1);
}

// ═══════════════════════════════════════════════════════════════════════════════
//  Option parsers
// ═══════════════════════════════════════════════════════════════════════════════

function parseBuildOptions(args) {
    const opts = {};
    for (let i = 0; i < args.length; i++) {
        switch (args[i]) {
            case '--input':    opts.input  = args[++i]; break;
            case '--output':   opts.output = args[++i]; break;
            case '--root':     opts.root   = args[++i]; break;
            case '--no-clean': opts.clean  = false;     break;
        }
    }
    return opts;
}

function parseServeOptions(args) {
    const opts = {};
    for (let i = 0; i < args.length; i++) {
        switch (args[i]) {
            case '--port':    opts.port   = parseInt(args[++i], 10); break;
            case '--host':    opts.host   = args[++i];              break;
            case '--input':   opts.input  = args[++i];              break;
            case '--output':  opts.output = args[++i];              break;
            case '--root':    opts.root   = args[++i];              break;
            case '--open':    opts.open   = true;                   break;
        }
    }
    return opts;
}



cli(process.argv);