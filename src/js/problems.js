/**
 * The problems above the code: the number of errors and notes, a button that shows or hides
 * the list, and one entry per problem (the first 80); a click on an entry selects its line in
 * the code and its place in the records view.
 */

import { escapeHtml } from './shls.js?v=8';
import { state, areas, ui, NARROW_SCREEN } from './state.js?v=3';
import { formatCount } from './util.js?v=3';
import { showCodePosition } from './code-view.js?v=5';
import { getLineStart, getLineEnd } from './text-position.js?v=3';
import { renderNode } from './node-panel.js?v=5';
import { showPane } from './layout.js?v=5';
import { getViewLine } from './records-views.js?v=1';

/** The most problems the list shows. */
const MAX_LISTED_PROBLEMS = 80;

/**
 * Draws the problems above the code, or hides the box when there are none.
 * @returns {void}
 */
export function renderProblems() {
    const problems = state.problems;
    const box = ui.error;
    if (!problems.length) { box.hidden = true; return; }
    const errors = problems.filter(problem => problem.kind === 'error').length, notes = problems.length - errors;
    const counts = [];
    if (errors) counts.push(`<b>${formatCount(errors, 'error', 'errors')}</b>`);
    if (notes) counts.push(formatCount(notes, 'note', 'notes'));
    const items = problems.slice(0, MAX_LISTED_PROBLEMS).map(renderProblemItem).join('');
    box.innerHTML = `<div class="pr-header"><span>${counts.join(' · ')}</span><button type="button" class="button small" data-toggle-probs>${state.showProblems ? 'Hide' : 'Show'}</button></div>${state.showProblems ? `<ul>${items}</ul>` : ''}`;
    box.classList.toggle('only-warnings', !errors);
    box.hidden = false;
}

/**
 * Returns the list entry of a problem.
 * @param {object} problem - the problem: line (0-based), kind ("error" or a note) and msg.
 * @param {number} index - its index in state.problems.
 * @returns {string} the HTML of the entry.
 */
function renderProblemItem(problem, index) {
    const isError = problem.kind === 'error';
    return `<li class="${isError ? 'err' : 'warn'}"><div class="pr-row" role="button" tabindex="0" data-prob="${index}"><span class="kind">${isError ? '✕' : '!'}</span><span class="line-number">Line ${problem.line + 1}</span><span>${escapeHtml(problem.msg)}</span></div></li>`;
}

/**
 * Connects the problem list: Enter and Space press an entry, a click shows its place or
 * switches the list.
 * @returns {void}
 */
export function startProblems() {
    ui.error.addEventListener('keydown', event => {
        if ((event.key === 'Enter' || event.key === ' ') && event.target.matches('[data-prob]')) { event.preventDefault(); event.target.click(); }
    });
    ui.error.addEventListener('click', showClickedProblem);
}

/**
 * Shows or hides the list, or selects the line of a clicked problem in the code and its place
 * in the records view (a click handler).
 * @param {MouseEvent} event - the click.
 * @returns {void}
 */
function showClickedProblem(event) {
    if (event.target.closest('[data-prob]') && String(getSelection())) return;   // the user selects the text to copy it
    if (event.target.closest('[data-toggle-probs]')) { state.showProblems = !state.showProblems; renderProblems(); return; }
    const entry = event.target.closest('[data-prob]');
    if (!entry) return;
    const problem = state.problems[+entry.dataset.prob];
    if (NARROW_SCREEN.matches) showPane('code');
    showCodePosition(getLineStart(problem.line), true, getLineEnd(problem.line));
    areas.view.selectLineRow(getViewLine(problem.line));
    renderNode();
}
