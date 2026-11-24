/**
 * The controls of template placeholders (?template=) in the SHLS editor: the switch between the
 * example view and the template view in the records view's bar, the note when the example view
 * could not be made, and the "Placeholders" box at the bottom of the code (template-controls.js).
 * Without a template syntax none of them is there.
 */

import { state, ui, getElement } from './state.js?v=3';
import { TEMPLATE_SYNTAX } from './template-lines.js?v=1';
import { writeCodeRange } from './code-input.js?v=5';
import { addHistoryStep, addPendingHistoryStep } from './history.js?v=5';
import { renderRecordsView } from './model.js?v=5';
import { startViewSwitch, showViewSwitch, showViewNote, createPlaceholderBox, getListedPlaceholders } from './template-controls.js?v=2';
import { getViewMode, setViewMode, isExampleViewFailed, getTemplateExamples } from './records-views.js?v=1';

/** The box, once connected. */
let placeholderBox = null;
/** What the box lists: the examples it was drawn for, or the document's tags. */
let listedKey = null;
/** The page's template placeholders the records view and the controls were last drawn with. */
let shownExamples = null;

/**
 * Connects the switch of the views and the box; without a template syntax nothing.
 * @returns {void}
 */
export function startTemplateControls() {
    if (!TEMPLATE_SYNTAX) return;
    startViewSwitch(getElement('#view-switch'), mode => { setViewMode(mode); renderRecordsView(); });
    placeholderBox = createPlaceholderBox(getElement('#placeholder-box'), { syntax: TEMPLATE_SYNTAX, textarea: ui.ta, insertText: editCodeAtRange });
}

/**
 * Writes a placeholder's tag over a range of the code as one undo step.
 * @param {number} start - the start of the range.
 * @param {number} end - the end of the range.
 * @param {string} text - the tag, or a section's start tag, selection and end tag.
 * @param {number} selectionStart - the start of the selection afterwards.
 * @param {number} selectionEnd - the end of the selection afterwards.
 * @returns {void}
 */
function editCodeAtRange(start, end, text, selectionStart, selectionEnd) {
    addPendingHistoryStep();
    writeCodeRange(start, end, text, selectionStart, selectionEnd);
    clearTimeout(state.histTimer);
    state.histTimer = 0;
    addHistoryStep();
}

/**
 * Shows the view chosen, the note when the example view could not be made, and the
 * placeholders in the box: the page's list, else the tags of the document.
 * @returns {void}
 */
export function renderTemplateControls() {
    shownExamples = getTemplateExamples();
    if (!placeholderBox) return;
    showViewSwitch(getElement('#view-switch'), getViewMode());
    showViewNote(getElement('#view-note'), isExampleViewFailed());
    const listed = getListedPlaceholders(getTemplateExamples(), state.code, TEMPLATE_SYNTAX);
    if (listed.key === listedKey) return;
    listedKey = listed.key;
    placeholderBox.render(listed.placeholders);
}

/**
 * Draws the records view and its controls at once when the page's template placeholders differ from
 * the ones they show: a template that comes with a document (or before it) shows from the first
 * paint, in the records view and in the box.
 * @returns {void}
 */
export function updateTemplateView() {
    if (getTemplateExamples() !== shownExamples) renderRecordsView();
}
