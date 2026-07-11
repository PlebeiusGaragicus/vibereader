// Single source of truth for the app's nostr relays.
// Phase A–C use nostr for identity only (login + npub as the data partition
// key); Phase D adds explicit, user-triggered sync to these relays.
// relay.abvstudio.net is the whitelisted test relay — only the test accounts
// in ../my-projects/.test-accounts.json can publish there.
export const RELAYS = ['wss://relay.abvstudio.net', 'wss://relay.primal.net'];
