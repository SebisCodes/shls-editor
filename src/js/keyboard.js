/**
 * The shortcuts of the page: Ctrl+S saves, Ctrl+E exports, Ctrl+O opens "My documents", Ctrl+F
 * searches the view, Escape closes the New menu; outside a field Ctrl+Z / Ctrl+Y undo and redo,
 * and ? opens the help. The shortcuts pause only while typing into a field.
 */

import { openDialog } from './dialogs.js?v=5';
import { areas, ui, TYPING_FIELDS, getElement } from './state.js?v=2';
import { undo, redo } from './history.js?v=3';
import { saveDocument, showExportDialog } from './export-dialog.js?v=3';
import { selectSearchField } from './view-bar.js?v=3';
import { setNewMenuOpen, isNewMenuOpen } from './documents.js?v=3';

/**
 * Connects the shortcuts of the page.
 * @returns {void}
 */
export function startKeyboard() {
    window.addEventListener('keydown', handlePageKey);
}

/**
 * Runs a shortcut of the page (a keydown handler).
 * @param {KeyboardEvent} event - the key.
 * @returns {void}
 */
function handlePageKey(event) {
    const active = document.activeElement;
    const typing = active && active.matches(TYPING_FIELDS);
    const withModifier = event.ctrlKey || event.metaKey;
    if (withModifier && event.key === 's') { event.preventDefault(); saveDocument(); return; }
    if (withModifier && event.key === 'e') { event.preventDefault(); showExportDialog(); return; }
    if (withModifier && event.key === 'o') { event.preventDefault(); areas.files.open(); return; }
    if (withModifier && !event.shiftKey && event.key === 'f' && active !== ui.ta) { event.preventDefault(); selectSearchField(); return; }
    if (event.key === 'Escape' && isNewMenuOpen()) { setNewMenuOpen(false); return; }
    if (typing || getElement('dialog[open]')) return;
    if (withModifier && (event.key === 'z' || event.key === 'Z')) { event.preventDefault(); event.shiftKey ? redo() : undo(); return; }
    if (withModifier && event.key === 'y') { event.preventDefault(); redo(); return; }
    if (withModifier) return;
    if (event.key === '?') openDialog(getElement('#help'));
}
