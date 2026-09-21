import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { Modality } from "@google/genai";
import { getCorsHeaders, withCors } from "@/lib/cors";

const SpeakSchema = z.object({
  text: z.string().min(1, "Text is required").max(4000),
  voice: z.enum(["Kore", "Puck", "Charon", "Fenrir", "Zephyr"]).default("Kore"),
});

function errorResponse(status: number, code: string, message: string, request?: Request) {
  const resp = new Response(JSON.stringify({ error: code, message }), {
    status,
    headers: { "content-type": "application/json" },
  });
  return withCors(resp, request);
}

export const Route = createFileRoute("/api/audio/speak")({
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
          parsed = SpeakSchema.parse(await request.json());
        } catch {
          return errorResponse(400, "bad_request", "Invalid speak payload.", request);
        }

        const { isGeminiConfigured, getGeminiClient } = await import("@/lib/ai/gemini.server");
        if (!isGeminiConfigured()) {
          return errorResponse(
            503,
            "missing_api_key",
            "GEMINI_API_KEY is not configured. Please add the GEMINI_API_KEY secret to enable reading aloud.",
            request,
          );
        }

        try {
          const ai = getGeminiClient();
          const response = await ai.models.generateContent({
            model: "gemini-3.1-flash-tts-preview",
            contents: [
              {
                parts: [
                  {
                    text: `Read the following message clearly, warmly, and naturally, pronouncing African and Rwandan names or words correctly: ${parsed.text}`,
                  },
                ],
              },
            ],
            config: {
              responseModalities: [Modality.AUDIO],
              speechConfig: {
                voiceConfig: {
                  prebuiltVoiceConfig: { voiceName: parsed.voice },
                },
              },
            },
          });

          const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;

          if (!base64Audio) {
            return errorResponse(500, "tts_error", "No audio output was generated.", request);
          }

          const successResp = new Response(
            JSON.stringify({
              audioBase64: base64Audio,
              mimeType: "audio/pcm;rate=24000",
              sampleRate: 24000,
            }),
            {
              status: 200,
              headers: { "content-type": "application/json" },
            },
          );
          return withCors(successResp, request);
        } catch (error) {
          console.error("[speak] speech generation failed", error);
          const msg = error instanceof Error ? error.message : "Failed to generate speech";
          return errorResponse(500, "tts_error", msg, request);
        }
      },
    },
  },
});
