/**
 * Edits of sections: a new section at the end, a section removed with its key block and
 * records, and the records of another SHLS text appended to the sections of the same name.
 */

import { parseModel, getRecordLines, getIndent } from './shls.js?v=7';
import { NO_VALUE, getSection } from './edits-lines.js?v=3';
import { getRecordAddEdit } from './edits-records.js?v=3';

/** The name of a new section. */
const DEFAULT_SECTION = 'Section';

/**
 * Returns the edit that adds a section at the end, with two keys and one record.
 * @param {string} code - the code.
 * @param {object} model - its model.
 * @param {string} [name] - the wanted name; "name 2", "name 3" … when it is taken.
 * @returns {import('./edits-lines.js').CodeEdit} the edit; the new section is selected.
 */
export function getSectionAddEdit(code, model, name = DEFAULT_SECTION) {
    const taken = new Set(model.sections.map(section => section.name));
    let sectionName = name;
    for (let n = 2; taken.has(sectionName); n++) sectionName = `${name} ${n}`;
    const unit = ' '.repeat(model.unit || 1);
    const body = [sectionName, unit + 'Name', unit + 'Note', '', unit + NO_VALUE, unit + NO_VALUE];
    const trimmed = code.replace(/\s+$/, '');
    return { code: (trimmed ? trimmed + '\n\n' : '') + body.join('\n') + '\n', select: { kind: 'section', sec: sectionName } };
}

/**
 * Returns the edit that removes a section: every line from each of its section lines up to the
 * next section line of another section.
 * @param {string} code - the code.
 * @param {object} model - its model.
 * @param {string} sectionName - the section's name.
 * @returns {import('./edits-lines.js').CodeEdit} the edit; nothing is selected.
 * @throws {Error} when there is no section of that name.
 */
export function getSectionRemoveEdit(code, model, sectionName) {
    getSection(model, sectionName);
    const lines = model.lines;
    const removed = new Set();
    const starts = model.sections.flatMap(section => section.lines.map(line => ({ line, name: section.name }))).sort((a, b) => a.line - b.line);
    starts.forEach((start, i) => {
        if (start.name !== sectionName) return;
        const end = i + 1 < starts.length ? starts[i + 1].line : lines.length;
        for (let line = start.line; line < end; line++) removed.add(line);
    });
    const result = lines.filter((_, i) => !removed.has(i));
    while (result.length > 1 && !result[result.length - 1].trim() && !result[result.length - 2].trim()) result.pop();
    while (result.length && !result[0].trim()) result.shift();
    return { code: result.join('\n'), select: null };
}

/**
 * Returns the keys of a section as key block lines.
 * @param {object[]} keys - the keys.
 * @param {number} unit - the spaces of one level.
 * @param {number} [level] - the level of the keys.
 * @returns {string[]} the lines.
 */
export function getKeyLines(keys, unit, level = 1) {
    const lines = [];
    for (const key of keys) {
        lines.push(getIndent(unit, level) + key.name);
        if (key.sub) lines.push(...getKeyLines(key.sub, unit, level + 1));
    }
    return lines;
}

/**
 * Returns the edit that appends the records of another SHLS text to the sections of the same
 * name; sections that are not there are added at the end with their key block.
 * @param {string} code - the code.
 * @param {object} model - its model.
 * @param {object} other - the model of the other text.
 * @returns {{code: string, added: number}} the new code and the number of records added.
 * @throws {Error} when a record cannot be added.
 */
export function getRecordsAppendEdit(code, model, other) {
    let current = code, currentModel = model;
    let added = 0;
    for (const otherSection of other.sections) {
        if (!otherSection.records.length && !otherSection.keys) continue;
        const data = other.data && other.data.get(otherSection.name);
        const own = currentModel.sections.find(section => section.name === otherSection.name && section.keys);
        if (own && Array.isArray(data)) {
            for (const record of data) {
                current = getRecordAddEdit(current, currentModel, { sec: otherSection.name, values: record }).code;
                currentModel = parseModel(current);
                added++;
            }
        } else if (!own && otherSection.keys) {
            const appended = getSectionWithRecords(current, currentModel, otherSection, data);
            current = appended.code;
            added += appended.added;
            currentModel = parseModel(current);
        }
    }
    return { code: current, added };
}

/**
 * Returns the code with a section of another text added at the end: its key block and records.
 * @param {string} code - the code.
 * @param {object} model - its model.
 * @param {object} section - the section of the other text.
 * @param {Map[]|undefined} data - the section's records as data.
 * @returns {{code: string, added: number}} the new code and the number of records added.
 */
function getSectionWithRecords(code, model, section, data) {
    const unit = model.unit || 1;
    const body = [section.name, ...getKeyLines(section.keys, unit)];
    let added = 0;
    if (Array.isArray(data) && data.length) {
        for (const record of data) { body.push('', ...getRecordLines(section.keys, unit, 1, record)); added++; }
    }
    const trimmed = code.replace(/\s+$/, '');
    return { code: (trimmed ? trimmed + '\n\n' : '') + body.join('\n') + '\n', added };
}
