/**
 * Documents that arrive: from AI links and browser agents (ai.js, mcp.js), and from other
 * websites and ?src= (sync.js). A document named by the link changes without a question;
 * "Undo" takes the change back. A page's document never takes the place of one of the user's
 * own documents.
 */

import { getRecordsAppendEdit } from './edits.js?v=9';
import { store } from './files.js?v=8';
import { VIEWER } from './sync.js?v=25';
import { state, ui, EDITOR, AI_DOCUMENT, showToast } from './state.js?v=3';
import { setCode } from './history.js?v=4';
import { getReadableModel } from './model.js?v=4';
import { openDocument, createDocument } from './documents.js?v=4';

/**
 * Which document a document from an AI goes into.
 * @typedef {object} ReceiveTarget
 * @property {string} [file] - "new" for a new document, a name for that document (made when
 *   there is none), empty for the open one.
 * @property {string} [name] - the name of a new document.
 */

/**
 * Takes a document from an AI (a command that returns a Promise so the caller can wait for it).
 * @param {string} text - the SHLS text.
 * @param {string} mode - "add" to add the records to the sections of the same name, else the
 *   text replaces the document.
 * @param {ReceiveTarget} [target] - which document.
 * @returns {Promise<void>} settles when the document is taken.
 */
export async function receiveDocument(text, mode, target = {}) {
    text = String(text).replace(/\r\n?/g, '\n');
    const wanted = String(target.file || '').trim();
    const isNew = wanted.toLowerCase() === 'new';
    const entry = isNew ? null : wanted ? store.findByName(wanted) : store.getEntry(state.fileId);
    const addition = mode === 'add' ? getReadableModel(text) : null;
    if (mode === 'add' && !addition) { openInvalidAddition(text, entry); return; }
    if (!entry) {
        if (createDocument(isNew ? target.name || AI_DOCUMENT : wanted || AI_DOCUMENT, text)) VIEWER || showToast(`New document "${state.name}" from the AI - your other documents are unchanged`);
        return;
    }
    // The link says which document (chosen with the prompt's buttons): no question; "Undo" takes the change back.
    if (entry.id !== state.fileId) openDocument(entry.id);
    if (mode === 'add') { if (!addRecords(text, addition, entry)) return; } else setCode(text);
    const errors = state.problems.filter(problem => problem.kind === 'error').length;
    VIEWER || showToast(errors ? `Document received - ${errors} ${errors === 1 ? 'problem' : 'problems'} found, see above the code` : `"${state.name}" changed by the AI - "Undo" takes it back`);
}

/**
 * Opens an addition that is no readable SHLS as a new document.
 * @param {string} text - the addition.
 * @param {object|null} entry - the document it was meant for.
 * @returns {void}
 */
function openInvalidAddition(text, entry) {
    if (createDocument(`${entry ? entry.name : AI_DOCUMENT} (AI)`, text)) showToast(`The addition is not valid ${EDITOR.name} - it is open as a new document "${state.name}"`);
}

/**
 * Adds the records of an addition to the sections of the same name in the open document; when
 * that fails, the addition opens as a new document. Returns whether the records were added.
 * @param {string} text - the addition's text.
 * @param {object} addition - the addition's model.
 * @param {object} entry - the open document's entry.
 * @returns {boolean} true when the records were added.
 */
function addRecords(text, addition, entry) {
    try {
        setCode(getRecordsAppendEdit(state.code, state.model, addition).code);
        return true;
    } catch (e) {
        if (createDocument(`${entry.name} (AI)`, text)) showToast(`${e.message} - the addition is open as a new document "${state.name}"`);
        return false;
    }
}

/**
 * A document from the page around the editor or from ?src= (sync.js's load message).
 * @typedef {object} ExternalDocument
 * @property {string} name - the document's name.
 * @property {string} content - its text.
 * @property {string} [into] - the id of the document to replace.
 * @property {boolean} [asNew] - true to always make a new document.
 * @property {string} [page] - the origin of the page it comes from.
 * @property {boolean} [temp] - true for a document kept in memory only, never stored.
 */

/**
 * Loads a document from the page around the editor or from ?src=: it replaces the document of
 * that name that came from the same page before (one undo step), or becomes a new document.
 * A command that returns a Promise, as sync.js waits for it.
 * @param {ExternalDocument} external - the document.
 * @returns {Promise<void>} settles when the document is shown.
 */
export async function importExternalDocument({ name, content, into, asNew, page, temp }) {
    content = String(content).replace(/\r\n?/g, '\n');
    const entry = asNew ? null : (into && store.getEntry(into)) || store.list().find(other => other.name === name && other.page && other.page === page && !!other.temp === !!temp);
    if (entry) {
        if (entry.id !== state.fileId) openDocument(entry.id);
        if (content !== state.code) setCode(content);
    } else {
        const id = createDocument(name, content, !!temp);
        if (id && page) try { store.setEntryFields(id, { page }); } catch (e) { /* storage full: it is not recognized next time */ }
    }
    ui.ta.setSelectionRange(0, 0);
    ui.ta.scrollTop = 0;
}
