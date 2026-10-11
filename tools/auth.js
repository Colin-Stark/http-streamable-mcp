// =============================================================================
// tools/auth.js: login and logout (they read and write the session in Redis)
// =============================================================================
import { randomBytes, createCipheriv } from "node:crypto"; // used to encrypt the JWT
import { z } from "zod";
import { BASE_URL, redis } from "../config.js";

// `{ sessionId }` is the context index.js passes in: the ID of the calling client.
// The tools below use it to find this client's entry in Redis.
export function registerAuthTools(server, { sessionId }) {
    // -------------------------------------------------------------------------
    // TOOL: login. Gets a JWT from the bank API, encrypts it, saves it in Redis.
    // -------------------------------------------------------------------------
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
                // No session ID = we can't tell who to save the login for.
                if (!sessionId) {
                    return {
                        isError: true,
                        content: [{ type: "text", text: "Your MCP client did not send a session ID, so login cannot be remembered." }],
                    };
                }

                // 1. Ask the bank API to authenticate (public endpoint).
                const res = await fetch(`${BASE_URL}/user/login`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ emailOrUsername, password }),
                    signal: AbortSignal.timeout(10_000),
                });

                // 2. If it refused, report why (never echo the password back).
                if (!res.ok) {
                    let reason = "";
                    try {
                        const errorData = await res.json();
                        reason = errorData.error || errorData.details || "";
                    } catch (_) {
                        // ignore
                    }
                    return {
                        isError: true,
                        content: [{ type: "text", text: `Login failed (HTTP ${res.status}): ${reason}` }],
                    };
                }

                // 3. Success: { accessToken, user: { id, username, email } }
                const data = await res.json();
                const jwt = data.accessToken;
                if (!jwt) {
                    return {
                        isError: true,
                        content: [{ type: "text", text: "Login succeeded but the API returned no access token." }],
                    };
                }

                // 4. ENCRYPT the JWT (AES-256-GCM) so the database never holds a usable token.
                const key = Buffer.from(process.env.TOKEN_ENCRYPTION_KEY, "hex"); // 32-byte secret key from the environment
                const iv = randomBytes(12);                                        // new random value for every encryption
                const cipher = createCipheriv("aes-256-gcm", key, iv);
                const encrypted = Buffer.concat([cipher.update(jwt, "utf8"), cipher.final()]);
                const authTag = cipher.getAuthTag();                               // tamper-detection seal
                // Save iv, authTag and the encrypted data together as one text value.
                const stored = [iv, authTag, encrypted].map((part) => part.toString("base64")).join(".");

                // 5. Save in Redis. { ex: 3600 } = Redis deletes it automatically after 1 hour.
                await redis.set(`session:${sessionId}`, stored, { ex: 3600 });

                // 6. Confirm WITHOUT showing the token.
                return {
                    content: [{ type: "text", text: `Logged in as ${data.user?.username ?? emailOrUsername}. Session valid for 1 hour.` }],
                };
            } catch (err) {
                return {
                    isError: true,
                    content: [{ type: "text", text: `Login error: ${err.message}` }],
                };
            }
        }
    );

    // -------------------------------------------------------------------------
    // TOOL: logout. Deletes this session's token from Redis.
    // -------------------------------------------------------------------------
    server.registerTool(
        "logout",
        {
            title: "Logout",
            description: "Log out and delete the stored access token for this session.",
        },
        async () => {
            try {
                if (sessionId) await redis.del(`session:${sessionId}`);
                return { content: [{ type: "text", text: "Logged out." }] };
            } catch (err) {
                return {
                    isError: true,
                    content: [{ type: "text", text: `Logout error: ${err.message}` }],
                };
            }
        }
    );
}