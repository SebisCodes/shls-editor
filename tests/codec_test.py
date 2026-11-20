"""The editor's SHLS reader and writer (src/js/shls.js) against the reference
SHLSDecoder and SHLSEncoder (Python) of the SHLS repository.

    php -S 127.0.0.1:8106 -t src src/php/router.php          (in the project folder)
    SHLS_SRC=<the SHLS repository> python tests/codec_test.py

Both sides read the same texts and write the same data; the results must be
identical (the same sections, records, keys in the same order, the same
values; the same text from the encoder byte for byte). Neither side may fail
or run forever on any text:

- tests/fixtures/Example.shls and Example2.shls (from the SHLS repository),
  the two examples of its README and the strings of its codec examples;
- texts with the unusual cases: blank lines with spaces, PH placeholders,
  repeated section lines, nested records with and without blank lines,
  records with a value too few or too many, a key named like a counter,
  nested keys and empty nested lists at the end of the text;
- about 50 random nested structures: encoded by both sides, the texts
  compared, then decoded by both sides and compared with the data (every
  value as a string, objects in records and plain values as records);
- the same encoded texts with random blank lines, lines with spaces,
  missing lines and repeated section lines, decoded by both sides."""

import importlib.util
import json
import os
import random
import re
import signal
import sys

from playwright.sync_api import sync_playwright

HERE = os.path.dirname(os.path.abspath(__file__))
EDITOR = os.environ.get('EDITOR_URL', 'http://127.0.0.1:8106/')
SRC = os.environ.get('SHLS_SRC', os.path.join(HERE, '..', '..', '..', 'SHLS-Sebis-Hierarchical-List-Structure'))
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


def import_reference_class(name):
    """Returns a reference class, imported from the SHLS repository by its path.

    Args:
        name (str): the class and file name (SHLSDecoder or SHLSEncoder).

    Returns:
        type: the class.
    """
    path = os.path.join(SRC, 'SHLS-Codec-Classes', name + '.py')
    spec = importlib.util.spec_from_file_location(name, path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return getattr(mod, name)


SHLSDecoder = import_reference_class('SHLSDecoder')
SHLSEncoder = import_reference_class('SHLSEncoder')


class Hang(Exception):
    """A reference call that runs longer than its time limit."""


def stop_hanging_call(signum, frame):
    """Stops a reference call at its time limit (the SIGALRM handler).

    Args:
        signum (int): the signal number.
        frame (FrameType): the frame that runs.

    Returns:
        None: it always raises.

    Raises:
        Hang: always.
    """
    raise Hang()


signal.signal(signal.SIGALRM, stop_hanging_call)


def read_with_reference(text):
    """Returns what the reference SHLSDecoder reads from a text, within one second.

    Args:
        text (str): the SHLS text.

    Returns:
        tuple[str, str]: ('ok', JSON with the order of the keys), ('hang', '') or ('error', the error type).
    """
    signal.setitimer(signal.ITIMER_REAL, 1.0)
    try:
        data = SHLSDecoder().decode(text)
        return ('ok', json.dumps(data, ensure_ascii=False, separators=(',', ':')))
    except Hang:
        return ('hang', '')
    except Exception as e:
        return ('error', type(e).__name__)
    finally:
        signal.setitimer(signal.ITIMER_REAL, 0)


def write_with_reference(obj):
    """Returns the text the reference SHLSEncoder writes for some data, within one second.

    Args:
        obj (dict): the data.

    Returns:
        str: the SHLS text.

    Raises:
        Hang: when the encoder runs longer than one second.
    """
    signal.setitimer(signal.ITIMER_REAL, 1.0)
    try:
        return SHLSEncoder().encode(json.loads(json.dumps(obj)))
    finally:
        signal.setitimer(signal.ITIMER_REAL, 0)


JS_DECODE = """texts => texts.map(t => {
  const C = shlsEditor.codec;
  try { return ['ok', C.toJson(C.decode(t), 0)]; }
  catch (e) { return [/never finishes/.test(e.message) ? 'hang' : 'error', e.message]; }
})"""
JS_ENCODE = """list => list.map(j => { const C = shlsEditor.codec; return C.encode(C.parseJson(j)); })"""


def get_normalized_json(js_json):
    """Returns the JSON from the browser written like Python's json.dumps (order kept).

    Args:
        js_json (str): the JSON from the browser.

    Returns:
        str: the same JSON as Python writes it.
    """
    return json.dumps(json.loads(js_json), ensure_ascii=False, separators=(',', ':'))


# ---------- The texts ----------

def get_readme_examples():
    """Returns the SHLS examples of the README of the SHLS repository.

    Returns:
        list[str]: the texts of its plaintext code blocks.
    """
    md = open(os.path.join(SRC, 'README.md'), encoding='utf-8').read()
    return re.findall(r'```plaintext\n(.*?)```', md, re.S)


def get_codec_example_strings():
    """Returns the SHLS strings of the decode examples of the SHLS repository.

    Returns:
        list[str]: the texts.
    """
    out = []
    folder = os.path.join(SRC, 'SHLS-Codec-Examples')
    for f in sorted(os.listdir(folder)):
        if f.startswith('DecodeExample') and f.endswith('.py'):
            out += re.findall(r'shls_string = """(.*?)"""', open(os.path.join(folder, f), encoding='utf-8').read(), re.S)
    return out


CASES = {
    'nested records without blank lines': 'A\n x\n y\n  p\n  q\n z\n\n 1\n Y\n  p1\n  q1\n  p2\n  q2\n 3\n 4\n Y\n  p3\n  q3\n 6\n',
    'nested records with blank lines': 'A\n x\n y\n  p\n  q\n z\n\n 1\n Y\n  p1\n  q1\n\n  p2\n  q2\n\n 3\n\n 4\n Y\n  p3\n  q3\n\n 6\n',
    'PH placeholders': 'C\n N\n L\n  Co\n  Ci\n\n T\n PH\n  USA\n  SF\n  USA\n  NY\n',
    'repeated section lines': 'P\n a\n b\n\nQ\n c\n\nP\n 1\n 2\n 3\n 4\n\nQ\n x\n\nP\n 9\n 8\n',
    'blank line with spaces after the key block': 'S\n a\n b\n \n 1\n 2\n 3\n 4\n',
    'blank line with spaces between records': 'S\n a\n b\n\n 1\n 2\n \n 3\n 4\n',
    'two blank lines after the key block': 'S\n a\n b\n\n\n 1\n 2\n',
    'a value too few': 'S\n a\n b\n c\n\n 1\n 2\n 3\n\n 4\n 5\n\n 7\n 8\n 9\n',
    'a value too many': 'S\n a\n b\n\n 1\n 2\n 3\n\n 4\n 5\n',
    'a nested key at the end': 'S\n a\n L\n  x\n\n 1\n L\n',
    'an empty nested list between records': 'S\n a\n L\n  x\n\n 1\n L\n\n 2\n L\n  y\n',
    'an empty nested list before blank lines': 'S\n L\n  x\n a\n\n L\n\n 1\n',
    'a blank line with spaces before nested records': 'S\n a\n L\n  x\n\n 1\n L\n  \n  y\n',
    'a value too few in a nested list': 'S\n a\n L\n  x\n  y\n b\n\n 1\n L\n  p\n  q\n  r\n 2\n',
    'keys named 0, 1 and 2': 'S\n 0\n 1\n 2\n\n a\n b\n c\n',
    'a key named like a counter': 'S\n 1\n 0\n  x\n\n a\n b\n  c\n',
    'two-space indentation': 'S\n  a\n  b\n    c\n\n  1\n  B\n    2\n    3\n',
    'indentation that is not a whole level': 'S\n a\n   b\n\n 1\n 2\n',
    'a tab in the indentation': 'S\n a\n\tb\n\n 1\n 2\n',
    'Windows line breaks': 'S\r\n a\r\n b\r\n\r\n 1\r\n 2\r\n',
    'text before the first section': ' x\nS\n a\n\n 1\n',
    'only a key block': 'S\n a\n b\n',
    'a section line twice in a row': 'S\nS\n a\n\n 1\n',
    'umlauts and symbols': 'Ort\n Name\n Preis\n\n Zürich «Altstadt»\n 12.50 CHF\n',
}

# ---------- Random structures ----------

WORDS = ['Name', 'City', 'Price', 'Tag', 'ID', 'Note', 'Color', 'Size', 'Owner', 'Year', 'Team', 'Item', 'Zürich', 'Ort', 'Datum', 'Role', 'x', 'Value']


def get_random_value(r):
    """Returns a random value: words, an integer, a float, a boolean or None.

    Args:
        r (random.Random): the random generator.

    Returns:
        Any: the value.
    """
    k = r.random()
    if k < 0.55:
        return ' '.join(r.choice(['alpha', 'beta', 'Gamma', 'delta 2', 'São Paulo', 'a-b', '7up', 'x/y', 'Ölberg', 'true', 'None'])
                        for _ in range(r.randint(1, 3)))
    if k < 0.7:
        return r.randint(-5000, 10 ** r.randint(1, 12))
    if k < 0.82:
        return r.choice([0.5, 1.0, 2.25, -3.75, 1e16, 1.5e-7, 123456.789, 100.0])
    if k < 0.92:
        return r.choice([True, False])
    return None


def get_random_records(r, keys, depth):
    """Returns one to three random records with the given keys.

    Args:
        r (random.Random): the random generator.
        keys (list): the keys; a tuple (name, keys) is a nested list.
        depth (int): the nesting level.

    Returns:
        list[dict]: the records.
    """
    out = []
    for _ in range(r.randint(1, 3)):
        rec = {}
        for k in keys:
            if isinstance(k, tuple):
                rec[k[0]] = get_random_records(r, k[1], depth + 1)
            else:
                rec[k] = get_random_value(r)
        out.append(rec)
    return out


def get_random_keys(r, depth):
    """Returns random keys, some of them nested lists with keys of their own.

    Args:
        r (random.Random): the random generator.
        depth (int): the nesting level; below level 3 a key may hold a nested list.

    Returns:
        list: names, and (name, keys) tuples for nested lists.
    """
    names = r.sample(WORDS, r.randint(1, 5))
    keys = []
    for n in names:
        if depth < 3 and r.random() < 0.25:
            keys.append((n + 's', get_random_keys(r, depth + 1)))
        else:
            keys.append(n)
    return keys


def get_random_structure(r):
    """Returns random data of one to three sections, sometimes with an extra value SHLS cannot keep.

    Args:
        r (random.Random): the random generator.

    Returns:
        dict: the sections with their records.
    """
    data = {}
    for s in r.sample(['Product', 'Company', 'Financials', 'Team', 'Orders', '2024', 'Data'], r.randint(1, 3)):
        data[s] = get_random_records(r, get_random_keys(r, 0), 0)
    if r.random() < 0.2:                         # an object, plain values, an empty value, a leading space
        sec = next(iter(data))
        extra = r.choice([{'k': 'v'}, ['p', 'q'], '', ' lead'])
        for rec in data[sec]:
            rec['Extra'] = extra
    return data


def get_python_text(v):
    """Returns a value as the decoder gives it back: Python's str().

    Args:
        v (Any): the value.

    Returns:
        str: the text.
    """
    return v if isinstance(v, str) else str(v)


def get_read_back_data(data):
    """Returns the data as SHLSDecoder reads back the encoder's text: lists of records, every value a string.

    Args:
        data (dict): the data given to the encoder.

    Returns:
        dict: the data as it reads back.
    """
    def get_records(items):
        """Returns items as records; a plain value becomes a record with the key Value.

        Args:
            items (list): the items.

        Returns:
            list[dict]: the records.
        """
        return [get_record(x if isinstance(x, dict) else {'Value': x}) for x in items]

    def get_record(d):
        """Returns a record with every value as it reads back.

        Args:
            d (dict): the record.

        Returns:
            dict: the record read back.
        """
        return {k: get_records(v) if isinstance(v, list) else get_records([v]) if isinstance(v, dict) else get_python_text(v) for k, v in d.items()}
    return {k: get_records(v if isinstance(v, list) else [v]) for k, v in data.items()}


def get_values(v):
    """Returns every plain value inside some data.

    Args:
        v (Any): the data.

    Returns:
        list: the values in order.
    """
    if isinstance(v, dict):
        return [x for y in v.values() for x in get_values(y)]
    if isinstance(v, list):
        return [x for y in v for x in get_values(y)]
    return [v]


def get_mutated_text(r, text):
    """Returns a text with one to three random changes: blank lines, lines with spaces, missing
    lines or repeated section lines.

    Args:
        r (random.Random): the random generator.
        text (str): the SHLS text.

    Returns:
        str: the changed text.
    """
    lines = text.split('\n')
    for _ in range(r.randint(1, 3)):
        i = r.randrange(1, len(lines)) if len(lines) > 1 else 0
        what = r.random()
        if what < 0.35:
            lines.insert(i, '')
        elif what < 0.55:
            lines.insert(i, ' ' * r.randint(1, 3))
        elif what < 0.8 and len(lines) > 3:
            del lines[i]
        else:
            heads = [l for l in lines if l and not l.startswith(' ')]
            if heads:
                lines.insert(i, r.choice(heads))
    return '\n'.join(lines)


with sync_playwright() as pw:
    browser = pw.chromium.launch(channel='chrome', headless=True)
    page = browser.new_page()
    errors = []
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.goto(EDITOR + '?lang=en', wait_until='networkidle')
    page.wait_for_function('() => !!window.shlsEditor')

    def find_decoding_differences(named):
        """Reads named texts on both sides and returns the names whose results differ.

        Args:
            named (dict[str, str]): the texts by name.

        Returns:
            list[str]: per text whose results are not the same, its name with both results.
        """
        names = list(named)
        js = page.evaluate(JS_DECODE, [named[n] for n in names])
        bad = []
        for n, (kind, out) in zip(names, js):
            py = read_with_reference(named[n])
            if kind == 'ok':
                same = py[0] == 'ok' and py[1] == get_normalized_json(out)
            else:
                same = py[0] == kind
            if not same:
                bad.append(f'{n}: python {py[0]} {py[1][:120]} / js {kind} {out[:120]}')
        return bad

    # The examples of the SHLS repository
    fixtures = {f: open(os.path.join(HERE, 'fixtures', f), encoding='utf-8').read() for f in ('Example.shls', 'Example2.shls')}
    bad = find_decoding_differences(fixtures)
    check_that(not bad, 'Example.shls and Example2.shls decode the same' + (': ' + '; '.join(bad) if bad else ''))
    readme = get_readme_examples()
    bad = find_decoding_differences({f'README example {i + 1}': t for i, t in enumerate(readme)})
    check_that(len(readme) == 2 and not bad, f'the {len(readme)} README examples decode the same' + (': ' + '; '.join(bad) if bad else ''))
    ex = get_codec_example_strings()
    bad = find_decoding_differences({f'codec example {i + 1}': t for i, t in enumerate(ex)})
    check_that(ex and not bad, f'the {len(ex)} strings of the codec examples decode the same' + (': ' + '; '.join(bad) if bad else ''))
    py_ex = json.loads(read_with_reference(fixtures['Example.shls'])[1])
    check_that(len(py_ex['Company'][0]['Departments']) == 3 and len(py_ex['Financials']) == 3, 'Example.shls: 3 departments, 3 years (sanity check of the reference)')

    # Unusual cases, one by one
    for name, text in CASES.items():
        bad = find_decoding_differences({name: text})
        py = read_with_reference(text)
        check_that(not bad, f'{name}: the same ({py[0]})' + (': ' + bad[0] if bad else ''))

    # Random structures: encoder text byte for byte, then decoded by both
    r = random.Random(20261028)
    structs = [get_random_structure(r) for _ in range(50)]
    js_enc = page.evaluate(JS_ENCODE, [json.dumps(s) for s in structs])
    enc_bad, py_texts = [], []
    for i, (s, j) in enumerate(zip(structs, js_enc)):
        p = write_with_reference(s)
        py_texts.append(p)
        if p != j:
            enc_bad.append(f'#{i}: {p[:80]!r} / {j[:80]!r}')
    check_that(not enc_bad, f'50 random structures: SHLSEncoder and shls.js write the same text' + (': ' + '; '.join(enc_bad[:3]) if enc_bad else ''))
    bad = find_decoding_differences({f'random #{i}': t for i, t in enumerate(py_texts)})
    check_that(not bad, '50 random structures: their SHLS decodes the same' + (': ' + '; '.join(bad[:3]) if bad else ''))
    kinds = [read_with_reference(t)[0] for t in py_texts]
    check_that(kinds.count('ok') == 50, f'50 random structures: Python reads every text ({kinds.count("hang")} never finish, {kinds.count("error")} raise)')
    fine = [(s, t) for s, t in zip(structs, py_texts) if not any(v in ('', ' lead') for v in get_values(s))]
    back = sum(1 for s, t in fine if read_with_reference(t) == ('ok', json.dumps(get_read_back_data(s), ensure_ascii=False, separators=(',', ':'))))
    check_that(back == len(fine), f'{back} of {len(fine)} random structures read back as their data (all without empty values or leading spaces)')

    # The same texts with random blank lines, spaces, missing and repeated lines
    mutated = {f'mutated #{i}': get_mutated_text(r, t) for i, t in enumerate(py_texts)}
    bad = find_decoding_differences(mutated)
    kinds = [read_with_reference(t)[0] for t in mutated.values()]
    check_that(not bad and kinds.count('ok') == 50, f'50 changed texts decode the same ({kinds.count("ok")} read, {kinds.count("hang")} never finish, {kinds.count("error")} raise)' + (': ' + '; '.join(bad[:3]) if bad else ''))

    # Decoded JSON back through both encoders
    jsons = [read_with_reference(t)[1] for t in list(fixtures.values()) + readme if read_with_reference(t)[0] == 'ok']
    js_enc = page.evaluate(JS_ENCODE, jsons)
    same = all(write_with_reference(json.loads(j)) == e for j, e in zip(jsons, js_enc))
    check_that(same, 'the decoded examples encode to the same text on both sides')
    check_that(not errors, 'no script errors' + (': ' + '; '.join(errors) if errors else ''))
    browser.close()

print(f'\n{len(failures)} failed' if failures else '\nall passed')
sys.exit(1 if failures else 0)
