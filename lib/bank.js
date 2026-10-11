// =============================================================================
// lib/bank.js: helpers for talking to the bank API
// =============================================================================
import { BASE_URL } from "../config.js";
import { getToken, deleteToken } from "./session.js";

// When the bank API replies with an error, try to pull out its explanation
// ({ details } or { error }). Returns "" if the body isn't JSON.
export async function errorReason(res) {
    try {
        const data = await res.json();
        return data.details || data.error || "";
    } catch {
        return "";
    }
}

// Call a PROTECTED endpoint (one that needs the JWT) for this session.
// It does all the repeated work in one place:
//   1. get the JWT from Redis (throws "Not logged in" if there isn't one)
//   2. build the URL, including optional ?query parameters
//   3. send the request with "Authorization: Bearer <jwt>"
//   4. if the API says 401, delete the dead token and ask for a new login
//   5. if the API says any other error, throw it with the API's explanation
// On success it returns the parsed JSON (or null if the response had no body).
// Errors are THROWN. The calling tool catches them and turns them into an errorResult.
export async function callProtected(sessionId, path, { method = "GET", query, body } = {}) {
    const token = await getToken(sessionId);

    const url = new URL(`${BASE_URL}${path}`);
    for (const [name, value] of Object.entries(query ?? {})) {
        if (value !== undefined) url.searchParams.set(name, String(value)); // skip optional values that weren't provided
    }

    const headers = { Authorization: `Bearer ${token}` };
    if (body !== undefined) headers["Content-Type"] = "application/json";

    const res = await fetch(url, {
        method,
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(10_000), // give up after 10 seconds
    });

    if (res.status === 401) {
        await deleteToken(sessionId);
        throw new Error("Your session expired. Use the `login` tool again.");
    }
    if (!res.ok) {
        throw new Error(`Request failed (HTTP ${res.status}): ${await errorReason(res)}`);
    }

    const text = await res.text(); // read as text first: some responses (like DELETE) have no body
    return text ? JSON.parse(text) : null;
}