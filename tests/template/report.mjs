/**
 * Reads a JSON list of cases (argv[3]) and runs each through the SHLS editor's modules in src/js
 * (argv[2]) as the editor runs them: the model with the control lines of a template, the
 * highlighting of the code view, the plain model for comparison, the edits of the records view
 * named in the case, and the example view with the page's examples of the case. Prints one JSON
 * result per case for template_test.py.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const scriptFolder = process.argv[2];
const cases = JSON.parse(readFileSync(process.argv[3], 'utf8'));
const shls = await loadModule('shls.js');
const lines = await loadModule('template-lines.js');
const edits = await loadModule('edits.js');
const template = await loadModule('template-tags.js');
const examplesModule = await loadModule('template-examples.js');
const recordsExamples = await loadModule('records-examples.js');

/**
 * Imports a module of the editor by its file name.
 * @param {string} fileName - the file in src/js, e.g. "shls.js".
 * @returns {Promise<object>} the module's exports.
 */
function loadModule(fileName) {
    return import(pathToFileURL(join(scriptFolder, fileName)).href);
}

/**
 * One case of template_test.py.
 * @typedef {object} TemplateCase
 * @property {string} code - the SHLS text.
 * @property {?string} template - the template syntax, or null for plain SHLS.
 * @property {Array<Array<*>>} [edits] - edits of the records view: [name of the edits.js function, ...arguments after code and model].
 * @property {string[]} [otherCodes] - edited codes to check against the code: does each keep the sections whole?
 * @property {object} [examples] - the page's template message for the example view (placeholders, assets); null for none.
 * @property {number[]} [templateLinesAsked] - lines of the template whose line in the example view is asked for.
 */

/**
 * Writes a model as JSON text, maps as lists of pairs.
 * @param {object} model - the model.
 * @returns {string} the JSON text.
 */
function formatModel(model) {
    return JSON.stringify(model, (key, value) => (value instanceof Map ? [...value] : value));
}

/**
 * Runs the edits of a case in order, each on the code the previous edit left.
 * @param {string} code - the code.
 * @param {?object} syntax - the template syntax.
 * @param {Array<Array<*>>} steps - the edits.
 * @returns {string[]} the code after each edit.
 */
function runEdits(code, syntax, steps) {
    const results = [];
    let current = code;
    for (const [name, ...args] of steps) {
        current = edits[name](current, lines.parseCodeModel(current, syntax), ...args).code;
        results.push(current);
    }
    return results;
}

/**
 * Builds the example view of a case: the filled text, its data and problems, the template's line
 * of each of its lines, which lines are copied text of the template, and the lines asked for.
 * @param {TemplateCase} testCase - the text, the template syntax and the examples.
 * @param {object} syntax - the template syntax.
 * @returns {Promise<?object>} the example view, { error } when the filling stopped, null without examples in the case.
 */
async function buildExampleResult(testCase, syntax) {
    if (!('examples' in testCase)) return null;
    const examples = testCase.examples ? await examplesModule.createTemplateExamples(testCase.examples, { decodePicture: async () => ({ width: 1, height: 1, frames: 1 }) }) : null;
    let view;
    try { view = recordsExamples.buildExampleView(testCase.code, syntax, examples); } catch (error) { return { error: error.name }; }
    const lineCount = view.lineStarts.length;
    return {
        text: view.text, data: shls.convertToJs(view.model.data), problems: view.model.problems, modelError: view.model.error || null,
        templateLines: [...view.templateLines],
        copied: Array.from({ length: lineCount }, (_, line) => recordsExamples.isViewLineCopied(view, line)),
        viewLines: (testCase.templateLinesAsked || []).map(line => recordsExamples.findViewLine(view, line)),
    };
}

/**
 * Builds the result of one case: what the editor makes of its text with its template syntax.
 * @param {TemplateCase} testCase - the text, the template syntax and the edits.
 * @returns {Promise<object>} the problems, the data, the roles, the highlighted HTML, the edited code, which edits keep the
 *     sections whole and the example view.
 */
async function buildCaseResult(testCase) {
    const syntax = template.getTemplateSyntax(testCase.template);
    const model = lines.parseCodeModel(testCase.code, syntax);
    return {
        problems: model.problems,
        data: shls.convertToJs(model.data),
        keys: model.sections.map(section => [section.name, (section.keys || []).map(key => key.name)]),
        roles: model.roles,
        isSameAsPlainModel: formatModel(model) === formatModel(shls.parseModel(testCase.code)),
        plainHighlighted: shls.highlight(model),
        highlighted: shls.highlight(model),
        tags: syntax ? template.getTemplateTags(testCase.code, syntax).map(tag => testCase.code.slice(tag.start, tag.end)) : [],
        hasTags: lines.hasTemplateTags(testCase.code, syntax),
        edited: runEdits(testCase.code, syntax, testCase.edits || []),
        editsWhole: (testCase.otherCodes || []).map(other => lines.isTemplateEditWhole(testCase.code, other, syntax)),
        example: await buildExampleResult(testCase, syntax),
    };
}

console.log(JSON.stringify(await Promise.all(cases.map(buildCaseResult))));
