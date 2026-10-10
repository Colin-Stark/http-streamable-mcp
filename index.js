// =============================================================================
// IMPORTS
// =============================================================================
import { randomUUID, randomBytes, createCipheriv, createDecipheriv } from "node:crypto"; // session IDs + AES encryption
import { Hono } from "hono";                                                             // web framework for the /mcp route
import { serve } from "@hono/node-server";                                               // runs Hono as a Node server locally
import { StreamableHTTPTransport } from "@hono/mcp";                                     // MCP over HTTP, on top of Hono
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";                     // where tools get registered
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";                // detects the first "initialize" handshake
import { Redis } from "@upstash/redis";                                                  // Upstash Redis client (works over HTTPS)
import { z } from "zod";                                                                 // tool input validation
import "dotenv/config";                                                                  // loads .env into process.env

// =============================================================================
// CONFIGURATION
// =============================================================================

/**
 * The base URL for the bank API. It can be set via the BASE_URL environment variable, or defaults to "https://fastify-api-xi.vercel.app".
 * @type {string}
 */
const BASE_URL = process.env.BASE_URL || "https://fastify-api-xi.vercel.app";

// Connection to Upstash Redis. The values come from environment variables.
// (Upstash names them UPSTASH_REDIS_REST_*, Vercel's integration may name them KV_REST_API_*.)
const redis = Redis.fromEnv();

// =============================================================================
// THE MCP SERVER (a new one is created for every HTTP request)
// =============================================================================

// sessionId = the ID the client sent in its "Mcp-Session-Id" header (undefined if none).
// It tells us which Redis entry belongs to THIS client. The model never sees it.
function createServer(sessionId) {
    /**
     * Create a new MCP server instance.
     * @returns {McpServer} The created MCP server.
     */
    const server = new McpServer({
        name: "my_bank_api",
        version: "1.0.0",
        description: "A simple bank API for demonstration purposes",
    });

    // -------------------------------------------------------------------------
    // TOOL: health_check (public, no login). Unchanged.
    // -------------------------------------------------------------------------
    server.registerTool(
        "health_check",
        {
            title: "Health Check",
            description: "Check the health of the API",
        },
        async () => {
            try {
                const res = await fetch(`${BASE_URL}/health`, {
                    signal: AbortSignal.timeout(10_000), // give up after 10 seconds
                });

                if (!res.ok) {
                    return {
                        isError: true,
                        content: [{ type: "text", text: `API is unhealthy (HTTP ${res.status})` }],
                    };
                }

                const data = await res.json(); // the API replies with { "status": "..." }
                return {
                    content: [{ type: "text", text: `API status: ${data.status}` }],
                };
            }
            catch (err) {
                return {
                    isError: true,
                    content: [{ type: "text", text: `Could not reach the API: ${err.message}` }],
                };
            }
        }
    );

    // -------------------------------------------------------------------------
    // TOOL: register_user (public, no login). Unchanged.
    // -------------------------------------------------------------------------
    server.registerTool(
        "register_user",
        {
            title: "Register User",
            description: "Register a new user with the bank API",
            inputSchema: z.object({
                username: z.string().min(3).max(30),
                email: z.string().email(),
                password: z.string().min(6),
            }),
        },
        async ({ username, email, password }) => {
            try {
                const res = await fetch(`${BASE_URL}/user/register`, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({ username, email, password }),
                });

                if (!res.ok) {
                    let errorDetails = "";
                    try {
                        const errorData = await res.json();
                        errorDetails = errorData.details || errorData.error || "";
                    } catch (_) {
                        // ignore
                    }
                    return {
                        isError: true,
                        content: [{ type: "text", text: `Registration failed (HTTP ${res.status}): ${errorDetails}` }],
                    };
                }

                const data = await res.json();
                return {
                    content: [
                        { type: "text", text: `User registered successfully:\n- ID: ${data.id}\n- Username: ${data.username}\n- Email: ${data.email}\n- Created at: ${data.created_at}\n- Updated at: ${data.updated_at}` },
                    ],
                };
            } catch (err) {
                return {
                    isError: true,
                    content: [{ type: "text", text: `Could not reach the API: ${err.message}` }],
                };
            }
        }
    );

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

    return server;
}

// =============================================================================
// THE HTTP ENTRY POINT
// =============================================================================

const app = new Hono();

app.all("/mcp", async (c) => {
    // 1. Which client is this? Clients echo back the ID we gave them in this header.
    //    We only accept values that look like a UUID (36 characters of hex and dashes).
    const headerValue = c.req.header("mcp-session-id");
    const sessionId = headerValue && /^[0-9a-f-]{36}$/i.test(headerValue) ? headerValue : undefined;

    // 2. Read the JSON body ourselves (POST only) so we can check for "initialize" below.
    let body;
    if (c.req.method === "POST") {
        try {
            body = await c.req.json();
        } catch {
            return c.json({ jsonrpc: "2.0", error: { code: -32700, message: "Invalid JSON" }, id: null }, 400);
        }
    }

    // 3. Same stateless setup as before: fresh server + transport per request.
    const server = createServer(sessionId);
    const transport = new StreamableHTTPTransport({
        sessionIdGenerator: undefined,
    });

    await server.connect(transport);
    const response = await transport.handleRequest(c, body);

    // 4. On the first "initialize" handshake, give the client a new session ID in a header.
    //    The client sends it back on every later request, which is how we recognise it.
    if (body && isInitializeRequest(body)) {
        const withSession = new Response(response.body, response); // copy, since headers can't be edited
        withSession.headers.set("Mcp-Session-Id", randomUUID());
        return withSession;
    }

    return response;
});

serve({ fetch: app.fetch, port: 3000, hostname: "127.0.0.1" }, (info) =>
    console.log(`MCP server on http://127.0.0.1:${info.port}/mcp`)
);