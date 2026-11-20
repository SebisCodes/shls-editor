/**
 * The parts the edits of edits-*.js share: the shape of an edit, applying line edits to the
 * code, and finding a section and a record in the model (shls.js parseModel()).
 */

/** The value of a new key in every record and of the values of a new section (SHLS has no empty values). */
export const NO_VALUE = '-';

/**
 * An edit of the code.
 * @typedef {object} CodeEdit
 * @property {string} code - the new code.
 * @property {import('./state.js').ViewPlace|null} [select] - the place to select afterwards; null selects
 *   nothing, without it the selection stays.
 * @property {string} [changed] - a value edit: how the value was cleaned ("lines" or "spaces"), "" when not.
 */

/**
 * An edit of whole lines: at a line of the old code, remove some lines and add others.
 * @typedef {object} LineEdit
 * @property {number} at - the index of the line in the old code.
 * @property {number} [del] - how many lines to remove there.
 * @property {string[]} [ins] - the lines to add there.
 */

/**
 * Returns the indentation of a line.
 * @param {string} line - the line.
 * @returns {string} its leading spaces.
 */
export function getIndentText(line) {
    return /^ */.exec(line)[0];
}

/**
 * Returns the code after line edits, applied from the bottom up so they do not move each other.
 * @param {string[]} lines - the lines of the old code.
 * @param {LineEdit[]} lineEdits - the edits, in any order.
 * @returns {string} the new code.
 */
export function getEditedCode(lines, lineEdits) {
    const result = lines.slice();
    const bottomUp = lineEdits.slice().sort((a, b) => b.at - a.at || (b.del || 0) - (a.del || 0));
    for (const lineEdit of bottomUp) result.splice(lineEdit.at, lineEdit.del || 0, ...(lineEdit.ins || []));
    return result.join('\n');
}

/**
 * Returns a section of the model.
 * @param {object} model - the model.
 * @param {string} name - the section's name.
 * @returns {object} the section.
 * @throws {Error} when there is no section of that name.
 */
export function getSection(model, name) {
    const section = model.sections.find(item => item.name === name);
    if (!section) throw new Error(`There is no section "${name}"`);
    return section;
}

/**
 * Returns the record at a path ([record, field, record, field, record …] in the section's
 * records, all data blocks in their order) with its list, keys and index.
 * @param {object} model - the model.
 * @param {string} sectionName - the section's name.
 * @param {number[]} recPath - the record's path.
 * @returns {{rec: object, list: object[], keys: object[]|null, idx: number, section: object}|null} the record, null when it is not there.
 * @throws {Error} when there is no section of that name.
 */
export function getRecordAt(model, sectionName, recPath) {
    const section = getSection(model, sectionName);
    let list = section.records, keys = section.keys, record = null, index = -1;
    for (let k = 0; k < recPath.length; k += 2) {
        index = recPath[k];
        record = list[index];
        if (!record) return null;
        if (k + 1 < recPath.length) {
            const field = record.fields[recPath[k + 1]];
            if (!field || !field.sub) return null;
            keys = (keys || []).find(key => key.name === field.key)?.sub || null;
            list = field.sub;
        }
    }
    return record ? { rec: record, list, keys, idx: index, section } : null;
}

/**
 * Tells whether the records of a list are separated by blank lines.
 * @param {string[]} lines - the lines of the code.
 * @param {object[]} list - the records.
 * @returns {boolean} true when a record after the first follows a blank line.
 */
export function hasBlankLineStyle(lines, list) {
    return list.slice(1).some(record => record.start > 0 && !lines[record.start - 1].trim());
}
