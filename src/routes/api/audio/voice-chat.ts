import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { getCorsHeaders, withCors } from "@/lib/cors";

const VoiceChatSchema = z.object({
  audioBase64: z.string().min(10, "Audio data is required"),
  mimeType: z.string().default("audio/webm"),
  conversationId: z.string().uuid().optional(),
  history: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().max(10000),
      }),
    )
    .optional(),
  voice: z.enum(["Kore", "Puck", "Charon", "Fenrir", "Zephyr"]).default("Kore"),
});

function errorResponse(status: number, code: string, message: string, request?: Request) {
  const resp = new Response(JSON.stringify({ error: code, message }), {
    status,
    headers: { "content-type": "application/json" },
  });
  return withCors(resp, request);
}

export const Route = createFileRoute("/api/audio/voice-chat")({
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
          parsed = VoiceChatSchema.parse(await request.json());
        } catch {
          return errorResponse(400, "bad_request", "Invalid voice-chat payload.", request);
        }

        const {
          isGeminiConfigured,
          getGeminiClient,
          generateContentWithFallback,
          AUDIO_TRANSCRIBE_CANDIDATES,
          TEXT_MODEL_CANDIDATES,
          isTransientGeminiError,
          markModelCooldown,
        } = await import("@/lib/ai/gemini.server");
        if (!isGeminiConfigured()) {
          return errorResponse(
            503,
            "missing_api_key",
            "GEMINI_API_KEY is not configured. Please add the GEMINI_API_KEY secret in settings to enable voice conversations.",
            request,
          );
        }

        try {
          const ai = getGeminiClient();
          const base64Data = parsed.audioBase64.includes(",")
            ? parsed.audioBase64.split(",")[1]!
            : parsed.audioBase64;

          // Normalize MIME type by stripping codecs or parameters (e.g. audio/webm;codecs=opus -> audio/webm)
          const rawMime = (parsed.mimeType || "audio/webm").split(";")[0]?.trim().toLowerCase();
          const cleanMimeType =
            rawMime === "audio/x-m4a"
              ? "audio/m4a"
              : rawMime === "audio/x-wav"
                ? "audio/wav"
                : rawMime || "audio/webm";

          let userTranscript = "";

          // Step 1: Transcribe user audio note with seamless model failover
          const transcribePrompt =
            "Transcribe this spoken audio exactly. Support Kinyarwanda, English, French, Swahili, and natural mixed speech. Return ONLY the transcription text without commentary. If there is no speech or only background noise, output [SILENCE].";

          for (const model of AUDIO_TRANSCRIBE_CANDIDATES) {
            try {
              const res = await ai.models.generateContent({
                model,
                contents: [
                  {
                    inlineData: {
                      mimeType: cleanMimeType,
                      data: base64Data,
                    },
                  },
                  {
                    text: transcribePrompt,
                  },
                ],
              });
              const text = res.text?.trim() ?? "";
              if (text && !text.includes("[SILENCE]")) {
                userTranscript = text;
                break;
              }
            } catch (err: unknown) {
              if (isTransientGeminiError(err)) {
                markModelCooldown(model);
              }
              console.info(`[voice-chat] Model ${model} unavailable, trying next candidate...`);
            }
          }

          // Step 1c: If still completely empty (mic was muted or recording was silent)
          // Handle gracefully without throwing a blocking 400 error toast
          if (!userTranscript) {
            const politeClarification =
              "Ntabwo numvise neza ijwi ryawe. Ongera uvuge gato wegereye mikorofone, cyangwa ukande akabuto wongere uvuge! (I couldn't hear your voice clearly. Please speak a little closer to the microphone and try again!)";

            let promptAudioBase64: string | null = null;
            try {
              const { Modality } = await import("@google/genai");
              const ttsPrompt = await ai.models.generateContent({
                model: "gemini-3.1-flash-tts-preview",
                contents: [
                  {
                    parts: [
                      {
                        text: "Ntabwo numvise neza ijwi ryawe. Ongera uvuge gato wegereye mikorofone!",
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
              promptAudioBase64 =
                ttsPrompt.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data ?? null;
            } catch (err) {
              console.info("[voice-chat] TTS audio prompt skipped", err);
            }

            return new Response(
              JSON.stringify({
                userTranscript: "(No speech detected / Nta jwi ryumvikanye)",
                replyText: politeClarification,
                audioReplyBase64: promptAudioBase64,
                sampleRate: 24000,
                noSpeechDetected: true,
              }),
              {
                status: 200,
                headers: { "content-type": "application/json" },
              },
            );
          }

          // Step 2: Generate Kero's text reply using our rich persona & language prompt
          const { buildMessages } = await import("@/lib/ai/prompt.server");
          const { detectConversationSignals, retrieveKinyarwandaContext } =
            await import("@/lib/ai/kinyarwanda/retrieval.server");

          const fullHistory = [
            ...(parsed.history ?? []),
            { role: "user" as const, content: userTranscript },
          ];

          const signals = detectConversationSignals(fullHistory);
          const retrieved = retrieveKinyarwandaContext(fullHistory, 5);
          const kinyarwandaDirective = signals.kinyarwanda
            ? signals.business
              ? "\n[IMPORTANT LINGUISTIC DIRECTIVE - BUSINESS KINYARWANDA]: Maintain formal, accurate business terminology ('Umukiriya', 'Sosiyete', 'Inama', 'Amasezerano', 'Ubwishyu', 'Igiciro', 'Sisitemu'). Never reply to 'Murakoze/Urakoze' with 'Urakaza neza'."
              : "\n[IMPORTANT LINGUISTIC DIRECTIVE - NATURAL KINYARWANDA]: Reply in authentic spoken Kinyarwanda ('Ni meza', 'Nta kibazo', 'Meze neza', 'Urakoze nawe', 'Sawa sawa', 'Turi kumwe', 'Kabisa', 'Rwose'). NEVER use 'Urakaza neza' to answer 'Urakoze'. Keep voice replies natural, conversational, and direct."
            : "";
          const contextHint = `\nConversation signals: ${JSON.stringify(signals)}${kinyarwandaDirective}${retrieved ? `\nLanguage reference:\n${retrieved}` : ""}`;

          const messages = buildMessages(fullHistory, 20, contextHint);

          // Format conversation prompt and generate text using resilient fallback
          const systemMsg = messages.find((m) => m.role === "system")?.content ?? "";
          const nonSystem = messages.filter((m) => m.role !== "system");

          const { response: responseTextGen } = await generateContentWithFallback(ai, {
            models: TEXT_MODEL_CANDIDATES,
            contents: nonSystem
              .map((m) => `${m.role === "user" ? "User" : "Kero"}: ${m.content}`)
              .join("\n\n"),
            config: {
              systemInstruction: systemMsg,
              temperature: 0.7,
            },
          });
          const replyText = responseTextGen.text?.trim() ?? "Ndabyumva rwose.";

          // Step 3: Generate spoken audio reading using gemini-3.1-flash-tts-preview
          const { Modality } = await import("@google/genai");
          let audioReplyBase64: string | null = null;
          try {
            const ttsRes = await ai.models.generateContent({
              model: "gemini-3.1-flash-tts-preview",
              contents: [
                {
                  parts: [
                    {
                      text: `Read this voice message naturally, warmly, and clearly: ${replyText}`,
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
            audioReplyBase64 =
              ttsRes.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data ?? null;
          } catch (ttsErr) {
            console.warn("[voice-chat] TTS synthesis failed, returning text-only", ttsErr);
          }

          const successResp = new Response(
            JSON.stringify({
              userTranscript,
              replyText,
              audioReplyBase64,
              sampleRate: 24000,
            }),
            {
              status: 200,
              headers: { "content-type": "application/json" },
            },
          );
          return withCors(successResp, request);
        } catch (error) {
          console.error("[voice-chat] failed", error);
          const msg = error instanceof Error ? error.message : "Voice conversation failed";
          return errorResponse(500, "voice_chat_error", msg, request);
        }
      },
    },
  },
});
