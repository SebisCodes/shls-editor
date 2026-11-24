/**
 * The code view: a textarea with the highlighted code, the problem marks and the line numbers
 * behind it, a band on the line with the cursor, and the status below it (lines, size,
 * sections).
 */

import { highlight, escapeHtml } from './shls.js?v=8';
import { state, areas, ui, LINE_HEIGHT, NARROW_SCREEN, formatSize } from './state.js?v=3';
import { formatCount } from './util.js?v=3';
import { getLineIndex, getColumnIndex, getLineStart, getLineEnd } from './text-position.js?v=3';
import { updateHistoryButtons } from './history.js?v=5';
import { getTemplateLines } from './records-views.js?v=1';

/** Longer code is shown without highlighting, so typing stays fast. */
const MAX_HIGHLIGHT_LENGTH = 600000;
/** The padding above the first line, in pixels. */
const CODE_PADDING_TOP = 10;
/** The cursor is scrolled into view when it is closer to the bottom than this many lines. */
const SCROLL_MARGIN_LINES = 2;
/** A line scrolled into view lands a third of the height below the top. */
const SCROLL_TARGET_DIVISOR = 3;
/** Room kept right of the cursor before the code scrolls sideways, in pixels. */
const SCROLL_MARGIN_RIGHT = 60;
/** Room kept left of the cursor after the code scrolls sideways, in pixels. */
const SCROLL_MARGIN_LEFT = 40;
/** The number of characters measured for the character width. */
const MEASURE_LENGTH = 100;

/** The band on the line with the cursor, so the cursor is easy to find. */
const lineBand = document.createElement('div');
let characterWidth = 0;

/**
 * Adds the band of the cursor's line behind the code.
 * @returns {void}
 */
export function startCodeView() {
    lineBand.className = 'line-band';
    lineBand.setAttribute('aria-hidden', 'true');
    ui.marks.before(lineBand);
}

/**
 * Draws the highlighted code, the problem marks, the line wrap and the status below the code.
 * @returns {void}
 */
export function renderCode() {
    const code = state.code;
    const model = state.hlModel || state.model;
    ui.hl.innerHTML = model && code.length < MAX_HIGHLIGHT_LENGTH ? highlight(model) + '\n' : escapeHtml(code) + '\n';
    renderMarks();
    const lines = code.split('\n').length;
    areas.lineWrap.update(code);
    const bytes = new Blob([code]).size;
    const sections = model ? model.sections.length : 0;
    ui.status.textContent = `${formatCount(lines, 'line', 'lines')} · ${formatSize(bytes)} · ${formatCount(sections, 'section', 'sections')}`;
    updateHistoryButtons();
}

/**
 * Gives lines with problems a colored background (an error wins over a note on the same line).
 * @returns {void}
 */
function renderMarks() {
    const lines = state.code.split('\n');
    const markByLine = new Map();
    for (const problem of (state.hlModel || state.model)?.problems || []) {
        if (!markByLine.has(problem.line) || problem.kind === 'error') markByLine.set(problem.line, problem.kind === 'error' ? 'err' : 'warn');
    }
    ui.marks.innerHTML = lines.map((line, index) => (markByLine.has(index) ? `<mark class="${markByLine.get(index)}">${escapeHtml(line || ' ')}</mark>` : escapeHtml(line))).join('\n') + '\n';
}

/**
 * Moves the highlighting, the marks and the line numbers with the textarea's scroll.
 * @returns {void}
 */
export function syncScroll() {
    const offset = `translate(${-ui.ta.scrollLeft}px, ${-ui.ta.scrollTop}px)`;
    ui.hl.style.transform = offset;
    ui.marks.style.transform = offset;
    ui.gutter.style.transform = `translateY(${-ui.ta.scrollTop}px)`;
    showLineBand();
}

/**
 * Puts the band on the line with the cursor; hides it while text is selected in the code.
 * @returns {void}
 */
export function showLineBand() {
    const ta = ui.ta;
    lineBand.hidden = ta.selectionStart !== ta.selectionEnd && document.activeElement === ta;
    const line = getLineIndex(ta.selectionStart);
    lineBand.style.transform = `translateY(${CODE_PADDING_TOP + areas.lineWrap.getLineTop(line) - ta.scrollTop}px)`;
    lineBand.style.height = areas.lineWrap.getLineHeight(line) + 'px';
}

/**
 * Returns the width of one character of the code's font, measured once (a query that fills a
 * cache).
 * @returns {number} the width in pixels.
 */
function getCharacterWidth() {
    if (!characterWidth) {
        const probe = document.createElement('span');
        probe.textContent = 'x'.repeat(MEASURE_LENGTH);
        probe.style.cssText = 'position:absolute;visibility:hidden;white-space:pre';
        probe.style.font = getComputedStyle(ui.ta).font;
        document.body.appendChild(probe);
        characterWidth = probe.getBoundingClientRect().width / MEASURE_LENGTH;
        probe.remove();
    }
    return characterWidth;
}

/**
 * Puts the cursor (or a selection) at a position and scrolls the code there.
 * @param {number} position - the start of the selection.
 * @param {boolean} [focus] - true to focus the code (not on narrow screens).
 * @param {number} [selectionEnd] - the end of the selection.
 * @returns {void}
 */
export function showCodePosition(position, focus = true, selectionEnd = position) {
    const ta = ui.ta;
    if (focus && !NARROW_SCREEN.matches) ta.focus({ preventScroll: true });
    ta.setSelectionRange(position, selectionEnd);
    const top = areas.lineWrap.getLineTop(getLineIndex(position)), height = ta.clientHeight;
    if (top < ta.scrollTop + LINE_HEIGHT || top > ta.scrollTop + height - LINE_HEIGHT * SCROLL_MARGIN_LINES) ta.scrollTop = Math.max(0, top - height / SCROLL_TARGET_DIVISOR);
    const left = getColumnIndex(position) * getCharacterWidth();
    if (left < ta.scrollLeft || left > ta.scrollLeft + ta.clientWidth - SCROLL_MARGIN_RIGHT) ta.scrollLeft = Math.max(0, left - SCROLL_MARGIN_LEFT);
    syncScroll();
}

/**
 * Selects the text of a row's lines in the code: from the first character after the
 * indentation to the end of its last line (in the example view of a template: the template's
 * lines the row comes from).
 * @param {object|null} row - a row of the records view (with its line and end).
 * @param {boolean} [focus] - true to focus the code.
 * @returns {void}
 */
export function showRowInCode(row, focus = false) {
    if (!row || row.line == null) return;
    const lines = getTemplateLines(row);
    const start = getLineStart(lines.line) + /^ */.exec(state.model.lines[lines.line] || '')[0].length;
    showCodePosition(start, focus, Math.max(start, getLineEnd(lines.end)));
}
