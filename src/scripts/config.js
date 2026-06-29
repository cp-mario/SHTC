/**
 * config.js — roxul Configuration Loader
 *
 * Loads roxul configuration from config.cfg (or alternative file names)
 * by delegating to the lower-level cfgParser module. Falls back to the
 * scaffolded default project config when none is found in the project root.
 */

import { join, resolve } from './runtime.js';
import { findConfig } from './cfgParser.js';

/**
 * Load configuration from the project root.
 *
 * Tries to locate a config file in the given root, falling back to the
 * `src/defaultProject` folder (used by the scaffolded template). Returns the
 * configuration together with the directory that actually contained the file
 * (baseRoot). This ensures that builds run inside the correct project when the
 * user executes the CLI from the repository root.
 *
 * @param {string} projectRoot - Absolute path to the project root
 * @returns {{ input: string, output: string, configPath: string|null, baseRoot: string }}
 */
export function loadConfig(projectRoot) {
    // First attempt: config at the supplied project root.
    let { path: cfgPath, config } = findConfig(projectRoot);
    let baseRoot = projectRoot;

    // If not found, look inside the default project template.
    if (!cfgPath) {
        const defaultProjectRoot = join(projectRoot, 'src', 'defaultProject');
        const result = findConfig(defaultProjectRoot);
        cfgPath = result.path;
        config = result.config;
        if (cfgPath) baseRoot = defaultProjectRoot;
    }

    return {
        input:      config.input  || 'src',
        output:     config.output || 'output',
        configPath: cfgPath,
        baseRoot,
    };
}
