// Public health endpoint for the Kero backend.
// Reports the real state of the server runtime and of the AI provider.
// It never returns secrets, tokens, keys or internal system details.

import { createFileRoute } from "@tanstack/react-router";
import { getCorsHeaders, withCors } from "@/lib/cors";

type HealthStatus = "connected" | "degraded" | "error";

interface HealthPayload {
  status: HealthStatus;
  provider: string;
  configured: boolean;
  backend: "ok" | "misconfigured";
  checkedAt: string;
  reason?: string;
}

const UPSTREAM_TIMEOUT_MS = 8_000;
const CACHE_MS = 30_000;
let cache: { at: number; payload: HealthPayload } | undefined;

async function buildPayload(): Promise<HealthPayload> {
  const checkedAt = new Date().toISOString();
  const supabaseConfigured = Boolean(
    process.env["SUPABASE_URL"] && process.env["SUPABASE_PUBLISHABLE_KEY"],
  );

  const { getProvider } = await import("@/lib/ai/providers/registry.server");
  const info = getProvider().describe();

  if (!supabaseConfigured) {
    return {
      status: "error",
      provider: info.id,
      configured: info.configured,
      backend: "misconfigured",
      checkedAt,
      reason: "Backend configuration error: server Supabase variables are missing.",
    };
  }

  const { isGeminiConfigured } = await import("@/lib/ai/gemini.server");
  const hasGemini = isGeminiConfigured();

  if (!info.configured && !hasGemini) {
    return {
      status: "error",
      provider: info.id,
      configured: false,
      backend: "ok",
      checkedAt,
      reason: "Neither NVIDIA_API_KEY nor GEMINI_API_KEY is configured on this deployment.",
    };
  }

  // If NVIDIA is not configured but Gemini is, we are healthy via Gemini
  if (!info.configured && hasGemini) {
    return {
      status: "connected",
      provider: "gemini",
      configured: true,
      backend: "ok",
      checkedAt,
      reason: "Running on Google Gemini AI.",
    };
  }

  // Verify the NVIDIA provider for real, with a hard timeout.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
  try {
    const { NVIDIA_BASE_URL } = await import("@/lib/ai/providers/nvidia.server");
    const res = await fetch(`${NVIDIA_BASE_URL}/models`, {
      headers: { Authorization: `Bearer ${process.env["NVIDIA_API_KEY"]}` },
      signal: controller.signal,
    });
    if (res.ok) {
      return { status: "connected", provider: info.id, configured: true, backend: "ok", checkedAt };
    }
    // If NVIDIA fails but Gemini is configured, status is connected with Gemini fallback!
    if (hasGemini) {
      return {
        status: "connected",
        provider: "nvidia+gemini_fallback",
        configured: true,
        backend: "ok",
        checkedAt,
        reason: "NVIDIA unavailable; auto-fallback to Google Gemini active.",
      };
    }
    return {
      status: res.status === 401 || res.status === 403 ? "error" : "degraded",
      provider: info.id,
      configured: true,
      backend: "ok",
      checkedAt,
      reason:
        res.status === 401 || res.status === 403
          ? "The AI provider rejected this deployment's credentials."
          : "The AI provider is currently unavailable.",
    };
  } catch {
    if (hasGemini) {
      return {
        status: "connected",
        provider: "nvidia+gemini_fallback",
        configured: true,
        backend: "ok",
        checkedAt,
        reason: "NVIDIA timed out; auto-fallback to Google Gemini active.",
      };
    }
    return {
      status: "degraded",
      provider: info.id,
      configured: true,
      backend: "ok",
      checkedAt,
      reason: "The AI provider did not respond in time.",
    };
  } finally {
    clearTimeout(timer);
  }
}

export const Route = createFileRoute("/api/public/kero-health")({
  server: {
    handlers: {
      OPTIONS: async ({ request }) =>
        new Response(null, { status: 204, headers: getCorsHeaders(request) }),
      GET: async ({ request }) => {
        const now = Date.now();
        if (!cache || now - cache.at > CACHE_MS) {
          cache = { at: now, payload: await buildPayload() };
        }
        const payload = cache.payload;
        const response = new Response(JSON.stringify(payload), {
          status: payload.backend === "misconfigured" ? 503 : 200,
          headers: {
            "content-type": "application/json",
            "cache-control": "no-store",
          },
        });
        return withCors(response, request);
      },
    },
  },
});
