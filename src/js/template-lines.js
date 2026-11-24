/**
 * Template placeholders in an SHLS document (?template=mustache or ?template=angle in the
 * editor's address). A value tag such as {{name}} is a plain string value. A line that holds
 * section tags only ({{#items}}, {{/items}}) is a control line, which the page's server removes
 * when it fills the template: the reader passes over it between complete records or sections
 * and reports it inside a key block or a record (shls.js parseModel()).
 *
 * This module reads the syntax from the address once, tells control lines apart and reads the
 * code into the model together with the placeholder errors of template-tags.js. Without a
 * syntax the model is exactly the one of parseModel().
 */

import { parseModel, getProblemOrder } from './shls.js?v=8';
import { getTemplateSyntax, getTemplateNameByAddress, getTemplateTags, checkTemplateSections, hasOnlySectionTags } from './template-tags.js?v=2';

/** The template syntax the address asks for with ?template=, or null. */
export const TEMPLATE_SYNTAX = getTemplateSyntax(getTemplateNameByAddress(globalThis.location ? globalThis.location.search : ''));
/** The message of an edit of the records view that would leave a section of the template open or closed alone. */
export const TEMPLATE_EDIT_MESSAGE = 'Sections of the template stay whole - make this change in the code';
/** The message of a rewrite of the whole document while it holds placeholders. */
export const TEMPLATE_FORMAT_MESSAGE = 'A template stays as written - the encoder works on filled data';

/**
 * Tells whether the code holds a placeholder of the address's syntax.
 * @param {string} code - the code.
 * @param {?import('./template-tags.js').TemplateSyntax} [syntax=TEMPLATE_SYNTAX] - the syntax, or null.
 * @returns {boolean} true when a syntax is set and the code holds one of its tags.
 */
export function hasTemplateTags(code, syntax = TEMPLATE_SYNTAX) {
    return Boolean(syntax) && getTemplateTags(code, syntax).length > 0;
}

/**
 * Tells whether an edit keeps the sections of a template whole: every placeholder error of the
 * edited code is one the code holds already.
 * @param {string} code - the code as it stands.
 * @param {string} editedCode - the code after the edit.
 * @param {?import('./template-tags.js').TemplateSyntax} [syntax=TEMPLATE_SYNTAX] - the syntax, or null.
 * @returns {boolean} true without a syntax, or when the edit adds no placeholder error.
 */
export function isTemplateEditWhole(code, editedCode, syntax = TEMPLATE_SYNTAX) {
    if (!syntax || editedCode === code) return true;
    const known = new Map();
    for (const problem of checkTemplateSections(code, syntax)) known.set(problem.msg, (known.get(problem.msg) || 0) + 1);
    for (const problem of checkTemplateSections(editedCode, syntax)) {
        const count = known.get(problem.msg) || 0;
        if (!count) return false;
        known.set(problem.msg, count - 1);
    }
    return true;
}

/**
 * Reads the code into the editor's model. With a syntax, control lines are read as such and the
 * placeholder errors join the problems.
 * @param {string} code - the SHLS code.
 * @param {?import('./template-tags.js').TemplateSyntax} [syntax=TEMPLATE_SYNTAX] - the syntax, or null.
 * @returns {import('./shls.js').ShlsModel} the model.
 */
export function parseCodeModel(code, syntax = TEMPLATE_SYNTAX) {
    if (!syntax) return parseModel(code);
    const model = parseModel(code, { isControlLine: line => hasOnlySectionTags(line, syntax) });
    model.problems = [...model.problems, ...getTemplateProblems(code, syntax)].sort(getProblemOrder);
    return model;
}

/**
 * Returns the placeholder errors of the code with their lines: sections left open, stray or
 * misplaced end tags and tags with a sign outside the syntax.
 * @param {string} code - the code.
 * @param {import('./template-tags.js').TemplateSyntax} syntax - the syntax.
 * @returns {import('./shls.js').ShlsProblem[]} the errors, in the order of the code.
 */
function getTemplateProblems(code, syntax) {
    const problems = checkTemplateSections(code, syntax);
    if (!problems.length) return [];
    const lineStarts = getLineStarts(code);
    return problems.map(problem => ({ line: findLineIndex(lineStarts, problem.pos), kind: 'error', msg: problem.msg }));
}

/**
 * Returns where each line of a code starts.
 * @param {string} code - the code.
 * @returns {number[]} the offset of each line (lines split at "\n"), in order.
 */
function getLineStarts(code) {
    const lineStarts = [0];
    for (let lineBreak = code.indexOf('\n'); lineBreak >= 0; lineBreak = code.indexOf('\n', lineBreak + 1)) lineStarts.push(lineBreak + 1);
    return lineStarts;
}

/**
 * Finds the line that holds a character offset.
 * @param {number[]} lineStarts - where each line starts, in order.
 * @param {number} offset - the character offset.
 * @returns {number} the line, 0-based.
 */
function findLineIndex(lineStarts, offset) {
    let low = 0, high = lineStarts.length - 1;
    while (low < high) {
        const middle = (low + high + 1) >> 1;
        if (lineStarts[middle] <= offset) low = middle; else high = middle - 1;
    }
    return low;
}
