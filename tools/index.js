// =============================================================================
// tools/index.js: one place that registers every tool group
// =============================================================================
import { registerPublicTools } from "./public.js";
import { registerAuthTools } from "./auth.js";
import { registerAccountTools } from "./accounts.js";
import { registerTransactionTools } from "./transactions.js";

// `context` carries per-request data (like sessionId) to the groups that need it.
export function registerAllTools(server, context) {
    registerPublicTools(server);            // does not need the context
    registerAuthTools(server, context);
    registerAccountTools(server, context);
    registerTransactionTools(server, context);
    // Adding a new group later? Create a new tool file, import it above,
    // and add one line here. index.js does not change.
}