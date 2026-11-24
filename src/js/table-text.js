/**
 * Tables for the editor: one section as CSV (its keys are the columns, each record a row; a
 * nested list is one cell with the list as JSON) or as JSON Lines (one record per line), and
 * CSV and JSON Lines files read as records.
 */

import { formatJson, parseJson } from './shls.js?v=8';

/**
 * Returns a CSV cell, quoted when it holds a separator, a quote, a line break or spaces at its ends.
 * @param {string} text - the cell's text.
 * @returns {string} the cell.
 */
function formatCsvCell(text) {
    return /[",\n\r;]|^\s|\s$/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text;
}

/**
 * Returns the records of one section as CSV: its keys are the columns, a nested list is one
 * cell with JSON.
 * @param {object|null} section - the section with its data: name, keys (null without a key
 *   block) and data (its records as Maps).
 * @returns {{text: string}|{error: string}} the CSV, or the reason there is none.
 */
export function convertToCsv(section) {
    if (!section) return { error: 'The document has no section yet' };
    if (!section.keys || !section.keys.length) return { error: `"${section.name}" has no key block` };
    const columns = section.keys.map(key => key.name);
    const rows = [columns.map(formatCsvCell).join(',')];
    for (const record of section.data || []) rows.push(columns.map(column => { const value = record.get(column); return formatCsvCell(value == null ? '' : typeof value === 'string' ? value : formatJson(value, 0)); }).join(','));
    return { text: rows.join('\n') + '\n' };
}

/**
 * Returns the records of CSV text: the first row names the columns; the separator is ",", ";"
 * or a tab, whichever the first row has most of.
 * @param {string} text - the CSV text.
 * @returns {Map[]} one Map per row.
 * @throws {Error} when the file has no rows.
 */
export function convertFromCsv(text) {
    const firstLine = text.split(/\r?\n/, 1)[0];
    const separator = [',', ';', '\t'].sort((a, b) => firstLine.split(b).length - firstLine.split(a).length)[0];
    const body = readCsvRows(text, separator).filter(row => row.some(cell => cell.trim()));
    if (!body.length) throw new Error('The CSV file is empty');
    const head = body[0].map((name, k) => name.trim() || `Column ${k + 1}`);
    return body.slice(1).map(row => new Map(head.map((name, k) => [name, row[k] ?? ''])));
}

/**
 * Returns the rows of CSV text with their cells; quoted cells may hold separators, quotes ("")
 * and line breaks.
 * @param {string} text - the CSV text.
 * @param {string} separator - the separator of the cells.
 * @returns {string[][]} the rows.
 */
function readCsvRows(text, separator) {
    const rows = [];
    let row = [], cell = '', quoted = false;
    for (let i = 0; i < text.length; i++) {
        const character = text[i];
        if (quoted) {
            if (character === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (character === '"') quoted = false; else cell += character;
        } else if (character === '"' && !cell) quoted = true;
        else if (character === separator) { row.push(cell); cell = ''; }
        else if (character === '\n' || character === '\r') { if (character === '\r' && text[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
        else cell += character;
    }
    if (cell || row.length) { row.push(cell); rows.push(row); }
    return rows;
}

/* ---------- JSON Lines ---------- */

/**
 * Returns the records of one section as JSON Lines, one record per line.
 * @param {object|null} section - the section with its data: name and data (its records as Maps).
 * @returns {{text: string}|{error: string}} the text, or the reason there is none.
 */
export function convertToJsonl(section) {
    if (!section) return { error: 'The document has no section yet' };
    if (!section.data || !section.data.length) return { error: `"${section.name}" has no records` };
    return { text: section.data.map(record => formatJson(record, 0)).join('\n') + '\n' };
}

/**
 * Returns the values of JSON Lines text, one per line that is not empty.
 * @param {string} text - the JSON Lines text.
 * @returns {Array} the values.
 * @throws {Error} with the line number when a line is no JSON.
 */
export function convertFromJsonl(text) {
    return text.split(/\r?\n/).filter(line => line.trim()).map((line, i) => {
        try { return parseJson(line); } catch (e) { throw new Error(`Line ${i + 1}: ${e.message}`); }
    });
}
