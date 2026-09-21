import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { CheckResult, DiagnosticsReport } from "@/lib/ai/types";

/** Lightweight status used by the sidebar badge. */
export const getProviderStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { getProvider } = await import("@/lib/ai/providers/registry.server");
    return getProvider().describe();
  });

export const runConnectionTest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<DiagnosticsReport> => {
    const { getProvider } = await import("@/lib/ai/providers/registry.server");
    const { FALLBACK_NVIDIA_MODELS } = await import("@/lib/ai/providers/nvidia.server");
    const provider = getProvider();
    const info = provider.describe();
    const checks: CheckResult[] = [];

    checks.push({
      id: "api_key",
      label: "NVIDIA API key configured",
      status: info.configured ? "pass" : "fail",
      detail: info.configured
        ? "NVIDIA_API_KEY is present in the server environment."
        : "NVIDIA_API_KEY is missing. Add it as a secret, then republish the app.",
    });

    const { isGeminiConfigured, getGeminiClient } = await import("@/lib/ai/gemini.server");
    const geminiActive = isGeminiConfigured();
    checks.push({
      id: "gemini_fallback",
      label: "Google Gemini auto-fallback",
      status: geminiActive ? "pass" : "warn",
      detail: geminiActive
        ? "GEMINI_API_KEY is configured. If NVIDIA fails or times out, Kero will automatically answer with Gemini."
        : "GEMINI_API_KEY is not configured. Add GEMINI_API_KEY as a backup secret so Kero never goes down if NVIDIA fails.",
    });

    if (!info.configured && !geminiActive) {
      return { provider: info.id, model: info.model, checks, ok: false };
    }

    if (!info.configured && geminiActive) {
      try {
        const ai = getGeminiClient();
        const testRes = await ai.models.generateContent({
          model: "gemini-3.8-flash",
          contents: "Reply with exactly: KERO GEMINI OK",
        });
        checks.push({
          id: "gemini_completion",
          label: "Gemini fallback live test",
          status: "pass",
          detail: `Gemini active & responding: "${(testRes.text ?? "").slice(0, 100)}"`,
        });
      } catch (geminiTestErr) {
        checks.push({
          id: "gemini_completion",
          label: "Gemini fallback live test",
          status: "fail",
          detail:
            geminiTestErr instanceof Error
              ? geminiTestErr.message.slice(0, 300)
              : "Gemini test failed",
        });
      }
      return { provider: "gemini", model: "gemini-3.8-flash", checks, ok: true };
    }

    // 2. Reachability + model list
    let models: string[] = [];
    const startList = Date.now();
    try {
      models = await provider.listModels();
      checks.push({
        id: "reachability",
        label: "NVIDIA endpoint reachable",
        status: "pass",
        detail: `integrate.api.nvidia.com answered with ${models.length} models.`,
        durationMs: Date.now() - startList,
      });
    } catch (error) {
      checks.push({
        id: "reachability",
        label: "NVIDIA endpoint reachable",
        status: "fail",
        detail: error instanceof Error ? error.message.slice(0, 300) : "Unknown error",
        durationMs: Date.now() - startList,
      });
    }

    // 3. Model availability
    if (models.length > 0) {
      const available = models.includes(info.model);
      const suggestion = FALLBACK_NVIDIA_MODELS.find((m) => models.includes(m));
      checks.push({
        id: "model",
        label: `Model available (${info.model})`,
        status: available ? "pass" : "warn",
        detail: available
          ? "The configured model is listed for this key."
          : suggestion
            ? `Not listed. A working alternative is ${suggestion} — set NVIDIA_MODEL to use it.`
            : "Not listed for this key. Set NVIDIA_MODEL to a model your key can access.",
      });
    }

    // 4. Real completion
    const startCompletion = Date.now();
    try {
      const result = await provider.testCompletion("Reply with exactly: KERO OK");
      const text = result.text.trim();
      checks.push({
        id: "completion",
        label: "Live completion test",
        status: text.length > 0 ? "pass" : "warn",
        detail:
          text.length > 0
            ? `Model replied: "${text.slice(0, 120)}"`
            : "Model returned an empty reply.",
        durationMs: Date.now() - startCompletion,
      });
    } catch (error) {
      checks.push({
        id: "completion",
        label: "Live completion test",
        status: "fail",
        detail: error instanceof Error ? error.message.slice(0, 300) : "Unknown error",
        durationMs: Date.now() - startCompletion,
      });
    }

    const ok = checks.every((c) => c.status !== "fail");

    await context.supabase.from("audit_logs").insert({
      user_id: context.userId,
      action: "connection_test",
      details: { provider: info.id, model: info.model, ok } as never,
    });

    return { provider: info.id, model: info.model, checks, ok };
  });

export const listAuditLogs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("audit_logs")
      .select("id, action, details, created_at")
      .order("created_at", { ascending: false })
      .limit(25);
    if (error) throw new Error(error.message);
    return data ?? [];
  });
