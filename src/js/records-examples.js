/**
 * The example view of an SHLS template: the code filled with the page's examples
 * (template-expansion.js), read as SHLS, with the lines of the filled text led back to the lines
 * of the template.
 *
 * buildExampleView() runs these steps:
 *   1. fill the template; lines that hold only section tags and spaces leave with their line
 *      break, as the page's server removes them. Each fill is written as one line of an SHLS
 *      value and keeps the line's indentation as the template has it: every run of white space
 *      becomes one space, and a fill at the start of a line loses its leading spaces. An empty
 *      fill at the start of a line is written as "-", the encoder's mark of a missing value, when
 *      the rest of its template line is blank (so the values after it keep their keys), and as a
 *      word joiner (U+2060, no white space for SHLS) when the rest starts with a space (so that
 *      space stays out of the indentation);
 *   2. read the filled text as plain SHLS (shls.js parseModel()), so text of an example is
 *      always a value and never a tag;
 *   3. note for every line of the filled text the line of the template it comes from.
 * It works on strings only, so it runs in Node as well.
 */

import { parseModel } from './shls.js?v=8';
import { expandTemplate, getCodeOffsetByViewOffset, getCopiedCodeRange } from './template-expansion.js?v=2';

/** A run of white space inside a fill (line breaks of every kind included). */
const FILL_WHITESPACE_RUN = /[\s\x1c-\x1e\x85]+/g;
/** The filled text so far ends at the start of a line, in its indentation. */
const AT_LINE_START = /(?:^|\n)[ \t]*$/;
/** The indentation at the start of a line. */
const LINE_INDENTATION = /^[ \t]*/;
/** What an empty fill is written as when the rest of its line is blank: the encoder's mark of a missing value. */
const MISSING_VALUE = '-';
/** What an empty fill is written as when the rest of its line starts with a space: a character SHLS reads as text. */
const INDENT_KEEPER = '\u2060';
/** A space or tab. */
const SPACE_OR_TAB = /^[ \t]/;

/**
 * The example view of a template.
 * @typedef {object} ExampleView
 * @property {import('./shls.js').ShlsModel} model - the filled text read as SHLS.
 * @property {string} text - the filled text.
 * @property {import('./template-expansion.js').ViewSegment[]} map - leads every place of the filled text back to the code.
 * @property {number[]} lineStarts - where each line of the filled text starts.
 * @property {Int32Array} templateLines - the line of the template each line of the filled text comes from.
 * @property {string} code - the template.
 * @property {number[]} codeLineStarts - where each line of the template starts.
 */

/**
 * Fills a template with the examples and reads the result (the steps in the header).
 * @param {string} code - the template.
 * @param {import('./template-tags.js').TemplateSyntax} syntax - the template syntax.
 * @param {?import('./template-examples.js').TemplateExamples} examples - the page's examples, or null.
 * @returns {ExampleView} the filled text, its model and its map.
 * @throws {import('./template-expansion.js').TemplateExpansionError} when the filling goes past its limits.
 */
export function buildExampleView(code, syntax, examples) {
    const filled = expandTemplate(code, syntax, { examples, writeFill: createFillWriter(code) });
    const lineStarts = getLineStarts(filled.text);
    const codeLineStarts = getLineStarts(code);
    const view = { model: parseModel(filled.text), text: filled.text, map: filled.map, lineStarts, templateLines: null, code, codeLineStarts };
    view.templateLines = buildTemplateLines(view, codeLineStarts);
    return view;
}

/**
 * Creates the writer of the fills of one template (template-expansion.js FillWriter).
 * @param {string} code - the template.
 * @returns {function(import('./template-tags.js').TemplateTag, import('./template-expansion.js').TagFill, string): string} the writer:
 *     (tag, fill, the filled text just before it) to the fill as SHLS text.
 */
export function createFillWriter(code) {
    return (tag, fill, before) => {
        const text = fill.text.replace(FILL_WHITESPACE_RUN, ' ');
        if (!AT_LINE_START.test(before)) return text;
        const trimmed = text.trimStart();
        if (trimmed) return trimmed;
        const rest = getRestOfLine(code, tag);
        return !rest.trim() ? MISSING_VALUE : SPACE_OR_TAB.test(rest) ? INDENT_KEEPER : '';
    };
}

/**
 * Returns the text of the template after a tag up to the end of its line.
 * @param {string} code - the template.
 * @param {import('./template-tags.js').TemplateTag} tag - the tag.
 * @returns {string} the rest of the tag's line, without the line break.
 */
function getRestOfLine(code, tag) {
    const lineBreak = code.indexOf('\n', tag.end);
    return code.slice(tag.end, lineBreak < 0 ? code.length : lineBreak);
}

/**
 * Returns where each line of a text starts.
 * @param {string} text - the text.
 * @returns {number[]} the offset of each line (lines split at "\n"), in order.
 */
function getLineStarts(text) {
    const lineStarts = [0];
    for (let lineBreak = text.indexOf('\n'); lineBreak >= 0; lineBreak = text.indexOf('\n', lineBreak + 1)) lineStarts.push(lineBreak + 1);
    return lineStarts;
}

/**
 * Returns the line that holds an offset.
 * @param {number[]} lineStarts - where each line starts, in order.
 * @param {number} offset - the offset.
 * @returns {number} the line, 0-based.
 */
function getLineAt(lineStarts, offset) {
    let low = 0, high = lineStarts.length - 1;
    while (low < high) {
        const middle = (low + high + 1) >> 1;
        if (lineStarts[middle] <= offset) low = middle; else high = middle - 1;
    }
    return low;
}

/**
 * Returns the stretch of a line of the filled text after its indentation.
 * @param {ExampleView} view - the example view.
 * @param {number} viewLine - the line of the filled text, 0-based.
 * @returns {{start: number, end: number}} where its text starts and ends in the filled text.
 */
function getLineText(view, viewLine) {
    const lineStart = view.lineStarts[viewLine] ?? view.text.length;
    const next = view.lineStarts[viewLine + 1];
    const end = next === undefined ? view.text.length : next - 1;
    return { start: Math.min(end, lineStart + LINE_INDENTATION.exec(view.text.slice(lineStart, end))[0].length), end };
}

/**
 * Returns the line of the template each line of the filled text comes from: the line of the
 * code its first character after the indentation is copied from or filled for.
 * @param {ExampleView} view - the example view (lineStarts and map set).
 * @param {number[]} codeLineStarts - where each line of the template starts.
 * @returns {Int32Array} the template's line per line of the filled text.
 */
function buildTemplateLines(view, codeLineStarts) {
    const lines = new Int32Array(view.lineStarts.length);
    for (let viewLine = 0; viewLine < lines.length; viewLine++) {
        lines[viewLine] = getLineAt(codeLineStarts, getCodeOffsetByViewOffset(view.map, getLineText(view, viewLine).start));
    }
    return lines;
}

/**
 * Returns the line of the template a line of the filled text comes from.
 * @param {ExampleView} view - the example view.
 * @param {number} viewLine - the line of the filled text, 0-based.
 * @returns {number} the template's line, 0-based.
 */
export function getTemplateLine(view, viewLine) {
    const lines = view.templateLines;
    return lines.length ? lines[Math.max(0, Math.min(viewLine, lines.length - 1))] : 0;
}

/**
 * Finds the line of the filled text that shows a line of the template: the first one that comes
 * from it, else the last one that comes from a line above it (the line itself is left out, in a
 * hidden section or as a control line).
 * @param {ExampleView} view - the example view.
 * @param {number} templateLine - the template's line, 0-based.
 * @returns {number} the line of the filled text, 0-based.
 */
export function findViewLine(view, templateLine) {
    let before = 0;
    for (let viewLine = 0; viewLine < view.templateLines.length; viewLine++) {
        const line = view.templateLines[viewLine];
        if (line === templateLine) return viewLine;
        if (line < templateLine) before = viewLine;
    }
    return before;
}

/**
 * Tells whether the text of a line of the filled text (after its indentation) is the whole text
 * of its template line, copied as one piece, so an edit of the line can be made in the template.
 * @param {ExampleView} view - the example view.
 * @param {number} viewLine - the line of the filled text, 0-based.
 * @returns {boolean} true when no example and no left-out part lies in it and it covers its template line's text.
 */
export function isViewLineCopied(view, viewLine) {
    const { start, end } = getLineText(view, viewLine);
    const range = getCopiedCodeRange(view.map, start, end);
    if (!range) return false;
    const codeLine = getLineAt(view.codeLineStarts, range.start);
    const lineStart = view.codeLineStarts[codeLine];
    const next = view.codeLineStarts[codeLine + 1];
    const lineEnd = next === undefined ? view.code.length : next - 1;
    const textStart = Math.min(lineEnd, lineStart + LINE_INDENTATION.exec(view.code.slice(lineStart, lineEnd))[0].length);
    return range.start === textStart && range.end === lineEnd;
}
