/**
 * Mouse and keyboard in the records view: a click selects a row and opens a field over a value
 * or key (or the selected row's section name), the arrow folds; a double click beside the texts
 * folds; the arrow keys move through the rows and fold them, Enter or F2 edits, Delete and
 * Backspace remove; a click on a step of the path selects its place.
 */

import { getPathParts, getPlaceId } from './view-path.js?v=2';

/**
 * The functions of the view the input needs (made in createView()).
 * @typedef {object} ViewControl
 * @property {function(string): (object|undefined)} getRow - a row by id.
 * @property {function(): string} getSelectedId - the id of the selected row.
 * @property {function(): object[]} getVisibleRows - the rows that are not folded away.
 * @property {function(string): boolean} isClosed - whether a row is folded.
 * @property {function(string): void} applyFoldSwitch - folds or unfolds a row.
 * @property {function(string): void} setSelectedRow - selects a row without scrolling, and draws.
 * @property {function(string, object=): void} selectRow - selects a row, scrolls to it and tells onPick.
 * @property {function(): void} draw - draws the rows.
 * @property {function(string, string, number=, number=): void} startEdit - opens a field over a row's text.
 * @property {function(string): void} showRowInView - scrolls a row into view.
 * @property {function(object, string): void} [onPick] - a row was picked.
 * @property {function(string, object): void} [onAction] - an action on a row.
 */

/**
 * Connects the mouse and the keys of the view and of its path.
 * @param {HTMLElement} element - the element of the rows.
 * @param {HTMLElement} [pathElement] - the element of the path.
 * @param {ViewControl} control - the view's own functions.
 * @returns {void}
 */
export function startViewInput(element, pathElement, control) {
    element.addEventListener('mousedown', event => { if (event.target.closest('.trow-edit')) return; if (event.detail > 1) event.preventDefault(); });
    element.addEventListener('click', event => handleClick(control, event));
    element.addEventListener('dblclick', event => handleDoubleClick(control, event));
    element.addEventListener('keydown', event => handleViewKey(element, control, event));
    pathElement?.addEventListener('click', event => selectPathStep(control, event));
}

/**
 * A click: the arrow folds the row; a click on a row selects it, and on a value or key (or
 * on the selected row's section name) opens a field (a click handler).
 * @param {ViewControl} control - the view's own functions.
 * @param {MouseEvent} event - the click.
 * @returns {void}
 */
function handleClick(control, event) {
    if (event.target.closest('.trow-edit')) return;
    const rowElement = event.target.closest('.trow');
    if (!rowElement || !rowElement.dataset.id) return;
    const id = rowElement.dataset.id;
    const row = control.getRow(id);
    if (event.target.closest('.trow-toggle') && row.kids) {
        control.applyFoldSwitch(id);
        control.setSelectedRow(id);
        control.onPick?.(row, 'fold');
        return;
    }
    if (window.getSelection && String(window.getSelection()).length) return;
    const editable = event.target.closest('[data-edit]');
    const wasSelected = control.getSelectedId() === id;
    control.setSelectedRow(id);
    control.onPick?.(row, 'click');
    if (editable && (wasSelected || editable.dataset.edit === 'value' || editable.dataset.edit === 'key')) control.startEdit(id, editable.dataset.edit, event.clientX, event.clientY);
}

/**
 * A double click beside the texts folds or unfolds the row (a dblclick handler).
 * @param {ViewControl} control - the view's own functions.
 * @param {MouseEvent} event - the double click.
 * @returns {void}
 */
function handleDoubleClick(control, event) {
    const rowElement = event.target.closest('.trow');
    if (!rowElement || event.target.closest('[data-edit]') || event.target.closest('.trow-edit')) return;
    const id = rowElement.dataset.id;
    if (control.getRow(id)?.kids) { control.applyFoldSwitch(id); control.draw(); }
}

/**
 * The keys of the view: up and down move, right unfolds or goes in, left folds or goes to
 * the parent, Enter or F2 edits (or folds), Delete and Backspace remove (a keydown handler).
 * @param {HTMLElement} element - the element of the rows.
 * @param {ViewControl} control - the view's own functions.
 * @param {KeyboardEvent} event - the key.
 * @returns {void}
 */
function handleViewKey(element, control, event) {
    if (event.target !== element) return;
    const visible = control.getVisibleRows();
    let index = visible.findIndex(row => row.id === control.getSelectedId());
    const row = visible[index];
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        index = index < 0 ? 0 : Math.max(0, Math.min(visible.length - 1, index + (event.key === 'ArrowDown' ? 1 : -1)));
        if (visible[index]) control.selectRow(visible[index].id, { how: 'key' });
    } else if (event.key === 'ArrowRight' && row && row.kids) { event.preventDefault(); if (control.isClosed(row.id)) { control.applyFoldSwitch(row.id); control.draw(); } else if (visible[index + 1]) control.selectRow(visible[index + 1].id, { how: 'key' }); }
    else if (event.key === 'ArrowLeft' && row) { event.preventDefault(); if (row.kids && !control.isClosed(row.id)) { control.applyFoldSwitch(row.id); control.draw(); } else if (row.parent) control.selectRow(row.parent, { how: 'key' }); }
    else if ((event.key === 'Enter' || event.key === 'F2') && row) { event.preventDefault(); editOrFold(control, row); }
    else if ((event.key === 'Delete' || event.key === 'Backspace') && row) { event.preventDefault(); control.onAction?.('remove', row); }
}

/**
 * Enter or F2 on a row: opens the field of its name or value, or folds a row without one.
 * @param {ViewControl} control - the view's own functions.
 * @param {object} row - the row.
 * @returns {void}
 */
function editOrFold(control, row) {
    const what = row.kind === 'section' ? 'section' : row.kind === 'key' ? 'key' : row.kind === 'field' && !row.list ? 'value' : null;
    if (what) { control.showRowInView(row.id); control.startEdit(row.id, what); return; }
    if (row.kids) { control.applyFoldSwitch(row.id); control.draw(); }
}

/**
 * Selects the place of a clicked step of the path (a click handler).
 * @param {ViewControl} control - the view's own functions.
 * @param {MouseEvent} event - the click.
 * @returns {void}
 */
function selectPathStep(control, event) {
    const button = event.target.closest('[data-depth]');
    if (!button) return;
    const part = getPathParts(control.getRow(control.getSelectedId()))[+button.dataset.depth];
    if (part) control.selectRow(getPlaceId(part.sel), { how: 'path' });
}
