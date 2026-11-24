/**
 * The side panel's Outline tab: the sections of the document with their records, line,
 * problems and keys; a click selects the section in the view and its line in the code.
 */

import { escapeHtml } from './shls.js?v=8';
import { state, areas, ui, NARROW_SCREEN, translate } from './state.js?v=3';
import { formatCount } from './util.js?v=3';
import { showRowInCode } from './code-view.js?v=5';
import { showPane } from './layout.js?v=5';
import { selectTemplatePlace } from './records-views.js?v=1';

/**
 * Draws the outline of the sections.
 * @returns {void}
 */
export function renderOutline() {
    if (!state.model || !state.model.sections.length) { ui.outline.innerHTML = `<p class="hint">${escapeHtml(translate('The document has no sections yet.'))}</p>`; return; }
    const problemCounts = getProblemCounts(state.model.sections, state.problems);
    ui.outline.innerHTML = `<p class="hint">${escapeHtml(translate('The sections of the document. Click one to go there.'))}</p><ul class="outline">${state.model.sections.map(section => renderOutlineItem(section, problemCounts)).join('')}</ul>`;
}

/**
 * Returns the entry of one section.
 * @param {object} section - the section of the model.
 * @param {Map<string, number>} problemCounts - the number of problems per section name.
 * @returns {string} the HTML.
 */
function renderOutlineItem(section, problemCounts) {
    const problems = problemCounts.get(section.name) || 0;
    const keys = section.keys ? section.keys.map(key => key.name + (key.sub ? ` [${key.sub.map(subKey => subKey.name).join(', ')}]` : '')).join(', ') : '';
    return `<li><button type="button" data-sec="${escapeHtml(section.name)}"><b data-no-i18n>${escapeHtml(section.name)}</b><span class="muted">${escapeHtml(`${formatCount(section.records.length, 'record', 'records')} · line ${section.line + 1}`)}</span>${problems ? `<span class="gl-prob">${escapeHtml(formatCount(problems, 'problem', 'problems'))}</span>` : ''}<span class="gl-keys" data-no-i18n>${escapeHtml(keys)}</span></button></li>`;
}

/**
 * Returns the number of problems per section. A problem belongs to the nearest section line at or
 * above it; a section that occurs several times (A … B … A) collects the problems of all its parts.
 * Problems above the first section line belong to no section.
 * @param {object[]} sections - the sections of the model, each with its section lines.
 * @param {object[]} problems - the problems, each with its 0-based line.
 * @returns {Map<string, number>} the number of problems per section name.
 */
function getProblemCounts(sections, problems) {
    const starts = sections.flatMap(section => section.lines.map(line => ({ line, name: section.name }))).sort((a, b) => a.line - b.line);
    const counts = new Map();
    for (const problem of problems) {
        const name = getSectionNameAt(starts, problem.line);
        if (name !== null) counts.set(name, (counts.get(name) || 0) + 1);
    }
    return counts;
}

/**
 * Returns the name of the section a line belongs to.
 * @param {Object[]} starts - the section lines as {line, name}, sorted by line.
 * @param {number} line - the 0-based line.
 * @returns {string|null} the name of the nearest section line at or above the line, null above the first.
 */
function getSectionNameAt(starts, line) {
    let name = null;
    for (const start of starts) {
        if (start.line > line) break;
        name = start.name;
    }
    return name;
}

/**
 * Connects the outline: a click selects the section and shows its line (on narrow screens the
 * view is shown).
 * @returns {void}
 */
export function startOutlinePanel() {
    ui.outline.addEventListener('click', selectSectionFromOutline);
}

/**
 * Selects the section of the outline entry that was clicked and shows its line (a click handler).
 * @param {MouseEvent} event - the click in the outline.
 * @returns {void}
 */
function selectSectionFromOutline(event) {
    const button = event.target.closest('[data-sec]');
    if (!button) return;
    selectTemplatePlace({ kind: 'section', sec: button.dataset.sec });
    showRowInCode(areas.view.getSelectedRow());
    if (NARROW_SCREEN.matches) showPane('draw');
}
