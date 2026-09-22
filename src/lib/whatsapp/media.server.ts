// Server-only media utilities for WhatsApp voice notes (receive, transcribe, synthesize, and send).

import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { Modality } from "@google/genai";
import {
  getGeminiClient,
  isGeminiConfigured,
  AUDIO_TRANSCRIBE_CANDIDATES,
  isTransientGeminiError,
  markModelCooldown,
} from "@/lib/ai/gemini.server";
import { gatewayFetch, keys, sendWhatsAppAudio } from "@/lib/whatsapp/gateway.server";
import { isFishAudioConfigured, synthesizeFishAudio } from "@/lib/ai/tts/fish-audio.server";

export interface MediaEntry {
  buffer: Buffer;
  mimeType: string;
  createdAt: number;
}

// In-memory media cache for WhatsApp Cloud API download requests (auto-cleans after 2 hours)
const mediaCache = new Map<string, MediaEntry>();
const CACHE_TTL_MS = 2 * 60 * 60 * 1000;

export function storeAudioMedia(buffer: Buffer, mimeType: string): string {
  cleanExpiredMedia();
  const token = randomBytes(24).toString("hex");
  mediaCache.set(token, {
    buffer,
    mimeType,
    createdAt: Date.now(),
  });
  return token;
}

export function getAudioMedia(token: string): MediaEntry | null {
  cleanExpiredMedia();
  const entry = mediaCache.get(token);
  if (!entry) return null;
  return entry;
}

function cleanExpiredMedia() {
  const now = Date.now();
  for (const [key, entry] of mediaCache.entries()) {
    if (now - entry.createdAt > CACHE_TTL_MS) {
      mediaCache.delete(key);
    }
  }
}

/** Prepend a 44-byte RIFF header to 16-bit 24kHz mono PCM, creating a valid WAV file. */
export function pcmToWav(
  pcmBuffer: Buffer,
  sampleRate = 24000,
  numChannels = 1,
  bitsPerSample = 16,
): Buffer {
  const byteRate = (sampleRate * numChannels * bitsPerSample) / 8;
  const blockAlign = (numChannels * bitsPerSample) / 8;
  const dataSize = pcmBuffer.length;
  const header = Buffer.alloc(44);

  header.write("RIFF", 0);
  header.writeUInt32LE(36 + dataSize, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(numChannels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write("data", 36);
  header.writeUInt32LE(dataSize, 40);

  return Buffer.concat([header, pcmBuffer]);
}

/** Converts raw 24kHz 16-bit mono PCM into standard WhatsApp native OGG Opus audio. */
export async function convertPcmToOggOpus(pcmBuffer: Buffer, sampleRate = 24000): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const ff = spawn("ffmpeg", [
      "-hide_banner",
      "-loglevel",
      "error",
      "-f",
      "s16le",
      "-ar",
      String(sampleRate),
      "-ac",
      "1",
      "-i",
      "pipe:0",
      "-c:a",
      "libopus",
      "-b:a",
      "32k",
      "-vbr",
      "on",
      "-application",
      "voip",
      "-f",
      "ogg",
      "pipe:1",
    ]);

    const chunks: Buffer[] = [];
    let errOutput = "";

    ff.stdout.on("data", (chunk: Buffer) => chunks.push(chunk));
    ff.stderr.on("data", (chunk: Buffer) => {
      errOutput += chunk.toString();
    });

    ff.on("error", (err) => reject(err));
    ff.on("close", (code) => {
      if (code === 0 && chunks.length > 0) {
        resolve(Buffer.concat(chunks));
      } else {
        reject(new Error(`ffmpeg exited with code ${code}: ${errOutput}`));
      }
    });

    ff.stdin.write(pcmBuffer);
    ff.stdin.end();
  });
}

/** Downloads audio binary from WhatsApp Cloud API or direct attachment link. */
export async function downloadWhatsAppAudio(audio: {
  id?: string;
  mime_type?: string;
  link?: string;
  url?: string;
}): Promise<{ buffer: Buffer; mimeType: string } | null> {
  // 1. Direct link if already supplied
  const directUrl = audio.link || audio.url;
  if (directUrl) {
    try {
      const res = await fetch(directUrl);
      if (res.ok) {
        const arrayBuf = await res.arrayBuffer();
        const mime = res.headers.get("content-type") || audio.mime_type || "audio/ogg";
        return { buffer: Buffer.from(arrayBuf), mimeType: mime };
      }
    } catch (err) {
      console.warn("[whatsapp] failed to fetch audio from direct URL", err);
    }
  }

  // 2. Resolve via media ID
  if (!audio.id) return null;

  try {
    const { connection } = keys();
    // Try fetching media details from gateway
    let mediaUrl: string | null = null;
    let mimeType = audio.mime_type || "audio/ogg";

    // Attempt A: GET /{mediaId} on the gateway
    const metaRes = await gatewayFetch(`/${audio.id}`, { method: "GET" });
    if (metaRes.ok) {
      const cType = metaRes.headers.get("content-type") || "";
      if (cType.includes("application/json")) {
        const json = (await metaRes.json()) as { url?: string; mime_type?: string };
        if (json.url) {
          mediaUrl = json.url;
          if (json.mime_type) mimeType = json.mime_type;
        }
      } else if (cType.includes("audio") || cType.includes("octet-stream")) {
        // Streamed directly
        const buf = Buffer.from(await metaRes.arrayBuffer());
        return { buffer: buf, mimeType: cType };
      }
    }

    // Attempt B: If mediaUrl not found, try GET /media/{mediaId} on the gateway
    if (!mediaUrl) {
      const mediaRes = await gatewayFetch(`/media/${audio.id}`, { method: "GET" });
      if (mediaRes.ok) {
        const cType = mediaRes.headers.get("content-type") || "";
        if (cType.includes("application/json")) {
          const json = (await mediaRes.json()) as { url?: string; mime_type?: string };
          if (json.url) {
            mediaUrl = json.url;
            if (json.mime_type) mimeType = json.mime_type;
          }
        } else if (cType.includes("audio") || cType.includes("octet-stream")) {
          const buf = Buffer.from(await mediaRes.arrayBuffer());
          return { buffer: buf, mimeType: cType };
        }
      }
    }

    // Attempt C: Direct Graph API call if token is available
    if (!mediaUrl && connection) {
      try {
        const graphRes = await fetch(`https://graph.facebook.com/v21.0/${audio.id}`, {
          headers: {
            Authorization: `Bearer ${connection}`,
          },
        });
        if (graphRes.ok) {
          const json = (await graphRes.json()) as { url?: string; mime_type?: string };
          if (json.url) {
            mediaUrl = json.url;
            if (json.mime_type) mimeType = json.mime_type;
          }
        }
      } catch (graphErr) {
        console.warn("[whatsapp] direct Graph API media lookup failed", graphErr);
      }
    }

    if (!mediaUrl) {
      console.warn(`[whatsapp] could not find media URL for id ${audio.id}`);
      return null;
    }

    // 3. Download the actual audio payload from mediaUrl
    // Meta downloads require Authorization: Bearer <WHATSAPP_API_KEY> and User-Agent
    let downloadRes = await fetch(mediaUrl, {
      headers: {
        Authorization: `Bearer ${connection}`,
        "User-Agent": "aistudio-build",
      },
    });

    if (!downloadRes.ok && (downloadRes.status === 401 || downloadRes.status === 403)) {
      // Retry without auth in case it's a signed pre-authenticated CDN URL
      downloadRes = await fetch(mediaUrl, {
        headers: { "User-Agent": "aistudio-build" },
      });
    }

    if (!downloadRes.ok) {
      console.error(
        `[whatsapp] failed to download media payload (${downloadRes.status}): ${await downloadRes.text().catch(() => "")}`,
      );
      return null;
    }

    const arrayBuf = await downloadRes.arrayBuffer();
    const finalMime = downloadRes.headers.get("content-type") || mimeType;
    return { buffer: Buffer.from(arrayBuf), mimeType: finalMime };
  } catch (error) {
    console.error("[whatsapp] downloadWhatsAppAudio exception", error);
    return null;
  }
}

/** Transcribe an incoming voice note using Gemini's audio transcription models. */
export async function transcribeWhatsAppAudio(buffer: Buffer, mimeType: string): Promise<string> {
  if (!isGeminiConfigured()) {
    throw new Error("GEMINI_API_KEY is not configured for voice transcription");
  }

  const ai = getGeminiClient();
  const base64Data = buffer.toString("base64");

  // Normalize MIME type
  const rawMime = mimeType.split(";")[0]?.trim().toLowerCase() || "audio/ogg";
  const cleanMime =
    rawMime === "audio/x-m4a"
      ? "audio/m4a"
      : rawMime === "audio/x-wav"
        ? "audio/wav"
        : rawMime || "audio/ogg";

  const promptText =
    "Transcribe this voice note accurately. The speaker may be speaking Kinyarwanda, English, French, Swahili, or a mix of these languages. Preserve authentic speech, greetings, and expressions. Return ONLY the transcribed text without quotes, formatting, or commentary. If there is no audible speech, reply with nothing.";

  for (const model of AUDIO_TRANSCRIBE_CANDIDATES) {
    try {
      const response = await ai.models.generateContent({
        model,
        contents: [
          {
            inlineData: {
              mimeType: cleanMime,
              data: base64Data,
            },
          },
          {
            text: promptText,
          },
        ],
      });
      const text = response.text?.trim() ?? "";
      if (text) return text;
    } catch (err: unknown) {
      if (isTransientGeminiError(err)) {
        markModelCooldown(model);
      }
      console.info(
        `[whatsapp-voice] Model ${model} unavailable for transcription, trying next candidate...`,
      );
    }
  }

  return "";
}

/** Synthesize speech from text using Fish Audio or Gemini TTS and encode to native WhatsApp OGG Opus. */
export async function synthesizeVoiceNote(
  text: string,
  voice: "Kore" | "Puck" | "Charon" | "Fenrir" | "Zephyr" = "Kore",
  languageHint?: string,
): Promise<{ buffer: Buffer; mimeType: string }> {
  // If Fish Audio is configured, try it for natural multilingual human voice
  if (isFishAudioConfigured()) {
    try {
      console.info("[whatsapp-voice] synthesizing voice note with Fish Audio TTS...");
      const fishResult = await synthesizeFishAudio({
        text,
        format: "opus",
      });
      if (fishResult.buffer && fishResult.buffer.length > 0) {
        return fishResult;
      }
    } catch (fishErr) {
      console.warn(
        "[whatsapp-voice] Fish Audio synthesis failed, falling back to Gemini TTS",
        fishErr,
      );
    }
  }

  if (!isGeminiConfigured()) {
    throw new Error(
      "Neither FISH_AUDIO_API_KEY nor GEMINI_API_KEY is configured for speech synthesis",
    );
  }

  const ai = getGeminiClient();

  const promptPrefix = languageHint?.includes("kinyarwanda")
    ? "Read the following message in fluent, natural Kinyarwanda with authentic Rwandan pronunciation and warm tone: "
    : languageHint?.includes("french")
      ? "Lisez le message suivant en français de manière fluide, chaleureuse et naturelle: "
      : languageHint?.includes("swahili")
        ? "Soma ujumbe ufuatao kwa Kiswahili fasaha, wazi na kwa utulivu: "
        : "Read the following message clearly, warmly, and naturally, pronouncing African, Rwandan, and English names or words accurately: ";

  const response = await ai.models.generateContent({
    model: "gemini-3.1-flash-tts-preview",
    contents: [
      {
        parts: [
          {
            text: `${promptPrefix}${text}`,
          },
        ],
      },
    ],
    config: {
      responseModalities: [Modality.AUDIO],
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: { voiceName: voice },
        },
      },
    },
  });

  const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
  if (!base64Audio) {
    throw new Error("No speech audio generated from Gemini TTS");
  }

  const pcmBuffer = Buffer.from(base64Audio, "base64");

  // Attempt OGG Opus encoding via ffmpeg for authentic WhatsApp voice note rendering
  try {
    const oggBuffer = await convertPcmToOggOpus(pcmBuffer, 24000);
    return { buffer: oggBuffer, mimeType: "audio/ogg; codecs=opus" };
  } catch (convErr) {
    console.warn(
      "[whatsapp-voice] ffmpeg opus conversion failed, falling back to WAV header",
      convErr,
    );
    const wavBuffer = pcmToWav(pcmBuffer, 24000);
    return { buffer: wavBuffer, mimeType: "audio/wav" };
  }
}

/** Sends a voice note to a WhatsApp recipient using direct upload or hosted public link. */
export async function sendWhatsAppVoiceNote(
  to: string,
  audioBuffer: Buffer,
  mimeType: string,
  serverOrigin: string,
): Promise<{ ok: boolean; id: string | null; error?: string }> {
  // Strategy 1: Try direct media upload to gateway /media if available
  try {
    const formData = new FormData();
    formData.append("messaging_product", "whatsapp");
    const cleanType = mimeType.includes("ogg") ? "audio/ogg" : mimeType;
    formData.append("type", cleanType);

    const ext = cleanType.includes("ogg") ? "ogg" : "wav";
    const fileBlob = new Blob([audioBuffer], { type: cleanType });
    formData.append("file", fileBlob, `voice-note.${ext}`);

    const uploadRes = await gatewayFetch("/media", {
      method: "POST",
      body: formData,
    });

    if (uploadRes.ok) {
      const json = (await uploadRes.json()) as { id?: string };
      if (json.id) {
        const sendResult = await sendWhatsAppAudio(to, { id: json.id });
        if (sendResult.ok) {
          return { ok: true, id: sendResult.id };
        }
      }
    }
  } catch (uploadErr) {
    console.info(
      "[whatsapp-voice] direct upload failed, proceeding with public URL fallback",
      uploadErr,
    );
  }

  // Strategy 2: Host on public media route and send link
  const token = storeAudioMedia(audioBuffer, mimeType);
  const mediaUrl = `${serverOrigin.replace(/\/+$/, "")}/api/public/whatsapp/media?id=${token}`;

  const sendResult = await sendWhatsAppAudio(to, { link: mediaUrl });
  if (sendResult.ok) {
    return { ok: true, id: sendResult.id };
  }

  return { ok: false, id: null, error: sendResult.error };
}
