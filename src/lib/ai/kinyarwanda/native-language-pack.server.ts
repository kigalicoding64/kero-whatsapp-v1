// Specialized linguistic module for native Rwandan Kinyarwanda.
// Contains rich cultural idioms, Kigali texting shorthands, proverbs,
// grammatical morphological patterns, and phonological normalizations so Kero
// speaks as if born and raised in Rwanda ("nk'umunyarwanda w'umwimerere").

export interface KinyarwandaIdiom {
  phrase: string;
  literal: string;
  nativeMeaning: string;
  category: "slang" | "proverb" | "daily" | "affection" | "business" | "reaction";
  properUsage: string;
}

export interface GrammarRule {
  pattern: string;
  correct: string;
  incorrectAiMistake: string;
  explanation: string;
}

/**
 * Common AI mistakes made by generic LLMs when speaking Kinyarwanda,
 * along with their authentic Rwandan native corrections.
 */
export const NATIVE_MISTAKE_CORRECTIONS: GrammarRule[] = [
  {
    pattern: "Thank you reply",
    correct: "Nta cyo rwose! / Urakoze nawe! / Karibu!",
    incorrectAiMistake: "Urakaza neza (translates 'You are welcome' literally)",
    explanation:
      "'Urakaza neza' is only for welcoming someone arriving at a place. Never use it to reply to 'Urakoze'.",
  },
  {
    pattern: "How are you check-in",
    correct: "Meze neza rwose, urakoze! Wowe umeze ute?",
    incorrectAiMistake: "Ndi mwiza / Ndi neza cyane nk'icyitegererezo cy'ubwenge",
    explanation:
      "Rwandans say 'Meze neza' (state of health/mind). 'Ndi mwiza' means 'I am physically handsome/beautiful', which sounds unnatural when replying to 'How are you'.",
  },
  {
    pattern: "Morning sleep inquiry",
    correct: "Naraye neza cyane, urakoze! Wowe waraye ute?",
    incorrectAiMistake: "Naryamye neza cyane muri seriveri yanjye",
    explanation:
      "When someone asks 'Waraye ute?' or 'Waryamye ute?', answer naturally and courteously without robotic tech disclaimers.",
  },
  {
    pattern: "Understood / Got it",
    correct: "Ndabyumva rwose / Ndakumva / Nta kibazo",
    incorrectAiMistake: "Nafashe ubwo butumwa mu bwenge bwanjye",
    explanation:
      "Express understanding using authentic verbs: 'Ndabyumva' (I understand it) or 'Ndakumva' (I hear you / I follow you).",
  },
  {
    pattern: "Wait a second / Just a moment",
    correct: "Tegereza gato / Mpa akanya gato / Reka ndebe",
    incorrectAiMistake: "Tegereza umunota umwe",
    explanation:
      "In Rwanda, conversational pausing uses 'gato' or 'akanya gato' rather than literal mathematical minutes.",
  },
  {
    pattern: "You're right / Exactly",
    correct: "Ni byo kabisa! / Ni byo rwose / Ufite ukuri",
    incorrectAiMistake: "Ufite ubugororotsi / Ibyo ni ukuri kw'ijambo",
    explanation:
      "Agreement is expressed naturally with 'Ni byo kabisa', 'Ni byo rwose', or 'Ufite ukuri'.",
  },
  {
    pattern: "Welcome a newcomer",
    correct: "Murakaza neza! / Ikaze!",
    incorrectAiMistake: "Murakoze kuza muri iyi porogaramu",
    explanation:
      "When genuinely welcoming someone to Rwanda, Kigali, an office, or the app, use 'Murakaza neza' or 'Ikaze mu muryango'.",
  },
  {
    pattern: "Farewell / See you later",
    correct: "Tuzongera mu kanya / Tuzavugana / Sawa, reka dushyireho / Ijoro ryiza",
    incorrectAiMistake: "Nzababona mu gihe kizaza cy'amasaha",
    explanation:
      "Farewells are concise and warm: 'Tuzavugana' (we'll talk), 'Tuzongera' (we'll connect again), 'Umunsi mwiza nawe!'.",
  },
  {
    pattern: "Encouragement / Be strong",
    correct: "Komera! / Ihangane! / Turi kumwe!",
    incorrectAiMistake: "Komeza ugire ingufu z'umubiri",
    explanation:
      "'Komera' expresses resilience, strength, and encouragement; 'Ihangane' conveys empathy during difficulty; 'Turi kumwe' conveys solidarity.",
  },
  {
    pattern: "Excuse me / Pardon",
    correct: "Mbabarira gato / Mbabarira sinumvise neza",
    incorrectAiMistake: "Mpere uburenganzira bwo gusaba imbabazi",
    explanation:
      "When asking to repeat or excusing oneself, use 'Mbabarira gato' or 'Sinumvise neza, ongera umbwire'.",
  },
];

/**
 * Native Kigali street texting idioms and culturally grounded phrases.
 */
export const NATIVE_IDIOMS_DATABASE: KinyarwandaIdiom[] = [
  {
    phrase: "Turi kumwe",
    literal: "We are together",
    nativeMeaning:
      "Solidarity, mutual support, agreement, or 'I've got your back'. Extremely popular in modern texting.",
    category: "daily",
    properUsage: "Turi kumwe rwose! Niteguye kugufasha.",
  },
  {
    phrase: "Kabisa",
    literal: "Completely / Totally",
    nativeMeaning: "Emphasis marker expressing total agreement, reality, or intensity.",
    category: "slang",
    properUsage: "Ibyo ni ukuri kabisa!",
  },
  {
    phrase: "Rwose",
    literal: "Truly / Really / Certainly",
    nativeMeaning: "Expresses warm sincerity and authenticity.",
    category: "daily",
    properUsage: "Nta kibazo rwose, mbwira icyo nkwereka.",
  },
  {
    phrase: "Birakaze",
    literal: "It is fierce / intense / tough",
    nativeMeaning:
      "Used to describe something deeply impressive, demanding, or intense depending on context.",
    category: "slang",
    properUsage: "Uwo mushinga urakaze kabisa! Wawukoze neza cyane.",
  },
  {
    phrase: "Sawa sawa",
    literal: "Equal equal / Fine fine",
    nativeMeaning: "Universal confirmation in Rwanda: 'All good', 'Understood', 'Agreed'.",
    category: "daily",
    properUsage: "Sawa sawa bro, reka tubikore ako kanya.",
  },
  {
    phrase: "Reka ndebe",
    literal: "Let me look",
    nativeMeaning: "'Let me check that out for you' or 'Let me see'.",
    category: "daily",
    properUsage: "Reka ndebe ibyo amakuru avuga.",
  },
  {
    phrase: "Mbwira",
    literal: "Tell me",
    nativeMeaning: "'Go ahead, I am listening' or 'Talk to me'.",
    category: "daily",
    properUsage: "Mbwira sha, ikibazo giteye gute?",
  },
  {
    phrase: "Sha / Bro / Boss",
    literal: "Informal peer addresses",
    nativeMeaning:
      "Affectionate, friendly, authentic address between friends or collegial contacts.",
    category: "affection",
    properUsage: "Ni meza sha! Amakuru ki iwawe?",
  },
  {
    phrase: "Agaciro",
    literal: "Dignity / Value / Self-worth",
    nativeMeaning: "Core Rwandan cultural concept representing human dignity and pride.",
    category: "proverb",
    properUsage: "Kwihesha agaciro no gukora kinyamwuga nibyo biza imbere.",
  },
  {
    phrase: "Ubworoherane",
    literal: "Tolerance / Mutual understanding",
    nativeMeaning: "Patience and understanding between people.",
    category: "proverb",
    properUsage: "Ubworoherane no kumvikana bituma akazi karushaho kugenda neza.",
  },
  {
    phrase: "Guhiga",
    literal: "To pledge / To aim for excellence (Imihigo)",
    nativeMeaning: "Setting ambitious measurable goals and achieving them honorably.",
    category: "business",
    properUsage: "Imihigo yacu ni ugushyira imbere umukiriya.",
  },
  {
    phrase: "Umuganda",
    literal: "Community solidarity work",
    nativeMeaning: "Working collectively for mutual benefit and social cohesion.",
    category: "daily",
    properUsage: "Gufatanyiriza hamwe bitanga umusaruro ugaragara.",
  },
];

/**
 * Common Rwandan proverbs (Imigani y'imigenurano) that embody deep native wisdom.
 */
export const RWANDAN_PROVERBS = [
  {
    rw: "Abishyize hamwe ntakibantera ubwoba.",
    meaning: "When people unite, nothing can frighten or defeat them. (Unity is strength)",
  },
  {
    rw: "Uwigize agatebo ayora ivu.",
    meaning: "Whoever belittles themselves will be treated as worthless. (Value your own worth)",
  },
  {
    rw: "Ijambo ryiza ryubaka inzu, naho iribi rikisenya.",
    meaning: "Kind words build a house; harsh words destroy it. (Power of respectful speech)",
  },
  {
    rw: "Inzira ntibwira umugenzi.",
    meaning: "The road does not tell the traveler what lies ahead. (Be prepared and humble)",
  },
  {
    rw: "Akanyoni katagurutse ntikamenya iyo bweze.",
    meaning: "A bird that never flies never discovers where the harvest is ripe. (Seek knowledge)",
  },
  {
    rw: "Agasozi k'imbwa ntikabura umwobo.",
    meaning: "Every problem has a solution when examined properly.",
  },
];

/**
 * Phonological and spelling regularizer for informal Kinyarwanda texting.
 * Normalizes slang contractions into recognized forms without losing native flavor.
 */
export function normalizeKinyarwandaText(input: string): string {
  return input
    .trim()
    .replace(/\bbite\s+shaa+\b/gi, "bite sha")
    .replace(/\bsawaa+\b/gi, "sawa")
    .replace(/\bkabisaa+\b/gi, "kabisa")
    .replace(/\brwosee+\b/gi, "rwose")
    .replace(/\bmuraho+\b/gi, "muraho")
    .replace(/\buraho+\b/gi, "uraho")
    .replace(/\bamakuruu+\b/gi, "amakuru");
}

/**
 * Compiles a rich cultural and native linguistic booster prompt that
 * can be dynamically embedded into conversation context.
 */
export function getNativeLinguisticBooster(options: {
  isCasual?: boolean;
  isBusiness?: boolean;
}): string {
  const { isCasual = false, isBusiness = false } = options;

  let text = `\n[NATIVE KINYARWANDA CORE INSTRUCTION - NATION-BORN ACCURACY]:
You must communicate in Kinyarwanda exactly like a native speaker born and living in Rwanda ("Umunyarwanda w'umwimerere"):
1. GRAMMAR & PRONUNCIATION INVARIANTS:
   - NEVER say "Urakaza neza" when answering "Urakoze". Use "Nta cyo rwose!", "Urakoze nawe!", or "Karibu!".
   - When asked "Umeze ute?" (How are you?), answer "Meze neza rwose, urakoze! Wowe umeze ute?" (NEVER say "Ndi mwiza").
   - When asked "Waraye ute?" (How did you sleep/wake up?), answer "Naraye neza cyane, urakoze! Wowe waraye ute?".
   - When asked "Wiriwe ute?" (How was your day/afternoon?), answer "Niriwe neza cyane, urakoze! Wowe wiriwe ute?".
   - Avoid literal English translation calques. Speak natural, flowing Bantu sentences with proper noun class prefixes (umu-, aba-, iki-, ibi-, in-, izi-).`;

  if (isBusiness) {
    text += `\n2. NATIVE BUSINESS & PROFESSIONAL EXCELLENCE:
   - Use respectful, formal address ("Mwashobora...", "Murakoze cyane", "Mumeze mute?").
   - Employ accurate terms: Umukiriya, Sosiyete, Ubufatanye, Ubuyobozi, Inama, Amasezerano, Inyemezabwishyu, Ubwishyu, Igiciro, Konti, Ijambobanga, Kode yo kwemeza, Sisitemu.
   - Maintain a courteous, dignified, and proactive demeanor.`;
  } else if (isCasual) {
    text += `\n2. AUTHENTIC CASUAL & TEXTING EXCELLENCE (KIGALI TEXTING):
   - Use familiar Rwandan conversational particles naturally: "sha", "bro", "boss", "sawa", "sawa sawa", "turi kumwe", "kabisa", "rwose", "noneho", "none se", "gusa", "reka ndebe", "gato".
   - Accept modern Kigali bilingual code-switching comfortably (e.g., website, link, app, MoMo, wifi, meeting, later, update).
   - Keep casual greetings and chat brief, warm, and natural (1-2 sentences), without robotic customer service follow-ups like "Nshobora kugufasha iki kindi?".`;
  }

  text += `\n3. NATIVE EXPRESSIONS & WISDOM:
   - Always prioritize mutual respect, clarity, and warmth ("Ijambo ryiza ryubaka inzu").
   - Match the exact mood and dialectal register of the person talking to you.`;

  return text;
}
