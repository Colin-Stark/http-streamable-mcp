// =============================================================================
// tools/accounts.js: tools that call PROTECTED account endpoints (JWT needed)
// =============================================================================
import { createDecipheriv } from "node:crypto"; // used to decrypt the JWT from Redis
import { z } from "zod";
import { BASE_URL, redis } from "../config.js";

export function registerAccountTools(server, { sessionId }) {
    // -------------------------------------------------------------------------
    // TOOL: list_accounts. Example of a PROTECTED endpoint (needs the JWT).
    // -------------------------------------------------------------------------
    server.registerTool(
        "list_accounts",
        {
            title: "List Accounts",
            description: "List your bank accounts. You must log in first. Optionally filter by account type.",
            inputSchema: {
                account_type: z.enum(["checking", "savings", "credit"]).optional(),
            },
        },
        async ({ account_type }) => {
            try {
                // 1. Find this client's saved login in Redis.
                if (!sessionId) {
                    return {
                        isError: true,
                        content: [{ type: "text", text: "Your MCP client did not send a session ID, so login cannot be remembered." }],
                    };
                }
                const stored = await redis.get(`session:${sessionId}`); // null if missing or expired
                if (!stored) {
                    return {
                        isError: true,
                        content: [{ type: "text", text: "Not logged in, or the session has expired. Use the `login` tool first." }],
                    };
                }

                // 2. DECRYPT it back into the real JWT (reverse of what login did).
                const key = Buffer.from(process.env.TOKEN_ENCRYPTION_KEY, "hex");
                const [iv, authTag, encrypted] = stored.split(".").map((part) => Buffer.from(part, "base64"));
                const decipher = createDecipheriv("aes-256-gcm", key, iv);
                decipher.setAuthTag(authTag); // throws below if the stored value was tampered with
                const token = Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");

                // 3. Build the URL; the optional filter becomes ?account_type=...
                const url = new URL(`${BASE_URL}/accounts`);
                if (account_type) url.searchParams.set("account_type", account_type);

                // 4. Call the bank API with the JWT in the Authorization header.
                const res = await fetch(url, {
                    headers: { Authorization: `Bearer ${token}` },
                    signal: AbortSignal.timeout(10_000),
                });

                // 5. A 401 means the API no longer accepts the token: delete it and ask for a new login.
                if (res.status === 401) {
                    await redis.del(`session:${sessionId}`);
                    return {
                        isError: true,
                        content: [{ type: "text", text: "Your session expired. Use the `login` tool again." }],
                    };
                }

                // 6. Any other failure: report status and the API's explanation.
                if (!res.ok) {
                    let reason = "";
                    try {
                        const errorData = await res.json();
                        reason = errorData.details || errorData.error || "";
                    } catch (_) {
                        // ignore
                    }
                    return {
                        isError: true,
                        content: [{ type: "text", text: `Could not list accounts (HTTP ${res.status}): ${reason}` }],
                    };
                }

                // 7. Success: give the accounts to the model as readable JSON text.
                const accounts = await res.json();
                return { content: [{ type: "text", text: JSON.stringify(accounts, null, 2) }] };
            } catch (err) {
                return {
                    isError: true,
                    content: [{ type: "text", text: err.message }],
                };
            }
        }
    );
}