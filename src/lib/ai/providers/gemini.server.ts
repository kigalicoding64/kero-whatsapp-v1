// Server-only Gemini provider implementing the AiProvider interface
// Compatible with OpenAI SSE streaming format so client ChatView works transparently!

import type { AiProvider, ChatMessage } from "../types";
import {
  getGeminiClient,
  isGeminiConfigured,
  isModelInCooldown,
  markModelCooldown,
  isTransientGeminiError,
} from "../gemini.server";

export const DEFAULT_GEMINI_MODEL = "gemini-3.8-flash";

function createSseEvent(content: string): string {
  const payload = JSON.stringify({
    choices: [
      {
        delta: { content },
        index: 0,
      },
    ],
  });
  return `data: ${payload}\n\n`;
}

export const geminiProvider: AiProvider = {
  id: "gemini",
  label: "Google Gemini",

  describe() {
    return {
      id: "gemini",
      label: "Google Gemini",
      model: DEFAULT_GEMINI_MODEL,
      configured: isGeminiConfigured(),
    };
  },

  async streamChat({ messages, model, signal }) {
    const ai = getGeminiClient();
    const systemMessage = messages.find((m) => m.role === "system")?.content;
    const nonSystem = messages.filter((m) => m.role !== "system");

    // Convert messages to Gemini format
    const contents = nonSystem.map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    }));

    const rawCandidates = [
      model || DEFAULT_GEMINI_MODEL,
      "gemini-3.1-flash-lite",
      "gemini-flash-latest",
    ];
    const candidateModels = [
      ...rawCandidates.filter((m) => !isModelInCooldown(m)),
      ...rawCandidates.filter((m) => isModelInCooldown(m)),
    ];

    let responseStream: Awaited<ReturnType<typeof ai.models.generateContentStream>> | null = null;
    let lastError: unknown = null;

    for (let i = 0; i < candidateModels.length; i++) {
      const candidate = candidateModels[i]!;
      try {
        responseStream = await ai.models.generateContentStream({
          model: candidate,
          contents,
          config: {
            ...(systemMessage ? { systemInstruction: systemMessage } : {}),
            temperature: 0.7,
          },
        });
        break;
      } catch (err: unknown) {
        lastError = err;
        if (isTransientGeminiError(err)) {
          markModelCooldown(candidate);
        }
        const next = candidateModels[i + 1];
        if (next) {
          console.info(
            `[gemini-provider] Model ${candidate} stream failed, falling back to ${next}...`,
          );
          continue;
        }
        break;
      }
    }

    if (!responseStream) {
      throw lastError || new Error("Failed to start Gemini stream");
    }

    const encoder = new TextEncoder();
    const readableStream = new ReadableStream({
      async start(controller) {
        if (signal) {
          signal.addEventListener("abort", () => {
            controller.close();
          });
        }
        try {
          for await (const chunk of responseStream) {
            if (signal?.aborted) break;
            const chunkText = chunk.text;
            if (chunkText) {
              controller.enqueue(encoder.encode(createSseEvent(chunkText)));
            }
          }
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          controller.close();
        } catch (err) {
          if (!signal?.aborted) {
            console.error("[gemini-provider] stream error", err);
            controller.error(err);
          }
        }
      },
    });

    return new Response(readableStream, {
      status: 200,
      headers: {
        "content-type": "text/event-stream; charset=utf-8",
        "cache-control": "no-store",
        connection: "keep-alive",
      },
    });
  },

  async listModels() {
    return [
      "gemini-3.8-flash",
      "gemini-3.1-pro-preview",
      "gemini-3.1-flash-lite",
      "gemini-3.5-transcribe",
      "gemini-3.1-flash-tts-preview",
    ];
  },

  async testCompletion(prompt: string) {
    const ai = getGeminiClient();
    const res = await ai.models.generateContent({
      model: DEFAULT_GEMINI_MODEL,
      contents: prompt,
    });
    return {
      text: res.text ?? "",
      model: DEFAULT_GEMINI_MODEL,
    };
  },
};
