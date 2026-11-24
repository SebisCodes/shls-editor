/**
 * The editor's state and the parts every module shares: what makes this the SHLS editor, the
 * open document as code and as a model, the undo history, the page elements, the areas set up
 * at start (records view, line wrap, sync …) and a few small helpers.
 *
 * The code is the single source of truth: the records view is made from it (shls.js reads it
 * exactly as the reference SHLSDecoder does), and every change in the view is an edit of whole
 * lines of the code (edits.js). The field names of the state are read by the tests through
 * window.shlsEditor.state.
 */

/** What makes this the SHLS editor. */
export const EDITOR = { prefix: 'shlseditor', editor: 'shls', name: 'SHLS', ext: 'shls', mime: 'text/plain' };
/** The JSON Editor, which opens a conversion to JSON as a new document. */
export const JSON_SITE = 'https://json.giit.ch/';
/** The localStorage key of the settings and the open document's id. */
export const SETTINGS_KEY = EDITOR.prefix + '.v1';
/** The height of one line of code, in pixels. */
export const LINE_HEIGHT = 20;
/** The width below which the editor shows one view at a time. */
export const NARROW_SCREEN = matchMedia('(max-width: 860px)');
/** The name of a document without one. */
export const DEFAULT_NAME = 'Document';
/** The name of a document from an AI without a name of its own. */
export const AI_DOCUMENT = 'AI document';
/** The share of the width the code takes until the user moves the splitter. */
const DEFAULT_SPLIT = 0.45;
/** The message shown when the browser storage is full. */
export const STORAGE_FULL = 'The browser storage is full';
/** The message shown when an action needs readable SHLS. */
export const CANNOT_READ = 'The code cannot be read as SHLS - fix the problem above the code first';
/** The message shown when the document has no section. */
export const NO_SECTIONS = 'The document has no sections yet';
/** The message shown when text is on the clipboard. */
export const COPIED = 'Copied to the clipboard';
/** The fields that take typing: shortcuts leave them alone. */
export const TYPING_FIELDS = 'textarea, select, [contenteditable], input:not([type=checkbox]):not([type=radio]):not([type=range]):not([type=color]):not([type=button])';
/** How long a toast stays, in milliseconds. */
const TOAST_TIME = 2600;
/** The number of bytes in a kilobyte. */
const KILOBYTE = 1024;

/**
 * A place in the records view that survives a new model (createView() in view.js).
 * @typedef {object} ViewPlace
 * @property {string} kind - "section", "keys", "key", "record" or "field".
 * @property {string} sec - the section's name.
 * @property {number[]} [keyPath] - a key: its index at each level of the key block.
 * @property {number[]} [recPath] - a record or value: [record, field, record, field, record …].
 * @property {number} [field] - a value: its index in the record.
 */

/**
 * A step of the undo history.
 * @typedef {object} HistoryStep
 * @property {string} code - the code.
 * @property {number} sel - the cursor in the code.
 * @property {ViewPlace|null} view - the place selected in the records view.
 */

/**
 * The editor's state.
 * @typedef {object} EditorState
 * @property {string} code - the document's code.
 * @property {object|null} model - the code as read by shls.js parseModel().
 * @property {object|null} hlModel - the model the highlighting uses (read while typing, before the full update).
 * @property {Array<{line: number, kind: string, msg: string}>} problems - the problems, lines 0-based.
 * @property {number} split - the share of the width the code takes.
 * @property {string} name - the document's name.
 * @property {string} fileId - the document's id in "My documents", "" for none.
 * @property {HistoryStep[]} history - the undo steps; the last one is the current code.
 * @property {HistoryStep[]} future - the redo steps.
 * @property {number} histTimer - the timer that makes an undo step of typing.
 * @property {boolean} showProblems - true when the list of problems is open.
 * @property {string|null} savedCode - the code as last stored or read from storage.
 * @property {number} modelTimer - the timer that reads the code after typing.
 * @property {number} saveTimer - the timer that stores the code after typing.
 */

/** @type {EditorState} */
export const state = {
    code: '', model: null, hlModel: null, problems: [],
    split: DEFAULT_SPLIT,
    name: DEFAULT_NAME, fileId: '',
    history: [], future: [], histTimer: 0,
    showProblems: true,
    savedCode: null, modelTimer: 0, saveTimer: 0,
};

/**
 * The areas set up at start by app.js; null until then.
 * @typedef {object} EditorAreas
 * @property {object|null} i18n - the interface language (i18n.js).
 * @property {object|null} lineWrap - the line wrap of the code view (wrap.js).
 * @property {object|null} view - the records view (view.js createView()).
 * @property {object|null} files - the "My documents" dialog (files-dialog.js).
 * @property {object|null} sync - webhook and embedding (sync.js).
 * @property {{updateRemote: function(): void}|null} ai - the AI Assistant.
 * @property {object|null} aiStatus - the AI status at the button (aistatus.js).
 */

/** @type {EditorAreas} */
export const areas = { i18n: null, lineWrap: null, view: null, files: null, sync: null, ai: null, aiStatus: null };

/** The undo history of each document opened while the page is open, by id. */
export const historyByDocument = new Map();

/**
 * Returns the first element that matches a selector.
 * @param {string} selector - the CSS selector.
 * @param {ParentNode} [root] - where to look.
 * @returns {HTMLElement|null} the element.
 */
export function getElement(selector, root = document) {
    return root.querySelector(selector);
}

/**
 * Returns every element that matches a selector.
 * @param {string} selector - the CSS selector.
 * @param {ParentNode} [root] - where to look.
 * @returns {HTMLElement[]} the elements.
 */
export function getElements(selector, root = document) {
    return [...root.querySelectorAll(selector)];
}

/** The elements the modules use. */
export const ui = {
    ta: getElement('#code'), hl: getElement('#hl'), marks: getElement('#marks'), gutter: getElement('#gutter'),
    status: getElement('#code-status'), error: getElement('#code-error'),
    tree: getElement('#tree'), node: getElement('#node-wrap'), insert: getElement('#insert-wrap'), convert: getElement('#convert-wrap'), outline: getElement('#outline-wrap'),
    work: getElement('#work'), toast: getElement('#toast'),
};

let toastTimer = 0;

/**
 * Translates an interface text into the page's language.
 * @param {string} text - the English text.
 * @returns {string} the translation, or the text as it is.
 */
export function translate(text) {
    return areas.i18n.translate(text);
}

/**
 * Shows a short message at the bottom of the page.
 * @param {string} message - the message.
 * @returns {void}
 */
export function showToast(message) {
    ui.toast.textContent = message;
    ui.toast.classList.add('shown');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => ui.toast.classList.remove('shown'), TOAST_TIME);
}

/**
 * Returns a number kept between two limits.
 * @param {number} value - the number.
 * @param {number} min - the lower limit.
 * @param {number} max - the upper limit.
 * @returns {number} the number inside the limits.
 */
export function getClamped(value, min, max) {
    return Math.min(max, Math.max(min, value));
}

/**
 * Returns a size for the screen: bytes below 1 KB, else KB with one decimal.
 * @param {number} bytes - the size in bytes.
 * @returns {string} the size with its unit ("512 B", "1.5 KB").
 */
export function formatSize(bytes) {
    return bytes < KILOBYTE ? bytes + ' B' : (bytes / KILOBYTE).toFixed(1) + ' KB';
}

/**
 * Returns a section of the open document by name.
 * @param {string} name - the section's name.
 * @returns {object|undefined} the section of the model, undefined when there is none.
 */
export function findSection(name) {
    return state.model?.sections.find(section => section.name === name);
}
