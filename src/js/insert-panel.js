/**
 * The side panel's Insert tab: buttons that add a record, a key, a copy or a section to the
 * selection (as the buttons above the view do), and snippets written at the cursor in the code.
 */

import { escapeHtml } from './shls.js?v=8';
import { state, ui } from './state.js?v=3';
import { runViewAction } from './view-actions.js?v=5';
import { writeCodeRange } from './code-input.js?v=5';
import { addHistoryStep } from './history.js?v=5';

/** The length of a date as YYYY-MM-DD. */
const DATE_LENGTH = 10;
/** Marks where the cursor goes in a snippet. */
const CURSOR_MARK = '|';

/**
 * Returns today's date as a snippet.
 * @returns {string} YYYY-MM-DD with the cursor after it.
 */
function getDateSnippet() {
    return `${new Date().toISOString().slice(0, DATE_LENGTH)}${CURSOR_MARK}`;
}

/** The snippets: their text ("|" marks the cursor, or a function that makes it) and whether it is a block. */
const SNIPPETS = {
    section: ['|Section\n Name\n Note\n\n -\n -\n', true],
    record: ['|-', false],
    ph: ['PH|', false],
    dash: ['-|', false],
    date: [getDateSnippet, false],
};

/**
 * Returns a button that adds to the selection.
 * @param {string} action - the action of runViewAction().
 * @param {string} label - the label.
 * @param {string} title - the tooltip.
 * @returns {string} the HTML.
 */
function renderAddButton(action, label, title) {
    return `<button type="button" class="button" data-add="${action}" title="${escapeHtml(title)}">${label}</button>`;
}

/**
 * Returns a button that writes a snippet at the cursor.
 * @param {string} snippet - the key in SNIPPETS.
 * @param {string} label - the label.
 * @param {string} title - the tooltip.
 * @returns {string} the HTML.
 */
function renderSnippetButton(snippet, label, title) {
    return `<button type="button" class="button" data-ins="${snippet}" title="${escapeHtml(title)}">${label}</button>`;
}

/**
 * Draws the Insert tab.
 * @returns {void}
 */
export function renderInsert() {
    ui.insert.innerHTML = `
        <div class="insert-group"><h3>Add to the selection</h3>
            <p class="hint">A record after the selected record (or at the end of the section), a key after the selected key - every record gets a value "-" for it. One step for Undo.</p>
            <div class="insert-grid">
            ${renderAddButton('add', 'Record', 'A new record with "-" for each value')}${renderAddButton('key', 'Key', 'A new key in the key block; every record gets "-"')}
            ${renderAddButton('dup', 'Duplicate', 'A copy of the selected record or key')}${renderAddButton('section', 'Section', 'A new section at the end, with two keys and one record')}
        </div></div>
        <div class="insert-group"><h3>At the cursor in the code</h3><div class="insert-grid">
            ${renderSnippetButton('section', 'Section', 'A section name, its key block, a blank line and one record')}${renderSnippetButton('ph', 'PH', 'The placeholder for the line of a nested list')}
            ${renderSnippetButton('dash', '- (no value)', 'SHLS has no empty values: a dash stands for none')}${renderSnippetButton('date', 'Today\'s date', 'The date as YYYY-MM-DD')}
        </div></div>`;
}

/**
 * Connects the Insert tab; a snippet button keeps the focus in the code.
 * @returns {void}
 */
export function startInsertPanel() {
    ui.insert.addEventListener('mousedown', event => { if (event.target.closest('[data-ins]')) event.preventDefault(); });
    ui.insert.addEventListener('click', handleInsertClick);
}

/**
 * Routes a click in the Insert tab: an add button runs its view action, a snippet button
 * writes its snippet.
 * @param {MouseEvent} event - the click in the tab.
 * @returns {void}
 */
function handleInsertClick(event) {
    const addButton = event.target.closest('[data-add]');
    if (addButton) { runViewAction(addButton.dataset.add); return; }
    const snippetButton = event.target.closest('[data-ins]');
    if (snippetButton) addSnippet(...SNIPPETS[snippetButton.dataset.ins]);
}

/**
 * Writes a snippet at the cursor in the code as an undo step: "|" marks where the cursor goes;
 * a block snippet starts on a line of its own, after a blank line, with the document's indentation.
 * @param {string|function(): string} snippet - the snippet, or a function that makes it.
 * @param {boolean} isBlock - true for a block (a section).
 * @returns {void}
 */
function addSnippet(snippet, isBlock) {
    const start = ui.ta.selectionStart;
    const end = ui.ta.selectionEnd;
    let text = typeof snippet === 'function' ? snippet() : snippet;
    if (isBlock) text = getBlockSnippet(text, start);
    let cursor = text.indexOf(CURSOR_MARK);
    text = text.replace(CURSOR_MARK, '');
    if (cursor < 0) cursor = text.length;
    writeCodeRange(start, end, text, start + cursor);
    addHistoryStep();
}

/**
 * Returns a block snippet with the document's indentation, preceded by the line breaks it
 * needs to stand on a line of its own after a blank line.
 * @param {string} text - the snippet, indented by one space per level.
 * @param {number} position - where it is written.
 * @returns {string} the snippet to write.
 */
function getBlockSnippet(text, position) {
    const unit = ' '.repeat(state.model?.unit || 1);
    const indented = text.replace(/\n /g, '\n' + unit);
    const lineStart = state.code.lastIndexOf('\n', position - 1) + 1;
    if (state.code.slice(lineStart, position).trim()) return '\n\n' + indented;
    if (lineStart > 0 && state.code.slice(0, lineStart).trim() && state.code[lineStart - 2] !== '\n') return '\n' + indented;
    return indented;
}
