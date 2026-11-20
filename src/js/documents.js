/**
 * The documents of "My documents" in the editor: opening one (each keeps its own undo history
 * while the page is open), making a new one from the New menu or a template, starting one over,
 * and the "My documents" dialog with its renaming and deleting.
 */

import { START, TEMPLATES, BLANK } from './samples.js?v=3';
import { openConfirmation } from './dialogs.js?v=5';
import { store } from './files.js?v=8';
import { createFilesDialog } from './files-dialog.js?v=2';
import { state, areas, ui, DEFAULT_NAME, STORAGE_FULL, historyByDocument, getElement, getElements, showToast } from './state.js?v=2';
import { setCode, addHistoryStep, updateHistoryButtons, undo, redo } from './history.js?v=3';
import { saveToStorage } from './storage.js?v=3';
import { renderNode } from './node-panel.js?v=3';
import { renderConvert } from './convert-panel.js?v=3';
import { openFilePicker } from './file-import.js?v=3';

const newButton = getElement('#btn-new'), newMenu = getElement('#new-menu');

/**
 * Shows the open document's name in the bar, in the tooltip of "My documents" and in the New menu.
 * @returns {void}
 */
export function showFileName() {
    getElement('#file-name').textContent = state.name;
    getElement('#btn-files').title = `"${state.name}" is open. My documents: open, rename, duplicate or delete your documents (Ctrl+O)`;
    getElement('#new-restart b').textContent = `Start "${state.name}" over`;
}

/**
 * Opens a document from "My documents". The document that is closed keeps the edits still
 * waiting for the autosave and its undo history.
 * @param {string} id - the document's id.
 * @param {string} [code] - its code, when the caller has it (else it is read from storage).
 * @returns {void}
 */
export function openDocument(id, code) {
    clearTimeout(state.histTimer);
    if (state.saveTimer) { clearTimeout(state.saveTimer); saveToStorage(); }
    if (state.fileId) { addHistoryStep(); historyByDocument.set(state.fileId, { history: state.history, future: state.future, view: areas.view.getSelectedPlace() }); }
    code ??= store.code(id) ?? BLANK;
    state.fileId = id;
    state.name = store.getEntry(id)?.name || DEFAULT_NAME;
    state.savedCode = code;
    const kept = historyByDocument.get(id);
    state.history = kept ? kept.history : [];
    state.future = kept ? kept.future : [];
    showOpenedCode(code, kept);
}

/**
 * Shows the code of a document that is opened, with the place selected when it was left.
 * @param {string} code - the code.
 * @param {object} [kept] - the kept history of the document (with its place in the view), if any.
 * @returns {void}
 */
function showOpenedCode(code, kept) {
    ui.ta.value = code;
    ui.ta.scrollTop = 0;
    ui.ta.setSelectionRange(0, 0);
    areas.view.select(null);
    setCode(code, { history: false });
    if (kept && kept.view) areas.view.select(kept.view, { scroll: false });
    addHistoryStep();
    updateHistoryButtons();
    showFileName();
    areas.files.render();
    renderNode();
    if (!ui.convert.hidden) renderConvert();
    areas.sync?.updateUi();
}

/**
 * Creates a document in "My documents" and opens it. A command that returns the new id, as the
 * callers need it.
 * @param {string} name - the wanted name.
 * @param {string} code - the code.
 * @param {boolean} [inMemory] - true to keep it in memory only (a page's document), never stored.
 * @returns {string|null} the new id, null when the browser storage is full.
 */
export function createDocument(name, code, inMemory = false) {
    let id;
    try { id = store.create(name, code, inMemory); } catch (e) {
        showToast('The browser storage is full - delete or download documents under "My documents" first');
        return null;
    }
    openDocument(id, code);
    return id;
}

/**
 * Empties the open document after asking (one undo step).
 * @returns {Promise<void>} settles when the document is emptied or left as it is.
 */
async function resetDocument() {
    if (state.code === BLANK) { showToast('This document is empty already'); return; }
    const forId = state.fileId;
    if (!await openConfirmation({ title: `Start "${state.name}" over?`, text: 'All data is removed. "Undo" brings it back as long as the page is open.', ok: 'Start over' })) return;
    if (state.fileId !== forId) return;                   // another document was opened while the question was open
    setCode(BLANK);
    showToast(`"${state.name}" is empty now - "Undo" brings it back`);
}

/**
 * Runs a choice of the New menu: a blank document, a template, the welcome example, or
 * starting the open document over.
 * @param {string} kind - "blank", "restart", "welcome" or a key of TEMPLATES.
 * @returns {void}
 */
function openNewDocument(kind) {
    if (kind === 'restart') { resetDocument(); return; }
    const template = kind === 'welcome' ? START : TEMPLATES[kind];
    if (createDocument(template ? template.name : DEFAULT_NAME, template ? template.code : BLANK)) showToast(`New document "${state.name}" - your other documents are under "My documents"`);
}

/**
 * Creates the "My documents" dialog with the editor's answers (an initializeX: it returns the dialog).
 * @returns {{open: function(): void, render: function(): void}} the dialog.
 */
export function createDocumentsDialog() {
    return createFilesDialog({
        getCurrent: () => ({ id: state.fileId, name: state.name, code: state.code }),
        openDocument: id => { openDocument(id); showToast(`"${state.name}" opened`); },
        openNewDocument,
        renameDocument,
        onDocumentRemoved: closeRemovedDocument,
        importFile: openFilePicker,
        showToast,
    });
}

/**
 * Renames a document; the open one shows its new name and tells sync.js.
 * @param {string} id - the document's id.
 * @param {string} name - the new (free) name.
 * @returns {void}
 */
function renameDocument(id, name) {
    try { store.save(id, { name }); } catch (e) { showToast(STORAGE_FULL); return; }
    if (id === state.fileId) { state.name = name; showFileName(); areas.sync?.handleChange(); }
}

/**
 * Follows a deleted document: its history is dropped; when it was open, the most recent
 * document opens (or a new blank one).
 * @param {string} id - the deleted document's id.
 * @returns {void}
 */
function closeRemovedDocument(id) {
    historyByDocument.delete(id);
    if (id !== state.fileId) return;
    state.fileId = '';
    const next = store.getSortedEntries()[0];
    if (next) openDocument(next.id);
    else createDocument(DEFAULT_NAME, BLANK);
}

/**
 * Opens or closes the New menu; an opened menu puts its first item in focus.
 * @param {boolean} [open] - true to open, false to close; without it the menu switches.
 * @returns {void}
 */
export function setNewMenuOpen(open = newMenu.hidden) {
    newMenu.hidden = !open;
    newButton.setAttribute('aria-expanded', open);
    if (open) newMenu.querySelector('button').focus();
}

/**
 * Tells whether the New menu is open.
 * @returns {boolean} true when it is open.
 */
export function isNewMenuOpen() {
    return !newMenu.hidden;
}

/**
 * Opens the template of the New menu entry that was clicked and closes the menu (a click handler).
 * @param {MouseEvent} event - the click in the menu.
 * @returns {void}
 */
function openNewDocumentFromMenu(event) {
    const item = event.target.closest('[data-new]');
    if (!item) return;
    setNewMenuOpen(false);
    openNewDocument(item.dataset.new);
}

/**
 * Connects the New menu (click, arrow keys, Escape, a click outside closes it), "My documents",
 * Undo and Redo.
 * @returns {void}
 */
export function startDocumentButtons() {
    newButton.addEventListener('click', () => setNewMenuOpen());
    newMenu.addEventListener('click', openNewDocumentFromMenu);
    newMenu.addEventListener('keydown', moveInNewMenu);
    document.addEventListener('pointerdown', event => { if (!newMenu.hidden && !event.target.closest('#new-menu, #btn-new')) setNewMenuOpen(false); });
    getElement('#btn-files').addEventListener('click', () => areas.files.open());
    getElement('#btn-undo').addEventListener('click', undo);
    getElement('#btn-redo').addEventListener('click', redo);
}

/**
 * Moves the focus in the New menu with the arrow keys; Escape closes it (a keydown handler).
 * @param {KeyboardEvent} event - the key.
 * @returns {void}
 */
function moveInNewMenu(event) {
    const items = getElements('button', newMenu), index = items.indexOf(document.activeElement);
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); items[(index + (event.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length].focus(); }
    if (event.key === 'Escape') { event.stopPropagation(); setNewMenuOpen(false); newButton.focus(); }
}
