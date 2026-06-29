/**
 * server.js — roxul Dev Server
 *
 * Provides an HTTP development server with live-reload via SSE.
 * Watches the source directory for changes and triggers automatic rebuilds.
 */

import { createServer, join, resolve, extname, statSync, readFileSync, existsSync, rmSync, mkdirSync, watch, sep } from './runtime.js';
import { loadConfig } from './config.js';
import { build } from './builder.js';
import { processDirectory } from './processor.js';
import { MIME_TYPES } from './constants.js';

/**
 * Get MIME type for a file path.
 * @param {string} filePath
 * @returns {string}
 */
function getMimeType(filePath) {
    const ext = extname(filePath).toLowerCase();
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
    const baseRoot    = config.baseRoot || projectRoot;
    const log         = opts.log || console;
    const port        = opts.port || 3000;
    const host        = opts.host || 'localhost';

    const inputDir  = resolve(baseRoot, opts.input || config.input);
    const outputDir = resolve(baseRoot, opts.output || config.output);

    // ── Initial build ────────────────────────────────────────────────────────
    log.info('');
    log.info('  ╔══════════════════════════════════════╗');
    log.info('  ║   roxul — Dev Server                 ║');
    log.info('  ╚══════════════════════════════════════╝');
    log.info('');

    await build({ input: inputDir, output: outputDir, root: baseRoot, clean: true, log });

    // ── File watcher ─────────────────────────────────────────────────────────
    const clients = new Set();
    let rebuildTimer = null;

    function rebuild() {
        if (rebuildTimer) clearTimeout(rebuildTimer);
        rebuildTimer = setTimeout(() => {
            log.info('  🔄 Change detected, rebuilding...');
            try {
                // Clean rebuild
                if (existsSync(outputDir)) {
                    rmSync(outputDir, { recursive: true, force: true });
                }
                mkdirSync(outputDir, { recursive: true });
                processDirectory(inputDir, inputDir, outputDir, baseRoot, log);

                // Notify clients
                for (const res of clients) {
                    try {
                        res.write('data: reload\n\n');
                    } catch {
                        clients.delete(res);
                    }
                }
                log.info('  ✅ Rebuild complete, reloading browsers.\n');
            } catch (err) {
                log.warn(`  ⚠️ Rebuild error: ${err.message}`);
            }
        }, 200);
    }

    /**
     * Watch a directory for HTML changes recursively.
     * @param {string} dir
     * @returns {import('node:fs').FSWatcher|null}
     */
    function watchDir(dir) {
        try {
            const watcher = watch(dir, { recursive: true }, (eventType, filename) => {
                if (filename && /\.html?$/i.test(filename)) rebuild();
            });
            return watcher;
        } catch {
            return null;
        }
    }

    // Watch top-level input and common source directories
    const watchers = [watchDir(inputDir)];
    const componentsDir = join(projectRoot, 'components');
    if (existsSync(componentsDir)) watchers.push(watchDir(componentsDir));

    // ── HTTP server ──────────────────────────────────────────────────────────
    const server = createServer(async (req, res) => {
        // SSE endpoint for live reload
        if (req.url === '/__roxul_livereload') {
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

        // ── Security: Path traversal prevention ──────────────────────────
        // Decode URL-encoded characters (e.g. %2e%2e%2f → ../) then
        // normalize the resolved path and verify it stays within outputDir
        // so a malicious request like GET /../config.cfg cannot read files
        // outside the intended output directory.
        const decodedPath = decodeURIComponent(urlPath);
        const filePath = resolve(join(outputDir, decodedPath));

        if (!filePath.startsWith(outputDir + sep)) {
            res.writeHead(403);
            res.end('Forbidden');
            return;
        }
        // ─────────────────────────────────────────────────────────────────

        try {
            const stats = statSync(filePath);
            if (stats.isFile()) {
                const content = readFileSync(filePath);

                // Inject live reload script into HTML files
                const mime = getMimeType(filePath);
                if (mime.startsWith('text/html')) {
                    const liveReloadScript = `<script>
(function(){
    var es = new EventSource('/__roxul_livereload');
    es.addEventListener('message', function(e){
        if(e.data === 'reload') location.reload();
    });
})();
</script>`;
                    const body = content
                        .toString('utf-8')
                        .replace('</body>', liveReloadScript + '\n</body>');
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
