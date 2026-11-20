/**
 * Edits of keys: a key added, duplicated, moved or removed in the key block is added,
 * duplicated, moved or removed in every record of the section (in all its data blocks); a new
 * key gets the value "-" in every record.
 */

import { getKeyAt, getRecordsAt, getKeyEnd, getFieldEnd, getCleanValue } from './shls.js?v=7';
import { NO_VALUE, getIndentText, getEditedCode, getSection } from './edits-lines.js?v=3';

/** The name of a new key. */
const DEFAULT_KEY = 'Key';

/**
 * Returns a key with its siblings and the records that have a value for it.
 * @param {object} model - the model.
 * @param {string} sectionName - the section's name.
 * @param {number[]} keyPath - the key's path in the key block.
 * @returns {{section: object, keys: object[], index: number, key: object, records: object[]}} the
 *   section, the keys of its level, the key's index, the key and the records of that level.
 * @throws {Error} when the section has no key block or the key is not there.
 */
function getKeyContext(model, sectionName, keyPath) {
    const section = getSection(model, sectionName);
    if (!section.keys) throw new Error(`"${sectionName}" has no key block`);
    const parentPath = keyPath.slice(0, -1);
    const keys = parentPath.length ? getKeyAt(section.keys, parentPath)?.sub : section.keys;
    const index = keyPath[keyPath.length - 1];
    if (!keys || !keys[index]) throw new Error('This key is not there any more');
    return { section, keys, index, key: keys[index], records: getRecordsAt(section, parentPath).filter(record => record.fields.length) };
}

/**
 * Returns a key name no sibling has: the name, or "name 2", "name 3" ….
 * @param {object[]} keys - the keys of the level.
 * @param {string} base - the wanted name.
 * @returns {string} the free name.
 */
function getUniqueKeyName(keys, base) {
    const taken = new Set(keys.map(key => key.name));
    if (!taken.has(base)) return base;
    for (let n = 2; ; n++) if (!taken.has(`${base} ${n}`)) return `${base} ${n}`;
}

/**
 * Returns the edit that adds a key after a key (first: before it); every record gets "-" for it.
 * @param {string} code - the code.
 * @param {object} model - its model.
 * @param {string} sectionName - the section's name.
 * @param {number[]} keyPath - the key's path.
 * @param {object} [options] - the new key.
 * @param {string} [options.name] - its name (made free among its siblings).
 * @param {boolean} [options.first] - true to add it before the key.
 * @returns {import('./edits-lines.js').CodeEdit} the edit; the new key is selected.
 * @throws {Error} when the section has no key block or the key is not there.
 */
export function getKeyAddEdit(code, model, sectionName, keyPath, { name = DEFAULT_KEY, first = false } = {}) {
    const lines = model.lines;
    const { keys, index, key, records } = getKeyContext(model, sectionName, keyPath);
    const keyName = getUniqueKeyName(keys, getCleanValue(name).value || DEFAULT_KEY);
    const keyIndent = getIndentText(lines[key.line]);
    const lineEdits = [first ? { at: key.line, ins: [keyIndent + keyName] } : { at: getKeyEnd(key) + 1, ins: [keyIndent + keyName] }];
    for (const record of records) {
        const field = record.fields[index];
        if (!field) continue;
        const recordIndent = getIndentText(lines[record.fields[0].line]);
        lineEdits.push(first ? { at: field.line, ins: [recordIndent + NO_VALUE] } : { at: getFieldEnd(field) + 1, ins: [recordIndent + NO_VALUE] });
    }
    const newPath = [...keyPath.slice(0, -1), first ? index : index + 1];
    return { code: getEditedCode(lines, lineEdits), select: { kind: 'key', sec: sectionName, keyPath: newPath } };
}

/**
 * Returns the edit that adds a copy of a key (with its nested keys) after it, and a copy of its
 * value in every record.
 * @param {string} code - the code.
 * @param {object} model - its model.
 * @param {string} sectionName - the section's name.
 * @param {number[]} keyPath - the key's path.
 * @returns {import('./edits-lines.js').CodeEdit} the edit; the copy is selected.
 * @throws {Error} when the section has no key block or the key is not there.
 */
export function getKeyDuplicateEdit(code, model, sectionName, keyPath) {
    const lines = model.lines;
    const { keys, index, key, records } = getKeyContext(model, sectionName, keyPath);
    const block = lines.slice(key.line, getKeyEnd(key) + 1);
    block[0] = getIndentText(block[0]) + getUniqueKeyName(keys, key.name);
    const lineEdits = [{ at: getKeyEnd(key) + 1, ins: block }];
    for (const record of records) {
        const field = record.fields[index];
        if (!field) continue;
        lineEdits.push({ at: getFieldEnd(field) + 1, ins: lines.slice(field.line, getFieldEnd(field) + 1) });
    }
    return { code: getEditedCode(lines, lineEdits), select: { kind: 'key', sec: sectionName, keyPath: [...keyPath.slice(0, -1), index + 1] } };
}

/**
 * Returns the edit that removes a key and its value in every record.
 * @param {string} code - the code.
 * @param {object} model - its model.
 * @param {string} sectionName - the section's name.
 * @param {number[]} keyPath - the key's path.
 * @returns {import('./edits-lines.js').CodeEdit} the edit; the next key (or the one before) is selected.
 * @throws {Error} when the key is the only one of its key block or is not there.
 */
export function getKeyRemoveEdit(code, model, sectionName, keyPath) {
    const lines = model.lines;
    const { keys, index, key, records } = getKeyContext(model, sectionName, keyPath);
    if (keys.length === 1) throw new Error('A key block needs at least one key - add another key first');
    const lineEdits = [{ at: key.line, del: getKeyEnd(key) - key.line + 1 }];
    for (const record of records) {
        const field = record.fields[index];
        if (!field) continue;
        lineEdits.push({ at: field.line, del: getFieldEnd(field) - field.line + 1 });
    }
    const next = Math.min(index, keys.length - 2);
    return { code: getEditedCode(lines, lineEdits), select: { kind: 'key', sec: sectionName, keyPath: [...keyPath.slice(0, -1), next] } };
}

/**
 * Returns the edit that moves a key one place up or down, and its value in every record.
 * @param {string} code - the code.
 * @param {object} model - its model.
 * @param {string} sectionName - the section's name.
 * @param {number[]} keyPath - the key's path.
 * @param {number} by - -1 for up, 1 for down.
 * @returns {import('./edits-lines.js').CodeEdit} the edit; the moved key is selected.
 * @throws {Error} when the key is not there or is the first (last) one.
 */
export function getKeyMoveEdit(code, model, sectionName, keyPath, by) {
    const lines = model.lines.slice();
    const { keys, index, records } = getKeyContext(model, sectionName, keyPath);
    const target = index + by;
    if (target < 0 || target >= keys.length) throw new Error(by < 0 ? 'This is the first key' : 'This is the last key');
    const [upper, lower] = by < 0 ? [target, index] : [index, target];
    const swaps = [[keys[upper].line, getKeyEnd(keys[upper]), keys[lower].line, getKeyEnd(keys[lower])]];
    for (const record of records) {
        const upperField = record.fields[upper], lowerField = record.fields[lower];
        if (upperField && lowerField) swaps.push([upperField.line, getFieldEnd(upperField), lowerField.line, getFieldEnd(lowerField)]);
    }
    // Each swap keeps the length of its range (upper start to lower end), so they do not move each other.
    let result = lines;
    for (const [upperStart, upperEnd, lowerStart, lowerEnd] of swaps) {
        const upperLines = result.slice(upperStart, upperEnd + 1), lowerLines = result.slice(lowerStart, lowerEnd + 1), between = result.slice(upperEnd + 1, lowerStart);
        result = [...result.slice(0, upperStart), ...lowerLines, ...between, ...upperLines, ...result.slice(lowerEnd + 1)];
    }
    return { code: result.join('\n'), select: { kind: 'key', sec: sectionName, keyPath: [...keyPath.slice(0, -1), target] } };
}

/* ---------- Sections ---------- */
