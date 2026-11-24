"""Template placeholders (?template=mustache, ?template=angle): how the SHLS editor reads and shows them.

    python3 tests/template_test.py            the checks in Node
    python3 tests/template_test.py --browser  also the checks in the editor (php -S on port 8106 first)

  order       an order template with value tags as values ({{name}}, "Order {{number}}"), control lines around
              a section, around the records of a section, inside a nested list and {{#hasNote}} / {{^hasNote}}
              (tests/order-template.shls): 0 problems, the data holds the tags as strings, the control lines
              have their own role
  angle       the same template in the syntax "angle" (tests/order-template-angle.shls)
  misplaced   a control line inside a key block, inside a record and inside a nested record is one error at
              its line, and the reader goes on as if the line were removed (the key block stays whole)
  in place    control lines after a key block, between records, at the end of a nested list and before a
              section are in their place
  errors      a section left open and a stray end tag are errors at the line of the tag
  view        the code view shows every tag as written, without a color of its own
  edits       edits of the records view (a value, a key, records added, copied and removed, a record with a nested
              section, a section) keep the template whole and every other tag as written; an edit that would
              leave a section open is held back
  unit        control lines are passed over when the indentation unit is found
  large       8000 control lines in a key block and 8000 placeholder errors are read quickly
  option off  the model is exactly the plain one of shls.js
  examples    the example view: values, a list once per example row, a hidden section and its inverted
              section, the label in brackets without an example; a fill is one line (line breaks and leading
              spaces go), an empty fill on its own line is "-", text of an example that looks like a tag stays
              a value; every line leads to the template's line, only copied lines may be changed, a left-out
              line finds the line above it; the "angle" syntax; filling past a limit stops
  browser     with --browser: through a page around the editor, the example view is the default and shows
              the examples (also when they come with the load, from the first paint), the switch shows the
              template view with the tags, a click leads to the template's line, a value with an example is
              refused with a message, a copied value is changed in the template, the "Placeholders" box is
              closed and puts a tag at the cursor as one undo step, the side panel is a closed drawer, "get"
              carries the template; with the option off nothing of this is there
Needs Node; --browser needs Playwright with Chrome."""
import html
import json
import os
import re
import subprocess
import sys
import tempfile
import time

HERE = os.path.dirname(os.path.abspath(__file__))
SCRIPTS = os.path.join(os.path.dirname(HERE), 'src', 'js')
MISPLACED = 'A line of section tags belongs between complete records'
failed = []


def check_that(ok, text):
    """Prints one result line and notes a failure.

    Args:
        ok (bool): True when the check holds.
        text (str): what is checked.

    Returns:
        None: the result is printed and a failure is noted.
    """
    print(('ok    ' if ok else 'FAIL  ') + text, flush=True)
    if not ok:
        failed.append(text)


def run_report(cases):
    """Runs tests/template/report.mjs in Node on the cases.

    Args:
        cases (list[dict]): each with `code` (str), `template` (str or None) and optional `edits` (list).

    Returns:
        list[dict]: one result per case, in order.
    """
    with tempfile.NamedTemporaryFile('w', suffix='.json', delete=False, encoding='utf-8') as file:
        json.dump(cases, file)
    try:
        run = subprocess.run(['node', os.path.join(HERE, 'template', 'report.mjs'), SCRIPTS, file.name],
                             capture_output=True, text=True, timeout=120)
    finally:
        os.unlink(file.name)
    if run.returncode:
        print(run.stderr)
        sys.exit('report.mjs failed')
    return json.loads(run.stdout)


def get_plain_text(highlighted):
    """Returns the plain text of highlighted HTML.

    Args:
        highlighted (str): the HTML of the code view.

    Returns:
        str: the text with the tags removed and the entities decoded.
    """
    return html.unescape(re.sub(r'<[^>]+>', '', highlighted))


def read_fixture(name):
    """Returns the text of a fixture in the tests folder.

    Args:
        name (str): the file name.

    Returns:
        str: the file's text.
    """
    with open(os.path.join(HERE, name), encoding='utf-8') as fixture:
        return fixture.read()


def get_problems(result):
    """Returns the problems of a result as (line, kind, message).

    Args:
        result (dict): one case result of report.mjs.

    Returns:
        list[tuple]: the problems in their order.
    """
    return [(problem['line'], problem['kind'], problem['msg']) for problem in result['problems']]


def get_control_lines(code):
    """Returns the lines of a code that hold section tags only.

    Args:
        code (str): the SHLS code.

    Returns:
        list[str]: the control lines in order.
    """
    return [line for line in code.split('\n') if re.fullmatch(r'\s*(\{\{[#^/][A-Za-z_][\w.-]*\}\}\s*)+', line)]


ORDER = read_fixture('order-template.shls')
ANGLE = read_fixture('order-template-angle.shls')
MISPLACED_CODE = ('person\n name\n{{#hasCity}}\n city\n\n John Doe\n {{#x}}\n Springfield\n\n'
                  'order\n number\n items\n  label\n  quantity\n\n 1\n items\n  pen\n  {{/x}}\n  2\n')
IN_PLACE = ('{{#hasPerson}}\nperson\n name\n{{/hasPerson}}\nnote\n text\n{{#one}}\n\n first\n{{/one}}\n\n second\n'
            'order\n items\n  label\n\n items\n  pen\n  {{#x}}\n {{/x}}\n')
BROKEN = 'person\n name\n\n{{#items}}\n {{name}}\n{{/people}}\n'
EDITS = [
    ['getValueEdit', ORDER.split('\n').index(' {{street}}'), '1 Main Street'],
    ['getKeyAddEdit', 'order', [0], {'name': 'date'}],
    ['getRecordAddEdit', {'sec': 'note'}],
    ['getRecordDuplicateEdit', 'order', [0, 2, 0]],
    ['getRecordRemoveEdit', 'note', [1]],
    ['getRecordDuplicateEdit', 'order', [0]],
    ['getRecordRemoveEdit', 'order', [1]],
    ['getKeyAddEdit', 'order', [2], {'name': 'total'}],
    ['getKeyDuplicateEdit', 'order', [2]],
    ['getSectionRemoveEdit', 'customer'],
]
GUARDED = 's\n items\n  value\n\n items\n  {{#x}}\n  {{!bad}}\n {{/x}}\n'
UNIT = 'empty\n  {{#x}}\nperson\n name\n\n Alice\n{{/x}}\n'
LARGE_KEYS = 'person\n name\n' + '{{#x}}{{/x}}\n' * 8000 + ' city\n\n Alice\n Paris\n'
LARGE_ERRORS = 'person\n name\n\n' + ' {{!x}}\n' * 8000
OPEN_AFTER_EDIT = ORDER.replace('  {{/items}}\n', '')

(order, order_off, angle, misplaced, in_place, broken, edited, unit, guarded) = run_report([
    {'code': ORDER, 'template': 'mustache', 'otherCodes': [OPEN_AFTER_EDIT, ORDER.replace('{{street}}', 'Main Street')]},
    {'code': ORDER, 'template': None, 'otherCodes': [OPEN_AFTER_EDIT]}, {'code': ANGLE, 'template': 'angle'},
    {'code': MISPLACED_CODE, 'template': 'mustache'}, {'code': IN_PLACE, 'template': 'mustache'},
    {'code': BROKEN, 'template': 'mustache'}, {'code': ORDER, 'template': 'mustache', 'edits': EDITS},
    {'code': UNIT, 'template': 'mustache'},
    {'code': GUARDED, 'template': 'mustache', 'otherCodes': ['s\n items\n  value\n {{/x}}\n']}])

print('-- the order template')
check_that(get_problems(order) == [], f'mustache: 0 problems (got {get_problems(order)})')
check_that(order['data'] == {'customer': [{'name': '{{name}}', 'street': '{{street}}', 'postalCode': '{{postalCode}}', 'city': '{{city}}'}],
                             'order': [{'number': 'Order {{number}}', 'items': [{'label': '{{label}}', 'quantity': '{{quantity}}'}]}],
                             'note': [{'text': '{{note}}'}, {'text': 'No note'}]},
           'mustache: the data holds every value tag as a string, the control lines are passed over')
check_that(order['roles'].count('control') == len(get_control_lines(ORDER)) == 10, f'mustache: every control line has the role "control" ({order["roles"].count("control")})')

print('-- angle')
check_that(get_problems(angle) == [] and angle['data']['order'][0]['items'] == [{'label': '<<label>>', 'quantity': '<<quantity>>'}],
           f'angle: 0 problems, the nested records read (got {get_problems(angle)})')
check_that(get_plain_text(angle['highlighted']) == ANGLE and 'class="tp"' not in angle['highlighted'],
           'angle: the code view shows every tag as written, without a color of its own')

print('-- misplaced control lines')
placed = [problem for problem in get_problems(misplaced) if problem[2] == MISPLACED]
check_that(placed == [(2, 'error', MISPLACED), (6, 'error', MISPLACED), (18, 'error', MISPLACED)],
           f'inside a key block, a record and a nested record: one error at the line ({placed})')
check_that(misplaced['keys'][0] == ['person', ['name', 'city']], f'the key block stays whole ({misplaced["keys"][0]})')
check_that(misplaced['data']['person'] == [{'name': 'John Doe', 'city': 'Springfield'}]
           and misplaced['data']['order'] == [{'number': '1', 'items': [{'label': 'pen', 'quantity': '2'}]}],
           'the reader goes on as if the lines were removed')

print('-- control lines in their place')
check_that(get_problems(in_place) == [], f'after a key block, between records, at the end of a nested list, before a section: 0 problems ({get_problems(in_place)})')
check_that(in_place['data']['note'] == [{'text': 'first'}, {'text': 'second'}] and in_place['keys'][0] == ['person', ['name']],
           'the records around them read as without the control lines')

print('-- placeholder errors')
check_that(get_problems(broken) == [(3, 'error', 'The section {{#items}} stays open - add {{/items}}'),
                                    (5, 'error', '{{/people}} is a stray end tag - remove it or add {{#people}} before it')],
           f'a section left open and a stray end tag at the line of their tag ({get_problems(broken)})')

print('-- code view')
check_that(get_plain_text(order['highlighted']) == ORDER, 'mustache: the highlighted text is the code')
check_that('class="tp"' not in order['highlighted'] and order['highlighted'] == order['plainHighlighted'] and len(order['tags']) == 18,
           f'mustache: the 18 tags have no color of their own, the highlighting is the plain SHLS highlighting')
check_that(order_off['highlighted'] == order_off['plainHighlighted'], 'option off: the plain SHLS highlighting')

print('-- edits of the records view')
for step, code in zip(EDITS[:5], edited['edited']):
    check_that(get_control_lines(code) == get_control_lines(ORDER), f'{step[0]}: every control line stays as written')
models = run_report([{'code': code, 'template': 'mustache'} for code in edited['edited']])
for step, model in zip(EDITS, models):
    check_that(get_problems(model) == [], f'{step[0]} {step[1:]}: the edited template has 0 problems ({get_problems(model)})')
fifth = edited['edited'][4]
check_that(' 1 Main Street' in fifth and ' {{name}}' in fifth and '  {{label}}' in fifth and fifth.count('{{quantity}}') == 2,
           'the edited value is changed, every other tag stays as written')
check_that(edited['edited'][-1].startswith('{{#hasCustomer}}\n{{/hasCustomer}}\norder\n'), 'removing a section keeps its control lines')
check_that(order['editsWhole'] == [False, True] and order_off['editsWhole'] == [True],
           'an edit that leaves a section open is held back with the option, any edit passes with the option off')
check_that(guarded['editsWhole'] == [False], 'an edit that trades a placeholder error for a new one is held back')
total = edited['edited'][7].split('\n')
check_that(total[total.index('  {{/items}}') + 1] == ' -', 'a key added after a nested key gets its value after the section of the nested list')

print('-- indentation unit and large templates')
check_that(get_problems(unit) == [], f'a control line is passed over when the indentation unit is found ({get_problems(unit)})')
started = time.monotonic()
large_keys, large_errors = run_report([{'code': LARGE_KEYS, 'template': 'mustache'}, {'code': LARGE_ERRORS, 'template': 'mustache'}])
seconds = time.monotonic() - started
check_that(large_keys['keys'][0] == ['person', ['name', 'city']] and len(large_keys['problems']) == 8000 and len(large_errors['problems']) == 8000,
           'a run of 8000 control lines in a key block is 8000 errors, the key block stays whole; 8000 placeholder errors are listed')
check_that(seconds < 5, f'both are read quickly ({seconds:.1f} s)')

print('-- option off')
check_that(order_off['isSameAsPlainModel'] and 'control' not in order_off['roles'], 'option off: the model is the plain one of shls.js')
check_that(order['hasTags'] and not order_off['hasTags'], 'the document holds tags only with the option')

print('-- example view')
ITEMS = {'name': 'items', 'kind': 'list', 'label': 'Items',
         'fields': [{'name': 'label', 'label': 'Item'}, {'name': 'quantity', 'label': 'Quantity'}],
         'rows': [{'label': 'Chair', 'quantity': '2'}, {'label': 'Table', 'quantity': '1'}]}
EXAMPLES = {'placeholders': [
    {'name': 'hasCustomer', 'kind': 'section', 'label': 'With a customer', 'shown': True},
    {'name': 'name', 'kind': 'value', 'label': 'Name', 'example': 'John Doe'},
    {'name': 'street', 'kind': 'value', 'label': 'Street', 'example': '1 Main Street'},
    {'name': 'postalCode', 'kind': 'value', 'label': 'Postal code', 'example': '8000'},
    {'name': 'city', 'kind': 'value', 'label': 'City', 'example': 'Springfield'},
    {'name': 'orders', 'kind': 'list', 'label': 'Orders', 'fields': [{'name': 'number', 'label': 'Number'}, ITEMS],
     'rows': [{'number': '1001'}, {'number': '1002'}]},
    {'name': 'hasNote', 'kind': 'section', 'label': 'With a note', 'shown': False},
    {'name': 'note', 'kind': 'value', 'label': 'Note', 'example': 'Leave it at the door'},
]}
ORDER_LINES = ORDER.split('\n')
ORDERED_ITEMS = [{'label': 'Chair', 'quantity': '2'}, {'label': 'Table', 'quantity': '1'}]
SPACES = {'placeholders': [
    {'name': 'name', 'kind': 'value', 'label': 'Name', 'example': '  John\nDoe  '},
    {'name': 'street', 'kind': 'value', 'label': 'Street', 'example': '{{#hasNote}} 1 Main Street'},
    {'name': 'postalCode', 'kind': 'value', 'label': 'Postal code', 'example': ''},
    {'name': 'city', 'kind': 'value', 'label': 'City'},
    {'name': 'hasNote', 'kind': 'section', 'label': 'With a note', 'shown': True},
]}
DEEP = ''.join('{{#s%d}}\n' % depth for depth in range(40)) + 'person\n name\n\n John Doe\n' + ''.join('{{/s%d}}\n' % depth for depth in reversed(range(40)))
ANGLE_EXAMPLES = {'placeholders': [{'name': 'number', 'kind': 'value', 'label': 'Number', 'example': '1001'}]}
filled, spaces, no_page, deep, angle_filled = [result['example'] for result in run_report([
    {'code': ORDER, 'template': 'mustache', 'examples': EXAMPLES, 'templateLinesAsked': [ORDER_LINES.index(' Order {{number}}'), ORDER_LINES.index(' {{note}}')]},
    {'code': ORDER, 'template': 'mustache', 'examples': SPACES},
    {'code': ORDER, 'template': 'mustache', 'examples': None},
    {'code': DEEP, 'template': 'mustache', 'examples': None},
    {'code': ANGLE, 'template': 'angle', 'examples': ANGLE_EXAMPLES}])]
check_that(filled['data'] == {'customer': [{'name': 'John Doe', 'street': '1 Main Street', 'postalCode': '8000', 'city': 'Springfield'}],
                              'order': [{'number': 'Order 1001', 'items': ORDERED_ITEMS}, {'number': 'Order 1002', 'items': ORDERED_ITEMS}],
                              'note': [{'text': 'No note'}]} and filled['problems'] == [] and not filled['modelError'],
           'the records of the filled document: values, a list once per example row (nested lists too), a hidden section and its inverted section')
check_that('{{' not in filled['text'], 'no tag is left in the example view')
view_lines = filled['text'].split('\n')
second_order = view_lines.index(' Order 1002')
check_that(ORDER_LINES[filled['templateLines'][second_order]] == ' Order {{number}}' and ORDER_LINES[filled['templateLines'][view_lines.index('  Table')]] == '  {{label}}',
           'a line of a list row leads to the template line it comes from')
check_that(filled['viewLines'][0] == view_lines.index(' Order 1001') and ORDER_LINES[filled['templateLines'][filled['viewLines'][1]]] == '',
           'a template line finds its first line in the view; a line of a hidden section finds the line above it')
copied = {line: filled['copied'][index] for index, line in enumerate(view_lines) if line.strip()}
check_that(copied[' name'] and copied[' No note'] and copied[' items'] and not copied[' John Doe'] and not copied[' Order 1002'] and not copied['  Chair'],
           'lines of copied template text may be changed, lines with an example may not')
check_that(spaces['data']['customer'] == [{'name': 'John Doe', 'street': '{{#hasNote}} 1 Main Street', 'postalCode': '-', 'city': '[City]'}] and spaces['problems'] == [],
           'a fill is one line without leading spaces, an empty fill on its own line is "-", text of an example that looks like a tag stays a value, no example shows the label')
check_that(no_page['data']['customer'] == [{'name': '[name]', 'street': '[street]', 'postalCode': '[postalCode]', 'city': '[city]'}]
           and no_page['data']['note'] == [{'text': '[note]'}] and len(no_page['data']['order']) == 1,
           'without examples: names in brackets, sections shown once, inverted sections hidden, a list once')
EMPTY = {'placeholders': [{'name': name, 'kind': 'value', 'label': name, 'example': ''} for name in ('x', 'a', 'b')]
         + [{'name': 'show', 'kind': 'section', 'label': 'Show', 'shown': False}]}
kept_indent, empty_pair, partial = [result['example'] for result in run_report([
    {'code': 'S\n A\n\n {{x}} literal\n', 'template': 'mustache', 'examples': EMPTY},
    {'code': 'S\n A\n B\n\n {{a}}{{b}}\n x\n', 'template': 'mustache', 'examples': EMPTY},
    {'code': 'S\n A\n\n {{#show}}prefix {{/show}}tail\n', 'template': 'mustache', 'examples': EMPTY}])]
check_that(kept_indent['data'] == {'S': [{'A': '\u2060 literal'}]} and kept_indent['problems'] == [],
           'an empty fill at the start of a line keeps the space after it out of the indentation (a word joiner stands in)')
check_that(empty_pair['data'] == {'S': [{'A': '-', 'B': 'x'}]}, 'two empty fills that would leave a blank line give "-", the values after it keep their keys')
check_that(partial['data'] == {'S': [{'A': 'tail'}]} and partial['copied'][partial['text'].split('\n').index(' tail')] is False,
           'a line that shows only part of its template line (a hidden section in it) may not be changed')
check_that(deep == {'error': 'TemplateExpansionError'}, f'sections standing too deep stop the filling ({deep})')
check_that(angle_filled['data']['order'][0]['number'] == 'Order 1001' and '<<' not in angle_filled['text'], 'the syntax "angle" fills the same way')


URL = os.environ.get('EDITOR_URL', 'http://127.0.0.1:8106/')
HOOK = 'shlsEditor'
PREFIX = HOOK.lower()
EXAMPLE_EDIT_MESSAGE = 'This part shows an example - change it in the template view or in the code'
HOST = """<!doctype html><meta charset="utf-8"><body style="margin:0">
<iframe id="ed" src="%s" style="width:1200px;height:800px;border:0"></iframe>
<script>
window.msgs = [];
addEventListener('message', e => { if (e.data && typeof e.data.type === 'string') msgs.push(e.data); });
window.send = m => document.getElementById('ed').contentWindow.postMessage(m, '*');
</script>"""
# Records the records view and the "Placeholders" box at every frame of the editor's page.
FRAME_RECORDER = """(() => { if (!location.href.startsWith(%s)) return; window.frameRows = [];
  const tick = () => { const tree = document.querySelector('#tree'), box = document.querySelector('#placeholder-box');
    if (tree && box) { const text = tree.innerText;
      const row = [document.documentElement.classList.contains('translate'), text.includes('Order'), text.includes('John Doe'), text.includes('[name]'),
        box.querySelector('[data-placeholder-toggle] > span:not([data-placeholder-count])').textContent, box.querySelector('.placeholder-label')?.textContent || ''].join('|');
      if (frameRows[frameRows.length - 1] !== row) frameRows.push(row); }
    requestAnimationFrame(tick); };
  requestAnimationFrame(tick); })();"""


def open_hosted_editor(browser, query, record=False):
    """Opens the editor inside a page around it (on another origin) and waits for its ready message.

    Args:
        browser (Browser): the browser.
        query (str): the editor's address parameters after ?embed=1, e.g. "&lang=en&template=mustache".
        record (bool): True to record the records view and the box at every frame (FRAME_RECORDER).

    Returns:
        tuple: the browser context and the page around the editor.
    """
    context = browser.new_context(viewport={'width': 1400, 'height': 900})
    if record:
        context.add_init_script(FRAME_RECORDER % json.dumps(URL))
    page = context.new_page()
    page.route('http://localhost:8199/**', lambda route: route.fulfill(status=200, content_type='text/html', body=HOST % (URL + '?embed=1' + query)))
    page.goto('http://localhost:8199/', wait_until='load')
    page.wait_for_function(f"msgs.some(m => m.type === '{PREFIX}:ready')", timeout=15000)
    return context, page


def send_and_wait(page, message, answer):
    """Sends a message to the editor and waits for its answer of a type.

    Args:
        page (Page): the page around the editor.
        message (dict): the message.
        answer (str): the type of the answer without the prefix, e.g. "loaded".

    Returns:
        dict: the answer.
    """
    page.evaluate('m => { msgs.length = 0; send(m); }', message)
    page.wait_for_function(f"msgs.some(m => m.type === '{PREFIX}:{answer}')", timeout=15000)
    return page.evaluate(f"msgs.find(m => m.type === '{PREFIX}:{answer}')")


def get_box(frame, selector):
    """Returns the place and size of an element.

    Args:
        frame (Frame): the editor's frame.
        selector (str): the element's selector.

    Returns:
        dict: x, y, width and height, rounded.
    """
    return frame.evaluate("s => { const r = document.querySelector(s).getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height) }; }", selector)


def get_code_selection(frame):
    """Returns the text selected in the code.

    Args:
        frame (Frame): the editor's frame.

    Returns:
        str: the selected text.
    """
    return frame.evaluate('() => { const ta = document.querySelector("#code"); return ta.value.slice(ta.selectionStart, ta.selectionEnd); }')


def run_first_paint_checks(browser, mode):
    """Checks frame by frame that the examples a page sends before the first drawing are shown from
    the first frame that shows the document, with the box's header in the interface language.

    Args:
        browser (Browser): the browser.
        mode (str): "field" (the template comes with the load) or "before" (a template message before the load).

    Returns:
        None: the results are printed and failures are noted.
    """
    context, page = open_hosted_editor(browser, '&lang=de&template=mustache', record=True)
    frame = page.frames[1]
    load = {'type': f'{PREFIX}:load', 'name': 'Order', 'content': ORDER}
    if mode == 'field':
        load['template'] = EXAMPLES
    else:
        page.evaluate('m => send(m)', {'type': f'{PREFIX}:template', **EXAMPLES})
    send_and_wait(page, load, 'loaded')
    page.wait_for_timeout(600)
    rows = [row.split('|') for row in frame.evaluate('frameRows')]
    print('      frames (translating | document | examples | names in brackets | box header | first label):', ['|'.join(row) for row in rows])
    shown = [row for row in rows if row[0] == 'false' and row[1] == 'true']
    check_that(bool(shown) and all(row[2] == 'true' and row[3] == 'false' and row[5] == 'With a customer' for row in shown),
               f'{mode}: every frame that shows the document shows the examples and the page\'s list, never the document\'s own tags ({len(rows)} frames)')
    check_that(all(row[4] == 'Platzhalter' for row in rows if row[0] == 'false'), f'{mode}: the box\'s header is in the interface language from the first frame')
    context.close()


def run_view_checks(browser):
    """Checks the example view, the template view, the map back to the code, the "Placeholders" box
    and the side panel through a page around the editor that sends examples.

    Args:
        browser (Browser): the browser.

    Returns:
        None: the results are printed and failures are noted.
    """
    context, page = open_hosted_editor(browser, '&lang=en&template=mustache')
    frame = page.frames[1]
    send_and_wait(page, {'type': f'{PREFIX}:load', 'name': 'Order', 'content': ORDER, 'template': EXAMPLES}, 'loaded')
    frame.wait_for_function("document.querySelector('#tree').innerText.includes('John Doe')", timeout=10000)
    frame.click('#tree-open')
    tree = frame.inner_text('#tree')
    check_that('{{' not in tree and 'Chair' in tree and 'Order 1002' in tree and 'No note' in tree, 'the example view is the default: the examples, the list rows, no tag')
    check_that(frame.locator('#hl .tp').count() == 0 and frame.inner_text('#hl').startswith(ORDER[:ORDER.index('{{name}}') + 8]), 'the code view shows the tags as written, without a color of their own')
    switch_before = [get_box(frame, '#view-switch [data-view-set=example]'), get_box(frame, '#view-switch [data-view-set=template]')]
    check_that(switch_before[0]['width'] == switch_before[1]['width'], f'the two buttons of the switch have one width: {switch_before}')
    frame.locator('#tree [data-edit=value]', has_text='John Doe').first.click()
    page.wait_for_timeout(200)
    check_that(frame.inner_text('#toast') == EXAMPLE_EDIT_MESSAGE and frame.locator('#tree input').count() == 0, 'a value with an example is read-only in the view, with a message')
    frame.locator('#tree .trow', has_text='Order 1002').first.click()
    page.wait_for_timeout(300)
    check_that(get_code_selection(frame).startswith('Order {{number}}'), f'a click on a row of a list selects the template\'s line in the code: {get_code_selection(frame)!r}')
    frame.locator('#tree [data-edit=value]', has_text='No note').first.click()
    page.wait_for_timeout(200)
    field = frame.locator('#tree input')
    check_that(field.count() == 1, 'a value of copied template text opens its field')
    if field.count():
        field.fill('No remark')
        field.press('Enter')
        page.wait_for_timeout(300)
    code = frame.evaluate(f'{HOOK}.state.code')
    check_that(code == ORDER.replace(' No note\n', ' No remark\n'), 'its change is made in the template')
    frame.evaluate(f'{HOOK}.undo()')
    frame.locator('#tree .trow', has_text='Order 1002').first.click()
    frame.fill('#tree-search', 'Chair')
    page.wait_for_timeout(400)
    hits_before = frame.inner_text('#tree-hits')
    frame.locator('#tree .trow', has_text='Order 1002').first.click()
    frame.click('#view-switch [data-view-set=template]')
    page.wait_for_timeout(300)
    check_that('{{name}}' in frame.inner_text('#tree') and 'John Doe' not in frame.inner_text('#tree'), 'the switch shows the template view with the tags')
    check_that('Order {{number}}' in frame.inner_text('#tree .trow.active'), f'the selection stays on its place of the template: {frame.inner_text("#tree .trow.active")!r}')
    check_that(hits_before == '1 / 2' and frame.inner_text('#tree-hits') == '0', f'the matches of the search follow the view ({hits_before} -> {frame.inner_text("#tree-hits")})')
    frame.fill('#tree-search', '')
    page.wait_for_timeout(300)
    switch_after = [get_box(frame, '#view-switch [data-view-set=example]'), get_box(frame, '#view-switch [data-view-set=template]')]
    check_that(switch_after == switch_before, 'the switch keeps its place and size')
    frame.click('#view-switch [data-view-set=example]')
    editor_before = get_box(frame, '.code-pane .editor')
    check_that(frame.locator('#placeholder-list').is_hidden() and frame.inner_text('[data-placeholder-count]') == str(len(EXAMPLES['placeholders'])), 'the "Placeholders" box is closed and counts the page\'s placeholders')
    frame.click('[data-placeholder-toggle]')
    check_that(frame.locator('#placeholder-list').is_visible() and get_box(frame, '.code-pane .editor') == editor_before, 'the box opens over the code without moving it')
    cursor = ORDER.index('No note')
    frame.evaluate('c => { const ta = document.querySelector("#code"); ta.focus(); ta.setSelectionRange(c, c + 7); }', cursor)
    frame.locator('.placeholder-entry', has_text='With a note').click()
    check_that(frame.evaluate(f'{HOOK}.state.code') == ORDER[:cursor] + '{{#hasNote}}No note{{/hasNote}}' + ORDER[cursor + 7:], 'a section goes around the selection')
    frame.evaluate(f'{HOOK}.undo()')
    check_that(frame.evaluate(f'{HOOK}.state.code') == ORDER, 'one undo step takes it back')
    check_that(send_and_wait(page, {'type': f'{PREFIX}:get'}, 'save')['content'] == ORDER, '"get" carries the template as written')
    panel_button = get_box(frame, '#btn-panel')
    work_before = get_box(frame, '.draw-pane')
    check_that(frame.evaluate("getComputedStyle(document.querySelector('#side-panel')).display") == 'none', 'the side panel is closed at the start')
    frame.click('#btn-panel')
    check_that(frame.evaluate("getComputedStyle(document.querySelector('#side-panel')).display") != 'none' and get_box(frame, '#btn-panel') == panel_button
               and get_box(frame, '.draw-pane') == work_before, 'its button opens it over the records view, and nothing moves')
    check_that(get_box(frame, '#side-panel')['y'] >= get_box(frame, '.tree-toolbar')['y'] + get_box(frame, '.tree-toolbar')['height'], 'the drawer starts below the bar of the records view')
    page.evaluate(f"() => {{ document.querySelector('#ed').contentWindow.postMessage({{ type: '{PREFIX}:template', clear: true }}, '*'); }}")
    frame.wait_for_function("document.querySelector('#tree').innerText.includes('[name]')", timeout=10000)
    frame.click('#tree-open')
    tree = frame.inner_text('#tree')
    check_that('[note]' in tree and 'No note' not in tree, 'clear ends the examples: names in brackets, a section shown once and its inverted section hidden')
    context.close()


def run_browser_checks():
    """Checks the option in the editor: the first frames, the views of the records, the box, the side
    panel and the option off.

    Returns:
        None: the results are printed and failures are noted.
    """
    from playwright.sync_api import sync_playwright
    with sync_playwright() as pw:
        # The page around the editor is served by the browser itself; these flags let it frame the local editor.
        browser = pw.chromium.launch(channel='chrome', headless=True, args=['--disable-features=LocalNetworkAccessChecks,BlockInsecurePrivateNetworkRequests,PrivateNetworkAccessSendPreflights'])
        print('-- browser')
        run_first_paint_checks(browser, 'field')
        run_first_paint_checks(browser, 'before')
        run_view_checks(browser)
        page = browser.new_page(viewport={'width': 1400, 'height': 900})
        page.goto(URL + '?lang=en', wait_until='networkidle')
        page.evaluate('t => %s.setCode(t)' % HOOK, ORDER)
        page.wait_for_timeout(500)
        check_that(page.locator('#hl .tp').count() == 0 and '{{name}}' in page.inner_text('#tree'), 'option off: the tags are SHLS text in the records')
        check_that(page.locator('#view-switch').is_hidden() and page.locator('#placeholder-box').is_hidden() and page.locator('#view-note').is_hidden(), 'option off: no switch, no box, no note')
        check_that(page.evaluate("getComputedStyle(document.querySelector('#side-panel')).display") == 'none', 'option off: the side panel is a closed drawer as well')
        page.close()
        browser.close()


if '--browser' in sys.argv:
    run_browser_checks()

print(f'\n{len(failed)} failed' if failed else '\nall passed')
sys.exit(1 if failed else 0)
