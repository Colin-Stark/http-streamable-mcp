// =============================================================================
// lib/crypto.js: encrypt and decrypt the JWT (AES-256-GCM)
// =============================================================================
// Redis should never hold a usable JWT. We encrypt before saving and decrypt after
// reading. Only a server that knows TOKEN_ENCRYPTION_KEY can open the stored value.
import { randomBytes, createCipheriv, createDecipheriv } from "node:crypto";

// Read TOKEN_ENCRYPTION_KEY from the environment and check it is usable.
// It must be 64 hex characters, which decode to exactly 32 bytes (what AES-256 needs).
// Checking here gives a clear message instead of Node's vague "Invalid key length".
function getKey() {
    const hex = process.env.TOKEN_ENCRYPTION_KEY;
    if (!hex) {
        throw new Error("TOKEN_ENCRYPTION_KEY is not set. Add it to your .env file (or Vercel environment variables).");
    }
    if (!/^[0-9a-fA-F]{64}$/.test(hex)) {
        // We report the length only, never the key itself.
        throw new Error(
            `TOKEN_ENCRYPTION_KEY must be exactly 64 hex characters (0-9, a-f), but it has ${hex.length} characters ` +
            `or contains other characters.`
        );
    }
    return Buffer.from(hex, "hex"); // 64 hex characters -> 32 bytes
}

// Turn the JWT into an encrypted string that is safe to store.
export function encrypt(plainText) {
    const iv = randomBytes(12);                                   // new random value for every encryption
    const cipher = createCipheriv("aes-256-gcm", getKey(), iv);
    const encrypted = Buffer.concat([cipher.update(plainText, "utf8"), cipher.final()]);
    const authTag = cipher.getAuthTag();                          // tamper-detection seal
    // Pack iv, authTag and the encrypted data into one string: "iv.authTag.encrypted" (base64 parts).
    return [iv, authTag, encrypted].map((part) => part.toString("base64")).join(".");
}

// Reverse of encrypt(): take the stored string and give back the original JWT.
// Throws if the stored value was tampered with or the key is different.
export function decrypt(payload) {
    const [iv, authTag, encrypted] = payload.split(".").map((part) => Buffer.from(part, "base64"));
    const decipher = createDecipheriv("aes-256-gcm", getKey(), iv);
    decipher.setAuthTag(authTag);
    return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
}