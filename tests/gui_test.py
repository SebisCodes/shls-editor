"""Browser test of the SHLS editor (Playwright, Google Chrome).

    php -S 127.0.0.1:8106 -t src src/php/router.php          (in the project folder)
    python tests/gui_test.py

Checks the records view (sections, key blocks, records, folding, path,
search), code <-> view, highlighting, problems with their line, the side
panel (record form, insert, convert with the token counter, outline),
templates, My documents, opening JSON / YAML / CSV / JSON Lines files,
AI links (also &mode=add), export, the phone layout and a template
(?template=mustache: control lines, the encoder rewrite kept back)."""

import base64
import os
import sys
import tempfile
import zlib

from playwright.sync_api import sync_playwright

URL = os.environ.get('EDITOR_URL', 'http://127.0.0.1:8106/')
HOOK = 'shlsEditor'
failures = []


def check_that(cond, what):
    """Prints one result line and notes a failure.

    Args:
        cond (bool): True when the check holds.
        what (str): what is checked.

    Returns:
        None: the result is printed and a failure is noted.
    """
    print(('ok    ' if cond else 'FAIL  ') + what)
    if not cond:
        failures.append(what)


def show_side_panel(page, is_open):
    """Opens or closes the side panel's column (it is closed at the start).

    Args:
        page (Page): the editor's page.
        is_open (bool): True to open it, False to close it.

    Returns:
        None: the side panel is open or closed.
    """
    button = page.locator('#btn-panel')
    if button.count() and button.is_visible() and (button.get_attribute('aria-expanded') == 'true') != is_open:
        button.click()


def set_code(page, text):
    """Sets the editor's code through the test hook and waits for the view.

    Args:
        page (Page): the editor page.
        text (str): the SHLS code.

    Returns:
        None: the editor holds the code.
    """
    page.evaluate('t => %s.setCode(t)' % HOOK, text)
    page.wait_for_timeout(300)


def get_state(page, expr):
    """Returns a value of the editor state.

    Args:
        page (Page): the editor page.
        expr (str): a JavaScript expression over S, the editor state.

    Returns:
        Any: the value of the expression.
    """
    return page.evaluate(f'() => {{ const S = {HOOK}.state; return {expr}; }}')


def get_code_selection(page):
    """Returns the text selected in the code field.

    Args:
        page (Page): the editor page.

    Returns:
        str: the selected text, empty when nothing is selected.
    """
    return page.evaluate('() => { const t = document.querySelector("#code"); return t.value.slice(t.selectionStart, t.selectionEnd); }')


def set_cursor(page, text, offset=1):
    """Puts the code cursor into a text of the code and waits for the view to follow.

    Args:
        page (Page): the editor page.
        text (str): a text of the code; the cursor goes into its first occurrence.
        offset (int): the characters after the start of the text.

    Returns:
        None: the cursor is placed.
    """
    page.evaluate('([s, o]) => { const t = document.querySelector("#code"); const i = t.value.indexOf(s); t.focus(); t.setSelectionRange(i + o, i + o); }', [text, offset])
    page.wait_for_timeout(400)


def get_field_row(page, key, value):
    """Returns the first row of the records view that shows a key with a value.

    Args:
        page (Page): the editor page.
        key (str): the text of the key.
        value (str): the text of the value.

    Returns:
        Locator: the row.
    """
    return page.locator('#tree .trow-field', has=page.locator('.trow-v', has_text=value)).filter(has=page.locator('.trow-k', has_text=key)).first


with sync_playwright() as pw:
    browser = pw.chromium.launch(channel='chrome', headless=True)
    ctx = browser.new_context(viewport={'width': 1440, 'height': 900}, accept_downloads=True)
    ctx.grant_permissions(['clipboard-read', 'clipboard-write'])
    page = ctx.new_page()
    errors = []
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.goto(URL + '?lang=en', wait_until='networkidle')
    page.wait_for_timeout(800)

    # --- First visit: the welcome example (the first README example) ---
    check_that(get_state(page, 'S.name') == 'Welcome', 'the first visit opens the welcome example')
    check_that(get_state(page, 'S.problems.length') == 0, 'the example has no problems')
    secs = page.locator('#tree .trow-section')
    check_that(secs.count() == 2 and 'Product' in secs.nth(0).inner_text() and '3 records · 5 keys' in secs.nth(0).inner_text(), 'the view shows each section with its records and keys')
    check_that(page.locator('#tree .trow.trow-key').count() == 5 + 4 + 2 and page.locator('#tree .trow-record').count() == 3 + 2 + 4, 'key blocks as trees, records with nested records: ' + str(page.locator('#tree .trow.trow-key').count()) + ' keys, ' + str(page.locator('#tree .trow-record').count()) + ' records')
    check_that(get_field_row(page, 'City', 'Zürich').count() == 1, 'nested records show their keys as labels')

    # --- Highlighting ---
    check_that(page.locator('#hl .sec').first.inner_text() == 'Product' and page.locator('#hl .key').count() == 11, 'code: section names and keys are highlighted')
    check_that(page.locator('#hl .ph').count() == 2 and page.locator('#hl .ig').count() > 40, 'code: PH placeholders and indentation guides')

    # --- Folding ---
    n = page.locator('#tree .trow').count()
    page.locator('#tree .trow-record').first.locator('.trow-toggle').click()
    page.wait_for_timeout(150)
    check_that(page.locator('#tree .trow').count() == n - 5, 'a click on the arrow folds a record')
    check_that('Smartphone A1 · Electronics · 599.99' in page.locator('#tree .trow-record').first.inner_text(), 'a folded record shows its first values')
    page.click('#tree-close')
    page.wait_for_timeout(150)
    check_that(page.locator('#tree .trow').count() == 2 + 2 + 5, 'Fold folds the key blocks and records: ' + str(page.locator('#tree .trow').count()))
    page.click('#tree-open')
    page.wait_for_timeout(150)
    check_that(page.locator('#tree .trow').count() == n, 'Unfold shows everything again')

    # --- View -> code, code -> view, path ---
    get_field_row(page, 'Price', '1299.99').locator('.trow-k').click()
    page.wait_for_timeout(200)
    check_that(get_code_selection(page) == '1299.99', 'a click on a value selects its line in the code')
    check_that(page.inner_text('#path').replace('\n', '') == 'Product[1].Price', 'the path of the value: ' + page.inner_text('#path').replace('\n', ''))
    page.locator('#tree .trow-record').nth(2).locator('.trow-rec').click()
    page.wait_for_timeout(200)
    check_that(get_code_selection(page).startswith('Table X5') and get_code_selection(page).endswith('2021-11-12'), 'a click on a record selects its lines')
    set_cursor(page, 'San Francisco', 2)
    check_that('San Francisco' in page.locator('#tree .trow.active').inner_text() and page.inner_text('#path').replace('\n', '') == 'Company[0].Location[0].City', 'the code cursor marks its value in the view: ' + page.inner_text('#path').replace('\n', ''))
    set_cursor(page, ' Country', 2)
    check_that(page.locator('#tree .trow.active').get_attribute('class').find('trow-key') >= 0 and 'Company (keys) Location.Country' == page.text_content('#path'), 'a key in the key block marks the key: ' + page.text_content('#path'))
    page.locator('#path [data-depth="0"]').click()
    page.wait_for_timeout(150)
    check_that('Company' in page.locator('#tree .trow.active').inner_text(), 'a part of the path selects that place')
    page.click('#path-copy')
    page.wait_for_timeout(150)
    check_that(page.evaluate('navigator.clipboard.readText()') == 'Company', 'Copy path copies it')

    # --- Search ---
    page.fill('#tree-search', 'electronics')
    page.wait_for_timeout(400)
    check_that(page.inner_text('#tree-hits') == '1 / 2' and page.locator('#tree .trow.hit').count() == 2, 'search finds values (case does not matter): ' + page.inner_text('#tree-hits'))
    page.press('#tree-search', 'Enter')
    page.wait_for_timeout(200)
    check_that(page.inner_text('#tree-hits') == '2 / 2' and page.inner_text('#path').replace('\n', '') == 'Product[1].Category', 'Enter goes to the next match')
    page.fill('#tree-search', '')
    page.wait_for_timeout(300)

    # --- Record form in the side panel ---
    check_that(page.locator('#side-panel').is_hidden() and page.get_attribute('#btn-panel', 'aria-expanded') == 'false', 'the side panel is closed at the start')
    show_side_panel(page, True)
    get_field_row(page, 'Name', 'Laptop B2').locator('.trow-k').click()
    page.wait_for_timeout(200)
    check_that(page.locator('#node-wrap input[data-f]').count() == 5 and page.locator('#node-wrap input.now').input_value() == 'Laptop B2', 'the side panel shows the record as a form')
    page.locator('#node-wrap input[data-f="2"]').fill('1199.00')
    page.locator('#node-wrap input[data-f="3"]').fill('true')
    hist = get_state(page, 'S.history.length')
    page.click('#n-apply')
    page.wait_for_timeout(300)
    check_that(' 1199.00\n true\n 2022-05-15' in get_state(page, 'S.code') and get_state(page, 'S.history.length') == hist + 1, 'Apply writes the changed values into the code, one undo step')
    page.click('#btn-undo')
    page.wait_for_timeout(200)
    check_that(' 1299.99\n false\n' in get_state(page, 'S.code'), 'Undo takes both back')

    # --- Problems with their line ---
    set_code(page, 'S\n a\n b\n c\n\n 1\n 2\n 3\n\n 4\n 5\n\n 7\n 8\n 9\n')
    msgs = get_state(page, 'S.problems.map(p => (p.line + 1) + ":" + p.msg)')
    check_that(any(m.startswith('14:') and '2 of 3 values' in m for m in msgs) and any(m.startswith('13:') and 'blank line inside a record' in m for m in msgs), 'a record with a value too few is found: ' + str(msgs))
    check_that('Line 13' in page.inner_text('#code-error'), 'problems are listed with their line')
    page.locator('#code-error [data-prob]').filter(has_text='missing in the data').first.click()
    check_that(page.evaluate('document.activeElement.id') == 'code' and get_code_selection(page) == ' 8', 'clicking a problem goes to its line')
    set_code(page, 'S\n  a\n   b\n\n  1\n  2\n')
    check_that(any('not a whole level' in p for p in get_state(page, 'S.problems.map(p => p.msg)')), 'indentation that is not a whole level')
    set_code(page, 'S\n Name\n Price\n Lamp\n 19.90\n')
    check_that(any('looks like a value' in p for p in get_state(page, 'S.problems.map(p => p.msg)')), 'a missing blank line after the key block (a value in the key block)')
    set_code(page, 'S\n a\n b\n\n\n 1\n 2\n')
    check_that(any('2 blank lines after the key block' in p for p in get_state(page, 'S.problems.map(p => p.msg)')), 'an extra blank line after the key block')
    set_code(page, 'S\n a\n a\n\n 1\n 2\n')
    check_that(any('twice in the key block' in p for p in get_state(page, 'S.problems.map(p => p.msg)')), 'a key twice')
    set_code(page, 'S\n a\n b\n \n 1\n   \n 2\n')
    check_that(get_state(page, 'S.problems.length') == 0 and page.evaluate('%s.codec.toJson(%s.state.model.data, 0)' % (HOOK, HOOK)) == '{"S":[{"a":"1","b":"2"}]}', 'a blank line with spaces is passed over like an empty one')
    set_code(page, 'S\n a\n L\n  x\n\n 1\n L\n')
    check_that(get_state(page, 'S.problems.length') == 0 and page.evaluate('%s.codec.toJson(%s.state.model.data, 0)' % (HOOK, HOOK)) == '{"S":[{"a":"1","L":[]}]}', 'a nested key at the end is an empty list')
    set_code(page, 'P\n a\n\n 1\n\nP\n 2\n')
    check_that(get_state(page, 'S.problems.length') == 0 and page.evaluate('%s.state.model.sections[0].records.length' % HOOK) == 2, 'the records of every data block of a section are kept')

    # --- Convert and tokens ---
    page.click('#btn-new')
    page.click('[data-new=example]')
    page.wait_for_timeout(300)
    check_that(get_state(page, 'S.name') == 'Example' and get_state(page, 'S.problems.length') == 0, 'New > Example.shls')
    page.click('[data-itab=convert]')
    page.wait_for_timeout(300)
    tok = page.inner_text('#cv-tokens')
    check_that('SHLS' in tok and 'fewer tokens' in tok, 'the token counter compares SHLS with JSON: ' + tok.replace('\n', ' '))
    out = page.input_value('#cv-out')
    check_that(out.startswith('{\n  "Company": [\n    {\n      "ID": "1001",') and '"Employees": [' in out, 'Convert to JSON as SHLSDecoder reads it')
    page.select_option('#cv-to', 'csv')
    page.select_option('#cv-sec', 'Financials')
    page.wait_for_timeout(200)
    check_that(page.input_value('#cv-out') == 'Year,Revenue,Expenses,NetProfit\n2021,5000000,3500000,1500000\n2022,5200000,3700000,1500000\n2023,5400000,3800000,1600000\n', 'Convert one section to CSV')
    page.select_option('#cv-to', 'jsonl')
    page.wait_for_timeout(200)
    check_that(page.input_value('#cv-out').split('\n')[0] == '{"Year":"2021","Revenue":"5000000","Expenses":"3500000","NetProfit":"1500000"}', 'Convert one section to JSON Lines')
    page.select_option('#cv-to', 'yaml')
    page.wait_for_timeout(200)
    check_that(page.input_value('#cv-out').startswith('Company:\n  - ID: "1001"\n    Name: Tech Solutions Inc.'), 'Convert to YAML: ' + repr(page.input_value('#cv-out')[:60]))
    page.click('[data-cv=format]')
    page.wait_for_timeout(300)
    code = get_state(page, 'S.code')
    check_that(code.startswith('Company\n ID\n') and '\nFinancials\n Year\n' in code and '\n\nCompany\n 1001\n' in code, 'Write as SHLSEncoder does: key blocks first, then the records')
    check_that(page.evaluate(f'() => {HOOK}.codec.toJson({HOOK}.state.model.data, 0)') == page.evaluate(f'() => {HOOK}.codec.toJson({HOOK}.codec.decode(document.querySelector("#code").value), 0)'), 'and it reads as the same data')
    page.click('#btn-undo')

    # --- Outline ---
    page.click('[data-itab=outline]')
    page.wait_for_timeout(200)
    check_that(page.locator('.outline li').count() == 2, 'the outline lists the sections')
    page.locator('.outline button', has_text='Financials').click()
    page.wait_for_timeout(200)
    check_that(get_code_selection(page) == 'Financials', 'a section in the outline goes to its line')
    set_code(page, 'First\n a\n\n 1\n\nSecond\n x\n y\n\n 1\n')
    page.wait_for_timeout(200)
    counts = page.evaluate('[...document.querySelectorAll(".outline li")].map(li => li.querySelector(".gl-prob")?.textContent || "")')
    check_that(counts == ['', '1 problem'], 'the outline counts a problem for its own section only: ' + str(counts))
    set_code(page, 'First\n a\n b\n\n 1\n 2\n\nSecond\n x\n\n 1\n\nFirst\n 1\n')
    page.wait_for_timeout(200)
    counts = page.evaluate('[...document.querySelectorAll(".outline li")].map(li => li.querySelector(".gl-prob")?.textContent || "")')
    check_that(counts == ['1 problem', ''], 'a section that occurs again counts the problems of all its parts: ' + str(counts))
    page.click('#btn-undo')
    page.click('#btn-undo')
    page.click('[data-itab=node]')
    show_side_panel(page, False)

    # --- Templates, My documents ---
    for k, name in [('readme2', 'Key blocks first'), ('example2', 'Example2'), ('section', 'Section'), ('readme1', 'Products and companies')]:
        page.click('#btn-new')
        page.click(f'[data-new={k}]')
        page.wait_for_timeout(200)
        check_that(get_state(page, 'S.name') == name and get_state(page, 'S.model.sections.length') >= 1 and not get_state(page, 'S.problems.filter(p => p.kind === "error").length'), f'New > {name}')
    check_that(get_state(page, 'S.model.sections.find(s => s.name === "Product").records.length') == 3, 'the README examples have their records')
    page.click('#btn-files')
    check_that(page.locator('#files-grid .file-card').count() >= 6, 'My documents lists the documents')
    page.locator('#files-grid .file-card', has_text='Welcome').locator('.file-open').click()
    check_that(get_state(page, 'S.name') == 'Welcome', 'a document opens from My documents')

    # --- Opening JSON, YAML, CSV and JSON Lines ---
    d = tempfile.mkdtemp()
    files = {
        'shop.json': '{"Product": [{"Name": "Lamp", "Price": 19.9, "Tags": [{"Tag": "home"}]}]}',
        'people.yaml': '- name: Ada\n  born: 1815\n- name: Grace\n  born: 1906\n',
        'prices.csv': 'item;price\nTea;"3.50"\nCake;4.2\n',
        'events.jsonl': '{"id": 1, "kind": "start"}\n{"id": 2, "kind": "stop"}\n',
    }
    for f, t in files.items():
        with open(os.path.join(d, f), 'w') as fh:
            fh.write(t)
    page.set_input_files('#file', [os.path.join(d, f) for f in files])
    page.wait_for_timeout(2500)
    docs = dict(page.evaluate(f'{HOOK}.store.list().map(f => [f.name, {HOOK}.store.code(f.id)])'))
    check_that(docs.get('shop') == 'Product\n Name\n Price\n Tags\n  Tag\n\nProduct\n Lamp\n 19.9\n Tags\n  home\n', 'a JSON file becomes SHLS as SHLSEncoder writes it: ' + repr(docs.get('shop')))
    check_that(docs.get('people', '').startswith('people\n name\n born\n\npeople\n Ada\n 1815\n'), 'a YAML file too')
    check_that(docs.get('prices') == 'prices\n item\n price\n\nprices\n Tea\n 3.50\n Cake\n 4.2\n', 'a CSV file too (";" found)')
    check_that(docs.get('events', '').startswith('events\n id\n kind\n\nevents\n 1\n start\n'), 'a JSON Lines file too')

    # --- AI links: a new document, mode=add appends records ---
    data = 'Note\n Text\n\n from the AI\n'
    z = base64.urlsafe_b64encode(zlib.compress(data.encode())).decode().rstrip('=')
    page.goto(URL + '#z=' + z + '&file=new&name=AI%20notes', wait_until='networkidle')
    page.wait_for_timeout(800)
    check_that(get_state(page, 'S.name') == 'AI notes' and get_state(page, 'S.code') == data, 'an AI link makes a new document')
    add = 'Note\n Text\n\n again\n\n and more\n\nOther\n Key\n\n v\n'
    link = 'https://shls.giit.ch/#b64=' + base64.urlsafe_b64encode(add.encode()).decode() + '&mode=add'
    answer = 'Here is the link:\n' + link[:40] + '\n' + link[40:] + '\nClick it.'
    page.click('#btn-ai')
    page.fill('#ai-paste', answer)
    page.wait_for_timeout(400)
    check_that(not page.locator('#ask').is_visible(), 'a link changes the document without a question')
    page.wait_for_timeout(400)
    check_that(get_state(page, 'S.code') == 'Note\n Text\n\n from the AI\n again\n and more\n\nOther\n Key\n\n v\n', 'mode=add appends the records and adds the new section: ' + repr(get_state(page, 'S.code')))
    page.goto(URL + '#shls=' + 'S%0A%20a%0A%0A%201%0A' + '&file=new&name=Plain', wait_until='networkidle')
    page.wait_for_timeout(600)
    check_that(get_state(page, 'S.code') == 'S\n a\n\n 1\n', '#shls= links work too')

    # --- Export ---
    page.click('#btn-new')
    page.click('[data-new=readme1]')
    page.wait_for_timeout(200)
    page.click('#btn-export')
    page.select_option('#ex-format', 'json')
    page.wait_for_timeout(200)
    check_that(page.input_value('#ex-text').startswith('{\n  "Product": [\n    {\n      "Name": "Smartphone A1"'), 'export: JSON')
    with page.expect_download() as dl:
        page.click('#ex-download')
    check_that(dl.value.suggested_filename == 'Products and companies 2.json' or dl.value.suggested_filename.endswith('.json'), 'export: .json download')
    page.select_option('#ex-format', 'txt')
    page.wait_for_timeout(200)
    check_that(page.input_value('#ex-text').startswith('Product (3 records)\n  Keys:\n    Name'), 'export: the records as plain text')
    page.select_option('#ex-format', 'csv')
    page.wait_for_timeout(200)
    check_that(page.input_value('#ex-text').startswith('Name,Category,Price,InStock,Released\nSmartphone A1,'), 'export: CSV of a section')
    with page.expect_download() as dl:
        page.click('#ex-zip')
    check_that(dl.value.suggested_filename.endswith('-all.zip'), 'export: all formats as ZIP')
    page.keyboard.press('Escape')
    with page.expect_download() as dl:
        page.click('#btn-download')
    check_that(dl.value.suggested_filename.endswith('.shls'), 'Download .shls')

    # --- Phone ---
    page.set_viewport_size({'width': 390, 'height': 800})
    page.wait_for_timeout(300)
    check_that(page.locator('.views').is_visible(), 'phone: Code / Records / Record tabs')
    check_that(page.evaluate('document.documentElement.scrollWidth') <= 391, 'phone: no sideways scrolling')
    page.click('[data-pane=code]')
    check_that(page.locator('#code').is_visible(), 'phone: the code view')

    # --- Template placeholders (?template=mustache) ---
    template = open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'order-template.shls'), encoding='utf-8').read()
    template_page = ctx.new_page()
    template_page.on('pageerror', lambda e: errors.append(str(e)))
    template_page.goto(URL + '?lang=en&template=mustache', wait_until='networkidle')
    template_page.wait_for_timeout(500)
    set_code(template_page, template)
    check_that(get_state(template_page, 'S.problems.length') == 0 and template_page.locator('#hl .tp').count() == 0 and '{{name}}' in template_page.inner_text('#hl'), 'template: no problems, the tags stand in the code as written, without a color of their own')
    check_that(get_state(template_page, 'S.model.sections.map(s => s.name)') == ['customer', 'order', 'note'], 'template: control lines are passed over by the reader')
    template_page.evaluate("document.querySelector('#btn-format').click()")
    template_page.wait_for_timeout(200)
    check_that(get_state(template_page, 'S.code') == template and 'A template stays as written' in template_page.inner_text('#toast'), 'template: the encoder rewrite keeps the template, with a message')
    set_code(template_page, 'person\n name\n{{#hasCity}}\n city\n{{/hasCity}}\n\n John Doe\n Springfield\n')
    check_that('A line of section tags belongs between complete records' in template_page.inner_text('#code-error'), 'template: a control line inside a key block is listed')
    set_code(page, template)
    check_that(page.locator('#hl .tp').count() == 0 and get_state(page, 'S.model.sections.length') > 3, 'option off: the tags are SHLS text')
    template_page.close()

    check_that(not errors, 'no script errors' + (': ' + '; '.join(errors) if errors else ''))
    browser.close()

print(f'\n{len(failures)} failed' if failures else '\nall passed')
sys.exit(1 if failures else 0)
