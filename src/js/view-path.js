/**
 * Paths and ids of the rows of the records view. A path is written as get_records shows the
 * data: Company[0].Departments[1].Name; each of its steps is a place that can be selected.
 * A place ({ kind, sec, keyPath?, recPath?, field? }) survives a new model, so after an edit
 * the same place is selected again; its id is the id of its row.
 */

/**
 * One step of a row's path.
 * @typedef {object} PathPart
 * @property {string} text - the step as written in the path.
 * @property {import('./state.js').ViewPlace} sel - the place the step selects.
 */

/**
 * Returns the steps of a row's path: the section, then its key block and key, or each record
 * and nested list down to the value.
 * @param {object|null} row - the row.
 * @returns {PathPart[]} the steps, empty without a row.
 */
export function getPathParts(row) {
    if (!row) return [];
    const parts = [{ text: row.sec, sel: { kind: 'section', sec: row.sec } }];
    if (row.kind === 'keys' || row.kind === 'key') {
        parts.push({ text: ' (keys)', sel: { kind: 'keys', sec: row.sec } });
        if (row.kind === 'key') parts.push({ text: ' ' + row.keyNames.join('.'), sel: { kind: 'key', sec: row.sec, keyPath: row.keyPath } });
        return parts;
    }
    const recPath = row.recPath || [];
    for (let k = 0; k < recPath.length; k += 2) {
        parts.push({ text: `[${recPath[k]}]`, sel: { kind: 'record', sec: row.sec, recPath: recPath.slice(0, k + 1) } });
        if (k + 1 < recPath.length) parts.push({ text: '.' + row.names[k / 2], sel: { kind: 'field', sec: row.sec, recPath: recPath.slice(0, k + 1), field: recPath[k + 1] } });
    }
    if (row.kind === 'field') parts.push({ text: '.' + row.label, sel: { kind: 'field', sec: row.sec, recPath, field: row.field } });
    return parts;
}

/**
 * Returns a row's path as text.
 * @param {object|null} row - the row.
 * @returns {string} e.g. "Company[0].Departments[1].Name", "" without a row.
 */
export function getPathText(row) {
    return getPathParts(row).map(part => part.text).join('');
}

/**
 * Returns the id of the row of a place.
 * @param {import('./state.js').ViewPlace|null} place - the place.
 * @returns {string} the id, "" for no place.
 */
export function getPlaceId(place) {
    if (!place) return '';
    if (place.kind === 'section') return 's|' + place.sec;
    if (place.kind === 'keys') return 't|' + place.sec;
    if (place.kind === 'key') return 'k|' + place.sec + '|' + place.keyPath.join('.');
    if (place.kind === 'record') return 'r|' + place.sec + '|' + place.recPath.join('.');
    if (place.kind === 'field') return 'f|' + place.sec + '|' + place.recPath.join('.') + '|' + place.field;
    return '';
}

/**
 * Returns the place of a row.
 * @param {object} row - the row.
 * @returns {import('./state.js').ViewPlace} the place.
 */
export function getRowPlace(row) {
    if (row.kind === 'section' || row.kind === 'keys') return { kind: row.kind, sec: row.sec };
    if (row.kind === 'key') return { kind: 'key', sec: row.sec, keyPath: row.keyPath };
    if (row.kind === 'record') return { kind: 'record', sec: row.sec, recPath: row.recPath };
    return { kind: 'field', sec: row.sec, recPath: row.recPath, field: row.field };
}
