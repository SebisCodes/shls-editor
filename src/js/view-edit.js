/**
 * Editing in place in the records view: a field over a value, key or section name. After a
 * click the cursor goes to the clicked character; from the keyboard the whole text is
 * selected. Enter or leaving the field writes the change, Escape cancels; a change that is
 * refused keeps the field open and marked with the reason, unless the field was left.
 */

import { getCharacterIndexAt } from './view-caret.js?v=2';

/** The narrowest edit field, in characters. */
const MIN_FIELD_WIDTH = 8;
/** The widest edit field, in characters. */
const MAX_FIELD_WIDTH = 60;
/** The room an edit field has beyond its text, in characters. */
const FIELD_ROOM = 2;

/**
 * What createInPlaceEdit() needs.
 * @typedef {object} InPlaceEditOptions
 * @property {function(string): string} translate - translates the field's label.
 * @property {function(object): (true|string)} onEdit - takes an edit { what, row, text, phase }; phase
 *   "start" asks whether a field may open; returns true, or the reason it failed.
 * @property {function(boolean, boolean): void} onEnd - the field closed: whether the change was
 *   taken (or the field was left with it), and whether the field lost the focus.
 */

/**
 * Creates the editing in place of a view (a factory: it returns its API).
 * @param {InPlaceEditOptions} options - the texts and the answers.
 * @returns {{start: function(object, Element, string, number=, number=): void, isEditing: function(): boolean, stop: function(): void}}
 *   start opens a field over a row's text element, isEditing tells whether one is open, stop ends it now.
 */
export function createInPlaceEdit({ translate, onEdit, onEnd }) {
    let editing = null;

    return {
        start,
        /**
         * Tells whether a field is open.
         * @returns {boolean} true while a value, key or section name is edited.
         */
        isEditing: () => !!editing,
        /**
         * Ends an open edit now (written into the code), not after the blur: a download right
         * after gets the value.
         * @returns {void}
         */
        stop() {
            if (!editing) return;
            if (editing.finish) editing.finish(true, true); else editing.field.blur();
        },
    };

    /**
     * Opens a field over a row's text, when onEdit allows it.
     * @param {object} row - the row.
     * @param {Element} node - the element of the text that is edited.
     * @param {string} what - "value", "key" or "section".
     * @param {number} [x] - the client x of the click.
     * @param {number} [y] - the client y of the click.
     * @returns {void}
     */
    function start(row, node, what, x, y) {
        if (onEdit({ what, row, phase: 'start' }) !== true) return;
        const old = what === 'value' ? row.value : row.label;
        let caret = x == null ? null : getCharacterIndexAt(node, x, y);
        if (caret != null) caret = Math.max(0, Math.min(old.length, caret));
        const field = createEditField(old, what);
        node.replaceWith(field);
        editing = { what, field, done: false, finish: null };
        field.focus();
        if (caret == null) field.select(); else field.setSelectionRange(caret, caret);
        /**
         * Ends this edit (stop() calls it): writes or cancels the change.
         * @param {boolean} keep - true to write the change.
         * @param {boolean} [left] - true when the field counts as left.
         * @returns {void}
         */
        editing.finish = (keep, left) => stopRenameEdit(row, what, field, old, keep, left);
        field.addEventListener('keydown', event => {
            event.stopPropagation();
            if (event.key === 'Enter') { event.preventDefault(); stopRenameEdit(row, what, field, old, true); }
            if (event.key === 'Escape') { event.preventDefault(); stopRenameEdit(row, what, field, old, false); }
        });
        field.addEventListener('input', () => field.classList.remove('invalid'));
        field.addEventListener('blur', () => setTimeout(() => stopRenameEdit(row, what, field, old, true, true), 0));
    }

    /**
     * Creates the field of an edit in place.
     * @param {string} text - the text it starts with.
     * @param {string} what - "value", "key" or "section".
     * @returns {HTMLInputElement} the field.
     */
    function createEditField(text, what) {
        const field = document.createElement('input');
        field.className = 'trow-edit';
        field.value = text;
        field.spellcheck = false;
        field.setAttribute('aria-label', translate(what === 'value' ? 'Value' : what === 'key' ? 'Key' : 'Section name'));
        field.style.width = Math.max(MIN_FIELD_WIDTH, Math.min(MAX_FIELD_WIDTH, text.length + FIELD_ROOM)) + 'ch';
        return field;
    }

    /**
     * Ends an edit: writes the change (onEdit) or cancels it; a change that is refused keeps the
     * field open and marked, unless the field was left.
     * @param {object} row - the edited row.
     * @param {string} what - "value", "key" or "section".
     * @param {HTMLInputElement} field - the field.
     * @param {string} old - the text before the edit.
     * @param {boolean} keep - true to write the change, false to cancel.
     * @param {boolean} [left] - true when the field lost the focus.
     * @returns {void}
     */
    function stopRenameEdit(row, what, field, old, keep, left) {
        if (!editing || editing.field !== field || editing.done) return;
        if (!keep || field.value === old) { editing = null; onEnd(false, !!left); return; }
        const result = onEdit({ what, row, text: field.value });
        if (result === true || left) { editing = null; onEnd(true, !!left); return; }
        field.classList.add('invalid');
        field.title = typeof result === 'string' ? result : '';
        field.focus();
    }
}
