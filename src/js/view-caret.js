/**
 * The text position under a point inside an element, from the boxes of its characters, so a
 * click on a value puts the cursor of its edit field at the clicked character. Unlike
 * caretPositionFromPoint this also holds in pages shown with CSS zoom.
 */

/**
 * A position in a text node.
 * @typedef {object} TextPoint
 * @property {Text} node - the text node.
 * @property {number} offset - the offset in it.
 */

/**
 * Returns the position under a point: before the character under it, or after it when the
 * point is on its right half. Beside the characters (right of a line's end, in the space
 * between lines) the nearest character within about a line counts, so a click right of a
 * line's end lands at its end.
 * @param {Element} element - the element.
 * @param {number} x - the client x of the point.
 * @param {number} y - the client y of the point.
 * @returns {TextPoint|null} the position, null when no character of the element is that near.
 */
function getCharacterAt(element, x, y) {
    const walker = element.ownerDocument.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    const range = element.ownerDocument.createRange();
    let best = null, bestDy = Infinity, bestDx = Infinity;
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        for (let i = 0; i < node.length; i++) {
            range.setStart(node, i);
            range.setEnd(node, i + 1);
            for (const box of range.getClientRects()) {
                const dy = y < box.top ? box.top - y : y > box.bottom ? y - box.bottom : 0;
                if (dy > box.height) continue;                                       // another line
                const offset = x < box.left + box.width / 2 ? i : i + 1;
                if (!dy && x >= box.left && x <= box.right) return { node, offset };
                const dx = x < box.left ? box.left - x : x > box.right ? x - box.right : 0;
                if (dy < bestDy || (dy === bestDy && dx < bestDx)) { bestDy = dy; bestDx = dx; best = { node, offset }; }
            }
        }
    }
    return best;
}

/**
 * Returns the number of characters before the position under a point, counted from the start
 * of the element's text.
 * @param {Element} element - the element.
 * @param {number} x - the client x of the point.
 * @param {number} y - the client y of the point.
 * @returns {number|null} the character index, null when no character is near the point.
 */
export function getCharacterIndexAt(element, x, y) {
    const point = getCharacterAt(element, x, y);
    if (!point) return null;
    const range = element.ownerDocument.createRange();
    range.selectNodeContents(element);
    range.setEnd(point.node, point.offset);
    return range.toString().length;
}
