/**
 * The side panel's first tab: the selected section, key or record with its path and buttons.
 * A section and a key are renamed in their field; a record shows a field per value, written
 * into the code together with "Apply" or Enter (one undo step). In the example view of a template
 * the panel shows the template's row the selected row stands for (records-views.js).
 */

import { escapeHtml } from './shls.js?v=8';
import { parseCodeModel } from './template-lines.js?v=1';
import { getPathText } from './view-path.js?v=2';
import { getRecordAt, getValueEdit, getSectionRenameEdit, getKeyRenameEdit } from './edits.js?v=9';
import { state, areas, ui, getElements, showToast, translate, findSection } from './state.js?v=3';
import { formatCount } from './util.js?v=3';
import { editCodeFromTree, runViewAction } from './view-actions.js?v=4';
import { getSelectedTemplateRow, getTemplateRows, EXAMPLE_EDIT_MESSAGE } from './records-views.js?v=1';

/**
 * Draws the side panel for the selection; leaves it alone while a field in it is being typed into.
 * @returns {void}
 */
export function renderNode() {
    if (ui.node.contains(document.activeElement) && document.activeElement.matches('input, textarea')) return;   // keep what is being typed
    const viewRow = areas.view.getSelectedRow();
    const row = getSelectedTemplateRow();
    if (viewRow && !row) { ui.node.innerHTML = `<p class="hint">${escapeHtml(translate(EXAMPLE_EDIT_MESSAGE))}</p>`; return; }
    if (!row) { ui.node.innerHTML = `<p class="hint">${escapeHtml(translate(state.model && state.model.sections.length ? 'Click a section, a key or a record in the middle.' : 'The document has no sections yet.'))}</p>`; return; }
    const section = findSection(row.sec);
    if (!section) { ui.node.innerHTML = ''; return; }
    if (row.kind === 'section' || row.kind === 'keys') ui.node.innerHTML = renderSectionForm(section);
    else if (row.kind === 'key') ui.node.innerHTML = renderKeyForm(row);
    else renderRecordForm(row);
}

/**
 * Returns the line with the path of a row.
 * @param {object} row - the row.
 * @returns {string} the HTML of the path field.
 */
function renderPath(row) {
    return `<label class="field"><span>${escapeHtml(translate('Path'))}</span><code data-no-i18n>${escapeHtml(getPathText(row))}</code></label>`;
}

/**
 * Returns a line of information under the fields.
 * @param {string} text - the text.
 * @returns {string} the HTML.
 */
function renderInfo(text) {
    return `<div class="node-info">${escapeHtml(text)}</div>`;
}

/**
 * Returns a row of buttons of the panel, two per line.
 * @param {Array<Array>} buttons - per button: action, label, enabled (default true), extra class.
 * @returns {string} the HTML.
 */
function renderButtons(buttons) {
    return `<div class="button-row two">${buttons.map(([action, label, enabled = true, className = '']) => `<button type="button" class="button ${className}" data-n="${action}"${enabled ? '' : ' disabled'}>${label}</button>`).join('')}</div>`;
}

/**
 * Returns the form of a section: its name, counts and buttons.
 * @param {object} section - the section of the model.
 * @returns {string} the HTML.
 */
function renderSectionForm(section) {
    const keys = section.keys ? section.keys.length : 0;
    return `<div class="node-form">
            <label class="field"><span>Section</span><input id="n-sec" value="${escapeHtml(section.name)}" spellcheck="false" data-no-i18n></label>
            ${renderInfo(`${formatCount(section.records.length, 'record', 'records')} · ${formatCount(keys, 'key', 'keys')} · line ${section.line + 1}`)}
            ${renderButtons([['add', 'Add a record', !!keys], ['key', 'Add a key', !!keys], ['remove', 'Remove the section', true, 'danger']])}</div>`;
}

/**
 * Returns the form of a key: its path, name, level and buttons.
 * @param {object} row - the key's row.
 * @returns {string} the HTML.
 */
function renderKeyForm(row) {
    const siblings = getTemplateRows().rows.filter(other => other.kind === 'key' && other.sec === row.sec && other.parent === row.parent);
    const index = row.keyPath[row.keyPath.length - 1];
    return `<div class="node-form">${renderPath(row)}
            <label class="field"><span>Key</span><input id="n-key" value="${escapeHtml(row.label)}" spellcheck="false" data-no-i18n></label>
            ${renderInfo(`${row.nested ? 'nested list · ' : ''}level ${row.keyPath.length} · line ${row.line + 1}`)}
            <p class="hint">${escapeHtml(translate('Renaming a key changes only the key block. Adding, moving or removing a key changes every record of the section.'))}</p>
            ${renderButtons([['add', 'Add a key after it'], ['dup', 'Duplicate'], ['up', 'Move up', index > 0], ['down', 'Move down', index < siblings.length - 1], ['remove', 'Remove', siblings.length > 1, 'danger']])}</div>`;
}

/**
 * Draws the form of a record (also for one of its values or nested lists): a field per value,
 * "Apply" and the buttons; a selected value's field is scrolled into view.
 * @param {object} row - the row of the record or of one of its values.
 * @returns {void}
 */
function renderRecordForm(row) {
    const found = getRecordAt(state.model, row.sec, row.recPath);
    if (!found) { ui.node.innerHTML = ''; return; }
    const fields = found.rec.fields.map((field, index) => renderRecordField(field, index, row.kind === 'field' && row.field === index)).join('');
    const count = found.list.length;
    ui.node.innerHTML = `<div class="node-form">${renderPath(row)}
        ${renderInfo(`record ${found.idx + 1} of ${count} · lines ${found.rec.start + 1}-${found.rec.end + 1}`)}
        <div class="record-form">${fields}</div>
        <div class="button-row"><button type="button" class="button primary" id="n-apply">Apply</button></div>
        ${renderButtons([['add', 'Add a record after it'], ['dup', 'Duplicate'], ['up', 'Move up', found.idx > 0], ['down', 'Move down', found.idx < count - 1], ['remove', 'Remove', row.recPath.length === 1 || count > 1, 'danger']])}</div>`;
    if (row.kind === 'field') ui.node.querySelector('input.now')?.scrollIntoView({ block: 'nearest' });
}

/**
 * Returns the field of one value of a record; a nested list shows its number of records.
 * @param {object} field - the field of the record.
 * @param {number} index - its index in the record.
 * @param {boolean} isSelected - true for the value selected in the view.
 * @returns {string} the HTML.
 */
function renderRecordField(field, index, isSelected) {
    if (field.sub) return `<div class="field"><span data-no-i18n>${escapeHtml(field.key)}</span><span class="muted">${escapeHtml(formatCount(field.sub.length, 'record', 'records'))}</span></div>`;
    return `<label class="field"><span data-no-i18n>${escapeHtml(field.key)}</span><input data-f="${index}" value="${escapeHtml(field.value)}" spellcheck="false" data-no-i18n${isSelected ? ' class="now"' : ''}></label>`;
}

/**
 * Connects the side panel: its buttons, "Apply", renaming in the fields, Enter, and drawing it
 * again once the focus leaves it.
 * @returns {void}
 */
export function startNodePanel() {
    ui.node.addEventListener('click', event => {
        const button = event.target.closest('[data-n]');
        if (button) { runViewAction(button.dataset.n, areas.view.getSelectedRow()); return; }
        if (event.target.id === 'n-apply') writeRecordForm();
    });
    ui.node.addEventListener('change', renameFromField);
    ui.node.addEventListener('keydown', event => {
        if (event.target.matches('input[data-f]') && event.key === 'Enter') { event.preventDefault(); writeRecordForm(); }
        if ((event.target.id === 'n-key' || event.target.id === 'n-sec') && event.key === 'Enter') { event.preventDefault(); event.target.blur(); }
    });
    ui.node.addEventListener('focusout', () => setTimeout(() => { if (!ui.node.contains(document.activeElement)) renderNode(); }, 0));
}

/**
 * Renames the selected section or key from its field (a change handler).
 * @param {Event} event - the change of a field.
 * @returns {void}
 */
function renameFromField(event) {
    const row = getSelectedTemplateRow();
    if (!row) return;
    if (event.target.id === 'n-sec' && event.target.value !== row.sec) editCodeFromTree(() => getSectionRenameEdit(state.code, state.model, row.sec, event.target.value));
    if (event.target.id === 'n-key' && event.target.value !== row.label) editCodeFromTree(() => getKeyRenameEdit(state.code, state.model, row.sec, row.keyPath, event.target.value));
}

/**
 * Writes the values typed into the record form into the code as one undo step.
 * @returns {void}
 */
function writeRecordForm() {
    const row = getSelectedTemplateRow();
    if (!row || !row.recPath) return;
    const found = getRecordAt(state.model, row.sec, row.recPath);
    if (!found) return;
    const changed = getElements('input[data-f]', ui.node).filter(field => field.value !== found.rec.fields[+field.dataset.f].value);
    if (!changed.length) { showToast('Nothing changed'); return; }
    editCodeFromTree(() => createFormEdit(found.rec, changed));
}

/**
 * Returns the edit that writes the changed fields of the record form, one value after the other.
 * @param {object} record - the record of the model the form shows.
 * @param {HTMLInputElement[]} changedFields - the form fields whose value differs from the record.
 * @returns {{code: string}} the edit.
 * @throws {Error} with a message for the user when a value cannot be written.
 */
function createFormEdit(record, changedFields) {
    let code = state.code, model = state.model;
    for (const field of changedFields) {
        code = getValueEdit(code, model, record.fields[+field.dataset.f].line, field.value).code;
        model = parseCodeModel(code);
    }
    return { code };
}
