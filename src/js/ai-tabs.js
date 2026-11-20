/**
 * Editor tabs of this browser talk over a BroadcastChannel: a tab opened by an AI link asks
 * which editor tabs are open (ping), picks the one used last and hands it the document; that
 * tab answers with the id of the document it is in. The viewer neither hands a link to an open
 * editor tab nor takes one.
 */

const CHANNEL = 'shlseditor';
const ID_RADIX = 36;
const ID_START = 2;
/** How long a tab waits for the other editor tabs to answer. */
const PING_WAIT = 350;
/** How long a tab waits for another tab to take a document. */
const HANDOVER_WAIT = 4000;
const tabId = Math.random().toString(ID_RADIX).slice(ID_START);
let lastFocus = document.hasFocus() ? Date.now() : 0;
addEventListener('focus', () => { lastFocus = Date.now(); });

/**
 * Creates the channel of the editor tabs and answers the other tabs on it.
 * @param {function(string, string, object): Promise<string>} receiveDocument - takes a document
 *   meant for this tab; resolves with the id of the document it is in.
 * @returns {BroadcastChannel|null} the channel, null in the viewer or without BroadcastChannel.
 */
export function createTabChannel(receiveDocument) {
    const channel = new URLSearchParams(location.search).get('viewer') !== '1' && 'BroadcastChannel' in window ? new BroadcastChannel(CHANNEL) : null;
    if (!channel) return null;
    /**
     * Answers a message of another editor tab (the channel's message handler).
     * @param {MessageEvent} event - the message on the channel.
     * @returns {void}
     */
    channel.onmessage = event => sendChannelAnswer(channel, receiveDocument, event);
    return channel;
}

/**
 * Returns a new random id for one question on the channel.
 * @returns {string} the id.
 */
export function createRequestId() {
    return Math.random().toString(ID_RADIX).slice(ID_START);
}

/**
 * Answers the other editor tabs: a ping with this tab's last focus, and a document meant for
 * this tab with the id of the document it is in (for "Open it here" in the other tab).
 * @param {BroadcastChannel} channel - the channel of the editor tabs.
 * @param {function(string, string, object): Promise<string>} receiveDocument - takes a document; resolves with its id.
 * @param {MessageEvent} event - the channel message.
 * @returns {void}
 */
function sendChannelAnswer(channel, receiveDocument, event) {
    const message = event.data || {};
    if (message.type === 'ping') channel.postMessage({ type: 'pong', ask: message.ask, tab: tabId, focus: lastFocus });
    if (message.type === 'document' && message.to === tabId) {
        Promise.resolve(receiveDocument(message.text, message.mode, message.target)).catch(() => null).then(id => channel.postMessage({ type: 'got', ask: message.ask, id }));
    }
}

/**
 * Asks the open editor tabs and returns the one used last (a command that returns a Promise
 * so the caller can wait for the answer).
 * @param {BroadcastChannel|null} channel - the channel of the editor tabs.
 * @param {string} requestId - the id of this question.
 * @returns {Promise<object|null>} the tab's answer, null when no tab answers.
 */
export function findEditorTab(channel, requestId) {
    if (!channel) return Promise.resolve(null);
    return new Promise(resolve => collectTabAnswers(channel, requestId, resolve));
}

/**
 * Pings the editor tabs, collects their answers for a moment and hands on the tab used last.
 * @param {BroadcastChannel} channel - the channel of the editor tabs.
 * @param {string} requestId - the id of this question.
 * @param {function(object|null): void} resolve - takes the tab's answer, null when no tab answers.
 * @returns {void}
 */
function collectTabAnswers(channel, requestId, resolve) {
    const tabs = [];
    /**
     * Collects the answers of the tabs to this ping.
     * @param {MessageEvent} event - a channel message.
     * @returns {void}
     */
    const addPongAnswer = event => { if (event.data && event.data.type === 'pong' && event.data.ask === requestId) tabs.push(event.data); };
    channel.addEventListener('message', addPongAnswer);
    channel.postMessage({ type: 'ping', ask: requestId });
    setTimeout(() => {
        channel.removeEventListener('message', addPongAnswer);
        tabs.sort((a, b) => b.focus - a.focus);
        resolve(tabs[0] || null);
    }, PING_WAIT);
}

/**
 * Hands a document to another editor tab (a command that returns a Promise so the caller can
 * wait for its answer).
 * @param {BroadcastChannel} channel - the channel of the editor tabs.
 * @param {object} tab - the tab's answer to the ping.
 * @param {string} text - the document's text.
 * @param {string} mode - "add" or "set".
 * @param {object} target - which document.
 * @param {string} requestId - the id of this question.
 * @returns {Promise<{id: string}|null>} the id of the document there, null when the tab does not answer.
 */
export function sendToTab(channel, tab, text, mode, target, requestId) {
    return new Promise(resolve => sendHandover(channel, { type: 'document', to: tab.tab, text, mode, target, ask: requestId }, resolve));
}

/**
 * Sends a document to another tab and hands on the id of the document it took there.
 * @param {BroadcastChannel} channel - the channel of the editor tabs.
 * @param {object} message - the document message for the other tab, with the id of this question in `ask`.
 * @param {function(?Object): void} resolve - takes {id} of the document there, null when the tab does not answer in time.
 * @returns {void}
 */
function sendHandover(channel, message, resolve) {
    /**
     * Settles with the id of the document the other tab took.
     * @param {MessageEvent} event - a channel message.
     * @returns {void}
     */
    const receiveGotAnswer = event => { if (event.data && event.data.type === 'got' && event.data.ask === message.ask) { channel.removeEventListener('message', receiveGotAnswer); resolve({ id: event.data.id }); } };
    channel.addEventListener('message', receiveGotAnswer);
    channel.postMessage(message);
    setTimeout(() => { channel.removeEventListener('message', receiveGotAnswer); resolve(null); }, HANDOVER_WAIT);
}
