/**
 * Opening files: with the Open button or dropped on the page. Every file becomes a new document
 * in "My documents"; JSON, YAML, CSV and JSON Lines are converted to SHLS, with a note on what
 * SHLS cannot keep.
 */

import { formatShls } from './shls.js?v=8';
import { convertToSections, getRoundTrip, convertJsonToShls } from './convert.js?v=9';
import { convertFromYaml, importYamlLibrary } from './yaml-text.js?v=4';
import { convertFromCsv, convertFromJsonl } from './table-text.js?v=3';
import { openConfirmation } from './dialogs.js?v=5';
import { getElement, showToast, translate, DEFAULT_NAME } from './state.js?v=3';
import { createDocument } from './documents.js?v=5';

/** The largest file that is opened, in bytes. */
const MAX_FILE_SIZE = 8 * 1024 * 1024;
/** The file names the editor opens. */
const OPENABLE_NAME = /\.(shls|txt|json|geojson|jsonl|ndjson|yaml|yml|csv|tsv)$/i;
/** The media types the editor opens. */
const OPENABLE_TYPE = /text|json|yaml|csv/;
/** The name of the section a list of records from a file without a name goes into. */
const DEFAULT_SECTION = 'Data';

const fileInput = getElement('#file');
let dragDepth = 0;

/**
 * A file's text as SHLS.
 * @typedef {object} ImportedCode
 * @property {string} code - the SHLS text.
 * @property {string} from - the format it was converted from, "" for SHLS or plain text.
 * @property {string[]} [notes] - what SHLS cannot keep of the data.
 */

/**
 * Lets the user choose files to open.
 * @returns {void}
 */
export function openFilePicker() {
    fileInput.click();
}

/**
 * Connects the Open button, the file field and dropping files on the page.
 * @returns {void}
 */
export function startFileImport() {
    getElement('#btn-open').addEventListener('click', openFilePicker);
    fileInput.addEventListener('change', async () => { await importFiles([...fileInput.files]); fileInput.value = ''; });
    window.addEventListener('dragenter', event => { if (event.dataTransfer.types.includes('Files')) { dragDepth++; document.body.classList.add('drop'); event.preventDefault(); } });
    window.addEventListener('dragover', event => { if (event.dataTransfer.types.includes('Files')) event.preventDefault(); });
    window.addEventListener('dragleave', () => { if (--dragDepth <= 0) { dragDepth = 0; document.body.classList.remove('drop'); } });
    window.addEventListener('drop', importDroppedFiles);
}

/**
 * Opens the files dropped on the page (a drop handler).
 * @param {DragEvent} event - the drop.
 * @returns {void}
 */
function importDroppedFiles(event) {
    dragDepth = 0;
    document.body.classList.remove('drop');
    const files = [...event.dataTransfer.files];
    if (!files.length) return;
    event.preventDefault();
    importFiles(files);
}

/**
 * Returns a file's text as SHLS: JSON, JSON Lines, YAML and CSV converted, anything else as it is.
 * @param {string} text - the file's text.
 * @param {string} fileName - the file's name.
 * @returns {Promise<ImportedCode>} the SHLS text, its source format and the notes.
 * @throws {Error} when the file cannot be read in its format.
 */
async function getImportedCode(text, fileName) {
    const extension = (/\.([a-z0-9]+)$/i.exec(fileName) || [])[1]?.toLowerCase() || '';
    const baseName = fileName.replace(/\.[^.]+$/, '').replace(/[\r\n]/g, ' ').trim() || DEFAULT_SECTION;
    if (/^(json|geojson)$/.test(extension)) return { ...convertJsonToShls(text, baseName), from: 'JSON' };
    if (extension === 'jsonl' || extension === 'ndjson') return getEncodedCode(convertFromJsonl(text), baseName, 'JSON Lines');
    if (extension === 'yaml' || extension === 'yml') { await importYamlLibrary(); return getEncodedCode(convertFromYaml(text), baseName, 'YAML'); }
    if (extension === 'csv' || extension === 'tsv') return getEncodedCode(convertFromCsv(text), baseName, 'CSV');
    return { code: text.replace(/\r\n?/g, '\n'), from: '' };
}

/**
 * Returns data as SHLS written by the encoder, with what SHLS cannot keep of it.
 * @param {*} data - the data read from the file.
 * @param {string} baseName - the name of the section a list of records goes into.
 * @param {string} from - the format it was read from.
 * @returns {ImportedCode} the SHLS text, its source format and the notes.
 */
function getEncodedCode(data, baseName, from) {
    const sections = convertToSections(data, baseName);
    const roundTrip = getRoundTrip(sections);
    return { code: formatShls(sections) + '\n', from, notes: roundTrip.notes };
}

/**
 * Opens every file as a new document, in order.
 * @param {File[]} files - the files.
 * @returns {Promise<void>} settles when every file is opened or refused.
 */
async function importFiles(files) {
    for (const file of files) await importFile(file);
}

/**
 * Opens one file as a new document, after checking its kind and size; tells what was converted
 * and what SHLS cannot keep.
 * @param {File} file - the file.
 * @returns {Promise<void>} settles when the file is opened or refused.
 */
async function importFile(file) {
    if (!OPENABLE_NAME.test(file.name) && !OPENABLE_TYPE.test(file.type)) { showToast(`"${file.name}" is not a file the editor can open`); return; }
    if (file.size > MAX_FILE_SIZE) { showToast('The file is larger than 8 MB'); return; }
    try {
        const imported = await getImportedCode(await file.text(), file.name);
        if (!createDocument(file.name.replace(/\.[^.]+$/, '') || DEFAULT_NAME, imported.code)) return;
        if (imported.notes && imported.notes.length) openConfirmation({ title: `"${file.name}" converted from ${imported.from}`, text: `SHLS cannot keep all of this data: ${imported.notes.map(note => translate(note)).join(' ')}`, ok: 'OK', cancel: 'Close' });
        else showToast(imported.from ? `Opened "${file.name}" - converted from ${imported.from}` : `Opened "${file.name}" - it is now in "My documents"`);
    } catch (e) { showToast(`"${file.name}" could not be opened: ${e.message}`); }
}
