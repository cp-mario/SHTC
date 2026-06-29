/**
 * runtime.js — roxul Runtime Abstraction
 *
 * Auto-detects the JavaScript runtime (Node.js, Bun, etc.) and provides
 * the appropriate implementation for each. To add support for a new runtime
 * (Deno, etc.) or to swap implementations, edit ONLY this file.
 *
 * Bun has first-class support for all node:* modules, but we wrap some APIs
 * (e.g. createServer) so the runtime's native engine is used where possible.
 */

// ═══════════════════════════════════════════════════════════════════════════════
//  Runtime detection
// ═══════════════════════════════════════════════════════════════════════════════

/** Runtime identifier: 'node', 'bun', etc. */
export const runtime =
    typeof Bun !== 'undefined' ? 'bun'
    : typeof Deno !== 'undefined' ? 'deno'
    : 'node';

/** Human-readable runtime version string */
export const runtimeVersion = (() => {
    if (runtime === 'bun') return Bun.version;
    if (runtime === 'deno') return Deno.version.deno;
    return process.version;
})();

// ═══════════════════════════════════════════════════════════════════════════════
//  node:path — Path utilities
//  Identical across Node and Bun (both support node:path natively).
// ═══════════════════════════════════════════════════════════════════════════════
export { join, resolve, relative, dirname, extname, basename, sep } from 'node:path';

// ═══════════════════════════════════════════════════════════════════════════════
//  node:url — URL utilities
//  Identical across Node and Bun (both support node:url natively).
// ═══════════════════════════════════════════════════════════════════════════════
export { fileURLToPath } from 'node:url';

// ═══════════════════════════════════════════════════════════════════════════════
//  node:http — HTTP server
//  Bun supports node:http natively (built on Bun.serve() internally), so the
//  same re-export works on both runtimes without any shim needed.
//
//  NOTE: Bun also exposes Bun.serve() with a Web-standard fetch API.
//  If you want to use it directly, adjust server.js and swap here:
//    export { createServer } from 'bun';
// ═══════════════════════════════════════════════════════════════════════════════
export { createServer } from 'node:http';

// ═══════════════════════════════════════════════════════════════════════════════
//  node:fs — Synchronous file-system operations
//  Bun has native node:fs support, so every export here works identically
//  on both runtimes without any wrapping needed.
// ═══════════════════════════════════════════════════════════════════════════════
export {
    existsSync,
    readFileSync,
    writeFileSync,
    readdirSync,
    copyFileSync,
    mkdirSync,
    rmSync,
    statSync,
    watch,
} from 'node:fs';
