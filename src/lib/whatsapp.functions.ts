import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const phoneInput = z.object({
  phone: z.string().min(7).max(25),
  label: z.string().max(60).optional(),
});

function randomCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

/** Public status: is WhatsApp connected, and which number should people message? */
export const whatsappStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { whatsappConfigured, getBusinessNumber } = await import("@/lib/whatsapp/gateway.server");
    if (!whatsappConfigured()) return { configured: false, businessNumber: null as string | null };
    return { configured: true, businessNumber: await getBusinessNumber() };
  });

export const listWhatsappNumbers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("whatsapp_numbers")
      .select(
        "id, phone_e164, label, verified, verified_at, auto_reply, verification_code, code_expires_at, created_at",
      )
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

/** Creates (or refreshes) a pending number and returns the code the owner must send. */
export const requestWhatsappVerification = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => phoneInput.parse(input))
  .handler(async ({ data, context }) => {
    const { normalizePhone } = await import("@/lib/whatsapp/gateway.server");
    const phone = normalizePhone(data.phone);
    if (phone.length < 8) throw new Error("Enter the full number including the country code.");

    const code = randomCode();
    const expires = new Date(Date.now() + 30 * 60 * 1000).toISOString();

    const { data: existing } = await context.supabase
      .from("whatsapp_numbers")
      .select("id, user_id, verified")
      .eq("phone_e164", phone)
      .maybeSingle();

    if (existing && existing.user_id !== context.userId) {
      throw new Error("That number is already linked to another account.");
    }

    if (existing) {
      const { error } = await context.supabase
        .from("whatsapp_numbers")
        .update({ verification_code: code, code_expires_at: expires, label: data.label ?? null })
        .eq("id", existing.id);
      if (error) throw new Error(error.message);

      // Attempt to immediately dispatch the verification code to the user's WhatsApp number
      try {
        const { sendWhatsAppText } = await import("@/lib/whatsapp/gateway.server");
        await sendWhatsAppText(
          phone,
          `Muraho! Kode yawe yo kwemeza numero kuri Kero AI ni: ${code}.\n(Your Kero verification code is: ${code}. Enter this code in Kero to finish connecting your number).`,
        );
      } catch (sendErr) {
        console.warn(
          "[whatsapp] could not automatically dispatch verification code to phone",
          sendErr,
        );
      }

      return { phone, code, alreadyVerified: existing.verified, dispatched: true };
    }

    const { error } = await context.supabase.from("whatsapp_numbers").insert({
      user_id: context.userId,
      phone_e164: phone,
      label: data.label ?? null,
      verification_code: code,
      code_expires_at: expires,
    });
    if (error) throw new Error(error.message);

    // Attempt to immediately dispatch the verification code to the user's WhatsApp number
    try {
      const { sendWhatsAppText } = await import("@/lib/whatsapp/gateway.server");
      await sendWhatsAppText(
        phone,
        `Muraho! Kode yawe yo kwemeza numero kuri Kero AI ni: ${code}.\n(Your Kero verification code is: ${code}. Enter this code in Kero to finish connecting your number).`,
      );
    } catch (sendErr) {
      console.warn(
        "[whatsapp] could not automatically dispatch verification code to phone",
        sendErr,
      );
    }

    return { phone, code, alreadyVerified: false, dispatched: true };
  });

/** Allows the user to enter the 6-digit verification code directly inside the Kero space */
export const verifyWhatsappCodeInKero = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ phone: z.string().min(7), code: z.string().length(6) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { normalizePhone } = await import("@/lib/whatsapp/gateway.server");
    const phone = normalizePhone(data.phone);
    const code = data.code.trim();

    const { data: record, error: fetchErr } = await context.supabase
      .from("whatsapp_numbers")
      .select("id, user_id, verification_code, code_expires_at, verified")
      .eq("phone_e164", phone)
      .maybeSingle();

    if (fetchErr) throw new Error(fetchErr.message);
    if (!record) {
      throw new Error("No pending verification found for this number. Please request a new code.");
    }
    if (record.user_id !== context.userId) {
      throw new Error("You do not have permission to verify this number.");
    }
    if (record.verified) {
      return { success: true, message: "Number is already verified and connected!" };
    }

    const isExpired =
      record.code_expires_at !== null && new Date(record.code_expires_at).getTime() < Date.now();
    if (isExpired) {
      throw new Error("The verification code has expired. Please request a new code.");
    }

    if (record.verification_code !== code) {
      throw new Error(
        "Incorrect 6-digit verification code. Please check your WhatsApp and try again.",
      );
    }

    const { error: updateErr } = await context.supabase
      .from("whatsapp_numbers")
      .update({
        verified: true,
        verified_at: new Date().toISOString(),
        verification_code: null,
        code_expires_at: null,
      })
      .eq("id", record.id);

    if (updateErr) throw new Error(updateErr.message);

    // Notify the user on WhatsApp as well
    try {
      const { sendWhatsAppText } = await import("@/lib/whatsapp/gateway.server");
      await sendWhatsAppText(
        phone,
        "Murakoze cyane! Numero yawe yamaze kwemezwa neza muri Kero AI. Ushobora kunyandikira cyangwa kumpa ubutumwa bw'amajwi igihe cyose.\n\n(Your number is now verified in Kero. Feel free to text or send voice notes anytime!)",
      );
    } catch {
      // Non-blocking
    }

    return { success: true, message: "WhatsApp number verified successfully!" };
  });

export const setWhatsappAutoReply = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ id: z.string().uuid(), autoReply: z.boolean() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("whatsapp_numbers")
      .update({ auto_reply: data.autoReply })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const removeWhatsappNumber = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("whatsapp_numbers").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listWhatsappThreads = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("whatsapp_conversations")
      .select("id, contact_phone, contact_name, last_message_at")
      .order("last_message_at", { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const listWhatsappMessages = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ conversationId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("whatsapp_messages")
      .select("id, direction, content, status, error, created_at")
      .eq("conversation_id", data.conversationId)
      .order("created_at", { ascending: true })
      .limit(300);
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

/** Returns real-time unified message logs across all WhatsApp conversations for the active user */
export const listRecentWhatsappLogs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        limit: z.number().min(5).max(100).optional().default(40),
      })
      .optional()
      .default({ limit: 40 }),
  )
  .handler(async ({ data, context }) => {
    const limit = data?.limit ?? 40;
    const { data: rows, error } = await context.supabase
      .from("whatsapp_messages")
      .select(
        `
        id,
        conversation_id,
        direction,
        content,
        status,
        error,
        created_at,
        whatsapp_conversations (
          id,
          contact_phone,
          contact_name
        )
      `,
      )
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) throw new Error(error.message);

    const { isVoiceNoteReplyEnabledForContact } =
      await import("@/lib/whatsapp/voice-preferences.server");

    const mapped = await Promise.all(
      (rows ?? []).map(async (row) => {
        const conv = row.whatsapp_conversations as unknown as {
          id: string;
          contact_phone: string;
          contact_name: string | null;
        } | null;

        const phone = conv?.contact_phone ?? "";
        const cleanName = conv?.contact_name?.replace(/\s*\[VN_DISABLED\]/g, "").trim() || null;
        const voiceEnabled = phone ? await isVoiceNoteReplyEnabledForContact(phone) : true;

        return {
          id: row.id,
          conversationId: row.conversation_id,
          direction: row.direction as "inbound" | "outbound",
          content: row.content,
          status: row.status,
          error: row.error,
          createdAt: row.created_at,
          contactPhone: phone,
          contactName: cleanName,
          voiceNoteReplyEnabled: voiceEnabled,
          isVoiceNote:
            row.content.startsWith("🎤") ||
            row.content.includes("voice note") ||
            row.content.includes("Voice note"),
        };
      }),
    );

    return mapped;
  });

/** Toggles whether automated voice note responses are enabled or disabled for a specific contact phone */
export const toggleContactVoiceResponse = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        contactPhone: z.string().min(5),
        enabled: z.boolean(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { setVoiceNoteReplyEnabledForContact } =
      await import("@/lib/whatsapp/voice-preferences.server");
    await setVoiceNoteReplyEnabledForContact(data.contactPhone, data.enabled);
    return { ok: true, contactPhone: data.contactPhone, enabled: data.enabled };
  });
