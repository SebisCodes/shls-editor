/**
 * Lines and columns of positions in the open document's code, and the other way round.
 * Line indexes are 0-based here; getLinePosition() takes a 1-based line number, as the tools
 * and the screen count them.
 */

import { state } from './state.js?v=3';

/**
 * Returns the line of a position in the open document's code.
 * @param {number} position - the character offset.
 * @returns {number} the line, 0-based.
 */
export function getLineIndex(position) {
    let line = 0;
    for (let i = state.code.indexOf('\n'); i >= 0 && i < position; i = state.code.indexOf('\n', i + 1)) line++;
    return line;
}

/**
 * Returns the column of a position in the open document's code.
 * @param {number} position - the character offset.
 * @returns {number} the column, 0-based.
 */
export function getColumnIndex(position) {
    return position - (state.code.lastIndexOf('\n', position - 1) + 1);
}

/**
 * Returns where a line of the open document's code starts; past the last line, the end of the
 * code (also for a huge or endless number).
 * @param {number} line - the line, 1-based.
 * @returns {number} the character offset of its start.
 */
export function getLinePosition(line) {
    let position = 0;
    for (let current = 1; current < line; current++) {
        const lineEnd = state.code.indexOf('\n', position);
        if (lineEnd < 0) return state.code.length;
        position = lineEnd + 1;
    }
    return position;
}

/**
 * Returns where a line of the open document's code starts.
 * @param {number} lineIndex - the line, 0-based.
 * @returns {number} the character offset of its start.
 */
export function getLineStart(lineIndex) {
    return getLinePosition(lineIndex + 1);
}

/**
 * Returns where a line of the open document's code ends (before its line break).
 * @param {number} lineIndex - the line, 0-based.
 * @returns {number} the character offset of its end.
 */
export function getLineEnd(lineIndex) {
    const start = getLineStart(lineIndex);
    const end = state.code.indexOf('\n', start);
    return end < 0 ? state.code.length : end;
}
