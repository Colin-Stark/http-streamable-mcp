// =============================================================================
// tools/public.js: tools that call PUBLIC endpoints (no login needed)
// =============================================================================
import { z } from "zod";                  // input validation for register_user
import { BASE_URL } from "../config.js";  // note "../": we are inside the tools/ folder

// index.js calls this once per request and hands over the server to add tools to.
export function registerPublicTools(server) {
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
}