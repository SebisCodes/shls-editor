# SHLS Editor

Edit SHLS (Sebis Hierarchical List Structure) in the browser. It needs no sign-up, loads
nothing from other servers and keeps documents in the browser unless the user sends them
somewhere. SHLS itself is described at
https://github.com/SebisCodes/SHLS-Sebis-Hierarchical-List-Structure. It is one of the giit
editors (https://editors.giit.ch/) and lives at https://shls.giit.ch/.

- Each section's key block and records side by side with the code; edit values, keys and
  records in place
- Reads and writes SHLS exactly as the reference SHLSDecoder and SHLSEncoder do
- Convert to and from JSON, YAML, CSV and JSON Lines; compare the tokens with JSON
- "My documents" kept in the browser; nothing is uploaded unless you set up a webhook
- AI Assistant: any AI can deliver its result as a link; WebMCP tools for browser agents
- Embedding in other websites (iframe, own window, viewer) with postMessage, a webhook and
  AI through your own server
- Interface in 14 languages, light and dark theme

## Run it locally

Clone this repository and the language packs side by side:

```
git clone https://github.com/SebisCodes/shls-editor.git
git clone https://github.com/SebisCodes/giit-editors-lang.git
cd shls-editor
php -S 127.0.0.1:8106 -t src src/php/router.php
```

Then open http://127.0.0.1:8106/ (other languages at `/de/`, `/fr/` …, the developer page at
`/embed/`). There is no build step.

## Folder layout

```
src/          the website
  index.php   the editor page; src/embed/index.php is the developer page
  templates/  the page templates (editor, developer page, footer)
  js/         the editor, as ES modules (app.js starts it)
  css/        styles, light and dark
  php/        page rendering, language choice, page counter, router for php -S
  img/        logo and preview image
  vendor/     bundled third-party libraries (see NOTICE)
  post.php    opens a document sent by HTTP POST
  lang.php    serves the interface language packs
  llms.txt    the editor and its protocol, described for AI assistants
tests/        browser tests (Python, Playwright)
docs/         USAGE.md and EMBEDDING.md
```

## Documentation

- [docs/USAGE.md](docs/USAGE.md): how to use the editor.
- [docs/EMBEDDING.md](docs/EMBEDDING.md): how to put it into your own website.

## License

Apache License 2.0, see [LICENSE](LICENSE). The bundled third-party parts and their licenses
are listed in [NOTICE](NOTICE).

A project by [Grünwald Innovation](https://giit.ch/).
