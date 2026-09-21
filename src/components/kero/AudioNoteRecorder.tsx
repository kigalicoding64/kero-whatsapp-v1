import { useState, useRef } from "react";
import { Mic, Square, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { blobToBase64 } from "@/lib/audio/client";

interface AudioNoteRecorderProps {
  onTranscribed: (text: string) => void;
  disabled?: boolean;
}

export function AudioNoteRecorder({ onTranscribed, disabled }: AudioNoteRecorderProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const recordStartTimeRef = useRef<number>(0);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : "audio/webm";

      const mediaRecorder = new MediaRecorder(stream, { mimeType });
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = async () => {
        stream.getTracks().forEach((track) => track.stop());
        const duration = Date.now() - recordStartTimeRef.current;
        const blob = new Blob(chunksRef.current, { type: mimeType });

        if (blob.size < 800 || duration < 500) {
          toast.info("Recording too short. Please speak before clicking stop.");
          setIsTranscribing(false);
          return;
        }

        const cleanMime = mimeType.split(";")[0]?.trim() || "audio/webm";
        await handleTranscribe(blob, cleanMime);
      };

      mediaRecorderRef.current = mediaRecorder;
      recordStartTimeRef.current = Date.now();
      mediaRecorder.start(250);
      setIsRecording(true);
      toast.info("Recording audio note... speak now");
    } catch (err) {
      console.error("Mic access error", err);
      toast.error("Microphone access denied. Please allow microphone permissions.");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const handleTranscribe = async (blob: Blob, mimeType: string) => {
    setIsTranscribing(true);
    try {
      const base64Audio = await blobToBase64(blob);
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) {
        toast.error("Please sign in to transcribe audio.");
        setIsTranscribing(false);
        return;
      }

      const res = await fetch("/api/audio/transcribe", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          audioBase64: base64Audio,
          mimeType,
        }),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.message || "Transcription failed");
      }

      const json = await res.json();
      if (json.text && json.text.trim()) {
        onTranscribed(json.text.trim());
        toast.success("Audio note transcribed!");
      } else {
        toast.info("No speech detected in audio note.");
      }
    } catch (err) {
      console.error("Transcription error", err);
      const msg = err instanceof Error ? err.message : "Failed to transcribe audio";
      toast.error(msg);
    } finally {
      setIsTranscribing(false);
    }
  };

  return (
    <Button
      type="button"
      size="icon"
      variant={isRecording ? "destructive" : "ghost"}
      disabled={disabled || isTranscribing}
      onClick={isRecording ? stopRecording : startRecording}
      title={
        isRecording
          ? "Stop recording and transcribe"
          : isTranscribing
            ? "Transcribing with gemini-3.5-transcribe..."
            : "Record audio note (voice typing)"
      }
      aria-label="Record voice note"
      className="size-8 rounded-full"
    >
      {isTranscribing ? (
        <Loader2 className="size-4 animate-spin text-primary" />
      ) : isRecording ? (
        <Square className="size-3.5" />
      ) : (
        <Mic className="size-4" />
      )}
    </Button>
  );
}
