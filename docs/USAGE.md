# Using the SHLS Editor

The SHLS Editor edits SHLS (Sebis Hierarchical List Structure), a text format for structured
data that needs far fewer tokens than JSON. It shows your SHLS next to each section's key
block and records, lets you change values, keys and records in place, lists problems by
line, converts to and from JSON exactly as the reference SHLSDecoder and SHLSEncoder do, and
compares the tokens of SHLS with JSON.

SHLS is described, with the reference decoder and encoder in Python, at
https://github.com/SebisCodes/SHLS-Sebis-Hierarchical-List-Structure.

Open it at https://shls.giit.ch/. It is free, needs no sign-up, and runs in your browser:
your documents stay there unless you send them somewhere yourself.

## What it can do

- Code with highlighting: section names, keys, values, the line of a nested list, `PH`
  placeholders, a guide line for each level of indentation.
- A records view: each section with its key block (as a tree of keys) and its records with
  the keys as labels; nested lists fold. Search in keys and values, and the path of the
  selection (`Company[0].Departments[1].Name`).
- Editing in place: values, keys (only the key block changes) and section names; records and
  keys added, duplicated, moved and removed, and every record of the section follows (a new
  key gets the value `-` in every record).
- The editor reads SHLS exactly as the reference SHLSDecoder does and lists problems with
  their line: a record with more or fewer values than the key block, indentation that is not
  a whole level, tabs, a missing or extra blank line after a key block, a key twice, lines
  the decoder ignores.
- **Tidy up** lays the document out as the reference SHLSEncoder does (it asks first when
  that would read back as different data).
- Convert: JSON exactly as SHLSDecoder gives it, YAML, CSV (one section as a table), JSON
  Lines, plain text; "Open in the JSON Editor". JSON, YAML, CSV and JSON Lines files open as
  SHLS.
- A token counter: the approximate tokens of the document as SHLS against the same data as
  JSON.
- Templates: the two examples of the SHLS description, Example.shls, Example2.shls, an empty
  section.

## Getting started

1. **Start**: choose a template under **New**, open a file or paste SHLS.
2. **Edit**: type in the code, or change values, keys and records in the middle.
3. **Export**: save SHLS, JSON, YAML, CSV or text.

## SHLS in short

- A section starts with its name on a line of its own, without indentation.
- Then its key block: one key per line, indented (one space per level). A key that holds a
  nested list is followed by the keys of that list one level deeper.
- Then exactly one blank line, then the records: one value per line, in the order of the
  keys, indented like the keys.
- For a key with a nested list, a record has one line of its own (the key's name, or `PH` as
  a placeholder) followed by the records of the nested list one level deeper.
- All values are text. There are no empty values (write `-` or `PH`), no values with line
  breaks and no values starting with spaces.

```
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
```

reads as `{"Company": [{"Name": "TechCorp", "Location": [{"Country": "USA", "City": "San
Francisco"}], "Founded": "2010"}]}`.

## Editing the records

Click a value, a key or a section name to change it right there. **Enter** or a click
elsewhere writes the change into the code (one step for Undo), **Escape** cancels. The
buttons above add, duplicate, move and remove records and keys; a key added or removed is
added to or removed from every record. A click in the middle puts the code's cursor on that
line, and the cursor in the code marks its record, key or value.

The right side panel has **Selection** (the selected record as a form), **Insert** (records,
keys and sections), **Convert** (the token counter and the conversions) and **Outline**
(every section with its number of records and its problems).

## Your documents

Your documents are kept only in your browser (in `localStorage`), not on a server, and stay
there after you close the page. **My documents** (the folder button at the top left) lists
every document of this browser: open, rename, duplicate, download (`.shls`) and delete them.

Clearing the browser's site data removes them, so download the ones you want to keep, or let
the editor send them to your own server: **Save to server** (the cloud button) sets up a
webhook, an address that gets every saved version (see [EMBEDDING.md](EMBEDDING.md#webhook)
for what it receives). Nothing is sent until you enter an address there.

**Opening files:** Open `.shls` files with the button, by drop or by paste; JSON, YAML, CSV
and JSON Lines files open as SHLS, with a note on what SHLS cannot keep.

## Export

**Export** saves `.shls`, JSON, YAML, CSV, plain text, or all of them as one ZIP.

**Export > Open in another editor** converts the document in the browser to JSON, YAML,
TOML, XML or CSV and opens the result as a new document in that editor. Anything the other
format cannot hold is listed first.

## AI Assistant

Any AI can work with you: ChatGPT, Claude, Gemini, Copilot or the AI in your coding tool.
Nothing to install and no key needed. Click **AI Assistant**, then **Copy prompt**, paste it
into your AI and say what it should do. The prompt holds the instructions and the current
document.

The prompt explains SHLS briefly, so the AI writes valid SHLS.

The AI answers with a link that carries the document after the `#`; click it and the
document appears in your editor. **Undo** takes every change back. The links look like this:

- `https://shls.giit.ch/#b64=<base64url of the UTF-8 text>`
- `https://shls.giit.ch/#shls=<URL-encoded text>`
- `https://shls.giit.ch/#z=<base64url of the zlib-compressed text>` (shortest)
- `&mode=add` adds records: they are appended to the sections of the same name in the open
  document, and sections it does not have yet are added at the end.
- `&file=new&name=<name>` makes a new document next to your others, `&file=<name>` changes
  that one; without `&file=` the open document changes.
- `&part=N&of=M&id=<name>` sends a long document in several links; the editor collects the
  parts.

A tab opened with such a link hands the document to the editor tab you used last. You can
also paste the AI's whole answer into the editor (Ctrl+V outside the code); links that a
terminal broke over several lines are joined. When the editor is embedded in another
website, links cannot reach it, so paste the answer there. A website that embeds the
editor may give its own instructions for how the AI answers, or show its own AI dialog
when you press the button; the dialog names the website and shows its instructions.

**Browser agents (WebMCP):** in browsers that offer WebMCP, the page registers tools for AI
agents that run in the page itself: `get_document`, `get_problems`, `get_records`,
`set_value` (by a path such as `Product[2].Price`), `add_record`, `set_document`,
`replace_text`, `show_line`, `undo`, and `list_files`, `open_file`, `new_file` for your
other documents. Every change is one step for Undo.

## Side panel

The side panel holds **Selection**, **Insert**, **Convert** and **Outline**. The button at the top
right of the work area opens it over the records, below the bar of the records view, and closes it
again (Escape too); it is closed when the editor opens. The bar's controls stay in view and usable
while it is open. On a phone it is the view **Edit**.

## Templates with placeholders

A website that edits templates opens the editor with `?template=mustache` or `?template=angle`.
The records view then shows the records filled with the website's examples; **Template** in its
bar shows the records with the placeholders as written, **Examples** brings the examples back. A
placeholder without an example shows its label in brackets. The **Placeholders** box below the
code lists them: a click puts one at the cursor, a section around the selected text. A value that
comes from an example cannot be changed in the records view; a click on it shows its line of the
template in the code. Saving, downloading and exporting keep the placeholders.

## Languages

The editor speaks English at `/`, German `/de/`, French `/fr/`, Italian `/it/`, Spanish
`/es/`, Portuguese `/pt/`, Dutch `/nl/`, Polish `/pl/`, Turkish `/tr/`, Russian `/ru/`,
Ukrainian `/uk/`, Chinese `/zh/`, Japanese `/ja/` and Korean `/ko/`. Opening
`https://shls.giit.ch/` leads to the language you picked before in a language menu, or else
to your browser's language. A language picked in the menu holds for every giit.ch site. The
prompt for the AI is always in English.

## Color theme

Light, dark or automatic (following your system): the theme switch in the bar sets it, and
the editor remembers your choice.

## Keyboard shortcuts

On macOS use Cmd instead of Ctrl. The **Help** dialog in the editor lists them as well.

| Keys | Action |
|---|---|
| ↑ ↓ ← → | In the records: go up and down, fold and unfold |
| Enter | In the records: change the value, key or section name |
| Delete | In the records: remove the record or key |
| Alt + ↑ / ↓ | In the records: move the record or key up / down |
| Ctrl + F | Search keys and values |
| Tab / Shift + Tab | Indent / outdent in the code by one level |
| Ctrl + Z / Y | Undo / redo |
| Ctrl + S | Save (download, or to your server) |
| Ctrl + E | Export |
| Ctrl + O | My documents |

Enter keeps the indentation of the line; after a section name it starts the key block.

## On your own website

The editor can be embedded in other websites with an iframe, opened in a window of its own
or used as a read-only viewer. See [EMBEDDING.md](EMBEDDING.md).
