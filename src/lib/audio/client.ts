// Helper utilities for recording audio, converting audio formats,
// and playing raw 24kHz PCM / audio buffers seamlessly in the browser.

/**
 * Converts a base64 encoded string to an ArrayBuffer.
 */
export function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binaryString = window.atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
}

/**
 * Converts a Blob to a base64 string (without data URL prefix).
 */
export async function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const res = reader.result as string;
      const base64 = res.includes(",") ? res.split(",")[1]! : res;
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/**
 * Decodes 24kHz 16-bit Mono PCM base64 audio and plays it via Web Audio API.
 */
export async function playPcmAudio(
  base64Pcm: string,
  sampleRate = 24000,
): Promise<{ stop: () => void }> {
  const arrayBuffer = base64ToArrayBuffer(base64Pcm);
  const int16View = new Int16Array(arrayBuffer);
  const float32Array = new Float32Array(int16View.length);

  for (let i = 0; i < int16View.length; i++) {
    // Normalize 16-bit integer (-32768 to 32767) to -1.0 to 1.0 float
    float32Array[i] = int16View[i]! / 32768.0;
  }

  const audioCtx = new (
    window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
  )({
    sampleRate,
  });

  if (audioCtx.state === "suspended") {
    await audioCtx.resume();
  }

  const audioBuffer = audioCtx.createBuffer(1, float32Array.length, sampleRate);
  audioBuffer.copyToChannel(float32Array, 0);

  const source = audioCtx.createBufferSource();
  source.buffer = audioBuffer;
  source.connect(audioCtx.destination);
  source.start(0);

  return {
    stop: () => {
      try {
        source.stop();
        audioCtx.close().catch(() => {});
      } catch {
        /* already stopped */
      }
    },
  };
}
