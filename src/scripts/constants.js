/**
 * constants.js — roxul Shared Constants
 *
 * Pure constants that do not depend on package location.
 */

/** Maximum depth for recursive component resolution */
export const MAX_COMPONENT_DEPTH = 10;

/** File extensions to try when resolving a component src attribute */
export const COMPONENT_EXTENSIONS = ['', '.html', '.htm'];

/** MIME type map for the dev server */
export const MIME_TYPES = {
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
    '.woff2': 'font/woff2',
    '.ttf':  'font/ttf',
    '.txt':  'text/plain; charset=utf-8',
    '.xml':  'application/xml',
    '.pdf':  'application/pdf',
};
