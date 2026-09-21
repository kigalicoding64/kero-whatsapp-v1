import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { getCorsHeaders, withCors } from "@/lib/cors";

const BodySchema = z.object({
  conversationId: z.string().uuid().optional(),
  model: z.string().max(200).optional(),
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().max(24000),
      }),
    )
    .min(1)
    .max(100),
});

function errorResponse(status: number, code: string, message: string, request?: Request) {
  const resp = new Response(JSON.stringify({ error: code, message }), {
    status,
    headers: { "content-type": "application/json" },
  });
  return withCors(resp, request);
}

export const Route = createFileRoute("/api/chat")({
  server: {
    handlers: {
      OPTIONS: async ({ request }) =>
        new Response(null, { status: 204, headers: getCorsHeaders(request) }),
      POST: async ({ request }) => {
        const { authenticateRequest } = await import("@/lib/api-auth.server");
        const auth = await authenticateRequest(request);
        if (!auth) return errorResponse(401, "unauthorized", "Please sign in again.", request);

        let parsed;
        try {
          parsed = BodySchema.parse(await request.json());
        } catch {
          return errorResponse(400, "bad_request", "Invalid request body.", request);
        }

        const { getProvider } = await import("@/lib/ai/providers/registry.server");
        const { buildMessages } = await import("@/lib/ai/prompt.server");
        const { isGeminiConfigured } = await import("@/lib/ai/gemini.server");
        const { geminiProvider } = await import("@/lib/ai/providers/gemini.server");

        const nvidia = getProvider("nvidia");
        const hasNvidia = nvidia.describe().configured;
        const hasGemini = isGeminiConfigured();

        if (!hasNvidia && !hasGemini) {
          return errorResponse(
            503,
            "missing_api_key",
            "Kero requires an API key to answer. Please configure NVIDIA_API_KEY or GEMINI_API_KEY in settings.",
            request,
          );
        }

        const { configuredModel, FALLBACK_NVIDIA_MODELS } =
          await import("@/lib/ai/providers/nvidia.server");
        const { retrieveKinyarwandaContext, detectConversationSignals } =
          await import("@/lib/ai/kinyarwanda/retrieval.server");

        // A deployment can be pinned (via NVIDIA_MODEL) to a model NVIDIA has
        // retired — that answers 404/410. Try the known-good models in order.
        const candidates = [
          ...(parsed.model ? [parsed.model] : [configuredModel()]),
          ...FALLBACK_NVIDIA_MODELS,
        ].filter((model, index, all) => all.indexOf(model) === index);

        const signals = detectConversationSignals(parsed.messages);
        const retrieved = retrieveKinyarwandaContext(parsed.messages, 5);
        const kinyarwandaDirective = signals.kinyarwanda
          ? signals.business
            ? "\n[IMPORTANT LINGUISTIC DIRECTIVE - BUSINESS KINYARWANDA]: The user is communicating in a business, corporate, or customer service context in Kinyarwanda. Use accurate, formal terminology (e.g., 'Umukiriya', 'Sosiyete/Ikigo', 'Ubufatanye', 'Inama', 'Amasezerano', 'Inyemezabwishyu', 'Ubwishyu', 'Igiciro/Ibiciro', 'Konti', 'Ijambobanga', 'Kode yo kwemeza', 'Sisitemu/Urubuga'). Maintain a helpful, respectful, and professional tone ('Murakoze', 'Mumeze mute?'). Never use 'Urakaza neza' to answer 'Murakoze/Urakoze'."
            : "\n[IMPORTANT LINGUISTIC DIRECTIVE - NATURAL KINYARWANDA]: The user is speaking Kinyarwanda. Reply strictly in authentic, natural Rwandan Kinyarwanda. Use real everyday words ('Ni meza', 'Nta kibazo', 'Meze neza', 'Urakoze nawe', 'Sawa sawa', 'Turi kumwe', 'Kabisa', 'Rwose'). NEVER use 'Urakaza neza' to answer 'Urakoze'. Keep greetings and casual chat brief (1-2 sentences) and warm, without robotic customer support closing questions."
          : "";
        const contextHint = `\nConversation signals: ${JSON.stringify(signals)}${kinyarwandaDirective}${retrieved ? `\nLanguage reference:\n${retrieved}` : ""}`;
        const messages = buildMessages(parsed.messages, 30, contextHint);

        let upstream: Response | undefined;

        // Try NVIDIA primary if configured
        if (hasNvidia) {
          for (const model of candidates) {
            try {
              upstream = await nvidia.streamChat({ messages, model, signal: request.signal });
            } catch (error) {
              console.warn("[chat] NVIDIA stream request attempt failed", error);
              break;
            }
            if (upstream.ok && upstream.body) break;
            if (upstream.status !== 404 && upstream.status !== 410) break;
            console.warn(`[chat] model unavailable (${upstream.status}): ${model}`);
            await upstream.text().catch(() => "");
          }
        }

        // If NVIDIA failed, rate-limited, rejected key, or wasn't configured, fallback immediately to Gemini!
        const nvidiaFailed = !upstream || !upstream.ok || !upstream.body;
        if (nvidiaFailed && hasGemini) {
          console.info(
            "[chat] NVIDIA failed or unavailable, falling back seamlessly to Google Gemini",
          );
          try {
            const geminiRes = await geminiProvider.streamChat({
              messages,
              signal: request.signal,
            });
            if (geminiRes.ok && geminiRes.body) {
              return geminiRes;
            }
          } catch (geminiError) {
            console.error("[chat] Gemini fallback also failed", geminiError);
          }
        }

        if (!upstream) {
          return errorResponse(502, "upstream_unreachable", "Could not reach the AI service.");
        }

        if (!upstream.ok || !upstream.body) {
          const detail = (await upstream.text().catch(() => "")).slice(0, 500);
          console.error("[chat] upstream error", upstream.status, detail);
          const message =
            upstream.status === 401 || upstream.status === 403
              ? "The NVIDIA API key was rejected. Check the key or configure GEMINI_API_KEY as fallback."
              : upstream.status === 429
                ? "NVIDIA is rate limiting requests. Please retry in a moment."
                : upstream.status === 404 || upstream.status === 410
                  ? "The configured AI model is no longer available from NVIDIA. Update the model setting or configure GEMINI_API_KEY as fallback."
                  : `AI service returned an error (${upstream.status}).`;
          return errorResponse(
            upstream.status === 429 ? 429 : 502,
            "upstream_error",
            message,
            request,
          );
        }

        const response = new Response(upstream.body, {
          status: 200,
          headers: {
            "content-type": "text/event-stream; charset=utf-8",
            "cache-control": "no-store",
            connection: "keep-alive",
          },
        });
        return withCors(response, request);
      },
    },
  },
});
