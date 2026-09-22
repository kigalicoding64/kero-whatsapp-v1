// Public route to serve generated voice notes for WhatsApp Cloud API downloads.
// Path: GET /api/public/whatsapp/media?id=<token>

import { createFileRoute } from "@tanstack/react-router";
import { getCorsHeaders } from "@/lib/cors";

export const Route = createFileRoute("/api/public/whatsapp/media")({
  server: {
    handlers: {
      OPTIONS: async ({ request }) =>
        new Response(null, { status: 204, headers: getCorsHeaders(request) }),

      GET: async ({ request }) => {
        const url = new URL(request.url);
        const id = url.searchParams.get("id");

        if (!id) {
          return new Response("Missing media token", {
            status: 400,
            headers: {
              ...getCorsHeaders(request),
              "content-type": "text/plain",
            },
          });
        }

        const { getAudioMedia } = await import("@/lib/whatsapp/media.server");
        const entry = getAudioMedia(id);

        if (!entry) {
          return new Response("Media not found or expired", {
            status: 404,
            headers: {
              ...getCorsHeaders(request),
              "content-type": "text/plain",
            },
          });
        }

        const cors = getCorsHeaders(request);
        const headers: Record<string, string> = {
          ...cors,
          "content-type": entry.mimeType,
          "content-length": String(entry.buffer.length),
          "accept-ranges": "bytes",
          "cache-control": "public, max-age=86400, immutable",
        };

        // Handle simple HTTP Range header for streaming playback
        const rangeHeader = request.headers.get("range");
        if (rangeHeader && rangeHeader.startsWith("bytes=")) {
          const parts = rangeHeader.replace(/bytes=/, "").split("-");
          const start = parseInt(parts[0] || "0", 10);
          const end = parts[1] ? parseInt(parts[1], 10) : entry.buffer.length - 1;

          if (start < entry.buffer.length && end < entry.buffer.length && start <= end) {
            const chunk = entry.buffer.subarray(start, end + 1);
            headers["content-range"] = `bytes ${start}-${end}/${entry.buffer.length}`;
            headers["content-length"] = String(chunk.length);
            return new Response(chunk, { status: 206, headers });
          }
        }

        return new Response(entry.buffer, {
          status: 200,
          headers,
        });
      },
    },
  },
});
