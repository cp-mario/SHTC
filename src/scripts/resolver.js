/**
 * resolver.js — roxul Component Path Resolution
 *
 * Translates a component `src` attribute into an actual file-system path
 * by searching through a well-defined list of locations.
 */

import { join, sep } from 'node:path';
import { existsSync, statSync } from 'node:fs';
import { COMPONENT_EXTENSIONS } from './constants.js';
import { PACKAGE_ROOT } from './package.js';

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
    // Basic path-traversal guard
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
        if (existsSync(loc) && statSync(loc).isFile()) {
            return { path: loc, searchLocations };
        }
    }
    return { path: null, searchLocations };
}
