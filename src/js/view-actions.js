/**
 * Changes made in the records view: a value, key or section name edited in place, and the
 * actions of the buttons above the view, of the side panel and of the Delete key (add,
 * duplicate, move up or down, remove).
 *
 * Every change is an edit of whole lines of the code (edits.js), written as one undo step;
 * the changed place is selected afterwards. Removing a section, or a key that records have
 * values for, asks first.
 */

import { openConfirmation } from './dialogs.js?v=5';
import * as edits from './edits.js?v=8';
import { state, areas, CANNOT_READ, showToast, translate, findSection } from './state.js?v=2';
import { setCode, addPendingHistoryStep } from './history.js?v=3';
import { showRowInCode } from './code-view.js?v=3';
import { renderNode } from './node-panel.js?v=3';

/** The message when a value's line breaks became spaces. */
const VALUE_LINES_JOINED = 'SHLS values have one line - the line breaks became spaces';
/** The message when spaces around a value were removed. */
const VALUE_SPACES_REMOVED = 'Spaces around the value were removed - SHLS values cannot start with spaces';
/** The kinds of edits in place the records view sends. */
const IN_VIEW_EDITS = ['value', 'key', 'section'];

/**
 * Writes one edit into the code as one undo step and selects the changed place; when the edit
 * cannot be made, shows the reason. A command that returns whether it took place.
 * @param {function(): import('./edits-lines.js').CodeEdit} createEdit - makes the edit from the code and the model; it
 *   throws an Error with a message for the user when the edit is not possible.
 * @returns {boolean} true when the edit took place (also when it changes nothing).
 */
export function editCodeFromTree(createEdit) {
    const result = getCodeEdit(createEdit);
    if ('error' in result) { showEditError(result.error); return false; }
    writeCodeEdit(result.edit);
    return true;
}

/**
 * Returns the edit a function makes, or the reason it cannot be made.
 * @param {function(): import('./edits-lines.js').CodeEdit} createEdit - makes the edit; it throws an Error with a
 *   message for the user when the edit is not possible.
 * @returns {{edit: import('./edits-lines.js').CodeEdit}|{error: string}} the edit, or the reason.
 */
export function getCodeEdit(createEdit) {
    try { return { edit: createEdit() }; } catch (e) { return { error: e.message }; }
}

/**
 * Shows why an edit cannot be made.
 * @param {string} error - the reason, in English.
 * @returns {void}
 */
export function showEditError(error) {
    showToast(translate(error));
}

/**
 * Writes an edit into the code as one undo step and selects the changed place (the place the edit
 * names, else the selected place stays selected); an edit that changes nothing is skipped.
 * @param {import('./edits-lines.js').CodeEdit} edit - the edit.
 * @returns {void}
 */
export function writeCodeEdit(edit) {
    if (edit.code === state.code) return;
    const kept = areas.view.getSelectedPlace();
    addPendingHistoryStep();
    setCode(edit.code);
    if (edit.select !== undefined) { if (edit.select) areas.view.select(edit.select); } else if (kept) areas.view.select(kept, { scroll: false });
    const row = areas.view.getSelectedRow();
    if (row) showRowInCode(row);
    renderNode();
}

/**
 * Takes an edit in place from the records view (the onEdit answer of createView(), whose shape
 * view.js dictates); a value that was cleaned (line breaks or leading spaces) is told.
 * @param {object} request - the edit.
 * @param {string} request.what - "value", "key" or "section".
 * @param {object} request.row - the row that is edited.
 * @param {string} [request.text] - the new text.
 * @param {string} [request.phase] - "start" when the field is about to open.
 * @returns {true|string} true when the edit is taken (or may start), else the reason.
 */
export function editInView({ what, row, text, phase }) {
    if (phase === 'start') return true;
    if (!IN_VIEW_EDITS.includes(what)) return 'unknown';
    const result = getCodeEdit(() => createInViewEdit(what, row, text));
    if ('error' in result) { showEditError(result.error); return result.error; }
    writeCodeEdit(result.edit);
    if (result.edit.changed) showToast(result.edit.changed === 'lines' ? VALUE_LINES_JOINED : VALUE_SPACES_REMOVED);
    return true;
}

/**
 * Returns the edit of a value, key or section name changed in place.
 * @param {string} what - "value", "key" or "section".
 * @param {object} row - the row that is edited.
 * @param {string} text - the new text.
 * @returns {import('./edits-lines.js').CodeEdit} the edit.
 * @throws {Error} with a message for the user when the edit is not possible.
 */
function createInViewEdit(what, row, text) {
    if (what === 'value') return edits.getValueEdit(state.code, state.model, row.line, text);
    if (what === 'key') return edits.getKeyRenameEdit(state.code, state.model, row.sec, row.keyPath, text);
    return edits.getSectionRenameEdit(state.code, state.model, row.sec, text);
}

/**
 * Runs an action of the buttons, the side panel or the Delete key on a row of the view.
 * @param {string} action - "add", "key", "dup", "up", "down", "remove" or "section".
 * @param {object|null} [row] - the row; without it, the selected one.
 * @returns {Promise<void>} settles when the action is done (removing may ask first).
 */
export async function runViewAction(action, row = areas.view.getSelectedRow()) {
    if (action === 'section') { editCodeFromTree(() => edits.getSectionAddEdit(state.code, state.model)); return; }
    if (!row) { addFirstSection(action); return; }
    if (state.model.error && action !== 'remove') { showToast(CANNOT_READ); return; }
    if (row.kind === 'section' || row.kind === 'keys') { await runSectionAction(action, row); return; }
    if (row.kind === 'key') { await runKeyAction(action, row); return; }
    if (row.kind === 'field' && row.list && action === 'add') { addNestedRecord(row); return; }
    const recPath = row.kind === 'record' || row.kind === 'field' ? row.recPath : null;
    if (recPath) runRecordAction(action, row, recPath);
}

/**
 * Without a selection: "add" makes the first section of an empty document; anything else asks
 * for a selection.
 * @param {string} action - the action.
 * @returns {void}
 */
function addFirstSection(action) {
    if (action === 'add' && state.model && !state.model.sections.length) { editCodeFromTree(() => edits.getSectionAddEdit(state.code, state.model)); return; }
    showToast('Choose a section, key or record first');
}

/**
 * Returns the index of the last key of a section's key block.
 * @param {string} sectionName - the section's name.
 * @returns {number} the index, 0 when the section has no keys.
 */
function getLastKeyIndex(sectionName) {
    const section = findSection(sectionName);
    return section && section.keys ? section.keys.length - 1 : 0;
}

/**
 * Runs an action on a section or its key block: add a record or a key, remove the section.
 * @param {string} action - the action.
 * @param {object} row - the section's row or its key block's row.
 * @returns {Promise<void>} settles when the action is done.
 */
async function runSectionAction(action, row) {
    if (action === 'add') editCodeFromTree(() => edits.getRecordAddEdit(state.code, state.model, { sec: row.sec }));
    else if (action === 'key') editCodeFromTree(() => edits.getKeyAddEdit(state.code, state.model, row.sec, [getLastKeyIndex(row.sec)]));
    else if (action === 'remove') await removeSectionAfterAsking(row.sec);
    else showToast('Choose a key or a record to move or duplicate it');
}

/**
 * Removes a section with its key block and records after asking.
 * @param {string} sectionName - the section's name.
 * @returns {Promise<void>} settles when the section is removed or kept.
 */
async function removeSectionAfterAsking(sectionName) {
    const section = findSection(sectionName);
    const count = section.records.length;
    const confirmed = await openConfirmation({ title: `Remove the section "${sectionName}"?`, text: `Its key block and its ${count} ${count === 1 ? 'record are' : 'records are'} removed. "Undo" brings them back.`, ok: 'Remove' });
    if (confirmed) editCodeFromTree(() => edits.getSectionRemoveEdit(state.code, state.model, sectionName));
}

/**
 * Runs an action on a key: add a key after it, duplicate, move or remove it (in every record
 * of the section too).
 * @param {string} action - the action.
 * @param {object} row - the key's row.
 * @returns {Promise<void>} settles when the action is done.
 */
async function runKeyAction(action, row) {
    if (action === 'add' || action === 'key') editCodeFromTree(() => edits.getKeyAddEdit(state.code, state.model, row.sec, row.keyPath));
    else if (action === 'dup') editCodeFromTree(() => edits.getKeyDuplicateEdit(state.code, state.model, row.sec, row.keyPath));
    else if (action === 'up' || action === 'down') editCodeFromTree(() => edits.getKeyMoveEdit(state.code, state.model, row.sec, row.keyPath, action === 'up' ? -1 : 1));
    else if (action === 'remove') await removeKeyAfterAsking(row);
}

/**
 * Removes a key and its value in every record, after asking when records have a value for it.
 * @param {object} row - the key's row.
 * @returns {Promise<void>} settles when the key is removed or kept.
 */
async function removeKeyAfterAsking(row) {
    const valueCount = areas.view.getRows().filter(other => other.kind === 'field' && other.sec === row.sec && other.label === row.label).length;
    if (!valueCount || await openConfirmation({ title: `Remove the key "${row.label}"?`, text: `Its value is removed from every record of "${row.sec}" (${valueCount}). "Undo" brings it back.`, ok: 'Remove' })) {
        editCodeFromTree(() => edits.getKeyRemoveEdit(state.code, state.model, row.sec, row.keyPath));
    }
}

/**
 * Adds a record at the end of a nested list.
 * @param {object} row - the row of the value that holds the nested list.
 * @returns {void}
 */
function addNestedRecord(row) {
    const records = areas.view.getRows().filter(other => other.parent === row.id && other.kind === 'record');
    const last = records[records.length - 1];
    if (!last) { showToast('This nested list has no records to add after'); return; }
    editCodeFromTree(() => edits.getRecordAddEdit(state.code, state.model, { sec: row.sec, recPath: last.recPath }));
}

/**
 * Runs an action on a record (or on the record of a selected value): add a record after it or
 * a key, duplicate, move or remove it.
 * @param {string} action - the action.
 * @param {object} row - the row of the record or of one of its values.
 * @param {number[]} recPath - the record's path.
 * @returns {void}
 */
function runRecordAction(action, row, recPath) {
    if (action === 'add') editCodeFromTree(() => edits.getRecordAddEdit(state.code, state.model, { sec: row.sec, recPath }));
    else if (action === 'key') editCodeFromTree(() => edits.getKeyAddEdit(state.code, state.model, row.sec, [getLastKeyIndex(row.sec)]));
    else if (action === 'dup') editCodeFromTree(() => edits.getRecordDuplicateEdit(state.code, state.model, row.sec, recPath));
    else if (action === 'up' || action === 'down') editCodeFromTree(() => edits.getRecordMoveEdit(state.code, state.model, row.sec, recPath, action === 'up' ? -1 : 1));
    else if (action === 'remove') editCodeFromTree(() => edits.getRecordRemoveEdit(state.code, state.model, row.sec, recPath));
}

