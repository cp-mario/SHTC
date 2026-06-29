/**
 * cfgParser.js — roxul Config Parser
 * 
 * Parses the roxul configuration file (config.cfg).
 * Works with both Node.js and Bun.
 * 
 * Format:
 *   # Comment lines start with #
 *   key = value
 *   Values can be quoted with " or '
 *   Empty lines are ignored
 */

import { readFileSync, existsSync, join } from './runtime.js';

/**
 * Parse raw config text into a configuration object.
 * @param {string} text - Raw content of the config file
 * @returns {Object} Parsed configuration key-value pairs
 */
export function parseConfig(text) {
    const config = {};
    const lines = text.split(/\r?\n/);

    for (const line of lines) {
        const trimmed = line.trim();

        // Skip empty lines and comments
        if (!trimmed || trimmed.startsWith('#')) continue;

        // Match key = value pattern (key must start with a letter or underscore)
        const match = trimmed.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\s*=\s*(.*)$/);
        if (match) {
            const key = match[1].trim();
            let value = match[2].trim();

            // Remove surrounding quotes (single or double)
            if ((value.startsWith('"') && value.endsWith('"')) ||
                (value.startsWith("'") && value.endsWith("'"))) {
                value = value.slice(1, -1);
            }

            config[key] = value;
        }
    }

    return config;
}

/**
 * Read a config file from disk synchronously and parse it.
 * Works with both Node.js and Bun.
 * @param {string} configPath - Absolute or relative path to config.cfg
 * @returns {Object|null} Parsed configuration, or null if file doesn't exist
 */
export function readConfigSync(configPath) {
    try {
        const text = readFileSync(configPath, 'utf-8');
        return parseConfig(text);
    } catch (err) {
        return null;
    }
}

/**
 * Find a config file by searching common locations.
 * Returns the first config file found.
 * @param {string} projectRoot - Project root directory
 * @returns {{ path: string|null, config: Object }}
 */
export function findConfig(projectRoot) {
    const candidates = [
        join(projectRoot, 'config.cfg'),
        join(projectRoot, 'roxul.config.cfg'),
        join(projectRoot, 'roxul.config.json'),
    ];

    for (const cfgPath of candidates) {
        if (existsSync(cfgPath)) {
            const config = readConfigSync(cfgPath);
            if (config) {
                return { path: cfgPath, config };
            }
        }
    }

    return { path: null, config: {} };
}