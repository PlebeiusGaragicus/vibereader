// Minimal Blossom client (BUD-01/02/06/11): raw blob upload/download with
// kind-24242 auth events. Blobs are public-by-hash — the UI owns warning the
// user before the first upload (see docs/nostr-event-model.md).

import { cyphertap } from 'cyphertap';
import { sha256Hex } from '$lib/epub/import.js';
import { KIND_BLOSSOM_AUTH, KIND_BLOSSOM_SERVERS } from './kinds.js';

export class BlossomError extends Error {}

// BUD-11 says base64url-without-padding, but deployed servers (nostr.download,
// and nak's client) speak STANDARD base64 and reject the url-safe form with
// "Invalid auth string" — follow the ecosystem, not the letter of the spec.
function encodeAuth(json: string): string {
	return btoa(unescape(encodeURIComponent(json)));
}

/** Build + sign a BUD-11 auth event and encode it for the Authorization header. */
async function authHeader(verb: 'upload' | 'get' | 'delete', sha256: string, reason: string): Promise<string> {
	const draft = {
		kind: KIND_BLOSSOM_AUTH,
		content: reason,
		created_at: Math.floor(Date.now() / 1000),
		tags: [
			['t', verb],
			['x', sha256],
			['expiration', String(Math.floor(Date.now() / 1000) + 300)]
		]
	};
	const { id, pubkey, signature } = await cyphertap.signEvent(draft);
	const full = { ...draft, id, pubkey, sig: signature };
	return `Nostr ${encodeAuth(JSON.stringify(full))}`;
}

function serverUrl(server: string, path: string): string {
	return `${server.replace(/\/$/, '')}${path}`;
}

/**
 * BUD-06 preflight — advisory only. Many servers don't implement it (or
 * reject the HEAD for unrelated reasons) yet accept the PUT fine, so the only
 * verdict that blocks an upload is an explicit 413 "too large".
 */
export async function canUpload(server: string, sha256: string, size: number, type: string): Promise<{ ok: boolean; reason?: string }> {
	try {
		const res = await fetch(serverUrl(server, '/upload'), {
			method: 'HEAD',
			headers: {
				Authorization: await authHeader('upload', sha256, 'Check upload'),
				'X-SHA-256': sha256,
				'X-Content-Length': String(size),
				'X-Content-Type': type
			}
		});
		if (res.status === 413) {
			return { ok: false, reason: res.headers.get('X-Reason') ?? 'File too large for this server' };
		}
		return { ok: true };
	} catch {
		return { ok: true };
	}
}

export async function uploadBlob(server: string, blob: Blob, sha256: string): Promise<void> {
	let res: Response;
	try {
		res = await fetch(serverUrl(server, '/upload'), {
			method: 'PUT',
			headers: {
				Authorization: await authHeader('upload', sha256, 'Upload Blob'),
				'X-SHA-256': sha256,
				'Content-Type': blob.type || 'application/octet-stream'
			},
			body: blob
		});
	} catch {
		throw new BlossomError(`Could not reach ${server}`);
	}
	if (!res.ok) {
		throw new BlossomError(res.headers.get('X-Reason') ?? `${server} returned ${res.status}`);
	}
}

/** Fetch a blob by hash, trying each server; re-verify the hash on receipt.
 * Returns the server that actually delivered, so callers can record it. */
export async function downloadBlob(
	servers: string[],
	sha256: string,
	ext = ''
): Promise<{ blob: Blob; server: string }> {
	for (const server of servers) {
		try {
			const res = await fetch(serverUrl(server, `/${sha256}${ext}`));
			if (!res.ok) continue;
			const blob = await res.blob();
			const actual = await sha256Hex(await blob.arrayBuffer());
			if (actual !== sha256) continue; // Corrupt or malicious — try the next server.
			return { blob, server };
		} catch {
			continue;
		}
	}
	throw new BlossomError('No configured Blossom server had this file');
}

/** Publish the BUD-03 user server list so other clients can find our blobs. */
export async function publishServerList(servers: string[]): Promise<void> {
	await cyphertap.publishEvent({
		kind: KIND_BLOSSOM_SERVERS,
		content: '',
		tags: servers.map((s) => ['server', s])
	});
}
