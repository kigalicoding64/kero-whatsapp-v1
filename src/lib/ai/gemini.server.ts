// Server-only Gemini client helper
import { GoogleGenAI, type GenerateContentResponse } from "@google/genai";

let aiInstance: GoogleGenAI | null = null;

export function getGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey.trim().length === 0) {
    throw new Error(
      "GEMINI_API_KEY is not configured. Please add the GEMINI_API_KEY secret in the app settings to enable audio notes, voice transcription, and reading.",
    );
  }

  if (!aiInstance) {
    aiInstance = new GoogleGenAI({
      apiKey: apiKey.trim(),
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        },
      },
    });
  }

  return aiInstance;
}

export function isGeminiConfigured(): boolean {
  return Boolean(process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.trim().length > 0);
}

// Track temporary high demand cooldowns per model (e.g. 503 spikes)
const modelCooldownMap = new Map<string, number>();
const COOLDOWN_DURATION_MS = 90_000; // 90 seconds

export function isModelInCooldown(model: string): boolean {
  const expiry = modelCooldownMap.get(model);
  if (!expiry) return false;
  if (Date.now() > expiry) {
    modelCooldownMap.delete(model);
    return false;
  }
  return true;
}

export function markModelCooldown(model: string): void {
  modelCooldownMap.set(model, Date.now() + COOLDOWN_DURATION_MS);
}

export function isTransientGeminiError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const anyErr = err as Record<string, unknown>;
  const status =
    typeof anyErr.status === "number"
      ? anyErr.status
      : typeof anyErr.code === "number"
        ? anyErr.code
        : undefined;
  const message = typeof anyErr.message === "string" ? anyErr.message : "";
  return (
    status === 503 ||
    status === 429 ||
    status === 500 ||
    status === 502 ||
    status === 504 ||
    message.includes("503") ||
    message.includes("429") ||
    message.includes("high demand") ||
    message.includes("UNAVAILABLE") ||
    message.includes("RESOURCE_EXHAUSTED") ||
    message.includes("overloaded") ||
    message.includes("rate limit") ||
    message.includes("quota")
  );
}

export const TEXT_MODEL_CANDIDATES = [
  "gemini-3.8-flash",
  "gemini-3.1-flash-lite",
  "gemini-flash-latest",
] as const;

export const AUDIO_TRANSCRIBE_CANDIDATES = [
  "gemini-3.5-transcribe",
  "gemini-3.1-flash-lite",
  "gemini-3.8-flash",
] as const;

export interface FallbackGenerateOptions {
  models: readonly string[] | string[];
  contents: Parameters<GoogleGenAI["models"]["generateContent"]>[0]["contents"];
  config?: Parameters<GoogleGenAI["models"]["generateContent"]>[0]["config"];
}

export async function generateContentWithFallback(
  ai: GoogleGenAI,
  options: FallbackGenerateOptions,
): Promise<{ response: GenerateContentResponse; usedModel: string }> {
  // Sort models putting non-cooldown models first
  const rawList = options.models.length > 0 ? [...options.models] : [...TEXT_MODEL_CANDIDATES];
  const sortedModels = [
    ...rawList.filter((m) => !isModelInCooldown(m)),
    ...rawList.filter((m) => isModelInCooldown(m)),
  ];

  let lastError: unknown = null;

  for (let i = 0; i < sortedModels.length; i++) {
    const model = sortedModels[i]!;
    try {
      const response = await ai.models.generateContent({
        model,
        contents: options.contents,
        config: options.config,
      });
      // Successful call clears any cooldown
      modelCooldownMap.delete(model);
      return { response, usedModel: model };
    } catch (err: unknown) {
      lastError = err;
      const isTransient = isTransientGeminiError(err);
      if (isTransient) {
        markModelCooldown(model);
      }

      const nextModel = sortedModels[i + 1];
      if (nextModel) {
        console.info(
          `[gemini] Model ${model} is temporarily busy, switching seamlessly to ${nextModel}...`,
        );
        continue;
      }
      break;
    }
  }

  throw lastError;
}
