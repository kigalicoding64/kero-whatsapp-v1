// Cross-Origin Resource Sharing (CORS) helper.
// Ensures browser clients from outside the preview window, custom domains,
// or local environments can interact with all server endpoints and auth routes.

export function getCorsHeaders(requestOrOrigin?: Request | string | null): Headers {
  let origin = "";
  if (typeof requestOrOrigin === "string") {
    origin = requestOrOrigin;
  } else if (requestOrOrigin && "headers" in requestOrOrigin) {
    origin = requestOrOrigin.headers.get("origin") ?? "";
  }

  const headers = new Headers();
  const allowOrigin = origin && origin !== "null" ? origin : "*";
  headers.set("Access-Control-Allow-Origin", allowOrigin);
  headers.set("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS, HEAD");
  headers.set(
    "Access-Control-Allow-Headers",
    "authorization, content-type, apikey, x-client-info, x-supabase-auth, x-requested-with, accept, baggage, sentry-trace",
  );
  headers.set("Access-Control-Max-Age", "86400");
  headers.set("Vary", "Origin, Access-Control-Request-Headers");

  if (allowOrigin !== "*") {
    headers.set("Access-Control-Allow-Credentials", "true");
  }

  return headers;
}

export function handleCorsPreflight(request: Request): Response | null {
  if (request.method.toUpperCase() === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: getCorsHeaders(request),
    });
  }
  return null;
}

export function withCors(response: Response, requestOrOrigin?: Request | string | null): Response {
  const corsHeaders = getCorsHeaders(requestOrOrigin);
  const newHeaders = new Headers(response.headers);

  corsHeaders.forEach((value, key) => {
    // Preserve response content-type and existing specific headers, but ensure CORS is set
    if (!newHeaders.has(key) || key.toLowerCase() === "access-control-allow-origin") {
      newHeaders.set(key, value);
    }
  });

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: newHeaders,
  });
}
