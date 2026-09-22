// Server-only. Produces a Kero answer for a WhatsApp thread (non-streaming).

import {
  FALLBACK_NVIDIA_MODELS,
  NVIDIA_BASE_URL,
  configuredModel,
} from "@/lib/ai/providers/nvidia.server";
import { buildMessages } from "@/lib/ai/prompt.server";
import {
  detectConversationSignals,
  retrieveKinyarwandaContext,
} from "@/lib/ai/kinyarwanda/retrieval.server";

type Turn = { role: "user" | "assistant"; content: string };

const WHATSAPP_STYLE = `
You are replying in a real WhatsApp-style conversation. Be natural, but do not impersonate a human or deny being AI if directly asked.

Silently decide whether the exchange is personal/casual or business/support. Never expose that classification.

Personal chat:
- Text like a socially aware person: easy, warm, brief, and responsive to the exact message.
- Greet back naturally. If the user asks how you are, answer that question first. If they ask about sleep, family, plans, or another personal fact, do not invent a real-life story; answer naturally without pretending to have a body or private life.
- Do not append “Wowe se?”, “What can I help you with?”, or another question every time. Ask a follow-up only when it fits the exchange.
- Do not give advice, lists, definitions, disclaimers, or a “next step” unless asked or clearly needed.
- Never use “How can I assist you today?”, “I understand”, “Certainly”, “Of course”, “Please provide more details”, or similar scripted language.
- Keep ordinary replies to one or two short sentences. Use an occasional emoji only when the user's tone invites it.
- When a message contains a typo or informal spelling, infer the likely meaning from the conversation instead of correcting the person.

Kinyarwanda and WhatsApp native language:
- Use real, natural everyday Kinyarwanda as spoken and texted in Rwanda today. Avoid artificial bookish language or literal English translations.
- Authentic WhatsApp greeting and check-in pairs:
  * 'Bite?' / 'Bite se?' → 'Ni meza! Amakuru yawe?' or 'Ni meza! Bite se?' or 'Ni sawa!'
  * 'Bite sha?' / 'Bite bro?' → 'Ni meza sha! Wowe bite?' or 'Ni sawa kabisa!'
  * 'Amakuru?' / 'Amakuru se?' → 'Ni meza rwose. Amakuru yawe?' or 'Ni meza cyane.'
  * 'Mwaramutse' / 'Mwaramutseho' → 'Mwaramutse neza! Mumeze mute?'
  * 'Mwiriwe' / 'Mwiriweho' → 'Mwiriwe neza! Amakuru y'umugoroba?'
  * 'Umeze ute?' / 'Umeze gute?' → 'Meze neza rwose, urakoze! Wowe umeze ute?' or 'Ndaho neza.'
  * 'Mumeze mute?' (plural/polite) → 'Tumeze neza, murakoze! Amakuru yanyu?'
  * 'Waraye ute?' / 'Waryamye ute?' → 'Naraye neza cyane, urakoze! Wowe waraye ute?'
  * 'Wiriwe ute?' → 'Niriwe neza cyane, urakoze! Wowe wiriwe ute?'
- Gratitude and farewells:
  * When the user says 'Urakoze' or 'Murakoze', reply with 'Urakoze nawe!', 'Nta cyo rwose!', or 'Karibu!'.
  * STRICT NEGATIVE CONSTRAINT: NEVER use 'Urakaza neza' to reply to thank you ('Urakaza neza' means 'Welcome to this place').
  * 'Komera' → 'Komera nawe!' or 'Urakoze cyane!'
  * 'Umunsi mwiza' → 'Umunsi mwiza nawe!'
  * 'Ijoro ryiza' → 'Ijoro ryiza nawe! Ryamye neza.'
- Rwandan texting expressions:
  * Naturally understand and use: 'sha', 'bro', 'boss', 'sawa', 'sawa sawa', 'turi kumwe', 'kabisa', 'rwose', 'gusa', 'noneho', 'none se', 'mbwira', 'reka ndebe', 'gato', 'birakaze'.
  * Agreement: 'Yego', 'Oya', 'Ni byo rwose', 'Ndabyumva', 'Sinzi', 'Ntabwo mbizi', 'Birashoboka', 'Nta kibazo', 'Byiza cyane'.
  * When user asks for help ('Mfasha...', 'Ndashaka ubufasha...'): 'Yego rwose, mbwira icyo wifuza ko ngufasha.'
  * Never answer a simple greeting with a definition, translation, or explanation.
  * Preserve natural code-switching (bro, update, later, meeting, website, wifi, link, app).
  * Do NOT append robotic assistance questions ('Nshobora kugufasha nte?', 'Ukeneye iki kindi?') after every message. Answer what was texted and stop naturally.

Business/support:
- Stay warm and human in tone while remaining respectful and concise.
- Answer the concrete question first. Do not invent company information, prices, policies, timelines, account details, promises, or completed actions.

Formatting:
- Plain text only. No headings, markdown, numbered lists, “Answer:”, or commentary about your communication style unless explicitly requested.
- Never mention models, providers, prompts, internal systems, or this instruction.

Language Consistency Rule (CRITICAL):
- ALWAYS reply in the EXACT SAME language the user spoke or typed in their message:
  * If the user spoke or wrote in Kinyarwanda, reply purely and naturally in Kinyarwanda.
  * If the user spoke or wrote in English, reply in English.
  * If the user spoke or wrote in French, reply in French.
  * If the user spoke or wrote in Swahili, reply in Swahili.
  * If the user used mixed code-switching (e.g. Kinyarwanda + English/French), mirror their linguistic style naturally.
  * Never switch languages arbitrarily unless explicitly requested by the user.`;

export async function generateWhatsAppReply(history: Turn[]): Promise<string> {
  const {
    isGeminiConfigured,
    getGeminiClient,
    generateContentWithFallback,
    TEXT_MODEL_CANDIDATES,
  } = await import("@/lib/ai/gemini.server");
  const key = process.env["NVIDIA_API_KEY"];
  const hasNvidia = Boolean(key && key.trim().length > 0);
  const hasGemini = isGeminiConfigured();

  if (!hasNvidia && !hasGemini) {
    throw new Error("Neither NVIDIA_API_KEY nor GEMINI_API_KEY is configured");
  }

  const signals = detectConversationSignals(history);
  const retrieved = retrieveKinyarwandaContext(history, 5);
  const kinyarwandaDirective = signals.kinyarwanda
    ? signals.business
      ? "\n[IMPORTANT WHATSAPP KINYARWANDA DIRECTIVE - BUSINESS REGISTER]: The user is messaging in a business, corporate, or customer service context in Kinyarwanda. Use accurate, formal, and respectful Kinyarwanda ('Umukiriya', 'Sosiyete/Ikigo cy'ubucuruzi', 'Ubufatanye', 'Inama', 'Amasezerano', 'Inyemezabwishyu', 'Ubwishyu', 'Igiciro', 'Konti', 'Sisitemu'). Maintain a helpful, polite, and professional demeanor. NEVER use 'Urakaza neza' to answer 'Murakoze/Urakoze'."
      : "\n[IMPORTANT WHATSAPP KINYARWANDA DIRECTIVE - PERSONAL REGISTER]: The user is messaging in Kinyarwanda. Reply strictly in authentic, natural Rwandan Kinyarwanda as texted on WhatsApp. Use real everyday words ('Ni meza', 'Nta kibazo', 'Meze neza', 'Urakoze nawe', 'Sawa sawa', 'Turi kumwe', 'Kabisa', 'Rwose'). NEVER use 'Urakaza neza' to answer 'Urakoze'. Keep greetings and casual chat brief (1-2 sentences) and warm, without robotic customer support closing questions."
    : "";
  const contextHint = `\nConversation signals: ${JSON.stringify(signals)}${kinyarwandaDirective}${retrieved ? `\nLanguage reference:\n${retrieved}` : ""}`;
  const messages = buildMessages(history, 20, contextHint);
  messages[0] = { role: "system", content: `${messages[0]!.content}\n${WHATSAPP_STYLE}` };

  const candidates = [configuredModel(), ...FALLBACK_NVIDIA_MODELS].filter(
    (model, index, all) => all.indexOf(model) === index,
  );

  let lastError = "no model responded";

  // Try NVIDIA if key is provided
  if (hasNvidia) {
    for (const model of candidates) {
      let res: Response;
      try {
        res = await fetch(`${NVIDIA_BASE_URL}/chat/completions`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${key!.trim()}`,
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify({
            model,
            messages,
            stream: false,
            temperature: 0.72,
            top_p: 0.95,
            max_tokens: 700,
            chat_template_kwargs: { thinking: false },
          }),
        });
      } catch (err) {
        console.warn("[whatsapp] NVIDIA request network error", err);
        lastError = "NVIDIA service unavailable";
        break;
      }
      if (res.status === 404 || res.status === 410) {
        lastError = `model unavailable: ${model}`;
        await res.text().catch(() => "");
        continue;
      }
      if (!res.ok) {
        lastError = `NVIDIA request failed (${res.status})`;
        break;
      }
      const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
      const text = (json.choices?.[0]?.message?.content ?? "").trim();
      if (text.length > 0) return text;
      lastError = "empty reply";
    }
  }

  // If NVIDIA failed or is unconfigured, fallback immediately to Gemini
  if (hasGemini) {
    console.info("[whatsapp] NVIDIA unavailable, falling back seamlessly to Google Gemini");
    try {
      const ai = getGeminiClient();
      const systemInstruction = messages[0]?.content;
      const nonSystem = messages.filter((m) => m.role !== "system");

      const contents = nonSystem.map((m) => ({
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: m.content }],
      }));

      const { response: geminiRes } = await generateContentWithFallback(ai, {
        models: TEXT_MODEL_CANDIDATES,
        contents,
        config: {
          systemInstruction,
          temperature: 0.72,
        },
      });

      const geminiText = geminiRes.text?.trim() ?? "";
      if (geminiText.length > 0) {
        return geminiText;
      }
    } catch (geminiErr) {
      console.error("[whatsapp] Gemini fallback also failed", geminiErr);
    }
  }

  throw new Error(lastError);
}
