/**
 * Edits of values, key and section names, and of records: added, duplicated, moved or removed
 * as whole lines, the blank lines between records kept in their style.
 */

import { getRecordLines, getKeyAt, getCleanValue } from './shls.js?v=8';
import { getIndentText, getEditedCode, getSection, getRecordAt, hasBlankLineStyle } from './edits-lines.js?v=3';

/* ---------- Values, keys and section names ---------- */

/**
 * Returns the edit that sets a value's line (its indentation kept).
 * @param {string} code - the code.
 * @param {object} model - its model.
 * @param {number} line - the value's line, 0-based.
 * @param {string} text - the new value; cleaned as SHLS needs (one line, no leading spaces).
 * @returns {import('./edits-lines.js').CodeEdit} the edit, with how the value was cleaned.
 * @throws {Error} when the value is empty or the line is not there.
 */
export function getValueEdit(code, model, line, text) {
    const cleaned = getCleanValue(text);
    if (!cleaned.value) throw new Error('SHLS has no empty values (a blank line is skipped) - write a placeholder such as - or PH');
    const lines = model.lines.slice();
    if (lines[line] == null) throw new Error('This line is not there any more');
    lines[line] = getIndentText(lines[line]) + cleaned.value;
    return { code: lines.join('\n'), changed: cleaned.changed };
}

/**
 * Returns the edit that renames a key in the key block (the records stay as they are).
 * @param {string} code - the code.
 * @param {object} model - its model.
 * @param {string} sectionName - the section's name.
 * @param {number[]} keyPath - the key's path in the key block.
 * @param {string} name - the new name.
 * @returns {import('./edits-lines.js').CodeEdit} the edit.
 * @throws {Error} when the key is not there or the name is empty.
 */
export function getKeyRenameEdit(code, model, sectionName, keyPath, name) {
    const section = getSection(model, sectionName);
    const key = getKeyAt(section.keys, keyPath);
    if (!key) throw new Error('This key is not there any more');
    const cleaned = getCleanValue(name);
    if (!cleaned.value) throw new Error('A key needs a name');
    const lines = model.lines.slice();
    lines[key.line] = getIndentText(lines[key.line]) + cleaned.value;
    return { code: lines.join('\n') };
}

/**
 * Returns the edit that renames a section on each of its section lines.
 * @param {string} code - the code.
 * @param {object} model - its model.
 * @param {string} sectionName - the section's name.
 * @param {string} name - the new name.
 * @returns {import('./edits-lines.js').CodeEdit} the edit; the renamed section is selected.
 * @throws {Error} when the name is empty or another section has it.
 */
export function getSectionRenameEdit(code, model, sectionName, name) {
    const section = getSection(model, sectionName);
    const cleaned = getCleanValue(name);
    if (!cleaned.value) throw new Error('A section needs a name');
    if (cleaned.value !== sectionName && model.sections.some(other => other.name === cleaned.value)) throw new Error(`There is already a section "${cleaned.value}"`);
    const lines = model.lines.slice();
    for (const line of section.lines) lines[line] = cleaned.value;
    return { code: lines.join('\n'), select: { kind: 'section', sec: cleaned.value } };
}

/* ---------- Records ---------- */

/**
 * Returns the indentation of a record, in spaces.
 * @param {string[]} lines - the lines of the code.
 * @param {object|undefined} record - the record.
 * @param {number} fallback - the indentation without a record.
 * @returns {number} the spaces before its first line.
 */
function getRecordLevel(lines, record, fallback) {
    return record && record.start != null ? getIndentText(lines[record.start]).length : fallback;
}

/**
 * Returns where a new record goes: its list, keys, the index it follows and its indentation.
 * @param {object} model - the model.
 * @param {object} section - the section.
 * @param {number[]} [recPath] - the record it follows; without it, the end of the section.
 * @returns {{list: object[], keys: object[], after: number, level: number}} the place.
 * @throws {Error} when the record is not there.
 */
function getNewRecordPlace(model, section, recPath) {
    if (!recPath || !recPath.length) {
        const list = section.records;
        return { list, keys: section.keys, after: list.length - 1, level: list.length ? getRecordLevel(model.lines, list[0], model.unit) : model.unit };
    }
    const found = getRecordAt(model, section.name, recPath);
    if (!found) throw new Error('This record is not there any more');
    return { list: found.list, keys: found.keys, after: found.idx, level: getRecordLevel(model.lines, found.rec, model.unit) };
}

/**
 * Returns the edit that adds a record after a record (or at the end of the section), with "-"
 * or the given values.
 * @param {string} code - the code.
 * @param {object} model - its model.
 * @param {object} options - where and what.
 * @param {string} options.sec - the section's name.
 * @param {number[]} [options.recPath] - the record it follows (in a nested list: a record of that list).
 * @param {Map|null} [options.values] - the values by key; "-" for each one missing.
 * @param {number|null} [options.at] - the index the new record gets in its list.
 * @returns {import('./edits-lines.js').CodeEdit} the edit; the new record is selected.
 * @throws {Error} when the section has no key block or the record is not there.
 */
export function getRecordAddEdit(code, model, { sec, recPath, values = null, at = null }) {
    const lines = model.lines;
    const section = getSection(model, sec);
    if (!section.keys || !section.keys.length) throw new Error(`"${sec}" has no key block - write its keys first`);
    const place = getNewRecordPlace(model, section, recPath);
    const after = at != null ? at - 1 : place.after;
    const body = getRecordLines(place.keys, model.unit, place.level / model.unit, values);
    const separated = hasBlankLineStyle(lines, place.list);
    let lineEdits, newIndex;
    if (!place.list.length) {
        // The first record: after the key block, behind exactly one blank line.
        lineEdits = [{ at: section.keyEnd + 1, ins: ['', ...body] }];
        newIndex = 0;
    } else if (after < 0) {
        lineEdits = [{ at: place.list[0].start, ins: separated ? [...body, ''] : body }];
        newIndex = 0;
    } else {
        lineEdits = [{ at: place.list[after].end + 1, ins: separated ? ['', ...body] : body }];
        newIndex = after + 1;
    }
    const parent = recPath && recPath.length ? recPath.slice(0, -1) : [];
    return { code: getEditedCode(lines, lineEdits), select: { kind: 'record', sec, recPath: [...parent, newIndex] } };
}

/**
 * Returns the edit that adds a copy of a record after it.
 * @param {string} code - the code.
 * @param {object} model - its model.
 * @param {string} sectionName - the section's name.
 * @param {number[]} recPath - the record's path.
 * @returns {import('./edits-lines.js').CodeEdit} the edit; the copy is selected.
 * @throws {Error} when the record is not there.
 */
export function getRecordDuplicateEdit(code, model, sectionName, recPath) {
    const lines = model.lines;
    const found = getRecordAt(model, sectionName, recPath);
    if (!found) throw new Error('This record is not there any more');
    const copy = lines.slice(found.rec.start, found.rec.end + 1);
    const lineEdits = [{ at: found.rec.end + 1, ins: hasBlankLineStyle(lines, found.list) ? ['', ...copy] : copy }];
    return { code: getEditedCode(lines, lineEdits), select: { kind: 'record', sec: sectionName, recPath: [...recPath.slice(0, -1), found.idx + 1] } };
}

/**
 * Returns the edit that removes a record with the blank line that separates it.
 * @param {string} code - the code.
 * @param {object} model - its model.
 * @param {string} sectionName - the section's name.
 * @param {number[]} recPath - the record's path.
 * @returns {import('./edits-lines.js').CodeEdit} the edit; the next record (or the one before, its parent, the section) is selected.
 * @throws {Error} when the record is not there.
 */
export function getRecordRemoveEdit(code, model, sectionName, recPath) {
    const lines = model.lines;
    const found = getRecordAt(model, sectionName, recPath);
    if (!found) throw new Error('This record is not there any more');
    let from = found.rec.start, to = found.rec.end;
    if (found.idx > 0 && from > 0 && !lines[from - 1].trim()) from--;
    else if (found.idx === 0 && found.list.length > 1 && !lines[to + 1]?.trim()) to++;
    else if (found.list.length === 1 && from > 0 && !lines[from - 1].trim() && (to + 1 >= lines.length || !lines[to + 1].trim())) from--;
    const next = Math.min(found.idx, found.list.length - 2);
    const select = next >= 0 ? { kind: 'record', sec: sectionName, recPath: [...recPath.slice(0, -1), next] }
        : recPath.length > 1 ? { kind: 'record', sec: sectionName, recPath: recPath.slice(0, -2) } : { kind: 'section', sec: sectionName };
    return { code: getEditedCode(lines, [{ at: from, del: to - from + 1 }]), select };
}

/**
 * Returns the edit that moves a record one place up or down in its list.
 * @param {string} code - the code.
 * @param {object} model - its model.
 * @param {string} sectionName - the section's name.
 * @param {number[]} recPath - the record's path.
 * @param {number} by - -1 for up, 1 for down.
 * @returns {import('./edits-lines.js').CodeEdit} the edit; the moved record is selected.
 * @throws {Error} when the record is not there or is the first (last) one.
 */
export function getRecordMoveEdit(code, model, sectionName, recPath, by) {
    const lines = model.lines;
    const found = getRecordAt(model, sectionName, recPath);
    if (!found) throw new Error('This record is not there any more');
    const target = found.idx + by;
    if (target < 0 || target >= found.list.length) throw new Error(by < 0 ? 'This is the first record' : 'This is the last record');
    const [upper, lower] = by < 0 ? [found.list[target], found.rec] : [found.rec, found.list[target]];
    const upperLines = lines.slice(upper.start, upper.end + 1), lowerLines = lines.slice(lower.start, lower.end + 1), between = lines.slice(upper.end + 1, lower.start);
    const result = [...lines.slice(0, upper.start), ...lowerLines, ...between, ...upperLines, ...lines.slice(lower.end + 1)];
    return { code: result.join('\n'), select: { kind: 'record', sec: sectionName, recPath: [...recPath.slice(0, -1), target] } };
}
