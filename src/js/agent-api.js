/**
 * What the AI Assistant (ai.js) and the WebMCP tools (mcp.js) get from the editor: the open
 * document for the prompt, its problems, the records of a section, a value or a record changed
 * by its path ("Company[0].Departments[1].Name", records counting from 0), the documents of
 * "My documents", replacing text and showing a line. Every change is one undo step.
 */

import { formatJson, convertFromJs } from './shls.js?v=8';
import { getValueEdit, getRecordAddEdit } from './edits.js?v=9';
import { getPathText } from './view-path.js?v=2';
import { store } from './files.js?v=8';
import { BLANK } from './samples.js?v=3';
import { state, areas, ui, AI_DOCUMENT, findSection } from './state.js?v=3';
import { formatCount } from './util.js?v=3';
import { setCode } from './history.js?v=5';
import { showCodePosition } from './code-view.js?v=5';
import { getLinePosition } from './text-position.js?v=3';
import { getCodeEdit, showEditError, writeCodeEdit } from './view-actions.js?v=5';
import { selectRowAtCursor } from './view-bar.js?v=5';
import { openDocument, createDocument } from './documents.js?v=5';
import { getSelectedTemplateRow } from './records-views.js?v=1';

/** The indentation of the JSON that get_records returns, in spaces. */
const JSON_INDENT = 2;
/** The message when a change needs readable SHLS. */
const FIX_FIRST = 'The code cannot be read as SHLS - fix it first (get_problems).';
/** The message when a path ends at a record. */
const PATH_ENDS_AT_RECORD = 'The path ends at a record - add .<key> for one of its values.';
/** A path: the section's name, then [n].key steps. */
const PATH_PATTERN = /^\s*([^[\]]+?)\s*((?:\[\d+\](?:\.[^.[\]]+)?)+)\s*$/;
/** One [n].key step of a path. */
const PATH_STEP = /\[(\d+)\](?:\.([^.[\]]+))?/g;

/**
 * A value found by its path.
 * @typedef {object} FoundValue
 * @property {string} [sec] - the section's name.
 * @property {number[]} [recPath] - the path of the value's record.
 * @property {number} [field] - the value's index in its record.
 * @property {number} [line] - the value's line, 0-based.
 * @property {string} [error] - why the path leads to no value.
 */

/**
 * Returns the problems with 1-based lines.
 * @returns {Array<{line: number, kind: string, msg: string}>} the problems.
 */
export function getProblemList() {
    return state.problems.map(problem => ({ ...problem, line: problem.line + 1 }));
}

/**
 * Returns what the AI prompt and get_document show of the open document.
 * @returns {object} code, name, document names, selected text, selected path, problems and the
 *   context of the page that holds the document.
 */
export function getPromptState() {
    const selected = getSelectedTemplateRow();
    return {
        code: state.code, name: state.name, files: store.getSortedEntries().map(entry => entry.name),
        sel: state.code.slice(ui.ta.selectionStart, ui.ta.selectionEnd),
        path: selected ? getPathText(selected) : '',
        problems: getProblemList().map(problem => `line ${problem.line}: ${problem.msg}`),
        context: areas.sync?.getContext() || null,
    };
}

/**
 * Returns the value a path leads to.
 * @param {string} path - the path, e.g. "Company[0].Departments[1].Name".
 * @returns {FoundValue} the value's place, or the reason there is none.
 */
function getValueAt(path) {
    const match = PATH_PATTERN.exec(path);
    if (!match) return { error: `"${path}" is not a path - write it like Product[0].Price (records count from 0)` };
    const sec = match[1];
    const section = findSection(sec);
    if (!section) return { error: `There is no section "${sec}" - call get_records to see the sections.` };
    const steps = [...match[2].matchAll(PATH_STEP)].map(step => ({ index: +step[1], key: step[2] }));
    const recPath = [];
    let records = section.records;
    for (let k = 0; k < steps.length; k++) {
        const step = steps[k];
        const record = records[step.index];
        if (!record) return { error: `There is no record ${step.index} at ${sec}${steps.slice(0, k).map(before => `[${before.index}].${before.key}`).join('')} (${records.length} records, counting from 0).` };
        recPath.push(step.index);
        if (!step.key) return { error: PATH_ENDS_AT_RECORD };
        const fieldIndex = record.fields.findIndex(field => field.key === step.key);
        if (fieldIndex < 0) return { error: `The record has no key "${step.key}" (keys: ${record.fields.map(field => field.key).join(', ')}).` };
        const field = record.fields[fieldIndex];
        if (k === steps.length - 1) return field.sub ? { error: `"${step.key}" is a nested list - add [n].<key> for one of its values.` } : { sec, recPath, field: fieldIndex, line: field.line };
        if (!field.sub) return { error: `"${step.key}" is a value, not a nested list.` };
        recPath.push(fieldIndex);
        records = field.sub;
    }
    return { error: PATH_ENDS_AT_RECORD };
}

/**
 * get_records: the sections with their records and keys, or one section's records as JSON.
 * @param {string} sectionName - the section, "" for the list of sections.
 * @returns {{text: string}|{error: string}} the text for the agent, or the reason there is none.
 */
export function getAgentRecords(sectionName) {
    if (state.model.error) return { error: state.model.error };
    if (!sectionName) return { text: state.model.sections.map(section => `"${section.name}": ${formatCount(section.records.length, 'record', 'records')}, keys: ${section.keys ? section.keys.map(key => key.name + (key.sub ? '[…]' : '')).join(', ') : '(none)'}`).join('\n') || 'No sections yet.' };
    const section = findSection(sectionName);
    if (!section) return { error: `There is no section "${sectionName}" - call get_records without a section to list them.` };
    return { text: `Section "${section.name}" (line ${section.line + 1}), keys: ${section.keys ? formatKeyNames(section.keys) : '(none)'}\n${formatJson(state.model.data.get(section.name) || [], JSON_INDENT)}` };
}

/**
 * Returns the names of keys with the keys of their nested lists in brackets.
 * @param {object[]} keys - the keys of a key block.
 * @returns {string} e.g. "Name, Location [Country, City]".
 */
function formatKeyNames(keys) {
    return keys.map(key => (key.sub ? `${key.name} [${formatKeyNames(key.sub)}]` : key.name)).join(', ');
}

/**
 * set_value: changes one value by its path (one undo step). The work of a WebMCP tool, which
 * returns the answer the tool sends back to the agent.
 * @param {string} path - the path.
 * @param {*} value - the new value; not a string, it is written as text.
 * @returns {{path: string}|{error: string}} the path, or the reason it did not work.
 */
export function setAgentValue(path, value) {
    if (state.model.error) return { error: FIX_FIRST };
    const found = getValueAt(path);
    if (found.error) return found;
    if (value === undefined || value === null) return { error: 'A value is needed.' };
    const result = getCodeEdit(() => getValueEdit(state.code, state.model, found.line, typeof value === 'string' ? value : String(value)));
    if ('error' in result) { showEditError(result.error); return { error: result.error }; }
    writeCodeEdit(result.edit);
    return { path: path.trim() };
}

/**
 * add_record: adds a record at the end of a section or after a record (one undo step). The work
 * of a WebMCP tool, which returns the answer the tool sends back to the agent.
 * @param {string} sectionName - the section.
 * @param {object} values - the values by key; a nested list is an array of such objects.
 * @param {number} [after] - add after this record (0 = the first).
 * @returns {{path: string}|{error: string}} the new record's path, or the reason it did not work.
 */
export function addAgentRecord(sectionName, values, after) {
    if (state.model.error) return { error: FIX_FIRST };
    const section = findSection(sectionName);
    if (!section) return { error: `There is no section "${sectionName}" - call get_records to see the sections.` };
    const at = after == null ? null : Math.max(0, Math.round(+after) + 1);
    let edit;
    try { edit = getRecordAddEdit(state.code, state.model, { sec: sectionName, values: convertFromJs(values), at }); } catch (e) { return { error: e.message }; }
    const index = edit.select && edit.select.recPath ? edit.select.recPath[0] : section.records.length;
    writeCodeEdit(edit);
    return { path: `${sectionName}[${index}]` };
}

/**
 * Returns the documents for list_files.
 * @returns {Array<{name: string, updated: number, open: boolean}>} the documents, the most recently changed first.
 */
export function getFileList() {
    return store.getSortedEntries().map(entry => ({ name: entry.name, updated: entry.updated, open: entry.id === state.fileId }));
}

/**
 * Opens a document by name. Returns whether there is one.
 * @param {string} name - the name.
 * @returns {boolean} true when a document of that name exists.
 */
export function openFileByName(name) {
    const entry = store.findByName(name);
    if (entry && entry.id !== state.fileId) openDocument(entry.id);
    return !!entry;
}

/**
 * Creates and opens a document for an agent. A command that returns the name it got.
 * @param {string} name - the wanted name.
 * @param {string} [code] - the code; empty without it.
 * @returns {string|null} the document's name, null when the browser storage is full.
 */
export function createFile(name, code) {
    return createDocument(name || AI_DOCUMENT, code || BLANK) && state.name;
}

/**
 * Replaces text in the code (one undo step). The work of the WebMCP tool replace_text, which
 * returns the number of places the tool sends back to the agent.
 * @param {string} find - the exact text to find.
 * @param {string} replacement - the new text.
 * @param {boolean} all - true for every match, else the first.
 * @returns {number} the number of replaced places, 0 when the text is not there.
 */
export function updateText(find, replacement, all) {
    if (!find) return 0;
    const count = state.code.split(find).length - 1;
    if (!count) return 0;
    setCode(all ? state.code.split(find).join(replacement) : state.code.replace(find, () => replacement));
    return all ? count : 1;
}

/**
 * Moves the cursor to a line and selects its place in the records view.
 * @param {number} line - the line, 1-based.
 * @returns {void}
 */
export function showAgentLine(line) {
    showCodePosition(getLinePosition(line));
    selectRowAtCursor();
}
