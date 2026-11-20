/**
 * WebMCP: the editor offers its functions as tools to an AI agent that runs in the browser
 * (document.modelContext, in Chrome as an early preview). The tools run in this page only -
 * no server, no connector. Browsers without WebMCP skip this. Every change is a normal undo
 * step.
 *
 * The data tools work on the open document; list_files, open_file and new_file reach the
 * user's other documents ("My documents"). The tool names, descriptions and parameters are the
 * contract with the agents and stay as they are.
 *
 * createMcp() runs these steps:
 *   1. find WebMCP; without it, return null;
 *   2. wrap every tool so a call notes its time and tells the editor;
 *   3. register the tools;
 *   4. return { last() }, when an agent last used a tool (for the AI status in aistatus.js).
 */

const FORMAT = 'SHLS';
/** The name of the document argument of set_document and new_file. */
const ARG = 'shls';
/** The length of a time as YYYY-MM-DDTHH:MM in list_files. */
const TIME_LENGTH = 16;

/**
 * What the editor hands to createMcp(); a function that cannot do its work returns an
 * error the tool reports to the agent.
 * @typedef {object} McpEditor
 * @property {function(): void} [onUse] - a tool was called.
 * @property {function(): object} getState - what the agent sees: name, code, selection and path.
 * @property {function(): Array<{line: number, kind: string, msg: string}>} getProblems - the problems.
 * @property {function(string): object} getRecords - a section's records: { text } or { error }.
 * @property {function(string, *): object} setValue - changes a value by its path: { path } or { error }.
 * @property {function(string, object, number): object} addRecord - adds a record: { path } or { error }.
 * @property {function(): Array<{name: string, updated: number, open: boolean}>} getFiles - the documents.
 * @property {function(string): boolean} openFileByName - opens a document by name; false when there is none.
 * @property {function(string, string): string} createFile - makes and opens a document; its name.
 * @property {function(string, string, object): Promise<void>} receiveDocument - takes a whole document.
 * @property {function(string, string, boolean): number} updateText - replaces text; the number of places.
 * @property {function(number): void} showLine - shows a line of the code.
 * @property {function(): void} undo - undoes the last change.
 */

/**
 * What createMcp() returns, read by the AI status.
 * @typedef {object} McpStatus
 * @property {function(): number} last - when an agent last used a tool (milliseconds since 1970), 0 for never.
 */

/**
 * Registers the editor's WebMCP tools (an initializeX: it returns the status object).
 * @param {McpEditor} editor - what the tools need of the editor.
 * @returns {McpStatus|null} the status, null without WebMCP.
 */
export function createMcp(editor) {
    const modelContext = document.modelContext || navigator.modelContext;
    if (!modelContext || typeof modelContext.registerTool !== 'function') return null;
    let lastCall = 0;
    for (const tool of createTools(editor)) {
        const run = tool.execute;
        /**
         * Runs the tool after noting the time of the call and telling the editor.
         * @param {...*} args - the arguments WebMCP passes to the tool.
         * @returns {Promise<*>} the tool's answer for the agent.
         */
        tool.execute = async (...args) => { lastCall = Date.now(); editor.onUse?.(); return run(...args); };
        addTool(modelContext, tool);
    }
    return {
        /**
         * Returns when an agent last used a tool.
         * @returns {number} milliseconds since 1970, 0 for never.
         */
        last: () => lastCall,
    };
}

/**
 * Registers one tool; a tool the browser refuses is left out.
 * @param {object} modelContext - the browser's WebMCP object.
 * @param {object} tool - the tool.
 * @returns {void}
 */
function addTool(modelContext, tool) {
    try {
        const result = modelContext.registerTool(tool);
        if (result && typeof result.catch === 'function') result.catch(() => { /* not available on this page */ });
    } catch (e) { /* the browser refused this tool */ }
}

/**
 * Creates the tools with their descriptions, input schemas and functions. Each tool function
 * returns the text for the agent, as WebMCP asks (an API-dictated shape).
 * @param {McpEditor} editor - what the tools need of the editor.
 * @returns {object[]} the tools in the order they are registered.
 */
function createTools(editor) {
    return [
        {
            name: 'get_document',
            description: `Returns the name and the ${FORMAT} code of the document open in the editor, and the selected text.`,
            inputSchema: { type: 'object', properties: {} },
            annotations: { readOnlyHint: true, untrustedContentHint: true },
            execute: getDocument,
        },
        {
            name: 'get_problems',
            description: 'Lists the problems of the document with their line: records with more or fewer values than the key block, indentation that is not a whole level, blank lines after a key block, keys twice, lines SHLS readers ignore.',
            inputSchema: { type: 'object', properties: {} },
            annotations: { readOnlyHint: true },
            execute: getProblems,
        },
        {
            name: 'get_records',
            description: 'Returns the records of a section as JSON, exactly as the reference SHLSDecoder reads them (every value is a string; a nested list is an array of objects), with the keys of the section. Without section: the names of the sections with their numbers of records.',
            inputSchema: { type: 'object', properties: { section: { type: 'string', description: 'The name of the section.' } } },
            annotations: { readOnlyHint: true, untrustedContentHint: true },
            execute: getRecords,
        },
        {
            name: 'set_value',
            description: 'Changes one value of a record, by its path: "Section[0].Key" (records count from 0), nested: "Company[0].Departments[1].Employees[0].Name". Only that line of the code changes. A value is one line of text without spaces at the start; SHLS has no empty values (use - or PH).',
            inputSchema: {
                type: 'object',
                properties: { path: { type: 'string', description: 'The path, e.g. "Product[2].Price".' }, value: { type: 'string', description: 'The new value.' } },
                required: ['path', 'value'],
            },
            execute: setValue,
        },
        {
            name: 'add_record',
            description: 'Adds a record at the end of a section (or after a record given by "after", a record number counting from 0). values: an object with a value for each key (missing keys get "-"); a nested list is an array of such objects.',
            inputSchema: {
                type: 'object',
                properties: {
                    section: { type: 'string', description: 'The name of the section.' },
                    values: { type: 'object', description: 'The values by key, e.g. {"Name": "Lamp", "Price": "19.90"}.' },
                    after: { type: 'number', description: 'Optional: add after this record (0 = the first).' },
                },
                required: ['section', 'values'],
            },
            execute: addRecord,
        },
        {
            name: 'set_document',
            description: `Replaces the whole open document with new ${FORMAT} code. Keep the user's existing data unless asked otherwise.`,
            inputSchema: { type: 'object', properties: { [ARG]: { type: 'string', description: `The complete ${FORMAT} code.` } }, required: [ARG] },
            execute: setDocument,
        },
        {
            name: 'replace_text',
            description: `Replaces an exact piece of the ${FORMAT} code with new text (the first match, or every match with all=true).`,
            inputSchema: {
                type: 'object',
                properties: {
                    find: { type: 'string', description: 'The exact text to find in the code.' },
                    replace: { type: 'string', description: 'The new text.' },
                    all: { type: 'boolean', description: 'Replace every match.' },
                },
                required: ['find', 'replace'],
            },
            execute: updateCodeText,
        },
        {
            name: 'show_line',
            description: 'Moves the cursor to a line of the code and shows that place in the records view, so the user sees it.',
            inputSchema: { type: 'object', properties: { line: { type: 'number', description: 'Line number (1 = first line).' } }, required: ['line'] },
            execute: showLine,
        },
        {
            name: 'list_files',
            description: 'Lists the user\'s documents stored in the editor ("My documents"), most recently changed first, and which one is open.',
            inputSchema: { type: 'object', properties: {} },
            annotations: { readOnlyHint: true, untrustedContentHint: true },
            execute: getFileListText,
        },
        {
            name: 'open_file',
            description: 'Opens one of the user\'s documents by name; the other tools then work on it.',
            inputSchema: { type: 'object', properties: { name: { type: 'string', description: 'The name from list_files.' } }, required: ['name'] },
            execute: openFile,
        },
        {
            name: 'new_file',
            description: `Creates a new document and opens it; the user's other documents stay unchanged. Without ${ARG} it starts empty.`,
            inputSchema: {
                type: 'object',
                properties: {
                    name: { type: 'string', description: 'A short name for the document.' },
                    [ARG]: { type: 'string', description: `Optional: the complete ${FORMAT} code.` },
                },
                required: ['name'],
            },
            execute: createFile,
        },
        {
            name: 'undo',
            description: 'Undoes the last change in the editor.',
            inputSchema: { type: 'object', properties: {} },
            execute: undo,
        },
    ];

    /**
     * get_document: the name and the code of the open document, with the selection.
     * @returns {Promise<string>} the answer for the agent.
     */
    async function getDocument() {
        const state = editor.getState();
        return `Document: "${state.name}" (${FORMAT})\n${state.path ? `Selected in the editor: ${state.path}\n` : ''}${state.sel ? `Selected text: ${state.sel}\n` : ''}\n${state.code}`;
    }

    /**
     * get_problems: the problems with line and kind.
     * @returns {Promise<string>} the answer for the agent.
     */
    async function getProblems() {
        const problems = editor.getProblems();
        return problems.length ? problems.map(problem => `line ${problem.line} (${problem.kind}): ${problem.msg}`).join('\n') : 'No problems.';
    }

    /**
     * get_records: the records of a section as JSON, or the list of sections.
     * @param {object} input - the section's name (section), none for the list.
     * @returns {Promise<string>} the answer for the agent.
     * @throws {Error} when there is no such section or the code cannot be read.
     */
    async function getRecords({ section }) {
        const result = editor.getRecords(section == null ? '' : String(section));
        if (result.error) throw new Error(result.error);
        return result.text;
    }

    /**
     * set_value: changes one value by its path.
     * @param {object} input - the path and the value.
     * @returns {Promise<string>} the answer for the agent.
     * @throws {Error} when the value cannot be set.
     */
    async function setValue({ path, value }) {
        const result = editor.setValue(String(path ?? ''), value);
        if (result.error) throw new Error(result.error);
        return `Changed ${result.path}.`;
    }

    /**
     * add_record: adds a record to a section.
     * @param {object} input - the section, the values by key and, optionally, the record to add after.
     * @returns {Promise<string>} the answer for the agent.
     * @throws {Error} when the record cannot be added.
     */
    async function addRecord({ section, values, after }) {
        const result = editor.addRecord(String(section ?? ''), values || {}, after);
        if (result.error) throw new Error(result.error);
        return `Added ${result.path}.`;
    }

    /**
     * set_document: replaces the whole open document.
     * @param {object} input - the code under ARG.
     * @returns {Promise<string>} the answer for the agent.
     * @throws {Error} when the document is empty.
     */
    async function setDocument(input) {
        const text = String(input[ARG] || '');
        if (!text.trim()) throw new Error('The document is empty.');
        editor.receiveDocument(text, 'replace', { direct: true });
        const errors = editor.getProblems().filter(problem => problem.kind === 'error');
        return errors.length ? `Loaded, with ${errors.length} error(s) - see get_problems.` : 'The document is in the editor.';
    }

    /**
     * replace_text: replaces an exact piece of the code.
     * @param {object} input - the text to find, its replacement (replace) and whether every match (all).
     * @returns {Promise<string>} the answer for the agent.
     * @throws {Error} when the text is not found.
     */
    async function updateCodeText({ find, replace, all }) {
        const count = editor.updateText(String(find || ''), String(replace ?? ''), !!all);
        if (!count) throw new Error('The text was not found - call get_document to see the exact code.');
        return `Replaced ${count} time${count === 1 ? '' : 's'}.`;
    }

    /**
     * show_line: moves the cursor to a line and shows its place in the records view.
     * @param {object} input - the line, 1-based.
     * @returns {Promise<string>} the answer for the agent.
     */
    async function showLine({ line }) {
        editor.showLine(Math.max(1, Math.round(+line || 1)));
        return `Showing line ${line}.`;
    }

    /**
     * list_files: the user's documents, the open one marked.
     * @returns {Promise<string>} the answer for the agent.
     */
    async function getFileListText() {
        return editor.getFiles().map(file => `${file.open ? '* ' : '  '}"${file.name}" (changed ${new Date(file.updated).toISOString().slice(0, TIME_LENGTH).replace('T', ' ')})`).join('\n') + '\n(* = open now)';
    }

    /**
     * open_file: opens a document by name.
     * @param {object} input - the name from list_files.
     * @returns {Promise<string>} the answer for the agent.
     * @throws {Error} when there is no document of that name.
     */
    async function openFile({ name }) {
        if (!editor.openFileByName(name)) throw new Error(`No document "${name}" - call list_files.`);
        return `"${name}" is open.`;
    }

    /**
     * new_file: makes a new document and opens it.
     * @param {object} input - the name and the code under ARG.
     * @returns {Promise<string>} the answer for the agent.
     * @throws {Error} when the browser storage is full.
     */
    async function createFile(input) {
        const made = editor.createFile(input.name, input[ARG]);
        if (!made) throw new Error('The browser storage is full.');
        return `New document "${made}" is open.`;
    }

    /**
     * undo: undoes the last change.
     * @returns {Promise<string>} the answer for the agent.
     */
    async function undo() {
        editor.undo();
        return 'Undone.';
    }
}
