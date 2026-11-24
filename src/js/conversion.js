/**
 * The open document in other formats, for the Convert tab and the Export dialog: JSON (as the
 * reference SHLSDecoder reads it, indented or on one line), YAML, the records as plain text,
 * and one section as CSV or JSON Lines; and the whole document written anew as the reference
 * SHLSEncoder writes it. A template that holds placeholders (?template=) keeps its text: the
 * encoder writes data only, which leaves out the control lines.
 */

import { parseShls, formatShls, formatJson } from './shls.js?v=8';
import { formatJsonText, formatRecordsText } from './convert.js?v=9';
import { convertToYaml } from './yaml-text.js?v=4';
import { convertToCsv, convertToJsonl } from './table-text.js?v=3';
import { openConfirmation } from './dialogs.js?v=5';
import { state, areas, CANNOT_READ, NO_SECTIONS, showToast, translate, findSection } from './state.js?v=3';
import { setCode } from './history.js?v=4';
import { hasTemplateTags, TEMPLATE_FORMAT_MESSAGE } from './template-lines.js?v=1';
import { getCurrentSection, getSelectedTemplatePlace, selectTemplatePlace } from './records-views.js?v=1';

/** The indentation of the indented JSON, in spaces. */
const JSON_INDENT = 2;
/** The file extension of each format. */
export const CONVERSION_EXTENSIONS = { json: 'json', jsonmin: 'json', yaml: 'yaml', csv: 'csv', jsonl: 'jsonl', txt: 'txt', shls: 'shls' };
/** The media type of each format. */
export const MEDIA_TYPES = { json: 'application/json', jsonmin: 'application/json', yaml: 'application/yaml', csv: 'text/csv', jsonl: 'application/jsonl', txt: 'text/plain', shls: 'text/plain' };

/**
 * A conversion of the open document.
 * @typedef {object} Conversion
 * @property {string} [text] - the converted text.
 * @property {string} [note] - what the result holds, for CSV and JSON Lines.
 * @property {string} [error] - why there is no result.
 */

/**
 * Returns the open document converted to another format.
 * @param {string} kind - "json", "jsonmin", "yaml", "txt", "csv" or "jsonl".
 * @param {string} [sectionName] - CSV and JSON Lines: the section; without it, the selected one.
 * @returns {Conversion} the text (with a note), or the reason there is none.
 */
export function getConversion(kind, sectionName) {
    if (!state.model || !state.model.sections.length) return { error: NO_SECTIONS };
    if (state.model.error) return { error: CANNOT_READ };
    const data = state.model.data;
    if (kind === 'json') return { text: formatJsonText(data, JSON_INDENT) };
    if (kind === 'jsonmin') return { text: formatJsonText(data, 0) };
    if (kind === 'yaml') return { text: convertToYaml(data) };
    if (kind === 'txt') return { text: formatRecordsText(state.model, translate) };
    const section = findSection(sectionName) || getCurrentSection();
    const sectionData = section && { name: section.name, keys: section.keys, data: data.get(section.name) || [] };
    if (kind === 'csv') { const result = convertToCsv(sectionData); return result.error ? result : { ...result, note: `The records of "${section.name}": its keys are the columns, a nested list is one cell with JSON.` }; }
    if (kind === 'jsonl') { const result = convertToJsonl(sectionData); return result.error ? result : { ...result, note: `One record of "${section.name}" per line.` }; }
    return { error: 'unknown format' };
}

/**
 * Writes the whole document anew as the reference SHLSEncoder does (one undo step): all key
 * blocks first, then the records of each section. Asks first when the encoder's text reads back
 * as other data. A template keeps its text, with a message.
 * @returns {Promise<void>} settles when the document is written or left as it is.
 */
export async function formatAsEncoder() {
    if (!state.model || !state.model.sections.length) { showToast(NO_SECTIONS); return; }
    if (state.model.error) { showToast(CANNOT_READ); return; }
    if (hasTemplateTags(state.code)) { showToast(TEMPLATE_FORMAT_MESSAGE); return; }
    const encoded = formatShls(state.model.data) + '\n';
    if (encoded === state.code) { showToast('The document is written as SHLSEncoder does already'); return; }
    if (!isSameDataAfterReading(encoded) && !await openConfirmation({ title: 'Write it anyway?', text: 'Read back, the encoder\'s text gives different data than this document (SHLSEncoder cannot write every structure). "Undo" brings the document back.', ok: 'Write it' })) return;
    const place = getSelectedTemplatePlace();
    setCode(encoded);
    if (place) selectTemplatePlace(place, { scroll: false });
    showToast('Written as SHLSEncoder does');
}

/**
 * Tells whether a text reads as the same data as the open document.
 * @param {string} encoded - the SHLS text.
 * @returns {boolean} true when both give the same JSON.
 */
function isSameDataAfterReading(encoded) {
    let readBack = null;
    try { readBack = formatJson(parseShls(encoded), 0); } catch (e) { readBack = null; }
    return readBack === formatJson(state.model.data, 0);
}
