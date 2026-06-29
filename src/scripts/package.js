/**
 * package.js — roxul Package Info
 *
 * Computes package-root paths and reads metadata from package.json.
 * This is the only module that depends on its own file location,
 * making it straightforward to override in tests.
 */

import { fileURLToPath, dirname, join, readFileSync } from './runtime.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname   = dirname(__filename);

/** Absolute path to the roxul package root (two levels up from src/core/) */
export const PACKAGE_ROOT = join(__dirname, '..', '..');

/** Version string read from package.json at startup */
export const PKG_VERSION = (() => {
    try {
        const pkg = readFileSync(join(PACKAGE_ROOT, 'package.json'), 'utf-8');
        return JSON.parse(pkg).version || '0.0.0';
    } catch {
        return '0.0.0';
    }
})();
