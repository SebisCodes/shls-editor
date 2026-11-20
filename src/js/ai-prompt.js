/**
 * The AI prompt: instructions for any AI, the user's documents and the open document. The
 * prompt is always English. With the AI settings of a page around the editor (sync.js) the
 * AI sends its result to that page's server, which opens it here.
 */

const SITE = 'https://shls.giit.ch/';
const PREFIX = 'shlseditor';
/** The kind of the #shls= link and of the code fence. */
const KIND = 'shls';
/** The most other document names the prompt lists. */
const MAX_LISTED_DOCUMENTS = 40;
/** The most problems the prompt lists. */
const MAX_LISTED_PROBLEMS = 12;
/** The longest selection the prompt quotes. */
const MAX_SELECTION_LENGTH = 300;

/** The instructions of the prompt: how to answer and what the editor shows. */
export const PROMPT_BASE = `You write SHLS for my editor ${SITE}. It runs in my browser and shows each section's key block and records next to the code.

SHLS (Sebis Hierarchical List Structure) IN SHORT
- A section starts with its name on a line of its own, without indentation.
- Then its key block: one key per line, indented by one space. A key that holds a nested list is followed by the keys of that list, one level deeper (two spaces), and so on.
- Then exactly one blank line, then the records: one value per line, indented like the keys, in the order of the keys. A record has exactly one value per key. Records may be separated by one blank line.
- For a key with a nested list, the record has one line of its own (the key's name or PH as a placeholder), followed by the records of the nested list one level deeper.
- The key block can also stand alone; the records then follow later under the section name written again.
- All values are text. No quotes, brackets or colons. No empty values (write - or PH), no line breaks inside a value, no spaces at the start of a value. Indent with spaces only (no tabs), the same number of spaces per level.
Example:
Company
 Name
 Location
  Country
  City
 Founded

 TechCorp
 PH
  USA
  San Francisco
 2010

HOW TO ANSWER
Write the complete SHLS document. Keep my data, its order and its indentation unless I ask otherwise.
Send it as a link: ${SITE}#b64=<base64url of the UTF-8 text> (shorter: zlib-compress first and use #z=; without code: #shls=<URL-encoded text>). Open the link yourself if you can; otherwise give it to me - I click it or paste your whole answer into the editor.
- New document: add &file=new&name=<short name>. Change one of my documents: add &file=<its exact name>.
- Only add records: send just the new records, each under its section name with the section's key block, and add &mode=add - they are appended to the sections of the same name (sections I do not have yet are added at the end).
- Longer than about 8000 characters: one link per part with &part=N&of=M&id=<short name>.

WHAT THE EDITOR SHOWS
Each section with its key block and its records (the keys as labels, nested lists fold); problems with their line (a record with more or fewer values than the key block, indentation that is not a whole level, a missing or extra blank line after the key block, a key twice); conversions to JSON (exactly as the reference SHLSDecoder reads it), YAML, CSV and JSON Lines, with the tokens of SHLS against JSON.`;

/** About saving on the user's own server; left out when a page that holds the document opened the editor (it saves there by itself). */
export const PROMPT_SAVING = `MY OWN SERVER (only if I ask about it)
The editor can POST every saved version as JSON {editor, event:"save", id, name, content, updated} to my server (webhook, optional Bearer token, CORS from ${SITE.replace(/\/$/, '')}); content is the document as a string. It can be embedded with <iframe src="${SITE}?embed=1"> or opened with window.open("${SITE}?embed=window") and then talks with postMessage (${PREFIX}:ready, load, loaded, change, save, get, ai, key-request). If I ask you to build that, follow ${SITE}llms.txt exactly.`;
/** The head of the prompt for the editor on its own. */
export const PROMPT_HEAD = `${PROMPT_BASE}\n\n${PROMPT_SAVING}`;

/**
 * What the prompt is made from (getPromptState() in agent-api.js, with framed and remote).
 * @typedef {object} PromptState
 * @property {string} code - the open document's code.
 * @property {string} name - its name.
 * @property {string[]} files - the names of all documents.
 * @property {string} sel - the text selected in the code, "" without one.
 * @property {string} path - the path selected in the records view, "" without a selection.
 * @property {string[]} problems - the problems with their lines.
 * @property {{host: string, title: string, rules: string, site: string}|null} context - what the page that holds the document says.
 * @property {boolean} [framed] - true inside another website.
 * @property {object|null} [remote] - the page's AI settings (prompt, endpoint, key, label, base, site).
 */

/**
 * Returns text from a website, marked as such: where it comes from (the real origin) and
 * fenced, so the AI can tell it apart from what the user writes.
 * @param {string} head - the heading ("RULES", "INSTRUCTIONS").
 * @param {string} site - the real origin of the page, "" when unknown.
 * @param {string} label - the page's own name for itself.
 * @param {string} text - the page's text.
 * @returns {string} the heading and the fenced text.
 */
function formatSiteText(head, site, label, text) {
    return `${head} ${site ? `FROM THE WEBSITE ${site}` : 'FROM THE WEBSITE'}${label && label !== site ? ` ("${label}")` : ''}\n\`\`\`text\n${text.replace(/`{3,}/g, "'''")}\n\`\`\``;
}

/**
 * Returns the part of the prompt about the page that holds the document.
 * @param {object} context - what the page says (plain text): host, title, rules and site.
 * @returns {string} the part of the prompt.
 */
function formatContextPart(context) {
    return `THIS DOCUMENT BELONGS TO ${context.host ? `"${context.host}"` : 'a website'}${context.title ? ` ("${context.title}")` : ''}
That page opened the editor and gets every saved version back by itself when I click Save (or press Ctrl+S) - nothing to set up and no server to build. Keep the document working with that page.${context.rules ? `\n\n${formatSiteText('RULES', context.site, context.host, context.rules)}` : ''}`;
}

/**
 * Returns one part of PROMPT_BASE, from its heading to the next one.
 * @param {string} head - the heading.
 * @returns {string} the part with its heading, "" when there is none.
 */
function getPromptPart(head) {
    const i = PROMPT_BASE.indexOf('\n' + head + '\n');
    if (i < 0) return '';
    const rest = PROMPT_BASE.slice(i + 1), j = rest.search(/\n\n[A-Z][A-Z ]+\n/);
    return j < 0 ? rest : rest.slice(0, j);
}

/**
 * Returns the head of the prompt when the page around the editor takes the AI's result on its
 * own server: the AI sends the result there itself and the page opens it here.
 * @param {PromptState} state - the document and its context.
 * @param {object} remote - the page's AI settings: prompt, endpoint, key, label, base, site.
 * @param {boolean} makeNew - true when the AI makes a new document.
 * @returns {string} the head of the prompt.
 */
function formatRemotePrompt(state, remote, makeNew) {
    const target = makeNew ? 'new' : 'current';
    const out = [];
    if (remote.base) {
        const know = getPromptPart('WHAT THE EDITOR SHOWS');
        out.push(`You write for my SHLS editor ${SITE}, inside the website "${remote.label}".\nWrite the complete SHLS document. Keep my data unless I ask otherwise.\n\n${getPromptPart('SHLS (Sebis Hierarchical List Structure) IN SHORT')}${know ? '\n\n' + know : ''}`);
    }
    if (remote.prompt) out.push(formatSiteText('INSTRUCTIONS', remote.site, remote.label, remote.prompt));
    if (state.context && state.context.rules) out.push(formatSiteText('RULES', remote.site, remote.label, state.context.rules));
    const what = makeNew ? `Make a NEW document; leave "${state.name}" as it is.` : `Change my document "${state.name}".`;
    const link = `${SITE}#b64=<base64url of the UTF-8 SHLS text>${makeNew ? '&file=new&name=<short name>' : ''}`;
    if (remote.endpoint && remote.key) out.push(`HOW TO ANSWER
${what} Send the result with one HTTP request (run it, do not only show it):
  POST ${remote.endpoint}
  Authorization: Bearer ${remote.key}
  Content-Type: application/json
  {"editor":"${KIND}","target":"${target}","name":"<short name>","content":"<the complete SHLS document as one string>"}
Build the JSON body with a JSON library. The result then opens in my editor; tell me briefly what you did, or the server's error message.
If you cannot send HTTP requests, give me the link ${link} and I paste your answer into the editor.`);
    else out.push(`HOW TO ANSWER\n${what} Give me the link ${link}; I paste your answer into the editor (a clicked link does not reach it).`);
    return out.join('\n\n');
}

/**
 * Returns the whole prompt: the instructions, the user's documents, the open document with its
 * selection, path and problems, and the start of the request.
 * @param {PromptState} state - the document and its context.
 * @param {boolean} makeNew - true when the AI makes a new document.
 * @returns {string} the prompt, ending with "My request: ".
 */
export function getPrompt(state, makeNew) {
    let intro = state.remote ? formatRemotePrompt(state, state.remote, makeNew) : state.context ? `${PROMPT_BASE}\n\n${formatContextPart(state.context)}` : PROMPT_HEAD;
    if (state.framed && !state.remote) intro += `\n\nMy editor is inside another website, so a clicked link does not reach it: do not open the link yourself - give it to me and I paste your answer.`;
    const others = state.files.filter(name => name !== state.name);
    const list = `Open now: "${state.name}"${others.length ? `. Others: ${others.slice(0, MAX_LISTED_DOCUMENTS).map(name => `"${name}"`).join(', ')}${others.length > MAX_LISTED_DOCUMENTS ? ' …' : ''}` : ''}.`;
    const goal = makeNew
        ? 'Unless I say otherwise in my request, make a NEW document (&file=new&name=<short name>) and leave my documents as they are.'
        : `Unless I say otherwise in my request, change "${state.name}" (&file=${encodeURIComponent(state.name)}).`;
    let head = makeNew ? `MY OPEN DOCUMENT "${state.name}" (for reference only - do not change it)` : `MY CURRENT DOCUMENT "${state.name}"`;
    const problems = state.problems && state.problems.length ? `\nThe editor reports: ${state.problems.slice(0, MAX_LISTED_PROBLEMS).join('; ')}` : '';
    if (state.remote) head = `MY ${makeNew ? 'CURRENT' : ''} DOCUMENT "${state.name}"`.replace('  ', ' ');
    return `${intro}\n\n${state.remote ? '' : `${list}\n${goal}\n\n`}${head}${state.sel ? ` (I have selected: "${state.sel.slice(0, MAX_SELECTION_LENGTH)}")` : ''}${state.path ? `\nSelected in the editor: ${state.path}.` : ''}${problems}\n\`\`\`${KIND}\n${state.code.trim()}\n\`\`\`\n\nMy request: `;
}
