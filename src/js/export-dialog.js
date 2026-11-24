/**
 * Export and saving: the Export dialog (SHLS, JSON, YAML, CSV or the records as text, with a
 * preview; one format or all as a ZIP), the buttons Copy, Download and Format in the bar, and
 * Ctrl+S (to the server or the page around the editor when set up, otherwise a download).
 */

import { openDialog } from './dialogs.js?v=5';
import { createZip } from './zip.js?v=4';
import { saveFile, getSafeName } from './util.js?v=3';
import { state, areas, ui, EDITOR, COPIED, getElement, showToast, translate } from './state.js?v=3';
import { updateModel } from './model.js?v=4';
import { getConversion, formatAsEncoder, CONVERSION_EXTENSIONS, MEDIA_TYPES } from './conversion.js?v=4';

/** The formats of the ZIP with all formats, in order. */
const ZIP_FORMATS = ['shls', 'json', 'yaml', 'csv', 'txt'];

const dialog = getElement('#export');
const nameField = getElement('#ex-name'), formatField = getElement('#ex-format'), previewField = getElement('#ex-text'), infoLine = getElement('#ex-info');

/**
 * Returns the open document in an export format.
 * @param {string} format - "shls" or a format of getConversion().
 * @returns {import('./conversion.js').Conversion} the text, or the reason there is none.
 */
function getExportText(format) {
    if (format === 'shls') return { text: state.code };
    return getConversion(format);
}

/**
 * Opens the Export dialog with the document read anew and its name.
 * @returns {void}
 */
export function showExportDialog() {
    updateModel();
    nameField.value = state.name;
    updateExportPreview();
    openDialog(dialog);
}

/**
 * Returns the file name of the export without extension.
 * @returns {string} the name typed in the dialog, or the document's name.
 */
function getExportName() {
    return getSafeName(nameField.value || state.name);
}

/**
 * Shows the chosen format in the preview with its size or note; Download and Copy are off when
 * the format cannot be made.
 * @returns {void}
 */
function updateExportPreview() {
    if (formatField.value === 'convert') return;
    const result = getExportText(formatField.value);
    previewField.value = result.text ?? '';
    infoLine.textContent = translate(result.error ? result.error : result.note ? result.note : `${new Blob([result.text]).size.toLocaleString('en')} bytes`);
    getElement('#ex-download').disabled = !!result.error;
    getElement('#ex-copy').disabled = !!result.error;
}

/**
 * Connects the Export dialog and the buttons Export, Copy, Download and Format in the bar.
 * @returns {void}
 */
export function startExportDialog() {
    formatField.addEventListener('change', updateExportPreview);
    nameField.addEventListener('input', updateExportPreview);
    getElement('#ex-download').addEventListener('click', saveExport);
    getElement('#ex-zip').addEventListener('click', saveAllFormatsAsZip);
    getElement('#ex-copy').addEventListener('click', async () => {
        try { await navigator.clipboard.writeText(previewField.value); } catch (err) { previewField.select(); document.execCommand('copy'); }
        showToast(COPIED);
    });
    getElement('#btn-export').addEventListener('click', showExportDialog);
    getElement('#btn-copy').addEventListener('click', async () => {
        try { await navigator.clipboard.writeText(state.code); } catch (e) { ui.ta.select(); document.execCommand('copy'); }
        showToast('Code copied');
    });
    getElement('#btn-download').addEventListener('click', saveDocumentFile);
    getElement('#btn-format').addEventListener('click', formatAsEncoder);
}

/**
 * Downloads the chosen format; an edit still open in the view is written first.
 * @returns {void}
 */
function saveExport() {
    if (areas.view.isEditing()) areas.view.stopEdit();
    const format = formatField.value;
    const result = getExportText(format);
    if (result.error) { showToast(translate(result.error)); return; }
    saveFile(result.text, `${getExportName()}.${CONVERSION_EXTENSIONS[format]}`, MEDIA_TYPES[format]);
    showToast('Downloaded');
}

/**
 * Downloads every format that can be made as one ZIP.
 * @returns {Promise<void>} settles when the ZIP is saved.
 */
async function saveAllFormatsAsZip() {
    const name = getExportName();
    const files = [];
    for (const format of ZIP_FORMATS) {
        const result = getExportText(format);
        if (!result.error) files.push({ name: `${name}.${CONVERSION_EXTENSIONS[format]}`, data: result.text });
    }
    saveFile(await createZip(files), `${name}-all.zip`);
    showToast(`ZIP downloaded with ${files.length} files`);
}

/**
 * Downloads the document as a .shls file; an edit still open in the view is written first.
 * @returns {void}
 */
function saveDocumentFile() {
    if (areas.view.isEditing()) areas.view.stopEdit();
    saveFile(state.code, `${getSafeName(state.name)}.${EDITOR.ext}`, EDITOR.mime);
    showToast(`.${EDITOR.ext} downloaded`);
}

/**
 * Ctrl+S: saves to the server or the page around the editor when set up, otherwise downloads
 * the document.
 * @returns {void}
 */
export function saveDocument() {
    if (areas.view.isEditing()) areas.view.stopEdit();
    if (areas.sync && areas.sync.isActive()) { areas.sync.save(); return; }
    saveDocumentFile();
}
