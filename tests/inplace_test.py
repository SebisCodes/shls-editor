"""Editing in place in the records view: a click on a value, a key or a
section name opens a field; Enter writes the change into the code (only
that line changes, one undo step), Escape cancels. The buttons above the
view add, duplicate, move and remove records and keys; the records follow
their key block (also in nested lists).

    php -S 127.0.0.1:8106 -t src src/php/router.php          (in the project folder)
    python tests/inplace_test.py
"""
import os
import sys

from playwright.sync_api import sync_playwright

EDITOR = os.environ.get('EDITOR_URL', 'http://127.0.0.1:8106/')
HOOK = 'shlsEditor'
CODE = '''Team
 Name
 Role
 Skills
  Skill
  Level

 Ada
 Lead
 Skills
  math
  5

  code
  4

 Grace
 Dev
 Skills
  cobol
  5

Office
 City

 Zürich
'''
failed = []


def check_that(ok, text):
    """Prints one result line and notes a failure.

    Args:
        ok (bool): True when the check holds.
        text (str): what is checked.

    Returns:
        None: the result is printed and a failure is noted.
    """
    print(('ok    ' if ok else 'FAIL  ') + text)
    if not ok:
        failed.append(text)


with sync_playwright() as pw:
    browser = pw.chromium.launch(channel='chrome', headless=True)
    page = browser.new_page(viewport={'width': 1440, 'height': 900})
    errors = []
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.goto(EDITOR + '?lang=en', wait_until='networkidle')
    page.wait_for_timeout(800)
    page.evaluate('c => %s.setCode(c)' % HOOK, CODE)
    page.wait_for_timeout(300)
    code = lambda: page.evaluate('%s.state.code' % HOOK)
    history = lambda: page.evaluate('%s.state.history.length' % HOOK)
    probs = lambda: page.evaluate('%s.state.problems.length' % HOOK)
    edit = page.locator('#tree .trow-edit')
    value = lambda key, v: page.locator('#tree .trow-field', has=page.locator('.trow-v', has_text=v)).filter(has=page.locator('.trow-k', has_text=key)).first
    key = lambda name: page.locator('#tree .trow.trow-key', has=page.locator('.trow-k', has_text=name)).first
    record = lambda i: page.locator('#tree .trow.trow-record').nth(i)
    undo = lambda: (page.click('#btn-undo'), page.wait_for_timeout(250))

    # A value
    value('Role', 'Lead').locator('.trow-v').click()
    page.wait_for_timeout(150)
    check_that(edit.count() == 1 and edit.input_value() == 'Lead', 'a click on a value opens a field with the value')
    sel = page.evaluate('() => { const t = document.querySelector("#code"); return t.value.slice(t.selectionStart, t.selectionEnd); }')
    check_that(sel == 'Lead', 'the click also selects the value in the code')
    n = history()
    edit.fill('Head of «Research»')
    edit.press('Enter')
    page.wait_for_timeout(300)
    check_that(code() == CODE.replace(' Lead\n', ' Head of «Research»\n'), 'Enter writes the value into its line, nothing else changes')
    check_that(history() == n + 1, 'one undo step')
    undo()
    check_that(code() == CODE, 'Undo takes it back')
    value('Level', '4').locator('.trow-v').click()
    edit.fill('3')
    edit.press('Escape')
    page.wait_for_timeout(200)
    check_that(code() == CODE and edit.count() == 0, 'Escape cancels')
    value('Skill', 'cobol').locator('.trow-v').click()
    edit.fill('   cobol, fortran   ')
    edit.press('Enter')
    page.wait_for_timeout(300)
    check_that('\n  cobol, fortran\n' in code() and 'Spaces around the value were removed' in page.inner_text('#toast'), 'spaces around a value are removed (SHLS values cannot start with spaces)')
    undo()
    value('City', 'Zürich').locator('.trow-v').click()
    edit.fill('')
    edit.press('Enter')
    page.wait_for_timeout(300)
    check_that(code() == CODE and 'no empty values' in page.inner_text('#toast'), 'an empty value is refused (a blank line would be skipped)')
    edit.press('Escape')
    page.wait_for_timeout(150)

    # A key: only the key block changes; a section name: all its section lines
    key('Role').locator('.trow-k').click()
    page.wait_for_timeout(150)
    edit.fill('Position')
    edit.press('Enter')
    page.wait_for_timeout(300)
    check_that(code() == CODE.replace(' Role\n', ' Position\n'), 'renaming a key changes only the key block')
    undo()
    page.locator('#tree .trow-section', has_text='Office').locator('.trow-sec').click()
    page.wait_for_timeout(150)
    page.locator('#tree .trow-section', has_text='Office').locator('.trow-sec').click()
    page.wait_for_timeout(150)
    edit.fill('Site')
    edit.press('Enter')
    page.wait_for_timeout(300)
    check_that(code() == CODE.replace('Office\n', 'Site\n'), 'renaming a section changes its section line')
    undo()

    # Records: add, duplicate, move, remove
    record(0).locator('.trow-rec').click()
    page.wait_for_timeout(150)
    n = history()
    page.click('#node-add')
    page.wait_for_timeout(300)
    check_that(' Lead\n Skills\n  math\n  5\n\n  code\n  4\n\n -\n -\n Skills\n  -\n  -\n\n Grace' in code() and history() == n + 1, 'Add: a new record after the selected one, "-" for each value and one nested record, one undo step')
    check_that(probs() == 0 and page.evaluate('%s.state.model.data.get("Team").length' % HOOK) == 3, 'and it reads as a third record')
    undo()
    record(0).locator('.trow-rec').click()
    page.click('#node-dup')
    page.wait_for_timeout(300)
    check_that(code().count(' Ada\n Lead\n') == 2 and probs() == 0, 'Duplicate copies the record with its nested records')
    undo()
    record(0).locator('.trow-rec').click()
    page.click('#node-down')
    page.wait_for_timeout(300)
    check_that(code().index(' Grace') < code().index(' Ada') and probs() == 0, 'Move down swaps the records (Alt+Down too)')
    check_that(page.inner_text('#path').replace('\n', '') == 'Team[1]', 'the moved record stays selected')
    undo()
    # a nested record
    page.locator('#tree .trow.trow-record', has=page.locator('.trow-preview, .trow-rec')).nth(2).locator('.trow-rec').click()
    page.wait_for_timeout(150)
    check_that(page.inner_text('#path').replace('\n', '') == 'Team[0].Skills[1]', 'a nested record is selected: ' + page.inner_text('#path').replace('\n', ''))
    page.click('#node-up')
    page.wait_for_timeout(300)
    check_that('  code\n  4\n\n  math\n  5\n' in code(), 'a nested record moves up inside its list')
    undo()
    page.locator('#tree .trow.trow-record').nth(3).locator('.trow-rec').click()
    page.wait_for_timeout(150)
    check_that(page.inner_text('#path').replace('\n', '') == 'Team[1]', 'Grace is selected')
    page.click('#node-del')
    page.wait_for_timeout(300)
    check_that(' Grace' not in code() and probs() == 0 and page.evaluate('%s.state.model.data.get("Team").length' % HOOK) == 1, 'Remove takes the record and its blank line out')
    undo()
    # the only record of a nested list: the list stays, empty
    value('Skill', 'cobol').locator('.trow-k').click()
    page.click('#node-del')
    page.wait_for_timeout(300)
    check_that(' Skills\n\nOffice' in code() and probs() == 0 and page.evaluate('%s.state.model.data.get("Team")[1].get("Skills").length' % HOOK) == 0, 'the only record of a nested list is removed, the list stays empty')
    undo()
    check_that(code() == CODE, 'Undo brings it back')

    # Keys: the records follow
    key('Role').locator('.trow-k').click()
    page.wait_for_timeout(150)
    edit.press('Escape')
    page.wait_for_timeout(150)
    n = history()
    page.click('#node-add')
    page.wait_for_timeout(300)
    c = code()
    check_that(' Role\n Key\n Skills\n' in c and ' Lead\n -\n Skills\n' in c and ' Dev\n -\n Skills\n' in c and history() == n + 1, 'a new key gets "-" in every record, one undo step')
    check_that(probs() == 0 and page.evaluate('%s.state.model.data.get("Team")[1].get("Key")' % HOOK) == '-', 'and the data reads right')
    check_that(edit.count() == 0 and page.text_content('#path') == 'Team (keys) Key', 'the new key is selected: ' + page.text_content('#path') + str(edit.count()))
    undo()
    key('Level').locator('.trow-k').click()
    edit.press('Escape')
    page.click('#node-up')
    page.wait_for_timeout(300)
    c = code()
    check_that(' Skills\n  Level\n  Skill\n' in c and '  5\n  math\n\n  4\n  code\n' in c and '  5\n  cobol\n' in c, 'moving a nested key moves its values in every nested record')
    undo()
    key('Name').locator('.trow-k').click()
    edit.press('Escape')
    page.click('#node-dup')
    page.wait_for_timeout(300)
    c = code()
    check_that(' Name\n Name 2\n Role\n' in c and ' Ada\n Ada\n Lead\n' in c and ' Grace\n Grace\n Dev\n' in c, 'duplicating a key copies its values in every record')
    undo()
    key('Skills').locator('.trow-k').click()
    edit.press('Escape')
    page.click('#node-del')
    page.wait_for_timeout(300)
    check_that(page.locator('#ask').is_visible() and 'every record' in page.inner_text('#ask'), 'removing a key asks first')
    page.click('#ask-ok')
    page.wait_for_timeout(300)
    check_that(code() == 'Team\n Name\n Role\n\n Ada\n Lead\n\n Grace\n Dev\n\nOffice\n City\n\n Zürich\n', 'removing a nested key removes its lines from every record: ' + repr(code()))
    undo()
    check_that(code() == CODE, 'Undo brings everything back')

    # Keyboard: Enter edits, Delete removes
    value('Name', 'Grace').locator('.trow-k').click()
    page.wait_for_timeout(150)
    page.focus('#tree')
    page.keyboard.press('Enter')
    page.wait_for_timeout(150)
    check_that(edit.count() == 1 and edit.input_value() == 'Grace', 'Enter on a value opens its field')
    edit.press('Escape')
    check_that(not errors, 'no script errors' + (': ' + '; '.join(errors) if errors else ''))
    browser.close()

print()
print('all passed' if not failed else f'{len(failed)} failed')
sys.exit(1 if failed else 0)
