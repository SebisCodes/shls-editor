/**
 * SHLS editor: the code on the left, each section's key block and records in the middle, the
 * selected record or value, insert, convert and the outline of the sections in the side panel.
 * This file starts the editor and wires its areas together; each area has its own module
 * (state.js describes the shared state).
 *
 * The code is the single source of truth: the records view is made from it (shls.js reads it
 * exactly as the reference SHLSDecoder does), and every change in the view is an edit of whole
 * lines of the code (edits.js) that keeps the rest of it as it is - one undo step each. A click
 * in the view puts the code's cursor on that line; the cursor in the code marks its record, key
 * or value in the view.
 *
 * Start-up steps:
 *   1. the interface language (the AI prompt stays English) and the line wrap of the code;
 *   2. connect the areas: storage, code view, problems, records view, side panel, documents,
 *      opening files, keyboard, layout, Export and the dialogs;
 *   3. take the stored settings and open the last document (or the welcome example);
 *   4. read and draw the document, and again once the language pack is there;
 *   5. start the AI Assistant, the WebMCP tools, the AI status, "Open in another editor" and
 *      sync.js (webhook, embedding, ?src=);
 *   6. offer the test hook window.shlsEditor.
 */

import { parseModel, parseShls, formatShls, parseJson, convertFromJs, formatJson, getRecordLines } from './shls.js?v=7';
import * as edits from './edits.js?v=8';
import { importYamlLibrary } from './yaml-text.js?v=3';
import { START } from './samples.js?v=3';
import { createAi } from './ai.js?v=8';
import { createMcp } from './mcp.js?v=5';
import { createAiStatus } from './aistatus.js?v=8';
import { createI18n } from './i18n.js?v=20';
import { createWrap } from './wrap.js?v=5';
import { store } from './files.js?v=8';
import { createSync } from './sync.js?v=23';
import './export-menu.js?v=6';
import { startConvert } from './convert-to.js?v=14';
import { state, areas, ui, EDITOR, STORAGE_FULL, showToast, translate } from './state.js?v=2';
import { getSettings, startStorageSync } from './storage.js?v=3';
import { setCode, addHistoryStep, undo, redo } from './history.js?v=3';
import { updateModel } from './model.js?v=3';
import { renderCode, syncScroll, showCodePosition, startCodeView } from './code-view.js?v=3';
import { startCodeInput } from './code-input.js?v=3';
import { startProblems } from './problems.js?v=3';
import { createRecordsView, startViewBar } from './view-bar.js?v=3';
import { editCodeFromTree } from './view-actions.js?v=3';
import { renderNode, startNodePanel } from './node-panel.js?v=3';
import { renderInsert, startInsertPanel } from './insert-panel.js?v=3';
import { startConvertPanel } from './convert-panel.js?v=3';
import { startOutlinePanel } from './outline-panel.js?v=3';
import { showFileName, openDocument, createDocumentsDialog, startDocumentButtons } from './documents.js?v=3';
import { startFileImport } from './file-import.js?v=3';
import { startKeyboard } from './keyboard.js?v=3';
import { showSplit, startLayout, startPanelTabs, startDialogs } from './layout.js?v=3';
import { startExportDialog } from './export-dialog.js?v=3';
import { receiveDocument, importExternalDocument } from './incoming.js?v=3';
import {
    getPromptState, getProblemList, getAgentRecords, setAgentValue, addAgentRecord, getFileList, openFileByName, createFile, updateText, showAgentLine,
} from './agent-api.js?v=3';

/** The YAML package loads this long after the start, for opening YAML files. */
const YAML_LIBRARY_DELAY = 1500;

startEditor();

/**
 * Starts the editor (the flow of the steps in the header).
 * @returns {void}
 */
function startEditor() {
    startLanguageAndWrap();
    connectAreas();
    openStartDocument();
    showStartDocument();
    startAiAndSync();
    window.shlsEditor = createTestHook();
}

/**
 * Starts the interface language (translated at run time, see i18n.js) and the line wrap of
 * the code view (wrap.js).
 * @returns {void}
 */
function startLanguageAndWrap() {
    areas.i18n = createI18n({
        prefix: 'shlseditor',
        roots: '.header, .views, #work, #ai-receive, #toast, .storage-hint, dialog',
        skip: '',
    });
    areas.lineWrap = createWrap({ prefix: EDITOR.prefix, ta: ui.ta, layers: [ui.hl, ui.marks], gutter: ui.gutter, button: document.getElementById('btn-wrap'), onChange: () => { renderCode(); syncScroll(); } });
}

/**
 * Connects the areas of the page, in the order their listeners take events.
 * @returns {void}
 */
function connectAreas() {
    startStorageSync();
    startCodeView();
    startProblems();
    areas.view = createRecordsView();
    startViewBar();
    startNodePanel();
    startInsertPanel();
    startCodeInput();
    startConvertPanel();
    startOutlinePanel();
    startPanelTabs();
    areas.files = createDocumentsDialog();
    startDocumentButtons();
    startFileImport();
    startKeyboard();
    startLayout();
    startExportDialog();
    startDialogs();
}

/**
 * Takes the stored settings and opens the last document, or the welcome example when
 * "My documents" is empty; with the storage blocked, the example without saving.
 * @returns {void}
 */
function openStartDocument() {
    const settings = getSettings();
    if (settings && settings.split) state.split = settings.split;
    showSplit();
    let code = null;
    try {
        if (!store.list().length) store.create(START.name, START.code);
        const entry = store.getEntry(settings?.file) || store.getSortedEntries()[0];
        code = store.code(entry.id);
        if (code != null) { state.fileId = entry.id; state.name = entry.name; state.savedCode = code; }
    } catch (e) { /* Storage blocked: one document without saving */ }
    if (code == null) { code = START.code; state.name = START.name; }
    state.code = code;
    ui.ta.value = code;
    showFileName();
    renderInsert();
}

/**
 * Reads and draws the start document with its first section selected, loads the YAML package
 * after a pause and draws the texts again once the language pack is there.
 * @returns {void}
 */
function showStartDocument() {
    updateModel();
    renderCode();
    areas.view.select({ kind: 'section', sec: state.model.sections[0]?.name }, { scroll: false });
    renderNode();
    addHistoryStep();
    syncScroll();
    setTimeout(() => importYamlLibrary().catch(() => { /* opening YAML files is not possible then */ }), YAML_LIBRARY_DELAY);
    areas.i18n.ready.then(() => { areas.view.render(); renderNode(); renderInsert(); });
}

/**
 * Starts the AI Assistant, the WebMCP tools, the AI status, "Open in another editor" and
 * sync.js. The callbacks reach the areas through `areas`, so each may start after the ones
 * it calls.
 * @returns {void}
 */
function startAiAndSync() {
    areas.ai = createAi({
        getState: getPromptState,
        receiveDocument: async (...args) => { setTimeout(() => areas.aiStatus.addDelivery('link')); await receiveDocument(...args); return state.fileId; },
        tryOpenDocument: id => { if (!store.getEntry(id)) return false; openDocument(id); return true; },
        showToast,
        getRemote: () => areas.sync?.getAiSettings() || null,
        fetchKey: () => (areas.sync ? areas.sync.fetchKey() : Promise.resolve(null)),
        hasValidKey: () => !!areas.sync?.hasValidKey(),
    });
    const agent = createMcp({
        onUse: () => areas.aiStatus.addDelivery('agent'),
        getState: getPromptState,
        getProblems: getProblemList,
        getRecords: getAgentRecords,
        setValue: setAgentValue,
        addRecord: addAgentRecord,
        getFiles: getFileList,
        openFileByName,
        createFile,
        receiveDocument,
        updateText,
        showLine: showAgentLine,
        undo,
    });
    areas.aiStatus = createAiStatus({
        prefix: EDITOR.prefix, btn: document.getElementById('btn-ai'), box: document.getElementById('ai-status'),
        remote: () => areas.sync?.getAiSettings() || null, agent: () => agent,
    });
    startConvert({ editor: 'shls', code: () => state.code, name: () => state.name, toast: showToast, t: translate });
    areas.sync = createSync(createSyncEditor());
}

/**
 * Creates what sync.js gets from the editor; the property names are sync.js's contract.
 * @returns {object} the adapter.
 */
function createSyncEditor() {
    return {
        viewerAllow: '.trow-toggle',
        prefix: EDITOR.prefix, editor: EDITOR.editor, word: 'document',
        current: () => ({ id: state.fileId, name: state.name, content: state.code, assets: {} }),
        load: importExternalDocument,
        toast: showToast,
        hookFor: id => store.getEntry(id)?.hook || null,
        setHookFor: (id, hook) => { try { store.setEntryFields(id, { hook }); } catch (e) { showToast(STORAGE_FULL); } },
        onAi: () => areas.ai?.updateRemote(),
        onAiResult: () => areas.aiStatus.addDelivery('page'),
        onAiEnd: () => areas.aiStatus.resetDelivery(),
    };
}

/**
 * Creates the hook for automated UI tests (window.shlsEditor); its member names are the ones
 * the tests call.
 * @returns {object} the state and the functions the tests call.
 */
function createTestHook() {
    return {
        state, store, setCode, undo, redo, receive: receiveDocument, revealInCode: showCodePosition, view: areas.view,
        sync: () => areas.sync, analyse: updateModel, change: editCodeFromTree, edits,
        codec: { decode: parseShls, encode: formatShls, parseJson, toJson: formatJson, fromJs: convertFromJs, analyse: parseModel, recordLines: getRecordLines },
    };
}
