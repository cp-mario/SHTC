/**
 * color.js — ANSI terminal colors (zero dependencies)
 *
 * Colors are applied only when stdout is a TTY (interactive terminal).
 * Piped / redirected output is never colorised, so logs stay clean
 * when captured by a file or another process.
 */

const enabled = process.stdout.isTTY ?? false;

/**
 * Wrap a string in an ANSI SGR (Select Graphic Rendition) escape sequence.
 *
 * @param {number} code ANSI parameter number (e.g. 1 = bold, 32 = green)
 * @returns {(s: string) => string}
 */
function ansi(code) {
    return (s) => (enabled ? `\x1b[${code}m${s}\x1b[0m` : s);
}

export const bold   = ansi(1);
export const dim    = ansi(2);
export const green  = ansi(32);
export const yellow = ansi(33);
export const cyan   = ansi(36);
export const red    = ansi(31);
export const gray   = ansi(90);
