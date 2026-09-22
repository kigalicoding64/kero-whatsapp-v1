import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  ArrowDownLeft,
  ArrowUpRight,
  Check,
  CheckCircle2,
  Clock,
  KeyRound,
  MessageSquare,
  Mic,
  MicOff,
  Phone,
  RefreshCw,
  Send,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Trash2,
  Volume2,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { Switch } from "@/components/ui/switch";
import {
  listRecentWhatsappLogs,
  listWhatsappNumbers,
  removeWhatsappNumber,
  requestWhatsappVerification,
  setWhatsappAutoReply,
  toggleContactVoiceResponse,
  verifyWhatsappCodeInKero,
  whatsappStatus,
} from "@/lib/whatsapp.functions";

interface WhatsAppDashboardProps {
  className?: string;
}

export function WhatsAppDashboard({ className }: WhatsAppDashboardProps) {
  const queryClient = useQueryClient();

  // State
  const [phoneNumber, setPhoneNumber] = useState("");
  const [verifyingPhone, setVerifyingPhone] = useState<string | null>(null);
  const [inputCode, setInputCode] = useState("");
  const [isVerifyModalOpen, setIsVerifyModalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"logs" | "contacts" | "numbers">("logs");

  // Server functions
  const fetchStatus = useServerFn(whatsappStatus);
  const fetchNumbers = useServerFn(listWhatsappNumbers);
  const fetchLogs = useServerFn(listRecentWhatsappLogs);
  const requestCode = useServerFn(requestWhatsappVerification);
  const verifyCodeInKero = useServerFn(verifyWhatsappCodeInKero);
  const toggleAutoReply = useServerFn(setWhatsappAutoReply);
  const deleteNumber = useServerFn(removeWhatsappNumber);
  const toggleVoiceResponse = useServerFn(toggleContactVoiceResponse);

  // Queries
  const statusQuery = useQuery({
    queryKey: ["wa-status"],
    queryFn: () => fetchStatus(),
    refetchInterval: 15000,
  });

  const numbersQuery = useQuery({
    queryKey: ["wa-numbers"],
    queryFn: () => fetchNumbers(),
    refetchInterval: 8000,
  });

  const logsQuery = useQuery({
    queryKey: ["wa-recent-logs"],
    queryFn: () => fetchLogs({ data: { limit: 50 } }),
    refetchInterval: 5000,
  });

  // Mutations
  const addNumberMutation = useMutation({
    mutationFn: () => requestCode({ data: { phone: phoneNumber } }),
    onSuccess: (res) => {
      setVerifyingPhone(res.phone);
      setInputCode("");
      setIsVerifyModalOpen(true);
      toast.success(
        `Verification code sent to WhatsApp on +${res.phone}! Check your WhatsApp and enter the 6 digits below.`,
      );
      void queryClient.invalidateQueries({ queryKey: ["wa-numbers"] });
    },
    onError: (err: Error) => {
      toast.error(err.message || "Failed to initiate number verification.");
    },
  });

  const verifyCodeMutation = useMutation({
    mutationFn: () => {
      if (!verifyingPhone) throw new Error("No phone specified for verification.");
      return verifyCodeInKero({ data: { phone: verifyingPhone, code: inputCode } });
    },
    onSuccess: (res) => {
      toast.success(res.message || "Number verified successfully!");
      setIsVerifyModalOpen(false);
      setPhoneNumber("");
      setVerifyingPhone(null);
      setInputCode("");
      void queryClient.invalidateQueries({ queryKey: ["wa-numbers"] });
      void queryClient.invalidateQueries({ queryKey: ["wa-status"] });
    },
    onError: (err: Error) => {
      toast.error(err.message || "Invalid or expired verification code.");
    },
  });

  const toggleAutoReplyMutation = useMutation({
    mutationFn: (vars: { id: string; autoReply: boolean }) => toggleAutoReply({ data: vars }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["wa-numbers"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const removeNumberMutation = useMutation({
    mutationFn: (id: string) => deleteNumber({ data: { id } }),
    onSuccess: () => {
      toast.success("WhatsApp number removed.");
      void queryClient.invalidateQueries({ queryKey: ["wa-numbers"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const toggleVoiceMutation = useMutation({
    mutationFn: (vars: { contactPhone: string; enabled: boolean }) =>
      toggleVoiceResponse({ data: vars }),
    onSuccess: (res) => {
      toast.success(
        res.enabled
          ? `Automated voice notes enabled for +${res.contactPhone}`
          : `Automated voice notes disabled for +${res.contactPhone} (text replies only)`,
      );
      void queryClient.invalidateQueries({ queryKey: ["wa-recent-logs"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const isGatewayConnected = Boolean(statusQuery.data?.configured);
  const businessNumber = statusQuery.data?.businessNumber;
  const verifiedNumbers = (numbersQuery.data ?? []).filter((n) => n.verified);
  const pendingNumbers = (numbersQuery.data ?? []).filter((n) => !n.verified);

  // Group logs by contact to extract unique contacts with voice preference state
  const contactsMap = new Map<
    string,
    {
      phone: string;
      name: string | null;
      lastActive: string;
      voiceEnabled: boolean;
      totalMessages: number;
    }
  >();

  for (const log of logsQuery.data ?? []) {
    if (!log.contactPhone) continue;
    const existing = contactsMap.get(log.contactPhone);
    if (!existing) {
      contactsMap.set(log.contactPhone, {
        phone: log.contactPhone,
        name: log.contactName,
        lastActive: log.createdAt,
        voiceEnabled: log.voiceNoteReplyEnabled,
        totalMessages: 1,
      });
    } else {
      existing.totalMessages += 1;
      if (new Date(log.createdAt) > new Date(existing.lastActive)) {
        existing.lastActive = log.createdAt;
      }
    }
  }

  const uniqueContacts = Array.from(contactsMap.values());

  return (
    <div className={className}>
      {/* 1. Gateway & Connection Status Banner */}
      <div className="overflow-hidden rounded-2xl border border-border bg-card p-5 shadow-sm">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="font-display text-base font-semibold text-foreground">
                WhatsApp Connection Status
              </span>
              {isGatewayConnected ? (
                <Badge
                  variant="outline"
                  className="border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                >
                  <span className="mr-1.5 size-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  Gateway Connected
                </Badge>
              ) : (
                <Badge
                  variant="outline"
                  className="border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400"
                >
                  <ShieldAlert className="mr-1 size-3" />
                  Credentials Required
                </Badge>
              )}
              <Badge variant="outline" className="border-primary/20 bg-primary/10 text-primary">
                <Mic className="mr-1 size-3" />
                Voice Notes Supported
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground sm:text-sm">
              {businessNumber ? (
                <>
                  Official Egreed Technology Line:{" "}
                  <strong className="font-semibold text-foreground">{businessNumber}</strong>
                </>
              ) : (
                "Connecting Kero AI to WhatsApp Business Gateway for automated audio & text responses."
              )}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                void statusQuery.refetch();
                void numbersQuery.refetch();
                void logsQuery.refetch();
                toast.info("Refreshed WhatsApp status and logs.");
              }}
              className="gap-1.5 text-xs"
            >
              <RefreshCw
                className={`size-3.5 ${logsQuery.isFetching ? "animate-spin text-primary" : ""}`}
              />
              Refresh
            </Button>
          </div>
        </div>

        {/* Quick summary strip */}
        <div className="mt-4 grid grid-cols-2 gap-3 border-t border-border pt-4 sm:grid-cols-4">
          <div className="rounded-xl bg-muted/40 p-3">
            <span className="text-xs font-medium text-muted-foreground">Connected Numbers</span>
            <p className="mt-1 text-lg font-bold text-foreground">{verifiedNumbers.length}</p>
          </div>
          <div className="rounded-xl bg-muted/40 p-3">
            <span className="text-xs font-medium text-muted-foreground">Active Contacts</span>
            <p className="mt-1 text-lg font-bold text-foreground">{uniqueContacts.length}</p>
          </div>
          <div className="rounded-xl bg-muted/40 p-3">
            <span className="text-xs font-medium text-muted-foreground">Voice Responses</span>
            <p className="mt-1 text-lg font-bold text-primary">
              {uniqueContacts.filter((c) => c.voiceEnabled).length} Enabled
            </p>
          </div>
          <div className="rounded-xl bg-muted/40 p-3">
            <span className="text-xs font-medium text-muted-foreground">Logged Messages</span>
            <p className="mt-1 text-lg font-bold text-foreground">{logsQuery.data?.length ?? 0}</p>
          </div>
        </div>
      </div>

      {/* 2. Connect Your Number Card with Direct Verification Workflow */}
      <div className="mt-6 rounded-2xl border border-border bg-card p-5 shadow-sm">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-display text-base font-semibold text-foreground">
              Connect Your WhatsApp Number
            </h2>
            <p className="text-xs text-muted-foreground sm:text-sm">
              Enter your WhatsApp number. Kero will send a 6-digit verification code directly to
              your WhatsApp to verify ownership.
            </p>
          </div>
        </div>

        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          <div className="relative flex-1">
            <Phone className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={phoneNumber}
              onChange={(e) => setPhoneNumber(e.target.value)}
              placeholder="e.g. +250788123456 or +14155552671"
              inputMode="tel"
              className="pl-9 text-sm"
              onKeyDown={(e) => {
                if (e.key === "Enter" && phoneNumber.trim().length >= 8) {
                  addNumberMutation.mutate();
                }
              }}
            />
          </div>
          <Button
            onClick={() => addNumberMutation.mutate()}
            disabled={phoneNumber.trim().length < 8 || addNumberMutation.isPending}
            className="gap-2"
          >
            {addNumberMutation.isPending ? (
              <RefreshCw className="size-4 animate-spin" />
            ) : (
              <Send className="size-4" />
            )}
            Send Code via WhatsApp
          </Button>
        </div>

        {/* Pending verification alert if code was requested */}
        {pendingNumbers.length > 0 && (
          <div className="mt-4 space-y-2">
            {pendingNumbers.map((pending) => (
              <div
                key={pending.id}
                className="flex flex-col justify-between gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3.5 sm:flex-row sm:items-center"
              >
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-amber-800 dark:text-amber-300">
                      Pending Verification: +{pending.phone_e164}
                    </span>
                    <Badge
                      variant="outline"
                      className="border-amber-500/40 text-[10px] text-amber-700 dark:text-amber-300"
                    >
                      Awaiting Code
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Code was dispatched to your WhatsApp. Enter the code to activate instant
                    replies.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    onClick={() => {
                      setVerifyingPhone(pending.phone_e164);
                      setInputCode("");
                      setIsVerifyModalOpen(true);
                    }}
                    className="gap-1.5 text-xs font-medium"
                  >
                    <KeyRound className="size-3.5" />
                    Enter Code
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => removeNumberMutation.mutate(pending.id)}
                    className="size-8 text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 3. Navigation Tabs: Message Logs, Contact Voice Controls, Linked Numbers */}
      <div className="mt-6 flex border-b border-border">
        <button
          onClick={() => setActiveTab("logs")}
          className={`flex items-center gap-2 border-b-2 px-4 py-2.5 text-xs font-medium transition-colors sm:text-sm ${
            activeTab === "logs"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          <MessageSquare className="size-4" />
          Recent Message Logs ({logsQuery.data?.length ?? 0})
        </button>
        <button
          onClick={() => setActiveTab("contacts")}
          className={`flex items-center gap-2 border-b-2 px-4 py-2.5 text-xs font-medium transition-colors sm:text-sm ${
            activeTab === "contacts"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          <Volume2 className="size-4" />
          Contact Voice Controls ({uniqueContacts.length})
        </button>
        <button
          onClick={() => setActiveTab("numbers")}
          className={`flex items-center gap-2 border-b-2 px-4 py-2.5 text-xs font-medium transition-colors sm:text-sm ${
            activeTab === "numbers"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          <ShieldCheck className="size-4" />
          Verified Numbers ({verifiedNumbers.length})
        </button>
      </div>

      {/* 4. Tab 1: Recent Message Logs */}
      {activeTab === "logs" && (
        <div className="mt-4 rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-5">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">
              Live stream of inbound customer messages and Kero automated replies
            </span>
            <span className="text-[11px] text-muted-foreground">Auto-updates every 5s</span>
          </div>

          <div className="space-y-2.5">
            {logsQuery.isLoading ? (
              <div className="flex h-36 items-center justify-center text-sm text-muted-foreground">
                <RefreshCw className="mr-2 size-4 animate-spin text-primary" />
                Loading WhatsApp message logs...
              </div>
            ) : (logsQuery.data ?? []).length === 0 ? (
              <div className="rounded-xl border border-dashed border-border p-8 text-center">
                <MessageSquare className="mx-auto size-8 text-muted-foreground/50" />
                <p className="mt-2 text-sm font-medium text-foreground">No WhatsApp messages yet</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Send a text message or voice note to{" "}
                  {businessNumber || "your connected WhatsApp line"} to see live logs here.
                </p>
              </div>
            ) : (
              (logsQuery.data ?? []).map((log) => {
                const isInbound = log.direction === "inbound";
                return (
                  <div
                    key={log.id}
                    className={`flex flex-col gap-1.5 rounded-xl border p-3 text-xs sm:text-sm ${
                      isInbound ? "border-border bg-muted/20" : "border-primary/20 bg-primary/5"
                    }`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 font-medium">
                        {isInbound ? (
                          <span className="inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-xs font-semibold text-foreground">
                            <ArrowDownLeft className="size-3 text-emerald-500" />
                            {log.contactName ||
                              (log.contactPhone ? `+${log.contactPhone}` : "Customer")}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded bg-primary/10 px-1.5 py-0.5 text-xs font-semibold text-primary">
                            <ArrowUpRight className="size-3 text-primary" />
                            Kero AI
                          </span>
                        )}

                        {log.isVoiceNote && (
                          <Badge
                            variant="secondary"
                            className="h-5 gap-1 rounded bg-primary/15 text-[10px] font-semibold text-primary"
                          >
                            <Mic className="size-2.5" />
                            Voice Note
                          </Badge>
                        )}

                        {log.status === "accepted" || log.status === "received" ? (
                          <span className="text-[11px] text-emerald-600 dark:text-emerald-400">
                            ✓ {log.status}
                          </span>
                        ) : log.error ? (
                          <span className="text-[11px] text-destructive">✗ {log.error}</span>
                        ) : null}
                      </div>

                      <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                        <Clock className="size-3" />
                        {new Date(log.createdAt).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                          second: "2-digit",
                        })}
                      </span>
                    </div>

                    <p className="whitespace-pre-wrap break-words text-foreground">
                      {log.content.replace(/^🎤\s*/, "")}
                    </p>

                    {/* Quick contact voice toggle badge */}
                    {log.contactPhone && (
                      <div className="flex items-center justify-between border-t border-border/60 pt-1.5 text-[11px]">
                        <span className="text-muted-foreground">
                          Contact: <strong>+{log.contactPhone}</strong>
                        </span>
                        <button
                          onClick={() =>
                            toggleVoiceMutation.mutate({
                              contactPhone: log.contactPhone,
                              enabled: !log.voiceNoteReplyEnabled,
                            })
                          }
                          className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
                          title="Click to toggle voice note reply"
                        >
                          {log.voiceNoteReplyEnabled ? (
                            <>
                              <Mic className="size-3 text-emerald-500" />
                              <span className="text-emerald-600 dark:text-emerald-400">
                                Voice Reply: Active
                              </span>
                            </>
                          ) : (
                            <>
                              <MicOff className="size-3 text-amber-500" />
                              <span className="text-amber-600 dark:text-amber-400">
                                Voice Reply: Disabled (Text Only)
                              </span>
                            </>
                          )}
                        </button>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* 5. Tab 2: Specific Contact Voice Controls */}
      {activeTab === "contacts" && (
        <div className="mt-4 rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-5">
          <div className="mb-4">
            <h3 className="font-display text-base font-semibold text-foreground">
              Automated Voice Note Response Preferences
            </h3>
            <p className="text-xs text-muted-foreground sm:text-sm">
              Enable or disable automated audio voice note generation for individual contacts. When
              disabled, Kero will reply to that contact exclusively via text, even if they send
              voice notes.
            </p>
          </div>

          {uniqueContacts.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border p-8 text-center">
              <Volume2 className="mx-auto size-8 text-muted-foreground/50" />
              <p className="mt-2 text-sm font-medium text-foreground">No contact threads yet</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Contacts will appear here automatically when they send a message to your WhatsApp
                line.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {uniqueContacts.map((contact) => (
                <div
                  key={contact.phone}
                  className="flex flex-col justify-between gap-3 rounded-xl border border-border bg-background p-4 sm:flex-row sm:items-center"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-foreground">
                        {contact.name ? `${contact.name} (+${contact.phone})` : `+${contact.phone}`}
                      </span>
                      {contact.voiceEnabled ? (
                        <Badge
                          variant="outline"
                          className="border-emerald-500/30 bg-emerald-500/10 text-[11px] text-emerald-600 dark:text-emerald-400"
                        >
                          <Mic className="mr-1 size-2.5" /> Voice Enabled
                        </Badge>
                      ) : (
                        <Badge
                          variant="outline"
                          className="border-muted bg-muted text-[11px] text-muted-foreground"
                        >
                          <MicOff className="mr-1 size-2.5" /> Text Only
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Last interaction: {new Date(contact.lastActive).toLocaleString()} •{" "}
                      {contact.totalMessages} logged exchange(s)
                    </p>
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">
                        {contact.voiceEnabled ? "Voice Notes Enabled" : "Text Replies Only"}
                      </span>
                      <Switch
                        checked={contact.voiceEnabled}
                        onCheckedChange={(checked) =>
                          toggleVoiceMutation.mutate({
                            contactPhone: contact.phone,
                            enabled: checked,
                          })
                        }
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 6. Tab 3: Verified Numbers */}
      {activeTab === "numbers" && (
        <div className="mt-4 rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-5">
          <div className="mb-4">
            <h3 className="font-display text-base font-semibold text-foreground">
              Connected Numbers ({verifiedNumbers.length})
            </h3>
            <p className="text-xs text-muted-foreground sm:text-sm">
              Numbers linked to this Kero AI account with active auto-reply permissions.
            </p>
          </div>

          {verifiedNumbers.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border p-8 text-center">
              <Phone className="mx-auto size-8 text-muted-foreground/50" />
              <p className="mt-2 text-sm font-medium text-foreground">No verified numbers linked</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Enter your WhatsApp number above to receive a code and verify ownership.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {verifiedNumbers.map((num) => (
                <div
                  key={num.id}
                  className="flex flex-col justify-between gap-3 rounded-xl border border-border bg-background p-4 sm:flex-row sm:items-center"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-foreground">+{num.phone_e164}</span>
                      <Badge
                        variant="outline"
                        className="border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                      >
                        <Check className="mr-1 size-3" /> Verified
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Verified{" "}
                      {num.verified_at
                        ? new Date(num.verified_at).toLocaleDateString()
                        : "recently"}
                    </p>
                  </div>

                  <div className="flex items-center gap-4">
                    <label className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span>Auto-Reply</span>
                      <Switch
                        checked={num.auto_reply}
                        onCheckedChange={(checked) =>
                          toggleAutoReplyMutation.mutate({ id: num.id, autoReply: checked })
                        }
                      />
                    </label>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => removeNumberMutation.mutate(num.id)}
                      className="size-8 text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 7. Enter Verification Code Modal inside Kero space */}
      <Dialog open={isVerifyModalOpen} onOpenChange={setIsVerifyModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
              <KeyRound className="size-6" />
            </div>
            <DialogTitle className="text-center font-display text-lg font-semibold">
              Enter WhatsApp Verification Code
            </DialogTitle>
            <DialogDescription className="text-center text-xs text-muted-foreground sm:text-sm">
              We just sent a 6-digit verification code to your WhatsApp on{" "}
              <strong className="font-semibold text-foreground">
                {verifyingPhone ? `+${verifyingPhone}` : "your phone"}
              </strong>
              . Enter the code below to complete connecting your number.
            </DialogDescription>
          </DialogHeader>

          <div className="my-4 flex flex-col items-center justify-center gap-4">
            <InputOTP
              maxLength={6}
              value={inputCode}
              onChange={(val) => setInputCode(val)}
              className="gap-2"
            >
              <InputOTPGroup>
                <InputOTPSlot index={0} className="size-11 text-lg font-bold" />
                <InputOTPSlot index={1} className="size-11 text-lg font-bold" />
                <InputOTPSlot index={2} className="size-11 text-lg font-bold" />
                <InputOTPSlot index={3} className="size-11 text-lg font-bold" />
                <InputOTPSlot index={4} className="size-11 text-lg font-bold" />
                <InputOTPSlot index={5} className="size-11 text-lg font-bold" />
              </InputOTPGroup>
            </InputOTP>

            <p className="text-center text-xs text-muted-foreground">
              Tip: You can also text the 6 digits directly to Kero on WhatsApp, and this page will
              verify automatically.
            </p>
          </div>

          <DialogFooter className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            <Button
              variant="outline"
              onClick={() => setIsVerifyModalOpen(false)}
              className="text-xs"
            >
              Cancel
            </Button>
            <Button
              onClick={() => verifyCodeMutation.mutate()}
              disabled={inputCode.length !== 6 || verifyCodeMutation.isPending}
              className="gap-2 text-xs"
            >
              {verifyCodeMutation.isPending ? (
                <RefreshCw className="size-3.5 animate-spin" />
              ) : (
                <CheckCircle2 className="size-3.5" />
              )}
              Verify & Connect Number
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
