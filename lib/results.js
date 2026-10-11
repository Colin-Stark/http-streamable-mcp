// =============================================================================
// lib/results.js: build the result objects MCP expects from a tool
// =============================================================================
// A tool must return { content: [ ...blocks ] }. The model only ever sees these
// blocks, so every tool ends by returning one of the two shapes below.

// Success: one block of text for the model to read.
export function textResult(text) {
    return { content: [{ type: "text", text }] };
}

// Failure: same shape plus isError: true. The model reads the message and can react
// (for example by calling `login` when the message says "Not logged in").
export function errorResult(text) {
    return { isError: true, content: [{ type: "text", text }] };
}