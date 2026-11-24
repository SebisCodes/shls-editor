/**
 * The side panel's Convert tab: the tokens of SHLS against the same data as JSON, "Write as
 * SHLSEncoder does", and the document converted to another format, to copy, download or open
 * in the JSON Editor (a new tab).
 */

import { escapeHtml } from './shls.js?v=8';
import { formatJsonText, getTokenCount } from './convert.js?v=9';
import { saveFile, getSafeName } from './util.js?v=3';
import { state, ui, JSON_SITE, COPIED, getElement, showToast, translate } from './state.js?v=3';
import { getConversion, formatAsEncoder, CONVERSION_EXTENSIONS, MEDIA_TYPES } from './conversion.js?v=5';
import { getCurrentSection } from './records-views.js?v=1';

/** The indentation of the indented JSON the tokens are counted for, in spaces. */
const JSON_INDENT = 2;
/** The shortest bar of the token counter, in percent. */
const MIN_BAR_WIDTH = 2;
/** A whole in percent. */
const PERCENT = 100;
/** The bytes encoded per step of the base64 conversion. */
const BASE64_CHUNK = 0x8000;
/** The note under the JSON result. */
const JSON_NOTE = 'Exactly the data the reference SHLSDecoder reads: every value is a string.';

/**
 * Draws the Convert tab with the sections to choose from (the selected one chosen).
 * @returns {void}
 */
export function renderConvert() {
    const sections = state.model ? state.model.sections : [];
    const current = getCurrentSection();
    ui.convert.innerHTML = `
        <h3>Tokens</h3>
        <div id="cv-tokens" class="tokens"></div>
        <h3>This document</h3>
        <div class="button-row">
            <button type="button" class="button" data-cv="format" title="Writes the document anew as the reference SHLSEncoder does: all key blocks first, then the records of each section">Write as SHLSEncoder does</button>
        </div>
        <h3>Convert to</h3>
        <div class="row2">
            <label class="field"><span>Format</span><select id="cv-to"><option value="json">JSON (as SHLSDecoder reads it)</option><option value="jsonmin">JSON on one line</option><option value="yaml">YAML</option><option value="csv">CSV (one section)</option><option value="jsonl">JSON Lines (one section)</option><option value="txt">The records as plain text</option></select></label>
            <label class="field" id="cv-sec-field"><span>Section</span><select id="cv-sec">${sections.map(section => `<option value="${escapeHtml(section.name)}"${section === current ? ' selected' : ''} data-no-i18n>${escapeHtml(section.name)}</option>`).join('')}</select></label>
        </div>
        <p class="hint" id="cv-note"></p>
        <textarea id="cv-out" readonly spellcheck="false" aria-label="Result"></textarea>
        <div class="button-row">
            <button type="button" class="button" id="cv-copy">Copy</button>
            <button type="button" class="button" id="cv-dl">Download</button>
            <button type="button" class="button" id="cv-other" title="Opens the result as a new document in the JSON Editor (in a new tab)">Open in the JSON Editor</button>
        </div>`;
    renderConvertResult();
}

/**
 * Draws the token counter: SHLS against JSON indented and on one line, with the share saved.
 * @returns {void}
 */
function renderTokens() {
    const box = getElement('#cv-tokens');
    if (!box) return;
    if (!state.model || !state.model.data || !state.model.sections.length) { box.innerHTML = `<span class="muted">${escapeHtml(translate('The document has no sections yet'))}</span>`; return; }
    const shlsTokens = getTokenCount(state.code), jsonTokens = getTokenCount(formatJsonText(state.model.data, JSON_INDENT)), oneLineTokens = getTokenCount(formatJsonText(state.model.data, 0));
    const saved = jsonTokens ? Math.round((1 - shlsTokens / jsonTokens) * PERCENT) : 0;
    const max = Math.max(shlsTokens, jsonTokens, oneLineTokens);
    box.innerHTML = renderTokenBar('SHLS', shlsTokens, max, 'tk-shls') + renderTokenBar('JSON', jsonTokens, max, 'tk-json') + renderTokenBar(translate('JSON on one line'), oneLineTokens, max, 'tk-json') +
        `<p class="hint">${escapeHtml(saved > 0 ? `SHLS needs about ${saved} % fewer tokens than the same data as JSON - approximate tokens of common AI models.` : 'The same data as JSON needs about as many tokens - approximate tokens of common AI models.')}</p>`;
}

/**
 * Returns one bar of the token counter.
 * @param {string} label - the label.
 * @param {number} count - the tokens.
 * @param {number} max - the most tokens of all bars (the full width).
 * @param {string} className - the bar's class.
 * @returns {string} the HTML.
 */
function renderTokenBar(label, count, max, className) {
    return `<div class="tk-row"><span>${label}</span><span class="tk-bar"><span class="${className}" style="width:${max ? Math.max(MIN_BAR_WIDTH, Math.round(count / max * PERCENT)) : 0}%"></span></span><b>≈ ${count.toLocaleString('en')}</b></div>`;
}

/**
 * Draws the token counter and the result of the chosen conversion with its note; the section
 * field shows for CSV and JSON Lines, "Open in the JSON Editor" for JSON.
 * @returns {void}
 */
export function renderConvertResult() {
    renderTokens();
    const output = getElement('#cv-out');
    if (!output) return;
    const kind = getElement('#cv-to').value;
    getElement('#cv-sec-field').hidden = kind !== 'csv' && kind !== 'jsonl';
    const result = getConversion(kind, getElement('#cv-sec').value);
    output.value = result.text ?? '';
    getElement('#cv-note').textContent = translate(result.error || result.note || (kind === 'json' || kind === 'jsonmin' ? JSON_NOTE : ''));
    getElement('#cv-other').hidden = kind !== 'json' && kind !== 'jsonmin';
}

/**
 * Connects the Convert tab: a new format or section draws the result again; the buttons
 * write, copy, download or open it.
 * @returns {void}
 */
export function startConvertPanel() {
    ui.convert.addEventListener('change', event => { if (event.target.id === 'cv-to' || event.target.id === 'cv-sec') renderConvertResult(); });
    ui.convert.addEventListener('click', runConvertButton);
}

/**
 * Runs a button of the Convert tab (a click handler).
 * @param {MouseEvent} event - the click.
 * @returns {Promise<void>} settles when the button's work is done.
 */
async function runConvertButton(event) {
    const button = event.target.closest('button');
    if (!button) return;
    if (button.dataset.cv === 'format') { formatAsEncoder(); return; }
    const kind = getElement('#cv-to').value;
    const result = getConversion(kind, getElement('#cv-sec').value);
    if (result.error) { showToast(translate(result.error)); return; }
    if (button.id === 'cv-copy') await copyResult(result.text);
    if (button.id === 'cv-dl') { saveFile(result.text, `${getSafeName(state.name)}.${CONVERSION_EXTENSIONS[kind]}`, MEDIA_TYPES[kind]); showToast('Downloaded'); }
    if (button.id === 'cv-other') openInJsonEditor(result.text);
}

/**
 * Copies the result: the clipboard, else the copy command on the result field.
 * @param {string} text - the result.
 * @returns {Promise<void>} settles when it is copied.
 */
async function copyResult(text) {
    try { await navigator.clipboard.writeText(text); } catch (err) { getElement('#cv-out').select(); document.execCommand('copy'); }
    showToast(COPIED);
}

/**
 * Opens a JSON text as a new document in the JSON Editor, in a new tab (the text after the #,
 * which never reaches a server).
 * @param {string} text - the JSON text.
 * @returns {void}
 */
function openInJsonEditor(text) {
    window.open(`${JSON_SITE}#b64=${convertToBase64Url(text)}&file=new&name=${encodeURIComponent(state.name)}`, '_blank', 'noopener');
}

/**
 * Returns the base64url of a text's UTF-8 bytes, without padding.
 * @param {string} text - the text.
 * @returns {string} the encoded text.
 */
function convertToBase64Url(text) {
    const bytes = new TextEncoder().encode(text);
    let binary = '';
    for (let i = 0; i < bytes.length; i += BASE64_CHUNK) binary += String.fromCharCode.apply(null, bytes.subarray(i, i + BASE64_CHUNK));
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
