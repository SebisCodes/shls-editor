/**
 * The records view in the editor: created with its answers (a click shows the row's lines in
 * the code, an edit in place goes into the code), the buttons and the search above it, the path
 * of the selection, and the code cursor that marks its record, key or value in the view.
 */

import { createView } from './view.js?v=12';
import { getPathText } from './view-path.js?v=2';
import { state, areas, ui, NARROW_SCREEN, getElement, showToast, translate } from './state.js?v=3';
import { showRowInCode, showLineBand } from './code-view.js?v=5';
import { getLineIndex } from './text-position.js?v=3';
import { renderNode } from './node-panel.js?v=5';
import { editInView, runViewAction } from './view-actions.js?v=5';
import { showPane } from './layout.js?v=5';
import { getViewLine } from './records-views.js?v=1';

/** The pause after typing in the search before it searches, in milliseconds. */
const SEARCH_DELAY = 160;
/** The pause after the cursor moved before the view follows it, in milliseconds. */
const CURSOR_FOLLOW_DELAY = 120;

const searchField = getElement('#tree-search'), hitsOutput = getElement('#tree-hits');
let searchTimer = 0;
let cursorTimer = 0;

/**
 * Creates the records view (an initializeX: it returns the view's API, see view.js).
 * @returns {object} the view.
 */
export function createRecordsView() {
    return createView({
        element: ui.tree, pathElement: getElement('#path'), translate,
        onPick: showPickedRow,
        onEdit: editInView,
        onAction: (action, row) => { runViewAction(action, row); },
    });
}

/**
 * Follows a row picked in the view: shows its lines in the code (not for folding), draws the
 * side panel and keeps the focus in the view after a search or a click on the path.
 * @param {object} row - the picked row.
 * @param {string} how - "click", "key", "fold", "search" or "path".
 * @returns {void}
 */
function showPickedRow(row, how) {
    if (how !== 'fold') showRowInCode(row);
    renderNode();
    if (how === 'search' || how === 'path') ui.tree.focus({ preventScroll: true });
}

/**
 * Connects the buttons above the view (add, duplicate, move, remove, open and close all, copy
 * the path), Alt+Up and Alt+Down in the view, the search and the code cursor.
 * @returns {void}
 */
export function startViewBar() {
    getElement('#node-add').addEventListener('click', () => runViewAction('add'));
    getElement('#node-dup').addEventListener('click', () => runViewAction('dup'));
    getElement('#node-up').addEventListener('click', () => runViewAction('up'));
    getElement('#node-down').addEventListener('click', () => runViewAction('down'));
    getElement('#node-del').addEventListener('click', () => runViewAction('remove'));
    ui.tree.addEventListener('keydown', event => {
        if (event.altKey && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) { event.preventDefault(); event.stopPropagation(); runViewAction(event.key === 'ArrowUp' ? 'up' : 'down'); }
    }, true);
    getElement('#tree-open').addEventListener('click', () => areas.view.openAll());
    getElement('#tree-close').addEventListener('click', () => areas.view.closeAll());
    getElement('#path-copy').addEventListener('click', copyPath);
    startSearch();
    document.addEventListener('selectionchange', watchCodeCursor);
}

/**
 * Copies the path of the selection ("Company[0].Name") and shows it.
 * @returns {Promise<void>} settles when the path is copied or shown.
 */
async function copyPath() {
    const path = getPathText(areas.view.getSelectedRow());
    try { await navigator.clipboard.writeText(path); } catch (e) { /* the path is shown anyway */ }
    showToast(`Path copied: ${path}`);
}

/**
 * Connects the search: it searches after a pause in typing; Enter goes to the next match
 * (Shift: the previous one), Escape clears it; the arrows go to the next and previous match.
 * @returns {void}
 */
function startSearch() {
    searchField.addEventListener('input', () => { clearTimeout(searchTimer); searchTimer = setTimeout(() => findText(searchField.value), SEARCH_DELAY); });
    searchField.addEventListener('keydown', handleSearchKey);
    getElement('#tree-next').addEventListener('click', () => selectNextHit(1));
    getElement('#tree-prev').addEventListener('click', () => selectNextHit(-1));
}

/**
 * Takes the keys of the search field: Enter goes to the next match (Shift: the previous one) or
 * searches, Escape clears the search (a keydown handler).
 * @param {KeyboardEvent} event - the key in the search field.
 * @returns {void}
 */
function handleSearchKey(event) {
    if (event.key === 'Enter') {
        event.preventDefault();
        if (areas.view.getHits().count) selectNextHit(event.shiftKey ? -1 : 1); else findText(searchField.value);
    }
    if (event.key === 'Escape') { searchField.value = ''; findText(''); }
}

/**
 * Searches the view and shows the number of matches.
 * @param {string} query - the text to find.
 * @returns {void}
 */
function findText(query) {
    areas.view.find(query);
    showHits();
}

/**
 * Selects the next or the previous match and shows its number.
 * @param {number} direction - 1 for the next match, -1 for the previous one.
 * @returns {void}
 */
function selectNextHit(direction) {
    areas.view.selectNextHit(direction);
    showHits();
}

/**
 * Shows "3 / 7" (the current match of all), "0", or nothing without a search.
 * @returns {void}
 */
export function showHits() {
    const hits = areas.view.getHits();
    hitsOutput.textContent = searchField.value.trim() ? (hits.count ? `${hits.index + 1} / ${hits.count}` : '0') : '';
}

/**
 * Puts the focus into the search field (Ctrl+F), on narrow screens with the view shown.
 * @returns {void}
 */
export function selectSearchField() {
    if (NARROW_SCREEN.matches) showPane('draw');
    searchField.focus();
    searchField.select();
}

/**
 * Moves the band with the cursor in the code and lets the view follow the cursor after a pause
 * (a selectionchange handler).
 * @returns {void}
 */
function watchCodeCursor() {
    if (document.activeElement !== ui.ta) return;
    showLineBand();
    clearTimeout(cursorTimer);
    cursorTimer = setTimeout(selectRowAtCursor, CURSOR_FOLLOW_DELAY);
}

/**
 * Selects the record, key or value of the code cursor's line in the view (in the example view of a
 * template: the row that shows that line of the template); nothing while a field is open or the
 * code is not read yet.
 * @returns {void}
 */
export function selectRowAtCursor() {
    if (!state.model || areas.view.isEditing() || state.hlModel !== state.model) return;
    const line = getViewLine(getLineIndex(ui.ta.selectionStart));
    if (!areas.view.getRowAt(line)) return;
    areas.view.selectLineRow(line);
    renderNode();
}
