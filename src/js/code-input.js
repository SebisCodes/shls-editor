/**
 * Typing in the code: each input is highlighted at once, read into the model after a pause,
 * made an undo step after a longer pause and stored after another; Tab indents and Enter keeps
 * the indentation (SHLS indents with spaces only); Ctrl+Z and Ctrl+Y undo and redo.
 */

import { parseModel } from './shls.js?v=7';
import { state, areas, ui } from './state.js?v=2';
import { renderCode, syncScroll } from './code-view.js?v=3';
import { startModelUpdate } from './model.js?v=3';
import { addHistoryStep, undo, redo } from './history.js?v=3';
import { saveToStorage } from './storage.js?v=3';

/** Longer code is highlighted without reading it while typing. */
const MAX_TYPING_MODEL_LENGTH = 300000;
/** Longer code is read into the model after the longer pause. */
const LONG_CODE_LENGTH = 200000;
/** The pause before long code is read into the model, in milliseconds. */
const LONG_MODEL_DELAY = 600;
/** The pause before the code is read into the model, in milliseconds. */
const MODEL_DELAY = 220;
/** The pause before typing becomes an undo step, in milliseconds. */
const HISTORY_DELAY = 600;
/** The pause before typing is stored, in milliseconds. */
const SAVE_DELAY = 400;

/**
 * Connects the typing, the scroll and the keys of the code.
 * @returns {void}
 */
export function startCodeInput() {
    ui.ta.addEventListener('input', readTypedCode);
    ui.ta.addEventListener('scroll', syncScroll);
    ui.ta.addEventListener('keydown', handleCodeKey);
}

/**
 * Takes the typed code: highlights it at once and starts the timers of the model, the undo
 * step and the storing (an input handler).
 * @returns {void}
 */
function readTypedCode() {
    state.code = ui.ta.value;
    state.hlModel = state.code.length < MAX_TYPING_MODEL_LENGTH ? parseModel(state.code) : null;
    renderCode();
    startModelUpdate(state.code.length > LONG_CODE_LENGTH ? LONG_MODEL_DELAY : MODEL_DELAY);
    clearTimeout(state.histTimer);
    state.histTimer = setTimeout(addHistoryStep, HISTORY_DELAY);
    clearTimeout(state.saveTimer);
    state.saveTimer = setTimeout(saveToStorage, SAVE_DELAY);
    areas.sync?.handleChange();
}

/**
 * Writes text over a range of the code as typing would: through the browser's own undo and
 * assistive technology where it can, else directly.
 * @param {number} start - the start of the range.
 * @param {number} end - the end of the range.
 * @param {string} text - the new text.
 * @param {number} [selectionStart] - where the selection starts afterwards.
 * @param {number} [selectionEnd] - where it ends; without it, the cursor is at selectionStart.
 * @returns {void}
 */
export function writeCodeRange(start, end, text, selectionStart, selectionEnd) {
    const ta = ui.ta;
    if (document.activeElement !== ta) ta.focus({ preventScroll: true });
    ta.setSelectionRange(start, end);
    if (!document.execCommand || !document.execCommand('insertText', false, text)) {
        ta.setRangeText(text, start, end, 'end');
        ta.dispatchEvent(new Event('input'));
    }
    if (selectionStart != null) ta.setSelectionRange(selectionStart, selectionEnd ?? selectionStart);
}

/**
 * Runs the keys of the code: undo and redo, Escape leaves the code, Tab indents, Enter keeps
 * the indentation (a keydown handler).
 * @param {KeyboardEvent} event - the key.
 * @returns {void}
 */
function handleCodeKey(event) {
    const withModifier = event.ctrlKey || event.metaKey;
    if (withModifier && !event.altKey && (event.key === 'z' || event.key === 'Z')) { event.preventDefault(); event.shiftKey ? redo() : undo(); return; }
    if (withModifier && event.key === 'y') { event.preventDefault(); redo(); return; }
    if (event.key === 'Escape') { ui.ta.blur(); return; }
    if (event.key === 'Tab') { event.preventDefault(); writeIndent(event.shiftKey); return; }
    if (event.key === 'Enter' && !withModifier && !event.isComposing) { event.preventDefault(); writeLineBreak(); }
}

/**
 * Returns one level of indentation of the open document.
 * @returns {string} as many spaces as the document indents one level.
 */
function getIndentUnit() {
    return ' '.repeat(state.model?.unit || 1);
}

/**
 * Tab: indents by one level at the cursor, or indents (Shift: outdents) every line of the
 * selection.
 * @param {boolean} outdent - true for Shift+Tab.
 * @returns {void}
 */
function writeIndent(outdent) {
    const code = ui.ta.value, start = ui.ta.selectionStart, end = ui.ta.selectionEnd;
    const unit = getIndentUnit();
    const lineStart = code.lastIndexOf('\n', start - 1) + 1;
    if (start === end && !outdent) { writeCodeRange(start, end, unit); return; }
    const lastLineEnd = code.indexOf('\n', end - (end > start && code[end - 1] === '\n' ? 1 : 0));
    const rangeEnd = lastLineEnd < 0 ? code.length : lastLineEnd;
    const lines = code.slice(lineStart, rangeEnd).split('\n');
    const strip = new RegExp('^ {1,' + unit.length + '}');
    const text = lines.map(line => (outdent ? line.replace(strip, '') : line.trim() ? unit + line : line)).join('\n');
    writeCodeRange(lineStart, rangeEnd, text, lineStart, lineStart + text.length);
}

/**
 * Enter: the next line keeps the indentation; after a section name it starts the key block.
 * @returns {void}
 */
function writeLineBreak() {
    const code = ui.ta.value, start = ui.ta.selectionStart, end = ui.ta.selectionEnd;
    const lineStart = code.lastIndexOf('\n', start - 1) + 1;
    const indent = /^ */.exec(code.slice(lineStart))[0];
    const before = code.slice(lineStart, start);
    const nextBreak = code.indexOf('\n', start);
    const after = code.slice(start, nextBreak < 0 ? code.length : nextBreak);
    if (!indent && before.trim() && start === end && !after.trim()) { writeCodeRange(start, end, '\n' + getIndentUnit()); return; }
    writeCodeRange(start, end, '\n' + (before.trim() ? indent : ''));
}
