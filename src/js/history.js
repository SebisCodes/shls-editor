/**
 * Setting the code and the undo history. Every change of the code goes through setCode(): it
 * reads the code into the model, draws the code, makes an undo step, stores the document and
 * tells sync.js. Typing makes its undo step after a pause (code-input.js).
 */

import { state, areas, ui, getElement, showToast } from './state.js?v=3';
import { updateModel } from './model.js?v=4';
import { renderCode } from './code-view.js?v=4';
import { saveToStorage } from './storage.js?v=4';
import { renderNode } from './node-panel.js?v=4';
import { getSelectedTemplatePlace, selectTemplatePlace } from './records-views.js?v=1';

/** The most undo steps a document keeps. */
const MAX_HISTORY_STEPS = 300;

/**
 * Sets the code: one undo step unless history is false.
 * @param {string} code - the new code.
 * @param {object} [options] - the options.
 * @param {boolean} [options.history] - false to make no undo step.
 * @returns {void}
 */
export function setCode(code, { history = true } = {}) {
    const ta = ui.ta;
    const scrollTop = ta.scrollTop, scrollLeft = ta.scrollLeft, selectionStart = ta.selectionStart, selectionEnd = ta.selectionEnd;
    // Typing still waiting for its undo step gets it first, so Undo after this change goes back to that text.
    if (history && state.histTimer) { clearTimeout(state.histTimer); state.histTimer = 0; addHistoryStep(); }
    state.code = code;
    if (ta.value !== code) {
        ta.value = code;
        ta.scrollTop = scrollTop; ta.scrollLeft = scrollLeft;
        ta.setSelectionRange(Math.min(selectionStart, code.length), Math.min(selectionEnd, code.length));
    }
    updateModel();
    renderCode();
    if (history) addHistoryStep();
    saveToStorage();
    areas.sync?.handleChange();
}

/**
 * Enables Undo and Redo as far as there is something to undo or redo.
 * @returns {void}
 */
export function updateHistoryButtons() {
    const last = state.history[state.history.length - 1];
    getElement('#btn-undo').disabled = !(state.history.length > 1 || (last && last.code !== state.code));
    getElement('#btn-redo').disabled = !state.future.length;
}

/**
 * Makes an undo step of the current code (or moves the cursor of the last step when the code
 * is the same) and clears the redo steps.
 * @returns {void}
 */
export function addHistoryStep() {
    const last = state.history[state.history.length - 1];
    const selection = ui.ta.selectionStart;
    if (last && last.code === state.code) { last.sel = selection; return; }
    state.history.push({ code: state.code, sel: selection, view: getSelectedTemplatePlace() });
    if (state.history.length > MAX_HISTORY_STEPS) state.history.shift();
    state.future = [];
    updateHistoryButtons();
}

/**
 * Makes the undo step that typing still waits for, so a change from the view is a step of its own.
 * @returns {void}
 */
export function addPendingHistoryStep() {
    clearTimeout(state.histTimer);
    if (state.history[state.history.length - 1]?.code !== state.code) addHistoryStep();
}

/**
 * Goes back one undo step, with its cursor and its place in the records view.
 * @returns {void}
 */
export function undo() {
    clearTimeout(state.histTimer);
    if (state.history[state.history.length - 1]?.code !== state.code) addHistoryStep();
    if (state.history.length < 2) { showToast('Nothing to undo'); return; }
    state.future.push(state.history.pop());
    const step = state.history[state.history.length - 1];
    setCode(step.code, { history: false });
    if (step.sel != null) ui.ta.setSelectionRange(Math.min(step.sel, state.code.length), Math.min(step.sel, state.code.length));
    if (step.view) selectTemplatePlace(step.view);
    renderNode();
}

/**
 * Goes forward one undo step that Undo took back.
 * @returns {void}
 */
export function redo() {
    const step = state.future.pop();
    if (!step) { showToast('Nothing to redo'); return; }
    state.history.push(step);
    setCode(step.code, { history: false });
    if (step.view) selectTemplatePlace(step.view);
    renderNode();
}
