import { useState, useRef, useEffect } from "react";
import { Mic, Square, Loader2, Sparkles, Volume2, PhoneOff } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { blobToBase64, playPcmAudio } from "@/lib/audio/client";
import type { UiMessage } from "./ChatView";

interface LiveVoiceModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  conversationId: string;
  recentMessages: UiMessage[];
  onMessageAdded: (userText: string, assistantReply: string) => void;
}

export function LiveVoiceModal({
  open,
  onOpenChange,
  conversationId,
  recentMessages,
  onMessageAdded,
}: LiveVoiceModalProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isPlayingReply, setIsPlayingReply] = useState(false);
  const [transcript, setTranscript] = useState<string>("");
  const [lastReply, setLastReply] = useState<string>("");

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const currentPlaybackRef = useRef<{ stop: () => void } | null>(null);
  const recordStartTimeRef = useRef<number>(0);

  // Stop any ongoing audio when modal closes
  useEffect(() => {
    if (!open) {
      if (currentPlaybackRef.current) {
        currentPlaybackRef.current.stop();
        currentPlaybackRef.current = null;
      }
      if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
        mediaRecorderRef.current.stop();
      }
      setIsRecording(false);
      setIsProcessing(false);
      setIsPlayingReply(false);
    }
  }, [open]);

  const startRecording = async () => {
    try {
      if (currentPlaybackRef.current) {
        currentPlaybackRef.current.stop();
        currentPlaybackRef.current = null;
        setIsPlayingReply(false);
      }

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : "audio/webm";
      const mediaRecorder = new MediaRecorder(stream, { mimeType });

      audioChunksRef.current = [];
      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        stream.getTracks().forEach((track) => track.stop());
        const duration = Date.now() - recordStartTimeRef.current;
        const audioBlob = new Blob(audioChunksRef.current, { type: mimeType });

        if (audioBlob.size < 800 || duration < 500) {
          toast.info("Recording was too short. Please speak clearly before stopping.");
          setIsProcessing(false);
          return;
        }

        const cleanMime = mimeType.split(";")[0]?.trim() || "audio/webm";
        await handleSendVoice(audioBlob, cleanMime);
      };

      mediaRecorderRef.current = mediaRecorder;
      recordStartTimeRef.current = Date.now();
      mediaRecorder.start(250);
      setIsRecording(true);
      setTranscript("");
    } catch (err) {
      console.error("Microphone access failed", err);
      toast.error("Unable to access microphone. Please check your browser permissions.");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const handleSendVoice = async (audioBlob: Blob, mimeType: string) => {
    setIsProcessing(true);
    try {
      const base64Audio = await blobToBase64(audioBlob);
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) {
        toast.error("Please sign in to use voice chat.");
        setIsProcessing(false);
        return;
      }

      const cleanMime = mimeType.split(";")[0]?.trim() || "audio/webm";
      const response = await fetch("/api/audio/voice-chat", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          audioBase64: base64Audio,
          mimeType: cleanMime,
          conversationId,
          history: recentMessages
            .filter((m) => !m.isError && m.content.trim().length > 0)
            .map((m) => ({ role: m.role, content: m.content }))
            .slice(-10),
          voice: "Kore",
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || "Failed to process voice note");
      }

      const result = await response.json();
      setTranscript(result.userTranscript || "");
      setLastReply(result.replyText || "");

      if (result.noSpeechDetected) {
        toast.info("No speech detected. Please speak louder or closer to the microphone.");
      } else if (result.userTranscript && result.replyText) {
        onMessageAdded(result.userTranscript, result.replyText);
      }

      // Play audio response if generated
      if (result.audioReplyBase64) {
        setIsPlayingReply(true);
        const playback = await playPcmAudio(result.audioReplyBase64, result.sampleRate || 24000);
        currentPlaybackRef.current = playback;
      }
    } catch (error) {
      console.error("Voice chat error", error);
      const msg = error instanceof Error ? error.message : "Voice conversation failed";
      toast.error(msg);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2 text-primary">
            <Sparkles className="size-5" />
            <DialogTitle>Kero Voice Conversation</DialogTitle>
          </div>
          <DialogDescription>
            Speak freely in Kinyarwanda, English, French, or Swahili. Gemini Live will transcribe
            your voice note, respond intelligently, and read the reply aloud.
          </DialogDescription>
        </DialogHeader>

        <div className="my-6 flex flex-col items-center justify-center gap-6">
          {/* Visual animation circle */}
          <div className="relative flex items-center justify-center">
            {isRecording && (
              <span className="absolute size-28 animate-ping rounded-full bg-primary/20 duration-1000" />
            )}
            {isPlayingReply && (
              <span className="absolute size-28 animate-pulse rounded-full bg-emerald-500/20" />
            )}

            <button
              type="button"
              onClick={isRecording ? stopRecording : startRecording}
              disabled={isProcessing}
              aria-label={isRecording ? "Stop recording" : "Start speaking"}
              className={`relative z-10 flex size-20 items-center justify-center rounded-full shadow-lg transition-transform hover:scale-105 active:scale-95 ${
                isRecording
                  ? "bg-destructive text-destructive-foreground"
                  : isPlayingReply
                    ? "bg-emerald-600 text-white"
                    : "bg-primary text-primary-foreground"
              }`}
            >
              {isProcessing ? (
                <Loader2 className="size-8 animate-spin" />
              ) : isRecording ? (
                <Square className="size-7" />
              ) : isPlayingReply ? (
                <Volume2 className="size-8 animate-bounce" />
              ) : (
                <Mic className="size-8" />
              )}
            </button>
          </div>

          <div className="text-center">
            <p className="text-sm font-medium">
              {isRecording
                ? "Listening... Tap to finish speaking"
                : isProcessing
                  ? "Transcribing & reading reply with Gemini..."
                  : isPlayingReply
                    ? "Kero is speaking..."
                    : "Tap microphone to speak"}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Powered by model gemini-3.8-live & gemini-3.5-transcribe
            </p>
          </div>

          {/* Transcript / Reply card */}
          {(transcript || lastReply) && (
            <div className="w-full space-y-3 rounded-xl border border-border bg-card/60 p-3.5 text-xs text-foreground">
              {transcript && (
                <div>
                  <span className="font-semibold text-muted-foreground">You said:</span>
                  <p className="mt-0.5 text-sm">{transcript}</p>
                </div>
              )}
              {lastReply && (
                <div className="border-t border-border/60 pt-2">
                  <span className="font-semibold text-primary">Kero:</span>
                  <p className="mt-0.5 text-sm">{lastReply}</p>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2">
          {isPlayingReply && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                if (currentPlaybackRef.current) {
                  currentPlaybackRef.current.stop();
                  currentPlaybackRef.current = null;
                }
                setIsPlayingReply(false);
              }}
            >
              <PhoneOff className="mr-1.5 size-3.5" /> Stop Reading
            </Button>
          )}
          <Button variant="secondary" size="sm" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
