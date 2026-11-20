/**
 * YAML for the editor: the data written as YAML in block style (quotes only where YAML needs
 * them), and YAML files read with the vendored yaml package, which loads on demand.
 */

import { convertFromJs, formatPythonStr, PyNum } from './shls.js?v=7';
import { isMap } from './convert.js?v=8';

/** The most aliases a YAML file may expand. */
const MAX_YAML_ALIASES = 1000;
/** The indentation of the YAML that is written, in spaces. */
const YAML_INDENT = 2;
/** What starts an item of a YAML list; the item's own lines are indented by its width. */
const LIST_DASH = '- ';
/** YAML scalars that need quotes: they would read as another type or break the syntax. */
const PLAIN_BAD = /^[-?:,[\]{}#&*!|>'"%@`]|^\s|\s$|: |\s#|^(true|false|yes|no|on|off|null|~|y|n)$|^[-+]?(\d|\.\d)|^\.(inf|nan)$|^0[xo]/i;

let yamlLibrary = null;

/**
 * Loads the vendored yaml package once (a command that returns a Promise so the caller can
 * wait for it).
 * @returns {Promise<object>} the package.
 */
export async function importYamlLibrary() {
    if (!yamlLibrary) yamlLibrary = await import('../vendor/yaml/index.js');
    return yamlLibrary;
}

/**
 * Returns a YAML string: plain where YAML reads it as the same text, else quoted as JSON.
 * @param {string} text - the text.
 * @returns {string} the YAML scalar.
 */
function formatYamlString(text) {
    return text === '' || PLAIN_BAD.test(text) || /[\n\r\t\\"]/.test(text) || text.endsWith(':') ? JSON.stringify(text) : text;
}

/**
 * Returns a scalar of the data as YAML: numbers as written (infinity and NaN in YAML's
 * spelling), booleans, null, or a string.
 * @param {*} value - the scalar.
 * @returns {string} the YAML scalar.
 */
function formatYamlScalar(value) {
    if (value instanceof PyNum) return value.float ? (Number.isFinite(value.value) ? formatPythonStr(value) : value.value > 0 ? '.inf' : value.value < 0 ? '-.inf' : '.nan') : formatPythonStr(value);
    if (value === true || value === false) return String(value);
    if (value === null || value === undefined) return 'null';
    return formatYamlString(String(value));
}

/**
 * Returns an empty container or a scalar as YAML on the line of its key or dash.
 * @param {*} value - the value.
 * @returns {string} "{}", "[]" or the scalar.
 */
function formatYamlInline(value) {
    return isMap(value) ? '{}' : Array.isArray(value) ? '[]' : formatYamlScalar(value);
}

/**
 * Tells whether a value takes lines of its own in YAML block style.
 * @param {*} value - the value.
 * @returns {boolean} true for a Map or an Array with items.
 */
function hasYamlBlock(value) {
    return (isMap(value) && value.size > 0) || (Array.isArray(value) && value.length > 0);
}

/**
 * Returns the data as YAML in block style.
 * @param {*} value - the data.
 * @param {number} [indent] - the indentation of a level, in spaces.
 * @returns {string} the YAML with a line break at the end.
 */
export function convertToYaml(value, indent = YAML_INDENT) {
    const lines = [];
    addYamlLines(value, 0, '', indent, lines);
    return lines.join('\n') + '\n';
}

/**
 * Adds the YAML lines of a value.
 * @param {*} value - the value.
 * @param {number} level - the indentation of its lines, in spaces.
 * @param {string} lead - what its first line starts with (indentation or "- ").
 * @param {number} indent - the indentation of a level, in spaces.
 * @param {string[]} lines - the lines so far.
 * @returns {void}
 */
function addYamlLines(value, level, lead, indent, lines) {
    if (isMap(value)) { addYamlMapLines(value, level, lead, indent, lines); return; }
    if (Array.isArray(value)) { addYamlListLines(value, level, lead, indent, lines); return; }
    lines.push(lead + formatYamlScalar(value));
}

/**
 * Adds the YAML lines of a Map: one "key:" per entry, its value on the line or below it.
 * @param {Map} map - the Map.
 * @param {number} level - the indentation of its lines, in spaces.
 * @param {string} lead - what its first line starts with.
 * @param {number} indent - the indentation of a level, in spaces.
 * @param {string[]} lines - the lines so far.
 * @returns {void}
 */
function addYamlMapLines(map, level, lead, indent, lines) {
    if (!map.size) { lines.push(lead + '{}'); return; }
    let first = true;
    for (const [key, item] of map) {
        const start = first ? lead : ' '.repeat(level);
        first = false;
        const keyText = formatYamlString(formatPythonStr(key)) + ':';
        if (hasYamlBlock(item)) { lines.push(start + keyText); addYamlLines(item, level + indent, ' '.repeat(level + indent), indent, lines); }
        else lines.push(start + keyText + ' ' + formatYamlInline(item));
    }
}

/**
 * Adds the YAML lines of an Array: one "- " per item.
 * @param {Array} list - the Array.
 * @param {number} level - the indentation of its lines, in spaces.
 * @param {string} lead - what its first line starts with.
 * @param {number} indent - the indentation of a level, in spaces.
 * @param {string[]} lines - the lines so far.
 * @returns {void}
 */
function addYamlListLines(list, level, lead, indent, lines) {
    if (!list.length) { lines.push(lead + '[]'); return; }
    list.forEach((item, i) => {
        const start = i === 0 ? lead : ' '.repeat(level);
        if (hasYamlBlock(item)) addYamlLines(item, level + LIST_DASH.length, start + LIST_DASH, indent, lines);
        else lines.push(start + LIST_DASH + formatYamlInline(item));
    });
}

/**
 * Returns the data of YAML text (several documents: a list). importYamlLibrary() first.
 * @param {string} text - the YAML text.
 * @returns {*} the data.
 * @throws {Error} when the package is not loaded or the text is no valid YAML.
 */
export function convertFromYaml(text) {
    if (!yamlLibrary) throw new Error('The YAML package is not loaded yet');
    const documents = Array.from(yamlLibrary.parseAllDocuments(text, { merge: true }));
    const errors = documents.flatMap(yamlDocument => yamlDocument.errors);
    if (errors.length) throw new Error(String(errors[0].message).split('\n')[0]);
    const values = documents.map(yamlDocument => convertFromJs(yamlDocument.toJS({ maxAliasCount: MAX_YAML_ALIASES })));
    return values.length === 1 ? values[0] : values;
}
