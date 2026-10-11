// =============================================================================
// config.js: settings and connections shared by every file
// =============================================================================

// Loads the .env file into process.env. It must run BEFORE anything below reads
// process.env, which is why it is the first import in this file.
import "dotenv/config";
import { Redis } from "@upstash/redis"; // Upstash Redis client (works over HTTPS)

/**
 * The base URL for the bank API. It can be set via the BASE_URL environment variable, or defaults to "https://fastify-api-xi.vercel.app".
 * @type {string}
 */
export const BASE_URL = process.env.BASE_URL;

// Connection to Upstash Redis, read from UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN.
// `export` lets other files do:  import { redis } from "../config.js"
// Node runs this file only once and shares the same `redis` object everywhere.
export const redis = Redis.fromEnv();