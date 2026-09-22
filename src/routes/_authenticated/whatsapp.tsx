import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Mic } from "lucide-react";

import { KeroMark } from "@/components/kero/KeroMark";
import { WhatsAppDashboard } from "@/components/kero/WhatsAppDashboard";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/whatsapp")({
  head: () => ({
    meta: [
      { title: "Kero on WhatsApp — Egreed Technology" },
      {
        name: "description",
        content:
          "Connect WhatsApp, manage automated voice note responses, view live logs, and verify your number.",
      },
      { property: "og:title", content: "Kero on WhatsApp — Egreed Technology" },
      {
        property: "og:description",
        content:
          "Connect your WhatsApp number with verification codes, view message logs, and toggle automated voice notes.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: WhatsAppPage,
});

function WhatsAppPage() {
  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-8">
      {/* Header */}
      <div className="mb-6 flex items-center gap-3">
        <Button asChild variant="ghost" size="icon">
          <Link to="/chat">
            <ArrowLeft className="size-4" />
          </Link>
        </Button>
        <KeroMark className="size-9" />
        <div>
          <div className="flex items-center gap-2">
            <h1 className="font-display text-xl font-semibold">Kero on WhatsApp</h1>
            <span className="inline-flex items-center gap-1 rounded-full border border-primary/20 bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
              <Mic className="size-3" /> Voice Notes Active
            </span>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Connect your number via WhatsApp verification, monitor live message logs, and manage
            per-contact automated voice replies.
          </p>
        </div>
      </div>

      {/* Main WhatsApp Dashboard Component */}
      <WhatsAppDashboard />
    </div>
  );
}
