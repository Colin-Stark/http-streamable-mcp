// =============================================================================
// lib/session.js: save, read and delete a client's JWT in Redis
// =============================================================================
// Every function takes the sessionId (from the Mcp-Session-Id header), which
// identifies WHICH client's token we mean. Nothing here is ever shown to the model.
import { redis } from "../config.js";
import { encrypt, decrypt } from "./crypto.js";

// How long a login lasts on our side. Redis deletes the entry automatically afterwards.
const SESSION_SECONDS = 3600; // 1 hour

// The key under which one session's token is stored. The "session:" prefix keeps
// our keys tidy if the same database is ever used for something else.
const keyFor = (sessionId) => `session:${sessionId}`;

// Make sure we actually have a session ID. Clients that did not send one back
// can't be recognised, so we cannot remember their login.
export function requireSession(sessionId) {
    if (!sessionId) {
        throw new Error("Your MCP client did not send a session ID, so login cannot be remembered.");
    }
}

// Encrypt the JWT and save it for this session. Redis deletes it after SESSION_SECONDS.
export async function saveToken(sessionId, jwt) {
    requireSession(sessionId);
    await redis.set(keyFor(sessionId), encrypt(jwt), { ex: SESSION_SECONDS });
}

// Fetch and decrypt this session's JWT. Throws a friendly error if the user is not logged in.
export async function getToken(sessionId) {
    requireSession(sessionId);
    const stored = await redis.get(keyFor(sessionId)); // null if missing or expired
    if (!stored) {
        throw new Error("Not logged in, or the session has expired. Use the `login` tool first.");
    }
    return decrypt(stored);
}

// Remove this session's token (used by logout and when the bank API rejects the token).
export async function deleteToken(sessionId) {
    if (sessionId) await redis.del(keyFor(sessionId));
}