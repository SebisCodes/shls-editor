/**
 * The rows of the records view, made from the model of shls.js: per section its row, the row
 * of its key block with a row per key (nested keys below theirs), and a row per record with a
 * row per value (a nested list with its records below it). Every row knows its lines in the
 * code, and every line of the code knows its row.
 */

import { formatCount } from './util.js?v=3';

/**
 * A row of the records view.
 * @typedef {object} ViewRow
 * @property {string} id - the row's id (see getPlaceId() in view-path.js).
 * @property {string} parent - the id of the row it folds into, "" for a section.
 * @property {string} kind - "section", "keys", "key", "record" or "field".
 * @property {string} sec - the section's name.
 * @property {number} depth - the indentation level in the view.
 * @property {number} line - its first line in the code, 0-based.
 * @property {number} end - its last line in the code.
 * @property {string} label - the name shown (section, key, "#3" for a record).
 * @property {boolean} kids - true when it has rows that fold into it.
 * @property {string} [info] - the summary shown next to it.
 * @property {number[]} [keyPath] - a key: its path in the key block.
 * @property {string[]} [keyNames] - a key: the names along its path.
 * @property {boolean} [nested] - a key: true when it holds a nested list.
 * @property {number[]} [recPath] - a record or value: the record's path.
 * @property {string[]} [names] - a record or value: the keys of the nested lists along its path.
 * @property {string} [preview] - a record: its first values.
 * @property {number} [field] - a value: its index in the record.
 * @property {string} [value] - a value: its text.
 * @property {boolean} [list] - a value: true when it holds a nested list.
 */

/**
 * The rows of a model.
 * @typedef {object} ViewRows
 * @property {ViewRow[]} rows - every row (also folded ones), in order.
 * @property {Map<string, ViewRow>} rowsById - the rows by id.
 * @property {string[]} rowIdByLine - the id of the row of each line of the code, "" for none.
 */

/** The number of values a folded record shows. */
const PREVIEW_VALUES = 3;

/**
 * Returns the number of keys of a key block, nested keys included.
 * @param {object[]} keys - the keys.
 * @returns {number} the number of keys.
 */
function getKeyCount(keys) {
    return keys.reduce((count, key) => count + 1 + (key.sub ? getKeyCount(key.sub) : 0), 0);
}

/**
 * Creates the rows of a model.
 * @param {object} model - the model of shls.js parseModel().
 * @returns {ViewRows} the rows, by id and by line.
 */
export function createRows(model) {
    const result = { rows: [], rowsById: new Map(), rowIdByLine: new Array(model.lines.length).fill('') };
    for (const section of model.sections) addSectionRows(result, section);
    return result;
}

/**
 * Adds a row to the rows.
 * @param {ViewRows} result - the rows so far.
 * @param {ViewRow} row - the row.
 * @returns {void}
 */
function addRow(result, row) {
    result.rows.push(row);
    result.rowsById.set(row.id, row);
}

/**
 * Marks the row of a line; the first row of a line keeps it unless force is true.
 * @param {ViewRows} result - the rows so far.
 * @param {number|null|undefined} line - the line, 0-based.
 * @param {string} id - the row's id.
 * @param {boolean} [force] - true to take the line from an earlier row.
 * @returns {void}
 */
function setLineRow(result, line, id, force) {
    if (line != null && line >= 0 && line < result.rowIdByLine.length && (force || !result.rowIdByLine[line])) result.rowIdByLine[line] = id;
}

/**
 * Adds the rows of a section: its own row, its key block and its records.
 * @param {ViewRows} result - the rows so far.
 * @param {object} section - the section of the model.
 * @returns {void}
 */
function addSectionRows(result, section) {
    const sectionId = 's|' + section.name;
    const keyCount = section.keys ? getKeyCount(section.keys) : 0;
    addRow(result, { id: sectionId, parent: '', kind: 'section', sec: section.name, depth: 0, line: section.line, end: section.line, label: section.name, info: `${formatCount(section.records.length, 'record', 'records')} · ${formatCount(keyCount, 'key', 'keys')}`, kids: !!(section.keys || section.records.length) });
    for (const line of section.lines) setLineRow(result, line, sectionId, true);
    if (section.keys) {
        const keysId = 't|' + section.name;
        addRow(result, { id: keysId, parent: sectionId, kind: 'keys', sec: section.name, depth: 1, line: section.keyStart, end: section.keyEnd, label: 'Keys', info: 'the template of each record', kids: true });
        addKeyRows(result, section, section.keys, [], [], 2, keysId);
    }
    addRecordRows(result, section, section.records, [], [], 1, sectionId);
}

/**
 * Adds a row per key, the keys of a nested list below theirs.
 * @param {ViewRows} result - the rows so far.
 * @param {object} section - the section of the model.
 * @param {object[]} keys - the keys of this level.
 * @param {number[]} path - the path of the level.
 * @param {string[]} names - the names along the path.
 * @param {number} depth - the indentation level of the rows.
 * @param {string} parent - the id of the row they fold into.
 * @returns {void}
 */
function addKeyRows(result, section, keys, path, names, depth, parent) {
    for (const [i, key] of keys.entries()) {
        const keyPath = [...path, i], keyNames = [...names, key.name];
        const id = 'k|' + section.name + '|' + keyPath.join('.');
        addRow(result, { id, parent, kind: 'key', sec: section.name, depth, line: key.line, end: key.line, label: key.name, keyPath, keyNames, nested: !!key.sub, kids: !!key.sub, info: key.sub ? `nested list · ${formatCount(key.sub.length, 'key', 'keys')}` : '' });
        setLineRow(result, key.line, id);
        if (key.sub) addKeyRows(result, section, key.sub, keyPath, keyNames, depth + 1, id);
    }
}

/**
 * Adds a row per record with a row per value; a nested list's records follow its value row.
 * @param {ViewRows} result - the rows so far.
 * @param {object} section - the section of the model.
 * @param {object[]} records - the records of this list.
 * @param {number[]} path - the path of the list.
 * @param {string[]} names - the keys of the nested lists along the path.
 * @param {number} depth - the indentation level of the record rows.
 * @param {string} parent - the id of the row they fold into.
 * @returns {void}
 */
function addRecordRows(result, section, records, path, names, depth, parent) {
    for (const [i, record] of records.entries()) {
        const recPath = [...path, i];
        const id = 'r|' + section.name + '|' + recPath.join('.');
        const preview = record.fields.filter(field => !field.sub).slice(0, PREVIEW_VALUES).map(field => field.value).join(' · ');
        addRow(result, { id, parent, kind: 'record', sec: section.name, depth, line: record.start, end: record.end, label: `#${i + 1}`, recPath, names, preview, kids: true, info: '' });
        record.fields.forEach((field, j) => addFieldRow(result, section, field, j, recPath, names, depth + 1, id));
    }
}

/**
 * Adds the row of one value of a record; a nested list adds its records below it.
 * @param {ViewRows} result - the rows so far.
 * @param {object} section - the section of the model.
 * @param {object} field - the field of the record.
 * @param {number} index - its index in the record.
 * @param {number[]} recPath - the record's path.
 * @param {string[]} names - the keys of the nested lists along the path.
 * @param {number} depth - the indentation level of the row.
 * @param {string} parent - the id of the record's row.
 * @returns {void}
 */
function addFieldRow(result, section, field, index, recPath, names, depth, parent) {
    const id = 'f|' + section.name + '|' + recPath.join('.') + '|' + index;
    if (field.sub) {
        addRow(result, { id, parent, kind: 'field', list: true, sec: section.name, depth, line: field.line, end: field.end, label: field.key, value: field.value, recPath, names, field: index, kids: field.sub.length > 0, info: formatCount(field.sub.length, 'record', 'records') });
        setLineRow(result, field.line, id);
        addRecordRows(result, section, field.sub, [...recPath, index], [...names, field.key], depth + 1, id);
        return;
    }
    addRow(result, { id, parent, kind: 'field', sec: section.name, depth, line: field.line, end: field.line, label: field.key, value: field.value, recPath, names, field: index, kids: false });
    setLineRow(result, field.line, id);
}
