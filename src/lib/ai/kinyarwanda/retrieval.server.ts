// Server-only Kinyarwanda conversation intelligence retrieval.
// This is a compact, searchable projection of the supplied Kero language pack.
// It keeps the full pack out of every model request while preserving the signals
// needed for natural WhatsApp and web conversations.

export type ConversationTurn = { role: "user" | "assistant"; content: string };

interface KnowledgeRecord {
  id: string;
  text: string;
  terms: string[];
  tags: string[];
}

const RECORDS: KnowledgeRecord[] = [
  {
    id: "rw-foundation",
    text: "Treat Kinyarwanda as a living language as spoken in Rwanda today: prioritize natural native phrasing over literal English translations. Never construct artificial, clumsy calques. Preserve context, informal texting orthography, and omitted accents/punctuation.",
    terms: ["kinyarwanda", "rw", "language", "context", "meaning"],
    tags: ["foundation"],
  },
  {
    id: "rw-greeting-replies",
    text: "Authentic WhatsApp greeting pairs:\n- 'Bite?' / 'Bite se?' → 'Ni meza! Amakuru yawe?' or 'Ni meza! Bite se?' or 'Ni sawa!'\n- 'Bite sha?' / 'Bite bro?' → 'Ni meza sha! Wowe bite?' or 'Ni sawa kabisa!'\n- 'Amakuru?' / 'Amakuru se?' / 'Amakuru ki?' → 'Ni meza rwose. Amakuru yawe?' or 'Ni meza cyane.'\n- 'Mwaramutse' / 'Mwaramutseho' → 'Mwaramutse neza! Mumeze mute?' or 'Mwaramutseho neza!'\n- 'Mwiriwe' / 'Mwiriweho' → 'Mwiriwe neza! Amakuru y'umugoroba?' or 'Mwiriweho neza!'\n- 'Uraho?' / 'Muraho?' → 'Uraho neza!' / 'Muraho neza! Amakuru?'\n- 'Akazi kose?' → 'Ni keza rwose / Akazi kameze neza, amakuru y'iwawe?'\nRule: A greeting receives a brief, warm greeting back (1 short sentence). Never answer a greeting with a dictionary definition or unprompted help desk prompt.",
    terms: [
      "muraho",
      "uraho",
      "amakuru",
      "bite",
      "bite sha",
      "bite bro",
      "bite se",
      "sha",
      "bro",
      "mwaramutse",
      "mwaramutseho",
      "mwiriwe",
      "mwiriweho",
      "akazi kose",
      "greeting",
    ],
    tags: ["whatsapp", "casual", "greeting"],
  },
  {
    id: "rw-social-wellbeing",
    text: "Natural health, social, and time check-ins:\n- 'Umeze ute?' / 'Umeze gute?' means how are you → 'Meze neza rwose, urakoze! Wowe umeze ute?' or 'Ndaho neza.'\n- 'Mumeze mute?' addresses more than one person respectfully → 'Tumeze neza, murakoze! Amakuru yanyu?'\n- 'Waraye ute?' / 'Waraye gute?' / 'Waryamye ute?' asks how someone slept → 'Naraye neza cyane, urakoze! Wowe waraye ute?'\n- 'Wiriwe ute?' / 'Wiriwe gute?' asks how their afternoon/day went → 'Niriwe neza cyane, urakoze! Wowe wiriwe ute?'\n- 'Uracyariho?' asks are you still there/alive → 'Ndacyariho rwose!'\n- 'Urakomeye?' asks are you staying strong → 'Ndakomeye rwose, urakoze!'\n- 'Wari he?' asks where were you → reply directly and naturally.",
    terms: [
      "umeze ute",
      "umeze gute",
      "mumeze mute",
      "waraye",
      "waraye ute",
      "waraye gute",
      "waryamye",
      "waryamye ute",
      "wiriwe ute",
      "wiriwe gute",
      "urakomeye",
      "uracyariho",
      "wari he",
      "none se",
      "wowe se",
      "muzima",
      "ndaho",
    ],
    tags: ["whatsapp", "casual", "social", "greeting", "wellbeing"],
  },
  {
    id: "rw-courtesy-and-gratitude",
    text: "Expressing gratitude, departure, and good wishes:\n- 'Urakoze' / 'Murakoze' / 'Urakoze cyane' → 'Urakoze nawe!', 'Nta cyo rwose!', or 'Karibu cyane!'. CRITICAL RULE: NEVER use 'Urakaza neza' to answer thank you! 'Urakaza neza' means 'Welcome to this place'. In response to thanks, use 'Nta cyo rwose!' or 'Urakoze nawe!'\n- 'Komera' → 'Komera nawe!' or 'Urakoze cyane!'\n- 'Umunsi mwiza' → 'Umunsi mwiza nawe!'\n- 'Ijoro ryiza' / 'Ryamye neza' → 'Ijoro ryiza nawe! Ryamye neza.'\n- 'Mwirirwe' / 'Mwirirwe neza' → 'Mwirirwe neza nawe!'\n- 'Muramuke' / 'Muramuke neza' → 'Muramuke neza nawe!'\n- 'Tuzongera' / 'Tuzavugana' → 'Sawa, tuzavugana!' or 'Tuzongera mu kanya.'",
    terms: [
      "urakoze",
      "murakoze",
      "urakoze cyane",
      "nta cyo",
      "nta kibozo",
      "komera",
      "umunsi mwiza",
      "ijoro ryiza",
      "ryamye neza",
      "mwirirwe",
      "muramuke",
      "tuzongera",
      "tuzavugana",
      "karibu",
    ],
    tags: ["courtesy", "gratitude", "farewell", "politeness"],
  },
  {
    id: "rw-whatsapp-texting-idioms",
    text: "Everyday WhatsApp chatting idioms in Rwanda:\n- 'sha' & 'bro': friendly, familiar address among peers ('Ni meza sha', 'Nta kibazo bro', 'Bite sha').\n- 'boss': friendly respectful informal term ('Ni sawa boss').\n- 'sawa' / 'sawa sawa': okay, understood, agreed, all good ('Sawa sawa, nta kibazo').\n- 'turi kumwe': 'we are together' (solidarity, got it, I've got your back — very common: 'Turi kumwe rwose!').\n- 'kabisa': completely, really, for sure ('Ni byo kabisa', 'Ni byiza kabisa').\n- 'rwose': really, truly, definitely ('Nta kibazo rwose', 'Ndabyumva rwose').\n- 'gusa': only, but ('Nta kibazo gusa...').\n- 'noneho': now, so, then ('Noneho mbwira...').\n- 'none se': so then what, what about it?\n- 'mbwira': tell me / talk to me ('Mbwira, ndakumva').\n- 'reka ndebe': let me check / let me see.\n- 'gato': a little bit, a moment ('Tegereza gato', 'Mpa umwanya gato').\n- 'birakaze' / 'birakomeye': tough, intense, or impressive depending on context.",
    terms: [
      "sha",
      "bro",
      "boss",
      "sawa",
      "sawa sawa",
      "turi kumwe",
      "kabisa",
      "rwose",
      "gusa",
      "noneho",
      "none se",
      "mbwira",
      "reka ndebe",
      "gato",
      "birakaze",
      "birakomeye",
    ],
    tags: ["whatsapp", "slang", "idioms", "casual"],
  },
  {
    id: "rw-actions-and-responses",
    text: "Everyday action verbs and natural conversational reactions:\n- 'Ndaje' (I am coming / on my way), 'Ndaza' (I will come), 'Nagiye' (I went).\n- 'Dushake' (let's look for), 'Turabikora' (we will do it), 'Reka tubikore' (let's do it).\n- 'Niteguye kugufasha' (I am ready to help you).\n- 'Ndabyumva' (I understand), 'Sinumva neza' (I don't understand well).\n- 'Sinzi' (I don't know — natural) or 'Ntabwo mbizi' (I don't know it).\n- 'Birashoboka' (it's possible), 'Ntibishoboka' (it's not possible).\n- 'Ni byo' / 'Nibyo' (that's true / right), 'Oya' (no), 'Yego' (yes).\n- 'Byiza cyane' (very good / excellent).",
    terms: [
      "ndaje",
      "ndaza",
      "nagiye",
      "dushake",
      "turabikora",
      "reka",
      "reka tubikore",
      "niteguye",
      "ndabyumva",
      "sinumva",
      "sinzi",
      "ntabwo mbizi",
      "birashoboka",
      "ntibishoboka",
      "ni byo",
      "nibyo",
      "byiza cyane",
    ],
    tags: ["action", "verbs", "agreement", "response"],
  },
  {
    id: "rw-requests-and-inquiries",
    text: "Handling user inquiries and requests in Kinyarwanda:\n- 'Mfasha...' / 'Ndashaka ubufasha...' → 'Yego rwose, mbwira icyo wifuza ko ngufasha.' or 'Niteguye kugufasha, mbwira ikibazo ufite.'\n- 'Ndashaka kumenya...' → 'Yego, reka nkubwire...' or 'Reka tubisobanure...'\n- 'Ese...' question opener ('Ese byagenze bite?', 'Ese wifuza ko...?')\n- Question words: 'Kuki' (why), 'Ryari' (when), 'Hehe' / 'He' (where), 'Gute' / 'Ute' (how), 'Iki' / 'Icyo' (what), 'Nde' / 'Ninde' (who).\n- Keep answers direct, helpful, and free from circular boilerplate.",
    terms: [
      "mfasha",
      "ndashaka",
      "nshaka",
      "ubufasha",
      "kumenya",
      "ese",
      "kuki",
      "ryari",
      "hehe",
      "gute",
      "iki",
      "icyo",
      "nde",
      "ninde",
    ],
    tags: ["inquiry", "questions", "requests", "help"],
  },
  {
    id: "rw-anti-patterns",
    text: "CRITICAL BANNED ERRORS in Kinyarwanda:\n1. NEVER answer 'Urakoze' with 'Urakaza neza'. 'Urakaza neza' is ONLY used when someone arrives at a location. When thanking, say 'Nta cyo rwose!', 'Urakoze nawe!', or 'Karibu!'.\n2. NEVER repeatedly end messages with 'Nshobora kugufasha nte uyu munsi?' or 'Ukeneye iki kindi?'. In natural WhatsApp chat, answer what was asked and stop.\n3. NEVER translate English idioms word-for-word (calques). Use natural Rwandan expressions.\n4. NEVER invent pseudo-Kinyarwanda words. If a standard English or French technical term is used in Rwanda (like WhatsApp, link, website, app, wifi, online, screenshot), keep it natural.",
    terms: [
      "urakaza neza",
      "nshobora kugufasha",
      "gufasha nte",
      "kugufasha nte",
      "calque",
      "translation",
      "error",
    ],
    tags: ["anti-patterns", "rules", "quality", "accuracy"],
  },
  {
    id: "rw-formal-business-glossary",
    text: "Mandated formal and accurate Kinyarwanda business terminology:\n- Company / Enterprise: 'Sosiyete' or 'Ikigo cy'ubucuruzi'\n- Customer / Client: 'Umukiriya' (plural: 'Abakiriya')\n- Customer Care / Support: 'Kwitaho abakiriya' or 'Serivisi y'abakiriya'\n- Partnership: 'Ubufatanye' (e.g., 'Twishimiye ubufatanye burambye')\n- Management / Leadership: 'Ubuyobozi'\n- Meeting / Conference: 'Inama' (e.g., 'Inama yo gusuzuma imirimo')\n- Contract / Agreement: 'Amasezerano'\n- Terms & Conditions: 'Amabwiriza n'amategeko agenga serivisi'\n- Invoice / Bill: 'Inyemezabwishyu'\n- Receipt / Proof of Payment: 'Inyemezamwishyuriro'\n- Payment: 'Ubwishyu' / 'Kwishyura'\n- Price / Tariff: 'Igiciro' (plural: 'Ibiciro')\n- Account: 'Konti'\n- Password / PIN: 'Ijambobanga'\n- Verification Code / OTP: 'Kode yo kwemeza' / 'Kode y'umutekano'\n- Security & Privacy: 'Umutekano n'ibanga ry'amakuru'\n- System / Platform: 'Sisitemu' / 'Urubuga'\n- Tone Rule: Keep business Kinyarwanda helpful, courteous, respectful ('Murakoze', 'Mumeze mute?'), and solution-oriented.",
    terms: [
      "sosiyete",
      "ikigo",
      "umukiriya",
      "abakiriya",
      "ubufatanye",
      "ubuyobozi",
      "inama",
      "amasezerano",
      "amabwiriza",
      "inyemezabwishyu",
      "inyemezamwishyuriro",
      "ubwishyu",
      "igiciro",
      "ibiciro",
      "konti",
      "ijambobanga",
      "kode yo kwemeza",
      "umutekano",
      "business",
      "client",
      "partnership",
      "invoice",
      "contract",
    ],
    tags: ["business", "formal", "corporate", "terminology"],
  },
  {
    id: "rw-tech-and-finance",
    text: "Modern tech, phone, and money vocabulary in Rwanda:\n- 'Telefoni' (phone), 'Ubutumwa' (message), 'Ubutumwa bwa WhatsApp'.\n- 'Porogaramu' or 'Apu' (app/software), 'Urubuga' or 'Website'.\n- 'Konti' (account), 'Ijambobanga' (password), 'Kode' (verification code).\n- 'Kwishyura' (to pay), 'Amafaranga' (money), 'MoMo' (Mobile Money), 'Igiciro' (price).\n- 'Akazi' (work / job), 'Ikigo' (company / organization), 'Umukiriya' (client).\n- Common loanwords used naturally in Kigali: link, screenshot, error, update, meeting, email, server, online, wifi.",
    terms: [
      "telefoni",
      "ubutumwa",
      "porogaramu",
      "urubuga",
      "website",
      "konti",
      "ijambobanga",
      "kode",
      "kwishyura",
      "amafaranga",
      "momo",
      "igiciro",
      "akazi",
      "ikigo",
      "umukiriya",
      "link",
      "screenshot",
    ],
    tags: ["tech", "business", "finance", "mobile"],
  },
  {
    id: "rw-support-and-service",
    text: "Customer and technical support in Kinyarwanda:\n- 'Sisitemu ntabwo iri gukora' / 'Ntabwo biri gukora' → 'Nta kibazo, mbwira: ikibazo giteye gute? Ese hari error cyangwa ubutumwa bwihariye yakweretse?'\n- 'Nanze gufunguka' (It refused to open).\n- 'Tugiye kubigenzura' (We are going to check/verify it) or 'Reka tubirebe.'\n- Never invent prices, deadlines, or account changes.",
    terms: [
      "sisitemu",
      "ntabwo iri gukora",
      "ikibazo",
      "error",
      "screenshot",
      "support",
      "kugenzura",
      "serivisi",
    ],
    tags: ["support", "troubleshooting", "service"],
  },
  {
    id: "rw-grammar-and-agreement",
    text: "Kinyarwanda grammar and agreement essentials:\n- Singular vs Plural/Respect: 'Umeze ute?' (one peer) vs 'Mumeze mute?' (plural/formal); 'Uraho' vs 'Muraho'; 'Urakoze' vs 'Murakoze'; 'Wowe' vs 'Mwebwe'.\n- First person forms: 'Meze neza' (I am fine), 'Tumeze neza' (we are fine), 'Ndi' (I am), 'Turi' (we are), 'Ndabyumva' (I understand), 'Sinzi' (I don't know).\n- Demonstratives: 'iki' (this), 'icyo' (that), 'ibi' (these), 'ibyo' (those), 'uyu munsi' (today), 'ubu' (now).\n- Temporal markers: 'ejo hashize' (yesterday), 'ejo hazaza' / 'ejo' (tomorrow), 'mu gitondo' (in the morning), 'ku mugoroba' (in the evening), 'nijoro' (at night).",
    terms: [
      "meze neza",
      "tumeze neza",
      "ndi",
      "turi",
      "wowe",
      "mwebwe",
      "iki",
      "icyo",
      "ibi",
      "ibyo",
      "uyu munsi",
      "ubu",
      "ejo",
      "mu gitondo",
      "ku mugoroba",
      "nijoro",
    ],
    tags: ["grammar", "agreement", "temporal"],
  },
  {
    id: "rw-code-switching",
    text: "Understand Kinyarwanda-English code-switching naturally without correcting it: 'Nshaka gukora website, but ibe fast', 'Mpa update', 'ndaza later', and 'Nshaka explanation ya cloud mu Kinyarwanda' reflect standard conversational texting in Kigali. Respond smoothly while matching the user's mixed style.",
    terms: [
      "but",
      "fast",
      "update",
      "later",
      "website",
      "explanation",
      "cloud",
      "api",
      "marketing",
      "meeting",
    ],
    tags: ["code-switching", "whatsapp", "technical"],
  },
  {
    id: "rw-born-in-rwanda-idioms",
    text: "AUTHENTIC BORN-IN-RWANDA NATIVE IDIOMS:\n- 'Turi kumwe': 'We are together' — conveys complete solidarity, agreement, and presence ('Turi kumwe rwose!').\n- 'Kabisa': 'Completely / Totally' — native affirmation ('Ni byo kabisa!', 'Birakaze kabisa!').\n- 'Rwose': 'Truly / Sincerely' — hallmark of polite Rwandan speech ('Nta kibazo rwose', 'Ndabyumva rwose').\n- 'Birakaze': 'Impressive / Intense / Tough' depending on context ('Uwo mushinga urakaze kabisa!').\n- 'Reka tubirebe' / 'Reka ndebe': 'Let's look into it' / 'Let me check'.\n- 'Mbwira, ndakumva': 'Tell me, I am listening'.\n- 'Mpa umwanya gato' / 'Tegereza gato': 'Give me a brief moment'.\n- 'Sawa sawa bro' / 'Sawa boss': Warm, relaxed, authentic closing or confirmation.",
    terms: [
      "turi kumwe",
      "kabisa",
      "rwose",
      "birakaze",
      "reka tubirebe",
      "reka ndebe",
      "mbwira",
      "ndakumva",
      "mpa umwanya",
      "tegereza gato",
      "sawa sawa",
    ],
    tags: ["native", "idioms", "street", "kigali", "slang"],
  },
  {
    id: "rw-cultural-proverbs-and-wisdom",
    text: "AUTHENTIC RWANDAN CULTURAL WISDOM & PROVERBS (IMIGANI Y'IMIGENURANO):\n- 'Abishyize hamwe ntakibantera ubwoba' (Unity makes us invincible — used to celebrate team collaboration).\n- 'Ijambo ryiza ryubaka inzu, naho iribi rikisenya' (Gentle and kind words build; harsh words destroy — guides courteous, respectful speech).\n- 'Akanyoni katagurutse ntikamenya iyo bweze' (One who explores gains true wisdom and knowledge).\n- 'Uwigize agatebo ayora ivu' (Self-worth and dignity (Agaciro) are essential; value yourself).\n- 'Imihigo': The noble Rwandan tradition of setting ambitious targets and achieving them with integrity.",
    terms: [
      "umugani",
      "imigani",
      "abishyize hamwe",
      "ijambo ryiza",
      "agaciro",
      "imihigo",
      "umuganda",
      "ubwenge",
      "ubupfura",
      "ubugwaneza",
      "wisdom",
      "culture",
    ],
    tags: ["culture", "proverbs", "wisdom", "agaciro"],
  },
  {
    id: "rw-native-ai-mistakes-ban",
    text: "CRITICAL BANNED AI TRANSLATION MISTAKES:\n1. 'Urakaza neza' is ONLY for arriving at a location. NEVER say it when someone says 'Urakoze'. Always say 'Nta cyo rwose!', 'Urakoze nawe!', or 'Karibu!'.\n2. 'Ndi mwiza' means 'I am handsome/pretty'. NEVER use it to answer 'Umeze ute?'. Say 'Meze neza rwose, urakoze!'.\n3. NEVER translate English expressions word-for-word (calques). E.g. Do NOT say 'komeza amaso yawe hejuru' for 'keep your eyes up'.\n4. Never give robotic disclaimers ('Nk'icyitegererezo cy'ubwenge bukorano...') unless explicitly asked about AI architecture.",
    terms: ["urakaza neza", "ndi mwiza", "calque", "mistake", "banned", "native correction"],
    tags: ["anti-patterns", "native", "accuracy", "grammar"],
  },
];

const normalize = (value: string) =>
  value
    .toLocaleLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

export function retrieveKinyarwandaContext(history: ConversationTurn[], limit = 5): string {
  const recent = history
    .slice(-8)
    .map((turn) => turn.content)
    .join(" ");
  const query = normalize(recent);
  if (!query) return "";

  const scored = RECORDS.map((record) => {
    const score = record.terms.reduce((total, term) => {
      const normalizedTerm = normalize(term);
      return total + (query.includes(normalizedTerm) ? (normalizedTerm.length <= 3 ? 1 : 2) : 0);
    }, 0);
    const tagBoost = record.tags.some((tag) => query.includes(normalize(tag))) ? 1 : 0;
    return { record, score: score + tagBoost };
  })
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  if (scored.length === 0) return "";
  return scored.map(({ record }) => `[${record.id}] ${record.text}`).join("\n\n");
}

export function detectConversationSignals(history: ConversationTurn[]) {
  const text = normalize(
    history
      .slice(-6)
      .map((turn) => turn.content)
      .join(" "),
  );
  const kinyarwanda =
    /\b(muraho|uraho|amakuru|bite|umeze|mumeze|waraye|waryamye|wiriwe|wari he|noneho|none se|ndashaka|nshaka|mfasha|mbwira|sawa|sha|wowe|mwebwe|yego|oya|ejo|ubu|ndaza|ndaje|tuzakomeza|tuzavugana|rwose|kabisa|turi kumwe|gusa|birakaze|birakomeye|mwaramutse|mwaramutseho|mwiriwe|mwiriweho|mwirirwe|muramuke|komera|urakoze|murakoze|byiza|nibyo|ni byo|ndabyumva|sinzi|ntabwo|akazi|amafaranga|ubutumwa|umunsi|ijoro|reka|bimeze|meze neza|tumeze)\b/.test(
      text,
    );
  const casual =
    /\b(sha|bro|boss|sawa|bite|hey|lol|haha|gusa|rwose|kabisa|none se|mwaramutse|mwiriwe)\b|[😂🤣😊😅😘]|❤️/u.test(
      text,
    );
  const business =
    /\b(manager|business|customer|client|meeting|professional|ikigo|umukiriya|serivisi|partnership|plan|igiciro|kwishyura|konti)\b/.test(
      text,
    );
  return { kinyarwanda, casual, business };
}
