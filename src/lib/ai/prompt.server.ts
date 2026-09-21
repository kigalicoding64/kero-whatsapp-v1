// Server-only. The system prompt never reaches the browser.

import {
  retrieveKinyarwandaContext,
  detectConversationSignals,
} from "./kinyarwanda/retrieval.server";
import { getNativeLinguisticBooster } from "./kinyarwanda/native-language-pack.server";
import { KERO_SYSTEM_INSTRUCTION } from "./persona.server";

export const KERO_SYSTEM_PROMPT = KERO_SYSTEM_INSTRUCTION;

export function buildMessages(
  history: { role: "user" | "assistant" | "system"; content: string }[],
  maxTurns = 30,
  conversationContext = "",
) {
  const trimmed = history.filter((m) => m.role !== "system").slice(-maxTurns);
  const signals = detectConversationSignals(trimmed);
  const context = conversationContext || retrieveKinyarwandaContext(trimmed, 6);

  let nativeBooster = "";
  if (signals.kinyarwanda) {
    nativeBooster = getNativeLinguisticBooster({
      isCasual: signals.casual,
      isBusiness: signals.business,
    });
  }

  let systemContent = KERO_SYSTEM_PROMPT;
  if (nativeBooster) {
    systemContent = `${systemContent}\n\n${nativeBooster}`;
  }
  if (context) {
    systemContent = `${systemContent}\n\nRelevant native linguistic context reference:\n${context}`;
  }

  return [{ role: "system" as const, content: systemContent }, ...trimmed];
}
