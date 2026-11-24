/**
 * Reading the code into the model (template-lines.js parseCodeModel()) and drawing what depends on it: the
 * records view (of a template: the example view or the template view, records-views.js), the
 * controls of template placeholders, the problems, the side panel and, while they are shown, the
 * conversion and the outline. Typing reads the code after a pause (startModelUpdate).
 */

import { parseCodeModel } from './template-lines.js?v=1';
import { state, areas, ui } from './state.js?v=3';
import { renderProblems } from './problems.js?v=4';
import { renderNode } from './node-panel.js?v=4';
import { renderConvertResult } from './convert-panel.js?v=4';
import { renderOutline } from './outline-panel.js?v=4';
import { renderCode } from './code-view.js?v=4';
import { updateRecordsView, getViewModel, getSelectedTemplatePlace, selectTemplatePlace } from './records-views.js?v=1';
import { showHits } from './view-bar.js?v=4';
import { renderTemplateControls } from './template-panel.js?v=1';

/**
 * Reads the code into the model now and draws everything that shows it.
 * @returns {void}
 */
export function updateModel() {
    clearTimeout(state.modelTimer);
    state.model = parseCodeModel(state.code);
    state.hlModel = state.model;
    state.problems = state.model.problems;
    updateRecordsView();
    areas.view.render(getViewModel());
    renderTemplateControls();
    renderProblems();
    renderNode();
    if (!ui.convert.hidden) renderConvertResult();
    if (!ui.outline.hidden) renderOutline();
}

/**
 * Builds the view of a template again and draws the records view, the controls of template
 * placeholders, the matches of the search and the side panel: after a switch of the view, and
 * when the page's examples change. An open edit in place is written first (it belongs to the
 * view before), and the selection stays on the same place of the template.
 * @returns {void}
 */
export function renderRecordsView() {
    if (areas.view.isEditing()) areas.view.stopEdit();
    const place = getSelectedTemplatePlace();
    updateRecordsView();
    areas.view.render(getViewModel());
    selectTemplatePlace(place, { scroll: false });
    renderTemplateControls();
    showHits();
    renderNode();
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
    const model = parseCodeModel(text);
    return !model.error && model.sections.length > 0 ? model : null;
}
