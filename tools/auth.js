// =============================================================================
// tools/auth.js: login and logout
// =============================================================================
import { z } from "zod";
import { BASE_URL } from "../config.js";
import { textResult, errorResult } from "../lib/results.js";
import { requireSession, saveToken, deleteToken } from "../lib/session.js";
import { errorReason } from "../lib/bank.js";

// `{ sessionId }` is the context from index.js: which client is calling.
export function registerAuthTools(server, { sessionId }) {
    // ---- login -----------------------------------------------------------------
    server.registerTool(
        "login",
        {
            title: "Login",
            description: "Log in to the bank API. The access token is stored securely on the server and is never shown.",
            inputSchema: {
                emailOrUsername: z.string().min(1),
                password: z.string().min(6),
            },
        },
        async ({ emailOrUsername, password }) => {
            try {
                // No session ID = we couldn't remember the login, so stop before calling the API.
                requireSession(sessionId);

                // 1. Ask the bank API to authenticate (public endpoint).
                const res = await fetch(`${BASE_URL}/user/login`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ emailOrUsername, password }),
                    signal: AbortSignal.timeout(10_000),
                });

                // 2. If it refused, report why (the password is never echoed back).
                if (!res.ok) {
                    return errorResult(`Login failed (HTTP ${res.status}): ${await errorReason(res)}`);
                }

                // 3. Success: { accessToken, user: { id, username, email } }
                const data = await res.json();
                if (!data.accessToken) {
                    return errorResult("Login succeeded but the API returned no access token.");
                }

                // 4. Encrypt and save the token in Redis for this session.
                await saveToken(sessionId, data.accessToken);

                // 5. Confirm WITHOUT showing the token.
                return textResult(`Logged in as ${data.user?.username ?? emailOrUsername}. Session valid for 1 hour.`);
            } catch (err) {
                return errorResult(`Login error: ${err.message}`);
            }
        }
    );

    // ---- logout ----------------------------------------------------------------
    server.registerTool(
        "logout",
        {
            title: "Logout",
            description: "Log out and delete the stored access token for this session.",
        },
        async () => {
            try {
                await deleteToken(sessionId);
                return textResult("Logged out.");
            } catch (err) {
                return errorResult(`Logout error: ${err.message}`);
            }
        }
    );
}