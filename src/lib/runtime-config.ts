// Environment-aware runtime configuration.
// The canonical production identity of Kero AI is kero.egreedtech.org.
// Hosting providers (Lovable preview, Vercel, …) are infrastructure only:
// no application logic may depend on their hostnames.

export const CANONICAL_PRODUCTION_ORIGIN = "https://kero.egreedtech.org";

export type AppEnvironment = "development" | "preview" | "production";

/** Hosts that are treated as preview/testing deployments, never as product identity. */
const PREVIEW_HOST_PATTERNS = [
  /(^|\.)lovable\.app$/,
  /(^|\.)lovableproject\.com$/,
  /(^|\.)vercel\.app$/,
];

const LOCAL_HOST_PATTERNS = [/^localhost$/, /^127\.0\.0\.1$/, /^0\.0\.0\.0$/, /(^|\.)local$/];

export function detectEnvironment(hostname?: string): AppEnvironment {
  const host = hostname ?? (typeof window !== "undefined" ? window.location.hostname : "");
  if (!host) return "production";
  if (LOCAL_HOST_PATTERNS.some((re) => re.test(host))) return "development";
  if (PREVIEW_HOST_PATTERNS.some((re) => re.test(host))) return "preview";
  return "production";
}

/**
 * Origin to use for auth redirects / callbacks. Always dynamically reads the origin
 * the user is actually on (window.location.origin) instead of hardcoding any
 * internal preview hostnames or static cloud URLs.
 * Falls back to the canonical production origin when there is no window (SSR).
 */
export function appOrigin(): string {
  if (typeof window !== "undefined") {
    try {
      const origin = window.location?.origin;
      if (origin && origin !== "null" && origin !== "undefined") {
        return origin.replace(/\/+$/, "");
      }
    } catch {
      // In restricted frames where location access throws
    }
  }
  return CANONICAL_PRODUCTION_ORIGIN;
}

/**
 * Checks whether the application is running inside an iframe / preview container.
 */
export function isEmbeddedFrame(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.self !== window.top;
  } catch {
    // Accessing window.top can throw a DOMException if cross-origin frame
    return true;
  }
}

export function authRedirectUrl(path = "/chat"): string {
  const base = appOrigin();
  const cleanPath = path.startsWith("/") ? path : `/${path}`;
  return `${base}${cleanPath}`;
}

/** All backend calls are same-origin; never build URLs from a hosting hostname. */
export const API_BASE = "";
export const HEALTH_ENDPOINT = "/api/public/kero-health";
export const CHAT_ENDPOINT = "/api/chat";

/** Hard timeout for the connection check, so the UI can never hang. */
export const HEALTH_TIMEOUT_MS = 12_000;
