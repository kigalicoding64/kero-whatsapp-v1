// Server-only Fish Audio TTS client integration.
// Supports custom voices and multilingual speech synthesis including African accents and languages.

export function isFishAudioConfigured(): boolean {
  return Boolean(
    process.env.FISH_AUDIO_API_KEY && process.env.FISH_AUDIO_API_KEY.trim().length > 0,
  );
}

export interface FishAudioSynthesisOptions {
  text: string;
  format?: "opus" | "mp3" | "wav";
  referenceId?: string;
  latency?: "normal" | "balanced";
}

/**
 * Synthesizes audio using the Fish Audio API (https://api.fish.audio/v1/tts).
 * Returns audio buffer and MIME type.
 */
export async function synthesizeFishAudio(
  options: FishAudioSynthesisOptions,
): Promise<{ buffer: Buffer; mimeType: string }> {
  const apiKey = process.env.FISH_AUDIO_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("FISH_AUDIO_API_KEY is not configured");
  }

  const format = options.format || "opus";
  const body: Record<string, unknown> = {
    text: options.text,
    format,
    latency: options.latency || "normal",
  };

  if (options.referenceId) {
    body.reference_id = options.referenceId;
  }

  const res = await fetch("https://api.fish.audio/v1/tts", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      Accept:
        format === "opus" ? "audio/opus, audio/ogg" : format === "wav" ? "audio/wav" : "audio/mpeg",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errorText = await res.text().catch(() => "");
    throw new Error(`Fish Audio TTS failed (${res.status}): ${errorText.slice(0, 300)}`);
  }

  const arrayBuf = await res.arrayBuffer();
  const buffer = Buffer.from(arrayBuf);
  const mimeType =
    format === "opus" ? "audio/ogg; codecs=opus" : format === "wav" ? "audio/wav" : "audio/mpeg";

  return { buffer, mimeType };
}
