/**
 * The HTML of the records view: a row with its fold arrow, its label or value (the search
 * marked) and its summary, and the path of the selection as buttons.
 */

import { escapeHtml } from './shls.js?v=7';

/** The fold arrow of a row that has rows below it. */
const ARROW = '<span class="trow-toggle" aria-hidden="true"></span>';
/** The empty place of the arrow in a row without rows below it. */
const NO_ARROW = '<span class="trow-toggle empty" aria-hidden="true"></span>';

/**
 * How the rows are shown: the selection, the folded rows and the search.
 * @typedef {object} RowLook
 * @property {string} selectedId - the id of the selected row.
 * @property {Set<string>} closed - the ids of the folded rows.
 * @property {string[]} hitIds - the ids of the rows that match the search.
 * @property {number} hitIndex - the index of the current match.
 * @property {string} query - the search text, "" without a search.
 * @property {function(string): string} translate - translates the view's texts.
 */

/**
 * Returns the HTML of a row.
 * @param {import('./view-rows.js').ViewRow} row - the row.
 * @param {RowLook} look - how the rows are shown.
 * @returns {string} the HTML.
 */
export function renderRow(row, look) {
    const open = row.kids ? !look.closed.has(row.id) : null;
    const hit = look.hitIds.includes(row.id) ? ' hit' + (look.hitIds[look.hitIndex] === row.id ? ' now' : '') : '';
    const className = `trow trow-${row.kind}${row.id === look.selectedId ? ' active' : ''}${hit}`;
    const aria = `role="treeitem" aria-level="${row.depth + 1}"${open === null ? '' : ` aria-expanded="${open}"`} aria-selected="${row.id === look.selectedId}"`;
    return `<div class="${className}" data-id="${escapeHtml(row.id)}" style="--t:${row.depth}" ${aria}>${row.kids ? ARROW : NO_ARROW}${renderRowBody(row, open, look)}</div>`;
}

/**
 * Returns the HTML of a row after its fold arrow.
 * @param {import('./view-rows.js').ViewRow} row - the row.
 * @param {boolean|null} open - whether it is unfolded, null when it has nothing to fold.
 * @param {RowLook} look - how the rows are shown.
 * @returns {string} the HTML.
 */
function renderRowBody(row, open, look) {
    const translate = look.translate;
    /**
     * Returns a text of the row with the search marked.
     * @param {string} text - the text.
     * @returns {string} the HTML.
     */
    const highlight = text => highlightQuery(text, look.query);
    if (row.kind === 'section') return `<span class="trow-sec trow-k" data-edit="section" title="${escapeHtml(translate('Click to rename the section'))}">${highlight(row.label)}</span><span class="trow-sum">${escapeHtml(translate(row.info))}</span>`;
    if (row.kind === 'keys') return `<span class="trow-group">${escapeHtml(translate(row.label))}</span><span class="trow-sum">${escapeHtml(translate(row.info))}</span>`;
    if (row.kind === 'key') return `<span class="trow-k trow-key" data-edit="key" title="${escapeHtml(translate('Click to rename the key - only the key block changes'))}">${highlight(row.label)}</span>${row.info ? `<span class="trow-sum">${escapeHtml(translate(row.info))}</span>` : ''}`;
    if (row.kind === 'record') return `<span class="trow-rec">${escapeHtml(row.label)}</span>${open ? '' : `<span class="trow-preview">${highlight(row.preview)}</span>`}`;
    if (row.list) return `<span class="trow-k trow-field-key">${highlight(row.label)}</span><span class="trow-sum">${escapeHtml(translate(row.info))}</span>`;
    return `<span class="trow-k trow-field-key">${highlight(row.label)}</span><span class="trow-p">:</span><span class="trow-v t-string" data-edit="value" title="${escapeHtml(translate('Click to change the value'))}">${highlight(row.value)}</span>`;
}

/**
 * Returns a text as HTML with the first match of the search marked.
 * @param {string} text - the text.
 * @param {string} query - the search text, "" without a search.
 * @returns {string} the HTML.
 */
function highlightQuery(text, query) {
    if (!query || !text) return escapeHtml(text);
    const lowerQuery = query.toLowerCase();
    const index = text.toLowerCase().indexOf(lowerQuery);
    if (index < 0) return escapeHtml(text);
    return escapeHtml(text.slice(0, index)) + '<mark>' + escapeHtml(text.slice(index, index + lowerQuery.length)) + '</mark>' + escapeHtml(text.slice(index + lowerQuery.length));
}

/**
 * Returns the HTML of the path of the selection: a button per step, the last one marked, or a
 * note when nothing is selected.
 * @param {import('./view-path.js').PathPart[]} parts - the steps of the path.
 * @param {function(string): string} translate - translates the note.
 * @returns {string} the HTML.
 */
export function renderPath(parts, translate) {
    if (!parts.length) return `<span class="muted">${escapeHtml(translate('Nothing selected'))}</span>`;
    return parts.map((part, i) => `<button type="button" class="path-part${i === parts.length - 1 ? ' now' : ''}" data-depth="${i}">${escapeHtml(part.text)}</button>`).join('');
}
