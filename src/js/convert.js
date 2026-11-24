/**
 * Converting between SHLS and JSON, the plain text of the records, and the token counter;
 * YAML is in yaml-text.js, CSV and JSON Lines in table-text.js.
 *
 * SHLS -> data is SHLSDecoder (shls.js parseShls), data -> SHLS is SHLSEncoder (shls.js
 * formatShls). The data is ordered (Map, Array, string, PyNum …), so JSON keeps the order of
 * the keys. JSON is the data as SHLSDecoder gives it: { section: [ { key: value … } ] }.
 */

import { formatShls, parseShls, formatJson, formatPythonStr, parseJson } from './shls.js?v=8';

/** The indentation of JSON without another one, in spaces. */
const JSON_INDENT = 2;
/** The name of the section a list of records without a name goes into. */
const DEFAULT_SECTION = 'Data';
/** The characters of a token-counted word: about six letters make one token. */
const LETTERS_PER_TOKEN = 6;
/** About two punctuation characters make one token. */
const SIGNS_PER_TOKEN = 2;
/** The note when the data read back from its SHLS text is not the same. */
const DIFFERS = 'Read back from SHLS, the data is not the same (for example records whose keys are in another order than in the first record) - check the result.';
/** The note when plain values stand where SHLS expects records. */
const PLAIN = 'Plain values where SHLS expects records (in a list or as a section) become records with the one key "Value".';

/**
 * Tells whether a value of the data is a dictionary.
 * @param {*} value - the value.
 * @returns {boolean} true for a Map.
 */
export function isMap(value) {
    return value instanceof Map;
}

/* ---------- JSON ---------- */

/**
 * Returns the data as JSON text.
 * @param {*} data - the data.
 * @param {number} [indent] - the indentation in spaces, 0 for one line.
 * @returns {string} the JSON, with a line break at the end when indented.
 */
export function formatJsonText(data, indent = JSON_INDENT) {
    return formatJson(data, indent) + (indent ? '\n' : '');
}

/**
 * Returns JSON (or a JS value) as the data the encoder takes: an array becomes the records of
 * a section, a single value its one record.
 * @param {*} value - the value.
 * @param {string} [name] - the section's name.
 * @returns {Map} the sections.
 */
export function convertToSections(value, name = DEFAULT_SECTION) {
    if (Array.isArray(value)) return new Map([[name || DEFAULT_SECTION, value]]);
    if (isMap(value)) return value;
    return new Map([[name || DEFAULT_SECTION, [value]]]);
}

/**
 * Returns what SHLS cannot keep of some data: the data read back from its SHLS text compared
 * with the data (all values as text), and the notes on what is lost.
 * @param {Map} data - the sections.
 * @returns {{same: boolean, notes: string[]}} whether it reads back the same, and the notes.
 */
export function getRoundTrip(data) {
    const notes = new Set();
    addLossNotes(data, false, notes);
    let same = false;
    try { same = isEqualData(parseShls(formatShls(data)), getTextData(data)); } catch (e) { same = false; }
    if (!same && !notes.size) notes.add(DIFFERS);         // never a silent change, also when no known cause is found
    return { same, notes: [...notes] };
}

/**
 * Adds the notes on what SHLS cannot keep of a value and of everything in it.
 * @param {*} value - the value.
 * @param {boolean} inRecord - true inside a record.
 * @param {Set<string>} notes - the notes found so far.
 * @returns {void}
 */
function addLossNotes(value, inRecord, notes) {
    if (isMap(value)) {
        for (const [, item] of value) {
            if (isMap(item) && inRecord) notes.add('An object inside a record becomes a list with this one object.');
            if (!inRecord && !isMap(item) && !Array.isArray(item)) notes.add(PLAIN);
            addLossNotes(item, true, notes);
        }
        return;
    }
    if (Array.isArray(value)) {
        for (const item of value) { if (!isMap(item)) notes.add(PLAIN); addLossNotes(item, true, notes); }
        return;
    }
    const text = formatPythonStr(value);
    if (text === '' || !text.trim()) notes.add('Empty values become blank lines, which SHLS readers skip - the values after them move up. Write a placeholder such as -.');
    else if (/[\r\n\u2028\u2029]/.test(text)) notes.add('Values with several lines are not supported by SHLS - they break the records apart.');
    else if (text !== text.trim()) notes.add('Values that start or end with spaces lose them (and leading spaces change the indentation).');
}

/**
 * Returns the data with every key and value as text, as SHLS reads it back.
 * @param {*} value - the data.
 * @returns {*} the same structure with strings.
 */
function getTextData(value) {
    if (isMap(value)) { const map = new Map(); for (const [key, item] of value) map.set(formatPythonStr(key), Array.isArray(item) || isMap(item) ? getTextData(item) : formatPythonStr(item)); return map; }
    if (Array.isArray(value)) return value.map(item => (Array.isArray(item) || isMap(item) ? getTextData(item) : formatPythonStr(item)));
    return formatPythonStr(value);
}

/**
 * Tells whether two pieces of data are the same, keys in the same order.
 * @param {*} a - the one.
 * @param {*} b - the other.
 * @returns {boolean} true when they are equal.
 */
function isEqualData(a, b) {
    if (isMap(a) && isMap(b)) {
        if (a.size !== b.size) return false;
        const keysA = [...a.keys()], keysB = [...b.keys()];
        return keysA.every((key, i) => key === keysB[i] && isEqualData(a.get(key), b.get(key)));
    }
    if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((item, i) => isEqualData(item, b[i]));
    return a === b;
}

/**
 * Returns JSON text as SHLS text written by the encoder, with what SHLS cannot keep.
 * @param {string} text - the JSON text.
 * @param {string} name - the name of the section an array goes into.
 * @returns {{code: string, notes: string[], same: boolean}} the SHLS text and the round trip.
 * @throws {Error} when the text is no JSON.
 */
export function convertJsonToShls(text, name) {
    const data = convertToSections(parseJson(text), name);
    const roundTrip = getRoundTrip(data);
    return { code: formatShls(data) + '\n', notes: roundTrip.notes, same: roundTrip.same };
}

/* ---------- Plain text of the records ---------- */

/**
 * Returns the records of the document as plain text: each section with its keys and its
 * numbered records, a nested list indented below its key.
 * @param {object} model - the model of shls.js parseModel().
 * @param {function(string): string} [translate] - translates the words of the text.
 * @returns {string} the text.
 */
export function formatRecordsText(model, translate = text => text) {
    const lines = [];
    for (const section of model.sections) {
        lines.push(`${section.name} (${section.records.length} ${translate(section.records.length === 1 ? 'record' : 'records')})`);
        if (section.keys) lines.push(`  ${translate('Keys')}:\n${formatKeyText(section.keys, '    ')}`);
        addRecordLines(section.records, section.keys, '  ', lines);
        lines.push('');
    }
    return lines.join('\n');
}

/**
 * Adds the lines of records: "#1", then "key: value" per value, a nested list as "key: [n]"
 * with its records below it.
 * @param {object[]} records - the records of the model.
 * @param {object[]|null|undefined} keys - their keys.
 * @param {string} indent - the indentation of the records.
 * @param {string[]} lines - the lines so far.
 * @returns {void}
 */
function addRecordLines(records, keys, indent, lines) {
    for (const [i, record] of records.entries()) {
        lines.push(`${indent}#${i + 1}`);
        for (const field of record.fields) {
            if (field.sub) { lines.push(`${indent}  ${field.key}: [${field.sub.length}]`); addRecordLines(field.sub, (keys || []).find(key => key.name === field.key)?.sub, indent + '    ', lines); }
            else lines.push(`${indent}  ${field.key}: ${field.value}`);
        }
    }
}

/**
 * Returns keys one per line, the keys of a nested list indented below theirs.
 * @param {object[]} keys - the keys.
 * @param {string} indent - the indentation of the keys.
 * @returns {string} the lines.
 */
function formatKeyText(keys, indent) {
    return keys.map(key => `${indent}${key.name}${key.sub ? '\n' + formatKeyText(key.sub, indent + '  ') : ''}`).join('\n');
}

/* ---------- Tokens ---------- */

/**
 * Returns about as many tokens as the tokenizers of common AI models make of a text: words
 * (long ones in pieces), numbers in groups of three digits, punctuation, a line break with its
 * indentation as one. An estimate, for comparing.
 * @param {string} text - the text.
 * @returns {number} the estimated tokens.
 */
export function getTokenCount(text) {
    let count = 0;
    const pattern = / ?[\p{L}\p{M}]+| ?\p{N}{1,3}| ?[^\s\p{L}\p{M}\p{N}]+|\s+/gu;
    let match;
    while ((match = pattern.exec(text))) {
        const word = match[0];
        if (/^\s+$/.test(word)) { count += word.includes('\n') ? 1 : word.length > 1 ? 1 : 0; continue; }
        const core = word.trim();
        if (/^[\p{L}\p{M}]+$/u.test(core)) count += Math.max(1, Math.ceil(core.length / LETTERS_PER_TOKEN));
        else if (/^\p{N}+$/u.test(core)) count += 1;
        else count += Math.max(1, Math.ceil(core.length / SIGNS_PER_TOKEN));
    }
    return count;
}
