/**
 * parser.js — roxul HTML Component Tag Parser
 *
 * Low-level functions for finding <component> tags in HTML and
 * extracting their attributes.
 */

/**
 * Parse all attributes from an attribute string into a key-value map.
 * Handles both double-quoted and single-quoted values.
 *
 * @param {string} attrString - Raw attribute text (everything between the
 *                              tag name and the closing `>` or `/>`)
 * @returns {Object.<string, string>}
 */
export function parseAttributes(attrString) {
    const attrs = {};
    const attrRegex = /(\S+)\s*=\s*"([^"]*)"|(\S+)\s*=\s*'([^']*)'/g;
    let match;
    while ((match = attrRegex.exec(attrString)) !== null) {
        const name  = match[1] !== undefined ? match[1] : match[3];
        const value = match[2] !== undefined ? match[2] : match[4];
        attrs[name] = value;
    }
    return attrs;
}

/**
 * Find all <component> tags in an HTML string.
 *
 * Handles self-closing (`<component ... />`), explicit closing
 * (`<component ... ></component>`), and implicit closing
 * (`<component ... >`) forms.
 *
 * @param {string} html - Raw HTML content
 * @returns {Array<{
 *   start: number,
 *   end: number,
 *   src: string,
 *   fullTag: string,
 *   attrs: Object.<string, string>
 * }>}
 */
export function findComponentTags(html) {
    const tags = [];
    const openTagRegex = /<component\s+/gi;
    let match;

    while ((match = openTagRegex.exec(html)) !== null) {
        const tagStart = match.index;
        const rest = html.slice(openTagRegex.lastIndex);

        const attrMatch = rest.match(/([\s\S]*?)(\/>|>|<\/component>)/);
        if (!attrMatch) continue;

        const attrString = attrMatch[1];
        const closingSeq = attrMatch[2];

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
        tags.push({
            start: tagStart,
            end: tagEnd,
            src,
            fullTag: html.slice(tagStart, tagEnd),
            attrs: parseAttributes(attrString),
        });
        openTagRegex.lastIndex = tagEnd;
    }
    return tags;
}
