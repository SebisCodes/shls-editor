/**
 * The two views of a template's records (?template=): the example view, the records of the
 * template filled with the page's examples (the default), and the template view, the records of
 * the code with its tags as written.
 *
 * updateRecordsView() runs these steps after the code is read (state.model):
 *   1. without a template syntax, or in the template view, the view shows state.model;
 *   2. in the example view, fill the code with the examples and read the filled text
 *      (records-examples.js); the view shows its records;
 *   3. when the filled text cannot be read while the template can, the view shows the template
 *      with a note.
 * Everything else works on the template: the problems, the side panel, saving and every export.
 * The functions below lead the view's rows and lines back to the template's rows and lines; a
 * row whose line holds text of an example is read-only in the example view.
 */

import { state, areas } from './state.js?v=3';
import { TEMPLATE_SYNTAX } from './template-lines.js?v=1';
import { createRows } from './view-rows.js?v=3';
import { getPlaceId, getRowPlace } from './view-path.js?v=2';
import { buildExampleView, getTemplateLine, findViewLine, isViewLineCopied } from './records-examples.js?v=1';

/** The view that shows the template filled with the examples. */
export const EXAMPLE_VIEW = 'example';
/** The view that shows the template with its tags. */
export const TEMPLATE_VIEW = 'template';
/** The message of a change of a part that shows an example. */
export const EXAMPLE_EDIT_MESSAGE = 'This part shows an example - change it in the template view or in the code';

/**
 * The state of the views: the view chosen, whether the example view could not be made, the
 * example view shown, and the template's rows of the model read last with their index by kind
 * and line.
 */
const views = { mode: EXAMPLE_VIEW, failed: false, shown: null, templateRows: null, templateRowsModel: null, templateRowIndex: null };
/** The index entry of a kind and line that more than one row of the template has. */
const AMBIGUOUS_ROW = 'ambiguous';

/**
 * Returns the view chosen.
 * @returns {string} EXAMPLE_VIEW or TEMPLATE_VIEW.
 */
export function getViewMode() {
    return views.mode;
}

/**
 * Sets the view chosen.
 * @param {string} mode - EXAMPLE_VIEW or TEMPLATE_VIEW.
 * @returns {void}
 */
export function setViewMode(mode) {
    views.mode = mode === TEMPLATE_VIEW ? TEMPLATE_VIEW : EXAMPLE_VIEW;
}

/**
 * Tells whether the example view was chosen and failed, so the template's records stand in for it.
 * @returns {boolean} true while the template's records stand in for the example view.
 */
export function isExampleViewFailed() {
    return Boolean(TEMPLATE_SYNTAX) && views.mode === EXAMPLE_VIEW && views.failed;
}

/**
 * Returns the page's examples for the open document.
 * @returns {?import('./template-examples.js').TemplateExamples} the examples, null without a page or away from its document.
 */
export function getTemplateExamples() {
    return areas.sync?.getTemplate() || null;
}

/**
 * Builds the view of the code read last (the steps in the header).
 * @returns {void}
 */
export function updateRecordsView() {
    views.shown = null;
    views.failed = false;
    if (!TEMPLATE_SYNTAX || views.mode !== EXAMPLE_VIEW || !state.model) return;
    try {
        const view = buildExampleView(state.code, TEMPLATE_SYNTAX, getTemplateExamples());
        if (!hasReadError(view.model)) views.shown = view;
        else views.failed = !hasReadError(state.model);
    } catch (error) {
        views.failed = true;
    }
}

/**
 * Tells whether a model could not be read or lists an error.
 * @param {import('./shls.js').ShlsModel} model - the model.
 * @returns {boolean} true when it holds a reading error or an error problem.
 */
function hasReadError(model) {
    return Boolean(model.error) || model.problems.some(problem => problem.kind === 'error');
}

/**
 * Returns the model the records view shows.
 * @returns {?import('./shls.js').ShlsModel} the example view's model, or the template's.
 */
export function getViewModel() {
    return views.shown ? views.shown.model : state.model;
}

/**
 * Returns the rows of the template's model (view-rows.js), made once per model.
 * @returns {import('./view-rows.js').ViewRows} the rows, by id and by line.
 */
export function getTemplateRows() {
    if (views.templateRowsModel !== state.model) {
        views.templateRowsModel = state.model;
        views.templateRows = state.model ? createRows(state.model) : { rows: [], rowsById: new Map(), rowIdByLine: [] };
        views.templateRowIndex = buildRowIndex(views.templateRows.rows);
    }
    return views.templateRows;
}

/**
 * Builds the index of rows by kind and line; a kind and line that several rows have (a line that
 * SHLS splits at a line break of its own, such as U+2028) is marked ambiguous.
 * @param {object[]} rows - the rows.
 * @returns {Map<string, (object|string)>} the row of each "kind:line", or AMBIGUOUS_ROW.
 */
function buildRowIndex(rows) {
    const index = new Map();
    for (const row of rows) {
        const key = row.kind + ':' + row.line;
        index.set(key, index.has(key) ? AMBIGUOUS_ROW : row);
    }
    return index;
}

/**
 * Returns the template's row a row of the view stands for: in the example view the row of the
 * same kind at the template's line the row comes from.
 * @param {?object} row - a row of the records view, or null.
 * @returns {?object} the template's row; null without one (a row made of an example only).
 */
export function getTemplateRow(row) {
    if (!row || !views.shown) return row || null;
    getTemplateRows();
    const found = views.templateRowIndex.get(row.kind + ':' + getTemplateLine(views.shown, row.line));
    return found && found !== AMBIGUOUS_ROW ? found : null;
}

/**
 * Returns the template's row of the row selected in the records view.
 * @returns {?object} the template's row, null without a selection or without a template's row.
 */
export function getSelectedTemplateRow() {
    return getTemplateRow(areas.view.getSelectedRow());
}

/**
 * Returns the place of the template's row of the selection, to keep a selection that holds in
 * both views and across changes (undo steps, documents).
 * @returns {?import('./state.js').ViewPlace} the place in the template, null without one.
 */
export function getSelectedTemplatePlace() {
    const row = getSelectedTemplateRow();
    return row ? getRowPlace(row) : null;
}

/**
 * Returns the section of the template the selection is in, or the first one.
 * @returns {object|null} the section of the template's model, null when the document has none.
 */
export function getCurrentSection() {
    const row = getSelectedTemplateRow();
    return state.model?.sections.find(section => section.name === row?.sec) || state.model?.sections[0] || null;
}

/**
 * Returns the lines of the template a row of the view covers.
 * @param {object} row - a row of the records view (with its line and end).
 * @returns {{line: number, end: number}} its first and last line in the template.
 */
export function getTemplateLines(row) {
    const end = row.end ?? row.line;
    if (!views.shown) return { line: row.line, end };
    const line = getTemplateLine(views.shown, row.line);
    return { line, end: Math.max(line, getTemplateLine(views.shown, end)) };
}

/**
 * Returns the line of the records view that shows a line of the template.
 * @param {number} templateLine - the template's line, 0-based.
 * @returns {number} the line of the view's model, 0-based.
 */
export function getViewLine(templateLine) {
    return views.shown ? findViewLine(views.shown, templateLine) : templateLine;
}

/**
 * Returns why a row cannot be changed in the example view.
 * @param {object} row - the row of the records view.
 * @returns {?string} EXAMPLE_EDIT_MESSAGE, or null when the change may be made in the template.
 */
export function getExampleEditRefusal(row) {
    if (!views.shown) return null;
    return getTemplateRow(row) && isViewLineCopied(views.shown, row.line) ? null : EXAMPLE_EDIT_MESSAGE;
}

/**
 * Selects a place of the template in the records view: in the example view the first row of the
 * same kind that stands for the template's row of the place; nothing is selected when no row
 * shows it (a hidden section).
 * @param {?import('./state.js').ViewPlace} place - the place in the template, or null for none.
 * @param {object} [options] - scroll: false to leave the scroll position; how: tells onPick.
 * @returns {void}
 */
export function selectTemplatePlace(place, options = {}) {
    if (!views.shown || !place) { areas.view.select(place, options); return; }
    const templateRow = getTemplateRows().rowsById.get(getPlaceId(place));
    const viewRow = templateRow ? areas.view.getRows().find(row => row.kind === templateRow.kind && getTemplateRow(row) === templateRow) : null;
    areas.view.select(viewRow ? viewRow.id : null, options);
}
