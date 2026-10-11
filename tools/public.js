// =============================================================================
// tools/public.js: tools that call PUBLIC endpoints (no login needed)
// =============================================================================
import { z } from "zod";
import { BASE_URL } from "../config.js";
import { textResult, errorResult } from "../lib/results.js";
import { errorReason } from "../lib/bank.js";

export function registerPublicTools(server) {
    // ---- health_check ----------------------------------------------------------
    server.registerTool(
        "health_check",
        {
            title: "Health Check",
            description: "Check the health of the API",
        },
        async () => {
            try {
                // Call the bank API's public GET /health endpoint, giving up after 10 seconds.
                const res = await fetch(`${BASE_URL}/health`, {
                    signal: AbortSignal.timeout(10_000),
                });

                if (!res.ok) return errorResult(`API is unhealthy (HTTP ${res.status})`);

                const data = await res.json(); // the API replies with { "status": "..." }
                return textResult(`API status: ${data.status}`);
            } catch (err) {
                // Network failure, timeout, or the response was not JSON
                return errorResult(`Could not reach the API: ${err.message}`);
            }
        }
    );

    // ---- register_user ---------------------------------------------------------
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
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ username, email, password }),
                });

                if (!res.ok) {
                    return errorResult(`Registration failed (HTTP ${res.status}): ${await errorReason(res)}`);
                }

                const data = await res.json();
                return textResult(
                    `User registered successfully:\n- ID: ${data.id}\n- Username: ${data.username}\n- Email: ${data.email}\n- Created at: ${data.created_at}\n- Updated at: ${data.updated_at}`
                );
            } catch (err) {
                return errorResult(`Could not reach the API: ${err.message}`);
            }
        }
    );
}