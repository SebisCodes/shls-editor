/**
 * Changes made in the records view, as edits of whole lines of the SHLS code. Everything else
 * in the code keeps its lines, blank lines and indentation. Each get…Edit function takes the
 * code and its model (shls.js parseModel()) and returns the edit { code, select } - select
 * names what to select afterwards; getRecordsAppendEdit returns { code, added } - or throws an
 * Error with a message for the user. The functions only compute the new code;
 * view-actions.js writes it. getKeyLines writes a key block's lines.
 *
 * Records follow their key block: a key added, duplicated, moved or removed in the key block
 * is added, duplicated, moved or removed in every record of the section (in all its data
 * blocks). SHLS has no empty values (a blank line is skipped by the readers), so a new value
 * is "-"; a new nested list gets one record.
 *
 * This module gathers the edits of edits-records.js, edits-keys.js and edits-sections.js, so
 * the editor imports them from one place.
 */

export { getSection, getRecordAt } from './edits-lines.js?v=3';
export * from './edits-records.js?v=3';
export * from './edits-keys.js?v=3';
export * from './edits-sections.js?v=3';
