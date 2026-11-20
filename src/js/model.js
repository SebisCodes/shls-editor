/**
 * Reading the code into the model (shls.js parseModel()) and drawing what depends on it: the
 * records view, the problems, the side panel and, while they are shown, the conversion and the
 * outline. Typing reads the code after a pause (startModelUpdate).
 */

import { parseModel } from './shls.js?v=7';
import { state, areas, ui } from './state.js?v=2';
import { renderProblems } from './problems.js?v=3';
import { renderNode } from './node-panel.js?v=3';
import { renderConvertResult } from './convert-panel.js?v=3';
import { renderOutline } from './outline-panel.js?v=3';
import { renderCode } from './code-view.js?v=3';

/**
 * Reads the code into the model now and draws everything that shows it.
 * @returns {void}
 */
export function updateModel() {
    clearTimeout(state.modelTimer);
    state.model = parseModel(state.code);
    state.hlModel = state.model;
    state.problems = state.model.problems;
    areas.view.render(state.model);
    renderProblems();
    renderNode();
    if (!ui.convert.hidden) renderConvertResult();
    if (!ui.outline.hidden) renderOutline();
}

/**
 * Reads the code into the model after a pause, then draws the code again.
 * @param {number} delay - the pause in milliseconds.
 * @returns {void}
 */
export function startModelUpdate(delay) {
    clearTimeout(state.modelTimer);
    state.modelTimer = setTimeout(() => { updateModel(); renderCode(); }, delay);
}

/**
 * Returns the model of a text when it is SHLS with at least one section.
 * @param {string} text - the text.
 * @returns {object|null} the model, null when the text cannot be read or has no section.
 */
export function getReadableModel(text) {
    const model = parseModel(text);
    return !model.error && model.sections.length > 0 ? model : null;
}
