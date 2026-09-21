import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { getCorsHeaders, withCors } from "@/lib/cors";

const TranscribeSchema = z.object({
  audioBase64: z.string().min(10, "Audio data is required"),
  mimeType: z.string().default("audio/webm"),
  prompt: z.string().max(2000).optional(),
});

function errorResponse(status: number, code: string, message: string, request?: Request) {
  const resp = new Response(JSON.stringify({ error: code, message }), {
    status,
    headers: { "content-type": "application/json" },
  });
  return withCors(resp, request);
}

export const Route = createFileRoute("/api/audio/transcribe")({
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
          parsed = TranscribeSchema.parse(await request.json());
        } catch {
          return errorResponse(400, "bad_request", "Invalid audio payload.", request);
        }

        const {
          isGeminiConfigured,
          getGeminiClient,
          AUDIO_TRANSCRIBE_CANDIDATES,
          isTransientGeminiError,
          markModelCooldown,
        } = await import("@/lib/ai/gemini.server");
        if (!isGeminiConfigured()) {
          return errorResponse(
            503,
            "missing_api_key",
            "GEMINI_API_KEY is not configured. Please add the GEMINI_API_KEY secret to enable voice transcription.",
            request,
          );
        }

        try {
          const ai = getGeminiClient();
          // Clean base64 header if present
          const base64Data = parsed.audioBase64.includes(",")
            ? parsed.audioBase64.split(",")[1]!
            : parsed.audioBase64;

          // Normalize MIME type by stripping codecs or parameters
          const rawMime = (parsed.mimeType || "audio/webm").split(";")[0]?.trim().toLowerCase();
          const cleanMimeType =
            rawMime === "audio/x-m4a"
              ? "audio/m4a"
              : rawMime === "audio/x-wav"
                ? "audio/wav"
                : rawMime || "audio/webm";

          let transcription = "";

          const promptText =
            parsed.prompt ||
            "Transcribe this audio recording accurately. The speaker may be speaking Kinyarwanda, English, French, Swahili, or a mix of these. Preserve authentic words and spelling. Return ONLY the transcribed text. If there is no speech, reply with nothing.";

          for (const model of AUDIO_TRANSCRIBE_CANDIDATES) {
            try {
              const response = await ai.models.generateContent({
                model,
                contents: [
                  {
                    inlineData: {
                      mimeType: cleanMimeType,
                      data: base64Data,
                    },
                  },
                  {
                    text: promptText,
                  },
                ],
              });
              const text = response.text?.trim() ?? "";
              if (text) {
                transcription = text;
                break;
              }
            } catch (err: unknown) {
              if (isTransientGeminiError(err)) {
                markModelCooldown(model);
              }
              console.info(`[transcribe] Model ${model} unavailable, trying next candidate...`);
            }
          }

          const successResp = new Response(JSON.stringify({ text: transcription }), {
            status: 200,
            headers: { "content-type": "application/json" },
          });
          return withCors(successResp, request);
        } catch (error) {
          console.error("[transcribe] audio transcription failed", error);
          const msg = error instanceof Error ? error.message : "Failed to transcribe audio";
          return errorResponse(500, "transcription_error", msg, request);
        }
      },
    },
  },
});
