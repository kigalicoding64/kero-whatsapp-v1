import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { AlertCircle, ExternalLink, Globe } from "lucide-react";

import { KeroMark } from "@/components/kero/KeroMark";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { supabase } from "@/integrations/supabase/client";
import { appOrigin, authRedirectUrl, isEmbeddedFrame } from "@/lib/runtime-config";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign in to Kero AI — Egreed Technology" },
      {
        name: "description",
        content:
          "Sign in or create an account to chat with Kero, the Egreed Technology AI assistant.",
      },
      { property: "og:title", content: "Sign in to Kero AI" },
      {
        property: "og:description",
        content: "Access your Kero conversations at Egreed Technology.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AuthPage,
});

interface AuthErrorMessage {
  title: string;
  description: string;
  isCrossOrigin: boolean;
}

function parseUrlAuthErrors(): AuthErrorMessage | null {
  if (typeof window === "undefined") return null;

  // Check URL hash (e.g. #error=access_denied&error_description=...)
  const hash = window.location.hash.startsWith("#") ? window.location.hash.substring(1) : "";
  const hashParams = new URLSearchParams(hash);

  // Check query string (?error=...&error_description=...)
  const searchParams = new URLSearchParams(window.location.search);

  const error = hashParams.get("error") || searchParams.get("error");
  const errorDescription =
    hashParams.get("error_description") ||
    searchParams.get("error_description") ||
    hashParams.get("message") ||
    searchParams.get("message");

  if (!error && !errorDescription) return null;

  const rawDesc = errorDescription || error || "Authentication error occurred.";
  const decodedDesc = decodeURIComponent(rawDesc.replace(/\+/g, " "));

  const isRedirectMismatch =
    decodedDesc.toLowerCase().includes("redirect") ||
    decodedDesc.toLowerCase().includes("url") ||
    decodedDesc.toLowerCase().includes("mismatch") ||
    error === "unauthorized_client";

  const isCrossOrigin =
    isRedirectMismatch ||
    decodedDesc.toLowerCase().includes("cross-origin") ||
    decodedDesc.toLowerCase().includes("origin");

  return {
    title: isRedirectMismatch ? "Cross-Origin Redirect Mismatch" : "Authentication Error",
    description: decodedDesc,
    isCrossOrigin,
  };
}

function formatAuthError(error: unknown): AuthErrorMessage {
  if (!error) {
    return {
      title: "Error",
      description: "An unexpected error occurred. Please try again.",
      isCrossOrigin: false,
    };
  }

  const rawMessage = error instanceof Error ? error.message : String(error);
  const lower = rawMessage.toLowerCase();

  const isCorsOrNetwork =
    lower.includes("failed to fetch") ||
    lower.includes("networkerror") ||
    lower.includes("network request failed") ||
    lower.includes("cross-origin") ||
    lower.includes("cors") ||
    lower.includes("load failed") ||
    lower.includes("access is denied") ||
    lower.includes("securityerror") ||
    lower.includes("insecure") ||
    lower.includes("storage");

  if (isCorsOrNetwork) {
    return {
      title: "Cross-Origin Connection Error",
      description:
        "Unable to communicate with the authentication server from this context. Your browser or preview container may be restricting cross-origin cookies or network requests.",
      isCrossOrigin: true,
    };
  }

  if (lower.includes("invalid login credentials")) {
    return {
      title: "Invalid Credentials",
      description:
        "Invalid email or password. Please verify your email and password and try again.",
      isCrossOrigin: false,
    };
  }

  if (lower.includes("user already registered")) {
    return {
      title: "Account Exists",
      description: "An account with this email already exists. Please switch to Sign in.",
      isCrossOrigin: false,
    };
  }

  return {
    title: "Authentication Failed",
    description: rawMessage,
    isCrossOrigin: false,
  };
}

function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [authError, setAuthError] = useState<AuthErrorMessage | null>(null);
  const [isFramed, setIsFramed] = useState(false);
  const [currentOrigin, setCurrentOrigin] = useState("");

  useEffect(() => {
    setIsFramed(isEmbeddedFrame());
    const origin = appOrigin();
    setCurrentOrigin(origin);

    // Parse any callback or redirect errors present in URL fragment or search
    const urlErr = parseUrlAuthErrors();
    if (urlErr) {
      setAuthError(urlErr);
      // Clean up URL to avoid repeating the error state on refresh
      if (typeof window !== "undefined" && window.history?.replaceState) {
        window.history.replaceState(null, "", window.location.pathname);
      }
    }

    // Check active session on initial load
    void supabase.auth.getSession().then(({ data, error }) => {
      if (error) {
        const formatted = formatAuthError(error);
        if (formatted.isCrossOrigin) {
          setAuthError(formatted);
        }
      } else if (data.session) {
        navigate({ to: "/chat" });
      }
    });

    // Listen for auth state changes (e.g. from token exchange or external confirmation)
    const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
      if (session && (event === "SIGNED_IN" || event === "INITIAL_SESSION")) {
        navigate({ to: "/chat" });
      }
    });

    return () => {
      authListener.subscription.unsubscribe();
    };
  }, [navigate]);

  const openInNewTab = () => {
    if (typeof window !== "undefined") {
      window.open(window.location.href, "_blank", "noopener,noreferrer");
    }
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setAuthError(null);

    // Always dynamically read the current window origin
    const redirectUrl = authRedirectUrl("/chat");

    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: redirectUrl },
        });
        if (error) throw error;
        toast.success("Account created. Check your inbox to confirm your email.");
        setMode("signin");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        navigate({ to: "/chat" });
      }
    } catch (error) {
      const formatted = formatAuthError(error);
      setAuthError(formatted);
      toast.error(formatted.description);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-5 py-12">
      <div className="w-full max-w-md">
        {/* Top frame notice when embedded */}
        {isFramed && (
          <div className="mb-6 flex items-center justify-between gap-3 rounded-xl border border-primary/20 bg-primary/5 p-3 text-xs text-foreground/90">
            <div className="flex items-center gap-2">
              <Globe className="size-4 shrink-0 text-primary" />
              <span>Viewing in preview frame. Having trouble signing in?</span>
            </div>
            <button
              type="button"
              onClick={openInNewTab}
              className="inline-flex shrink-0 items-center gap-1 font-medium text-primary hover:underline"
            >
              Open in new tab
              <ExternalLink className="size-3" />
            </button>
          </div>
        )}

        <div className="flex flex-col items-center text-center">
          <KeroMark className="size-14" />
          <h1 className="mt-4 font-display text-2xl font-semibold">
            {mode === "signin" ? "Welcome back to Kero" : "Create your Kero account"}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">Egreed Technology AI assistant</p>
        </div>

        {/* Dynamic origin indicator */}
        {currentOrigin && (
          <div className="mt-3 flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
            <span className="inline-block size-1.5 rounded-full bg-emerald-500" />
            <span>
              Connected to origin: <code className="text-foreground">{currentOrigin}</code>
            </span>
          </div>
        )}

        {/* Cross-origin or general authentication error alert */}
        {authError && (
          <Alert
            variant={authError.isCrossOrigin ? "default" : "destructive"}
            className="mt-6 border-destructive/40 bg-destructive/5 text-destructive dark:bg-destructive/10"
          >
            <AlertCircle className="size-4 text-destructive" />
            <div className="space-y-2">
              <AlertTitle className="font-semibold text-destructive">{authError.title}</AlertTitle>
              <AlertDescription className="text-xs text-destructive/90">
                {authError.description}
              </AlertDescription>
              {authError.isCrossOrigin && (
                <div className="pt-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={openInNewTab}
                    className="h-8 border-destructive/30 bg-background text-xs text-foreground hover:bg-destructive/10"
                  >
                    <ExternalLink className="mr-1.5 size-3" />
                    Open in New Window to Sign In
                  </Button>
                </div>
              )}
            </div>
          </Alert>
        )}

        <form
          onSubmit={submit}
          className="mt-6 space-y-4 rounded-2xl border border-border bg-card p-6 shadow-sm"
        >
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              placeholder="you@example.com"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              autoComplete={mode === "signin" ? "current-password" : "new-password"}
              placeholder="••••••••"
              required
              minLength={6}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </div>

          <Button type="submit" className="w-full" disabled={busy}>
            {busy ? "Please wait…" : mode === "signin" ? "Sign in" : "Create account"}
          </Button>

          <button
            type="button"
            className="w-full text-center text-sm text-muted-foreground hover:text-foreground"
            onClick={() => {
              setAuthError(null);
              setMode(mode === "signin" ? "signup" : "signin");
            }}
          >
            {mode === "signin" ? "New here? Create an account" : "Already have an account? Sign in"}
          </button>
        </form>
      </div>
    </div>
  );
}
