import { useState, useRef, useEffect } from "react";
import { Volume2, VolumeX, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { playPcmAudio } from "@/lib/audio/client";

interface ReadAloudButtonProps {
  text: string;
}

export function ReadAloudButton({ text }: ReadAloudButtonProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const playbackRef = useRef<{ stop: () => void } | null>(null);

  useEffect(() => {
    return () => {
      if (playbackRef.current) {
        playbackRef.current.stop();
        playbackRef.current = null;
      }
    };
  }, []);

  const handleTogglePlay = async () => {
    if (isPlaying) {
      if (playbackRef.current) {
        playbackRef.current.stop();
        playbackRef.current = null;
      }
      setIsPlaying(false);
      return;
    }

    if (!text.trim()) return;

    setIsLoading(true);
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) {
        toast.error("Please sign in to use voice reading.");
        setIsLoading(false);
        return;
      }

      // Limit length for read aloud
      const cleanText = text
        .replace(/```[\s\S]*?```/g, "Code block omitted.")
        .replace(/`([^`]+)`/g, "$1")
        .slice(0, 3000);

      const res = await fetch("/api/audio/speak", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          text: cleanText,
          voice: "Kore",
        }),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.message || "Failed to generate voice reading");
      }

      const json = await res.json();
      if (!json.audioBase64) {
        throw new Error("No audio returned from speech synthesis");
      }

      setIsPlaying(true);
      const playback = await playPcmAudio(json.audioBase64, json.sampleRate || 24000);
      playbackRef.current = playback;
    } catch (err) {
      console.error("Read aloud error", err);
      const msg = err instanceof Error ? err.message : "Failed to read aloud";
      toast.error(msg);
      setIsPlaying(false);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Button
      type="button"
      size="icon"
      variant="ghost"
      onClick={handleTogglePlay}
      disabled={isLoading}
      title={isPlaying ? "Stop reading aloud" : "Read message aloud (gemini-3.1-flash-tts)"}
      aria-label="Read message aloud"
      className="size-7 rounded-md text-muted-foreground hover:text-foreground"
    >
      {isLoading ? (
        <Loader2 className="size-3.5 animate-spin" />
      ) : isPlaying ? (
        <VolumeX className="size-3.5 text-destructive" />
      ) : (
        <Volume2 className="size-3.5" />
      )}
    </Button>
  );
}
