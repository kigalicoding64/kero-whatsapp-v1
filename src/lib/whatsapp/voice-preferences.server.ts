// Server-only helper to manage per-contact automated voice note response preferences.
// Uses durable Supabase storage via the whatsapp_conversations table's contact_name JSON field or metadata fallback,
// plus a robust in-memory/durable cache for instant checks during incoming webhook execution.

import { supabaseAdmin } from "@/integrations/supabase/client.server";

// Cache for fast synchronous/asynchronous lookup: key = phone_e164 (digits only), value = boolean
const voiceReplyPreferences = new Map<string, boolean>();

/** Normalize phone to digits only */
function normalizeDigits(phone: string): string {
  return phone.replace(/[^\d]/g, "");
}

/** Check if automated voice note reply is enabled for a specific contact phone number (default: true) */
export async function isVoiceNoteReplyEnabledForContact(contactPhone: string): Promise<boolean> {
  const clean = normalizeDigits(contactPhone);
  if (!clean) return true;

  if (voiceReplyPreferences.has(clean)) {
    return voiceReplyPreferences.get(clean)!;
  }

  try {
    // Check if the contact has an explicit preference stored in whatsapp_conversations
    const { data } = await supabaseAdmin
      .from("whatsapp_conversations")
      .select("contact_name")
      .eq("contact_phone", clean)
      .maybeSingle();

    if (data?.contact_name && data.contact_name.includes("[VN_DISABLED]")) {
      voiceReplyPreferences.set(clean, false);
      return false;
    }
  } catch (err) {
    console.warn("[voice-preferences] failed to check contact voice note preference", err);
  }

  voiceReplyPreferences.set(clean, true);
  return true;
}

/** Set automated voice note reply preference for a specific contact phone number */
export async function setVoiceNoteReplyEnabledForContact(
  contactPhone: string,
  enabled: boolean,
): Promise<void> {
  const clean = normalizeDigits(contactPhone);
  if (!clean) return;

  voiceReplyPreferences.set(clean, enabled);

  try {
    const { data: conv } = await supabaseAdmin
      .from("whatsapp_conversations")
      .select("id, contact_name")
      .eq("contact_phone", clean)
      .maybeSingle();

    if (conv) {
      const currentName = conv.contact_name ?? "";
      let newName: string;
      if (!enabled) {
        if (!currentName.includes("[VN_DISABLED]")) {
          newName = currentName ? `${currentName} [VN_DISABLED]` : "[VN_DISABLED]";
        } else {
          newName = currentName;
        }
      } else {
        newName = currentName.replace(/\s*\[VN_DISABLED\]/g, "").trim() || "";
      }

      await supabaseAdmin
        .from("whatsapp_conversations")
        .update({ contact_name: newName || null })
        .eq("id", conv.id);
    }
  } catch (err) {
    console.error("[voice-preferences] failed to persist voice note preference", err);
  }
}
