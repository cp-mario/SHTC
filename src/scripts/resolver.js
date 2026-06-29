/**
 * resolver.js — roxul Component Path Resolution
 *
 * Translates a component `src` attribute into an actual file-system path
 * by searching through a well-defined list of locations.
 */

import { join, resolve, sep, existsSync, statSync } from './runtime.js';
import { COMPONENT_EXTENSIONS } from './constants.js';
import { PACKAGE_ROOT } from './package.js';

/**
 * Normalize a candidate path and verify it is contained within one of the
 * allowed root directories. Returns the normalized path if safe, or null if
 * the path escapes the allowed roots (path traversal attempt).
 *
 * @param {string} candidate - Raw candidate path (as constructed by join)
 * @param {string[]} allowedRoots - List of absolute directory paths that are
 *                                  considered safe base directories
 * @returns {string|null}
 */
function checkPathContainment(candidate, allowedRoots) {
    const normalized = resolve(candidate);
    for (const root of allowedRoots) {
        const normalizedRoot = resolve(root);
        if (normalized.startsWith(normalizedRoot + sep) || normalized === normalizedRoot) {
            return normalized;
        }
    }
    return null;
}

/**
 * Resolve a component src attribute to the first existing file.
 *
 * Prefix rules:
 *   No prefix  →  components/<path>  →  roxul/BIComponents/<path>  →  <PACKAGE>/roxul/BIComponents/<path>
 *   # prefix   →  src/<path>
 *   % prefix   →  <path>  (project root)
 *
 * @param {string} src         - Raw src attribute value
 * @param {string} projectRoot - User project root
 * @returns {{ path: string|null, searchLocations: string[] }}
 */
export function resolveComponentPath(src, projectRoot) {
    // ── Security: Path-traversal guard ───────────────────────────────────
    // Reject any src containing parent-directory references ("..") or
    // absolute paths ("/" or "\") to prevent escaping the project root via
    // the component resolution mechanism.
    if (src.includes('..') || src.startsWith('/') || src.startsWith('\\')) {
        return { path: null, searchLocations: [] };
    }

    const searchLocations = [];

    if (src.startsWith('#')) {
        // # prefix → resolve relative to src/ directory
        const relative = src.slice(1);
        const base = join(projectRoot, 'src', relative);
        for (const ext of COMPONENT_EXTENSIONS) searchLocations.push(base + ext);
    } else if (src.startsWith('%')) {
        // % prefix → resolve relative to project root
        const relative = src.slice(1);
        const base = join(projectRoot, relative);
        for (const ext of COMPONENT_EXTENSIONS) searchLocations.push(base + ext);
    } else {
        // 1) User's components/
        const userBase = join(projectRoot, 'components', src);
        for (const ext of COMPONENT_EXTENSIONS) searchLocations.push(userBase + ext);
        // 2) User's roxul/BIComponents/ (local override)
        const localBiBase = join(projectRoot, 'roxul', 'BIComponents', src);
        for (const ext of COMPONENT_EXTENSIONS) searchLocations.push(localBiBase + ext);
        // 3) Package roxul/BIComponents/ (built-ins shipped with roxul)
        const pkgBiBase = join(PACKAGE_ROOT, 'roxul', 'BIComponents', src);
        for (const ext of COMPONENT_EXTENSIONS) searchLocations.push(pkgBiBase + ext);
    }

    for (const loc of searchLocations) {
        // ── Security: Defense-in-depth containment check ──────────────────
        // Normalize the candidate path and verify it resides within one of
        // the allowed root directories (projectRoot or PACKAGE_ROOT). This
        // catches any edge-case where the construction above could produce
        // a path that escapes the intended base.
        const safePath = checkPathContainment(loc, [projectRoot, PACKAGE_ROOT]);
        if (!safePath) continue;

        if (existsSync(safePath) && statSync(safePath).isFile()) {
            return { path: safePath, searchLocations };
        }
    }
    return { path: null, searchLocations };
}
