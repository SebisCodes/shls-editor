/**
 * The records view: each section with its key block (the template, as a tree of keys) and its
 * records (the keys as labels, nested lists fold). Made from the model of shls.js
 * (view-rows.js); every row knows its line in the code.
 *
 * A selection is a place ({ kind, sec, keyPath?, recPath?, field? }, view-path.js), so it
 * survives a new model (after an edit the same place is selected again). Values, keys and
 * section names are edited in place: a click on them opens a field; Enter or leaving it writes
 * the change (onEdit), Escape cancels. The arrow keys move through the rows and fold them,
 * Enter or F2 edits, Delete removes (onAction); a search marks its matches.
 *
 * The view's state (rows, selection, folding, search) lives in the one closure of createView(),
 * which keeps this file above the size guide; the rows, their HTML, editing in place, mouse and
 * keys, and paths are in view-rows.js, view-render.js, view-edit.js, view-input.js and
 * view-path.js.
 */

import { escapeHtml } from './shls.js?v=8';
import { createRows } from './view-rows.js?v=3';
import { getPathParts, getPlaceId, getRowPlace } from './view-path.js?v=2';
import { renderRow, renderPath } from './view-render.js?v=3';
import { createInPlaceEdit } from './view-edit.js?v=2';
import { startViewInput } from './view-input.js?v=2';

/** A row is scrolled into view when it is closer to the top than this, in pixels. */
const SCROLL_MARGIN_TOP = 4;
/** A row is scrolled into view when it is closer to the bottom than this, in pixels. */
const SCROLL_MARGIN_BOTTOM = 40;
/** A row scrolled into view lands a third of the height below the top. */
const SCROLL_TARGET_DIVISOR = 3;

/**
 * What createView() needs.
 * @typedef {object} ViewOptions
 * @property {HTMLElement} element - the element of the rows.
 * @property {HTMLElement} [pathElement] - the element of the selection's path.
 * @property {function(string): string} [translate] - translates the view's texts.
 * @property {function(object, string): void} [onPick] - a row was picked: the row and how
 *   ("click", "key", "fold", "search", "path").
 * @property {function(object): (true|string)} onEdit - takes an edit { what, row, text, phase };
 *   phase "start" asks whether a field may open; returns true, or the reason it failed.
 * @property {function(string, object): void} [onAction] - an action ("remove") on a row.
 */

/**
 * Creates the records view in an element (a factory: it returns the view's API).
 * @param {ViewOptions} options - the element, the texts and the answers.
 * @returns {object} the view: render, select, getSelectedRow, getSelectedPlace, getRowAt,
 *   selectLineRow, editSelected, isEditing, stopEdit, openAll, closeAll, find, selectNextHit,
 *   getHits, getRows, getRow.
 */
export function createView({ element, pathElement, translate = text => text, onPick, onEdit, onAction }) {
    let model = null;
    let rows = [];                 // every row (also folded ones), in order
    let rowsById = new Map();
    let rowIdByLine = [];
    const closed = new Set();
    let selectedId = '';
    let hitIds = [], hitIndex = -1, query = '';
    const inPlace = createInPlaceEdit({ translate, onEdit, onEnd: showEditEnd });

    startViewInput(element, pathElement, {
        getRow: id => rowsById.get(id), getSelectedId: () => selectedId, getVisibleRows,
        isClosed: id => closed.has(id), applyFoldSwitch, setSelectedRow, selectRow, draw, startEdit, showRowInView, onPick, onAction,
    });

    return {
        render,
        select,
        /**
         * Returns the selected row.
         * @returns {object|null} the row, null when nothing is selected.
         */
        getSelectedRow: () => rowsById.get(selectedId) || null,
        /**
         * Returns the place of the selected row.
         * @returns {import('./state.js').ViewPlace|null} the place, null when nothing is selected.
         */
        getSelectedPlace() {
            const row = rowsById.get(selectedId);
            return row ? getRowPlace(row) : null;
        },
        getRowAt,
        /**
         * Selects the row of a line of the code (or the nearest one above it), when another one
         * is selected.
         * @param {number} line - the line, 0-based.
         * @returns {void}
         */
        selectLineRow(line) {
            const row = getRowAt(line);
            if (row && row.id !== selectedId) selectRow(row.id);
        },
        /**
         * Opens a field over the selected row's value, key or section name.
         * @param {string} [what] - "value", "key" or "section"; without it, the row's own.
         * @returns {void}
         */
        editSelected(what) {
            const row = rowsById.get(selectedId);
            if (!row) return;
            showRowInView(row.id);
            startEdit(row.id, what || (row.kind === 'section' ? 'section' : row.kind === 'key' ? 'key' : 'value'));
        },
        /**
         * Tells whether a field is open.
         * @returns {boolean} true while a value, key or section name is edited.
         */
        isEditing: () => inPlace.isEditing(),
        /**
         * Ends an open edit now (written into the code), not after the blur: a download right
         * after gets the value.
         * @returns {void}
         */
        stopEdit: () => inPlace.stop(),
        /**
         * Unfolds every row.
         * @returns {void}
         */
        openAll() { closed.clear(); draw(); },
        /**
         * Folds every row below the sections.
         * @returns {void}
         */
        closeAll() { for (const row of rows) if (row.kids && row.kind !== 'section') closed.add(row.id); draw(); },
        find,
        selectNextHit,
        /**
         * Returns the search state.
         * @returns {{count: number, index: number}} the number of matches and the index of the current one.
         */
        getHits: () => ({ count: hitIds.length, index: hitIndex }),
        /**
         * Returns every row, folded ones too.
         * @returns {object[]} the rows in order.
         */
        getRows: () => rows,
        /**
         * Returns a row by id.
         * @param {string} id - the row's id.
         * @returns {object|undefined} the row.
         */
        getRow: id => rowsById.get(id),
    };

    /**
     * Shows a model (or the current one again), keeps the selection when its row is still there
     * and repeats an active search.
     * @param {object} [newModel] - the model to show.
     * @returns {void}
     */
    function render(newModel) {
        if (newModel) model = newModel;
        if (!model) return;
        ({ rows, rowsById, rowIdByLine } = createRows(model));
        if (selectedId && !rowsById.has(selectedId)) selectedId = '';
        if (query) updateHits();
        draw();
    }

    /**
     * Selects a place (or a row id); nothing is selected when it is not there.
     * @param {import('./state.js').ViewPlace|string|null} place - the place, or a row's id.
     * @param {object} [options] - scroll: false to leave the scroll position; how: tells onPick.
     * @returns {void}
     */
    function select(place, options = {}) {
        const id = typeof place === 'string' ? place : getPlaceId(place);
        if (!id || !rowsById.has(id)) { selectedId = ''; draw(); return; }
        selectRow(id, options);
    }

    /**
     * Returns the row of a line of the code, or the nearest one above it.
     * @param {number} line - the line, 0-based.
     * @returns {object|null} the row, null when no line above has one.
     */
    function getRowAt(line) {
        for (let current = Math.min(line, rowIdByLine.length - 1); current >= 0; current--) if (rowIdByLine[current]) return rowsById.get(rowIdByLine[current]);
        return null;
    }

    /**
     * Returns the rows that are not folded away.
     * @returns {object[]} the visible rows in order.
     */
    function getVisibleRows() {
        const visible = [];
        const hidden = new Set();
        for (const row of rows) {
            if (row.parent && (hidden.has(row.parent) || closed.has(row.parent))) { hidden.add(row.id); continue; }
            visible.push(row);
        }
        return visible;
    }

    /**
     * Draws the visible rows (keeping the scroll position) and the path; nothing while a field
     * is open.
     * @returns {void}
     */
    function draw() {
        if (inPlace.isEditing()) return;
        if (!model) { element.innerHTML = ''; return; }
        const visible = getVisibleRows();
        if (!visible.length) {
            element.innerHTML = `<div class="trow empty">${escapeHtml(translate(model.error ? 'The code cannot be read - see the problem above the code.' : 'No sections yet - write a section name, its keys (indented) and, after one blank line, the records. Or choose a template under "New".'))}</div>`;
        } else {
            const scrollTop = element.scrollTop;
            const look = { selectedId, closed, hitIds, hitIndex, query, translate };
            element.innerHTML = visible.map(row => renderRow(row, look)).join('');
            element.scrollTop = scrollTop;
        }
        drawPath();
    }

    /**
     * Draws the path of the selection as buttons, the last one marked.
     * @returns {void}
     */
    function drawPath() {
        if (!pathElement) return;
        pathElement.innerHTML = renderPath(getPathParts(rowsById.get(selectedId)), translate);
    }

    /**
     * Scrolls a row into view when it is near the top or the bottom.
     * @param {string} id - the row's id.
     * @returns {void}
     */
    function showRowInView(id) {
        const rowElement = element.querySelector(`[data-id="${CSS.escape(id)}"]`);
        if (!rowElement) return;
        const top = rowElement.offsetTop, height = element.clientHeight;
        if (top < element.scrollTop + SCROLL_MARGIN_TOP || top > element.scrollTop + height - SCROLL_MARGIN_BOTTOM) element.scrollTop = Math.max(0, top - height / SCROLL_TARGET_DIVISOR);
    }

    /**
     * Unfolds every row a row folds into.
     * @param {string} id - the row's id.
     * @returns {void}
     */
    function expandParents(id) {
        let row = rowsById.get(id);
        while (row && row.parent) { closed.delete(row.parent); row = rowsById.get(row.parent); }
    }

    /**
     * Selects a row: unfolds its parents, draws, scrolls it into view and tells onPick.
     * @param {string} id - the row's id.
     * @param {object} [options] - scroll: false to leave the scroll position; how: tells onPick.
     * @returns {void}
     */
    function selectRow(id, { scroll = true, how = '' } = {}) {
        if (!rowsById.has(id)) return;
        selectedId = id;
        expandParents(id);
        draw();
        if (scroll) showRowInView(id);
        if (how) onPick?.(rowsById.get(id), how);
    }

    /**
     * Selects a row without scrolling or telling onPick, and draws the rows.
     * @param {string} id - the row's id.
     * @returns {void}
     */
    function setSelectedRow(id) {
        selectedId = id;
        draw();
    }

    /**
     * Folds or unfolds a row.
     * @param {string} id - the row's id.
     * @returns {void}
     */
    function applyFoldSwitch(id) {
        if (closed.has(id)) closed.delete(id); else closed.add(id);
    }

    /* ---------- Editing in place ---------- */

    /**
     * Opens a field over a row's value, key or section name (view-edit.js).
     * @param {string} id - the row's id.
     * @param {string} what - "value", "key" or "section".
     * @param {number} [x] - the client x of a click.
     * @param {number} [y] - the client y of a click.
     * @returns {void}
     */
    function startEdit(id, what, x, y) {
        const row = rowsById.get(id);
        if (!row) return;
        const node = element.querySelector(`[data-id="${CSS.escape(id)}"] [data-edit="${what}"]`);
        if (!node) return;
        inPlace.start(row, node, what, x, y);
    }

    /**
     * Draws the rows again once a field closed; a taken change scrolls the selection into view,
     * and the focus goes back to the view unless the field lost it.
     * @param {boolean} taken - true when the change was taken.
     * @param {boolean} left - true when the field lost the focus.
     * @returns {void}
     */
    function showEditEnd(taken, left) {
        draw();
        if (taken) showRowInView(selectedId);
        if (!left) element.focus({ preventScroll: true });
    }

    /* ---------- Search ---------- */

    /**
     * Searches the labels and values; the first match is selected.
     * @param {string} text - the text to find; empty ends the search.
     * @returns {void}
     */
    function find(text) {
        query = String(text || '').trim();
        updateHits();
        hitIndex = hitIds.length ? 0 : -1;
        if (hitIndex >= 0) selectRow(hitIds[0], { how: 'search' }); else draw();
    }

    /**
     * Selects the next or the previous match, around the end.
     * @param {number} [direction] - 1 for the next match, -1 for the previous one.
     * @returns {void}
     */
    function selectNextHit(direction = 1) {
        if (!hitIds.length) return;
        hitIndex = (hitIndex + direction + hitIds.length) % hitIds.length;
        selectRow(hitIds[hitIndex], { how: 'search' });
    }

    /**
     * Finds the rows whose label (or value) holds the search text.
     * @returns {void}
     */
    function updateHits() {
        const lowerQuery = query.toLowerCase();
        hitIds = lowerQuery ? rows.filter(row => (row.label || '').toLowerCase().includes(lowerQuery) || (row.kind === 'field' && !row.list && String(row.value).toLowerCase().includes(lowerQuery))).map(row => row.id) : [];
        if (hitIndex >= hitIds.length) hitIndex = hitIds.length ? 0 : -1;
    }
}
