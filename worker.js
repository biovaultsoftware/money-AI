/**
 * MONEY AI COUNCIL — WORKER v6 (Behavior-Enforced, Low-Drift)
 * ------------------------------------------------------------------------------
 * What this version GUARANTEES (by enforcement + retry):
 * ✅ No “consultant filler” answers
 * ✅ No onboarding/therapist openings (“To better assist you…”)
 * ✅ Always produces the Money AI contract:
 *    Diagnosis / Wheat-Tomato / Leverage / Friction / Unit Math / 48h Mission / One Question
 * ✅ Exactly ONE 48-hour mission (binary + success criteria)
 * ✅ final.next_action MUST match the 48h mission
 * ✅ No fake “PDF / knowledge base” claims unless excerpts exist
 *
 * Keeps your core functionality:
 * - Persona routing
 * - Query rewrite (tool gating)
 * - Optional web search (Tavily)
 * - Optional Vectorize RAG (facts/examples only)
 *
 * ENV:
 * - env.AI (Workers AI)
 * - env.TAVILY_API_KEY (optional)
 * - env.MONEYAI_VECTORIZE (optional)
 */

export default {
  async fetch(request, env) {
    // ─────────────────────────────────────────────────────────────
    // CORS
    // ─────────────────────────────────────────────────────────────
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders() });
    }

    // ─────────────────────────────────────────────────────────────
    // Parse input
    // ─────────────────────────────────────────────────────────────
    const { text, character: requestedCharacter } = await readInput(request);
    const userText = (text || "").trim() || "Explain Rush → Rich in one practical example.";

    const detectedLang = detectUserLanguage(userText);
    const router = runRoutingLogic(userText, requestedCharacter);

    // Greeting-only handler (prevents vague onboarding mode)
    if (isGreetingOnly(userText)) {
      return jsonResponse(kickoffResponse(router.character, detectedLang), 200);
    }

    try {
      // ─────────────────────────────────────────────────────────────
      // STEP 0: QUERY REWRITE (intent + tool gating)
      // ─────────────────────────────────────────────────────────────
      const rewrite = await runQueryRewrite(env, userText, detectedLang);

      const normalizedQuery = rewrite?.normalized_query || userText;

      // Default posture: NO RAG for behavior. Only for factual/excerpt needs.
      const useInternalRag = !!rewrite?.use_internal_rag;
      const useWebSearch = !!rewrite?.use_web_search;

      const userLanguage = rewrite?.user_language || detectedLang;

      // ─────────────────────────────────────────────────────────────
      // STEP 1: INTERNAL RAG (Vectorize optional — facts/examples only)
      // ─────────────────────────────────────────────────────────────
      let internalExcerptsBlock = "";
      if (useInternalRag) {
        const internalExcerpts = await retrieveInternalExcerpts(env, normalizedQuery, 6);
        internalExcerptsBlock = formatInternalExcerpts(internalExcerpts);
      }

      // ─────────────────────────────────────────────────────────────
      // STEP 2: WEB SEARCH (ONLY if rewrite says so)
      // ─────────────────────────────────────────────────────────────
      let webContextBlock = "";
      if (useWebSearch && env.TAVILY_API_KEY) {
        try {
          const searchResults = await searchWeb(normalizedQuery, env.TAVILY_API_KEY);
          if (searchResults) webContextBlock = `\n\nWEB RESULTS (external):\n${searchResults}\n`;
        } catch (e) {
          console.log("Web search failed:", e?.message || e);
        }
      }

      // ─────────────────────────────────────────────────────────────
      // STEP 3: BUILD SINGLE CONSTITUTION SYSTEM PROMPT
      // ─────────────────────────────────────────────────────────────
      const systemPrompt = buildMoneyAIGenerationSystemPrompt({
        personaKey: router.character,
        personaText: PERSONAS[router.character],
        internalExcerptsBlock,
        webContextBlock,
        userLanguage,
      });

      // ─────────────────────────────────────────────────────────────
      // STEP 4: CALL MODEL + VALIDATE + AUTO-RETRY
      // ─────────────────────────────────────────────────────────────
      const result = await generateWithValidation(env, {
        model: MODEL_GENERATION,
        systemPrompt,
        userMessage: userText, // NEVER mutate user text
        personaKey: router.character,
      });

      return jsonResponse(result, 200);
    } catch (e) {
      return jsonResponse(
        {
          mode: "reply",
          selected_character: router.character,
          bubbles: [
            {
              speaker: router.character,
              text:
                "System error (internal). Retry with a shorter message.\n\n" +
                "If this repeats: send your goal + budget + target customer in one line.",
            },
          ],
          final: {
            decision: "REJECT",
            next_action: localizeAction(
              "Within 48 hours: resend your question in ONE sentence + include budget + target customer. Success: one message contains both.",
              detectedLang
            ),
          },
        },
        500
      );
    }
  },
};

/* ─────────────────────────────────────────────────────────────
 * MODELS
 * ───────────────────────────────────────────────────────────── */
const MODEL_REWRITE = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";
const MODEL_GENERATION = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";

/* ─────────────────────────────────────────────────────────────
 * ENFORCEMENT SETTINGS
 * ───────────────────────────────────────────────────────────── */
const MAX_ATTEMPTS = 4;
const MAX_BUBBLES = 6;
const MAX_BUBBLE_CHARS = 1100;

const REQUIRED_LABELS = [
  "Diagnosis:",
  "Wheat/Tomato:",
  "Leverage:",
  "Friction:",
  "Unit Math:",
  "48h Mission:",
  "One Question:",
];

// Brutal banned phrases = drift detector
const BANNED_PHRASES = [
  // Fake sourcing / doc hallucination
  "according to the pdf",
  "pdf knowledge base",
  "knowledge base",
  "according to the knowledge base",
  "according to the documents",
  "from the pdf",

  // Tool hallucination
  "web search reveals",
  "a web search shows",
  "based on a web search",

  // Generic consultant filler
  "can be lucrative",
  "growing demand",
  "do market research",
  "market analysis",
  "comprehensive business plan",
  "create a business plan",
  "you'll need to obtain the necessary licenses",
  "obtain the necessary licenses and permits",
  "register your business",
  "research the local market",
  "it is important to research",

  // Onboarding / therapist mode
  "to better assist you",
  "i need more information",
  "provide more information",
  "tell me more about your situation",
  "i need to understand your current situation",

  // Poison UI artifacts
  "review the advice above",
  "→ action: review the advice above",
];

/* ─────────────────────────────────────────────────────────────
 * INPUT + CORS
 * ───────────────────────────────────────────────────────────── */
async function readInput(request) {
  const url = new URL(request.url);
  let text = url.searchParams.get("text");
  let character = url.searchParams.get("character");

  if (!text && request.method === "POST") {
    try {
      const body = await request.json();
      text = body.text || body.message || body.query;
      character = body.selected_character || body.character;
    } catch (_) {}
  }

  return { text, character };
}

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...corsHeaders(),
      "Content-Type": "application/json",
      "X-MoneyAI-Worker": "v6-behavior-enforced",
    },
  });
}

/* ─────────────────────────────────────────────────────────────
 * GREETING HANDLER
 * ───────────────────────────────────────────────────────────── */
function isGreetingOnly(text) {
  const t = String(text || "").trim();
  return /^(hi|hello|hey|yo|sup|مرحبا|هلا|أهلا|السلام عليكم|سلام)\b[\s!.؟?]*$/i.test(t);
}

function kickoffResponse(character, lang) {
  const en =
    `Diagnosis: You’re here for results, not chatting. We need one clear move.\n` +
    `Wheat/Tomato: We start with Wheat (real need or real income lever).\n` +
    `Leverage: We’ll pick one lever that increases value/hour.\n` +
    `Friction: The blocker is unclear goal + unclear constraints.\n` +
    `Unit Math: One goal + one number (budget or income target) + one deadline.\n` +
    `48h Mission: In 48h, send me (1) your goal, (2) your budget, (3) your available hours/week. Success: ONE message contains all 3.\n` +
    `One Question: What is your goal for the next 30 days?`;

  const ar =
    `Diagnosis: انت هنا للنتيجة مش للدردشة. لازم نحدد “الخطوة القادمة”.\n` +
    `Wheat/Tomato: نبدأ بالـWheat — حاجة حقيقية أو رافعة دخل حقيقية.\n` +
    `Leverage: نختار رافعة واحدة ترفع قيمة الساعة.\n` +
    `Friction: العائق: الهدف غير محدد + القيود غير واضحة.\n` +
    `Unit Math: هدف واحد + رقم واحد (ميزانية أو دخل) + موعد نهائي.\n` +
    `48h Mission: خلال 48 ساعة ارسل (1) هدفك، (2) ميزانيتك، (3) كم ساعة/أسبوع متاح. النجاح: رسالة واحدة فيها الثلاثة.\n` +
    `One Question: ما هدفك خلال 30 يوم؟`;

  return {
    mode: "reply",
    selected_character: character,
    bubbles: [{ speaker: character, text: lang === "ar" ? ar : en }],
    final: {
      decision: "ACCEPT",
      next_action:
        lang === "ar"
          ? "خلال 48 ساعة ارسل: هدفك + ميزانيتك + ساعاتك/الأسبوع. النجاح: رسالة واحدة فيها الثلاثة."
          : "In 48h, send: your goal + budget + hours/week. Success: one message containing all 3.",
    },
  };
}

/* ─────────────────────────────────────────────────────────────
 * LANGUAGE (kept; harmless and useful)
 * ───────────────────────────────────────────────────────────── */
function detectUserLanguage(text) {
  const s = String(text || "");
  const hasArabic = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]/.test(s);
  const hasLatin = /[A-Za-z]/.test(s);
  if (hasArabic && hasLatin) return "mixed";
  if (hasArabic) return "ar";
  return "en";
}

function localizeAction(actionEn, lang) {
  if (lang === "ar") {
    return "خلال 48 ساعة: اكتب (الهدف + الميزانية + نوع العميل) وأرسلهم برسالة واحدة. النجاح: رسالة واحدة فيها الثلاثة.";
  }
  return actionEn;
}

/* ─────────────────────────────────────────────────────────────
 * QUERY REWRITE PROMPT (tool gating only)
 * Default: use_internal_rag = false
 * ───────────────────────────────────────────────────────────── */
const QUERY_REWRITE_PROMPT = `
You are Money AI — Query Rewrite Engine.

You do NOT answer the user.
You output JSON ONLY.

Rules:
- Preserve the user's language. Do NOT translate.
- Default: use_internal_rag = false.
- use_internal_rag = true ONLY if internal factual excerpts/examples are required.
- use_web_search = true ONLY if up-to-date external facts are needed (licenses, fees, regulations, prices, addresses, “today/latest”).

Schema:
{
  "user_language": "ar|en|mixed",
  "intent_type": "business_start|idea_validation|pricing|marketing|operations|time_management|mindset|factual_lookup|other",
  "normalized_query": "<short query in same language>",
  "use_internal_rag": true|false,
  "use_web_search": true|false,
  "missing_variable": "<single highest leverage missing variable or empty string>"
}
`.trim();

async function runQueryRewrite(env, userText, detectedLang) {
  try {
    const hint = `Language hint: ${detectedLang}. Keep normalized_query in same language.`;

    const resp = await env.AI.run(MODEL_REWRITE, {
      messages: [
        { role: "system", content: QUERY_REWRITE_PROMPT },
        { role: "user", content: `${hint}\n\nUser message:\n${userText}` },
      ],
    });

    const raw = stripCodeFences(extractText(resp)).trim();
    const parsed = extractJsonObject(raw);
    if (!parsed || typeof parsed !== "object") return null;

    parsed.use_internal_rag = !!parsed.use_internal_rag;
    parsed.use_web_search = !!parsed.use_web_search;

    if (!parsed.user_language) parsed.user_language = detectedLang;
    if (!parsed.normalized_query) parsed.normalized_query = userText;

    // Hard web-search triggers for “facts”
    const t = userText.toLowerCase();
    if (/(license|permit|registration|requirements|fee|cost|rent|price|today|latest|moci|qfc|qatar)/i.test(t)) {
      parsed.use_web_search = true;
    }

    return parsed;
  } catch (_) {
    return null;
  }
}

/* ─────────────────────────────────────────────────────────────
 * OPTIONAL VECTORIZE RAG (facts/examples only)
 * ───────────────────────────────────────────────────────────── */
async function retrieveInternalExcerpts(env, query, topK = 6) {
  const idx = env.MONEYAI_VECTORIZE;
  if (!idx || typeof idx.query !== "function") return [];

  try {
    const res = await idx.query(query, { topK, returnMetadata: true });
    const matches = res?.matches || res?.results || [];
    return matches
      .slice(0, topK)
      .map((m, i) => ({
        chunk_id: String(m.id ?? m.chunk_id ?? `chunk_${i + 1}`),
        score: typeof m.score === "number" ? m.score : null,
        text: m.metadata?.text || m.metadata?.content || m.text || m.document || "",
        source: m.metadata?.source || m.metadata?.doc || m.metadata?.title || "internal",
      }))
      .filter((x) => (x.text || "").trim().length > 0);
  } catch (e) {
    console.log("Vectorize query failed:", e?.message || e);
    return [];
  }
}

function formatInternalExcerpts(excerpts) {
  if (!excerpts || excerpts.length === 0) return "";
  const lines = excerpts.map((x) => {
    const snippet = String(x.text || "").trim().replace(/\s+/g, " ");
    const clipped = snippet.length > 380 ? snippet.slice(0, 380) + "…" : snippet;
    return `- [chunk_id: ${x.chunk_id}] [source: ${x.source}] ${clipped}`;
  });
  return `\n\nINTERNAL EXCERPTS (facts/examples only):\n${lines.join("\n")}\n`;
}

/* ─────────────────────────────────────────────────────────────
 * WEB SEARCH (Tavily)
 * ───────────────────────────────────────────────────────────── */
async function searchWeb(query, apiKey) {
  const response = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      api_key: apiKey,
      query,
      search_depth: "basic",
      max_results: 5,
      include_answer: true,
      include_raw_content: false,
    }),
  });

  if (!response.ok) throw new Error(`Tavily API error: ${response.status}`);

  const data = await response.json();
  let context = "";

  if (data.answer) context += `Summary: ${data.answer}\n\n`;
  if (Array.isArray(data.results) && data.results.length > 0) {
    context += "Sources:\n";
    data.results.slice(0, 3).forEach((r, i) => {
      const title = r.title || "Source";
      const content = (r.content || "").substring(0, 220);
      context += `${i + 1}. ${title}: ${content}...\n`;
    });
  }

  return context.trim();
}

/* ─────────────────────────────────────────────────────────────
 * GENERATION PROMPT (Constitution + Few-shot)
 * ───────────────────────────────────────────────────────────── */
function buildMoneyAIGenerationSystemPrompt({
  personaKey,
  personaText,
  internalExcerptsBlock,
  webContextBlock,
  userLanguage,
}) {
  const truthGate = internalExcerptsBlock
    ? `Internal excerpts exist. You MAY use them as facts/examples. NEVER say “PDF knowledge base”.`
    : `No internal excerpts exist. You MUST NOT mention PDFs/knowledge base/internal docs.`;

  const webGate = webContextBlock
    ? `Web results exist. Use them as neutral facts. NEVER say “web search reveals”.`
    : `No web results exist. You MUST NOT claim you searched the web.`;

  const languageRule =
    userLanguage === "ar"
      ? `Reply in Arabic (simple Gulf/Levant).`
      : userLanguage === "mixed"
        ? `Reply in the dominant language of the user's last message.`
        : `Reply in English.`;

  const requiredLabelsText = REQUIRED_LABELS.map((x) => `- ${x}`).join("\n");

  const fewShot = buildFewShotExamples(userLanguage);

  return `
You are Money AI.

${languageRule}

IDENTITY
You are not a chatbot. You are an execution-grade decision engine that moves the user from RUSH (reactive, low leverage) to RICH (calm systems, compounding).

ABSOLUTE RULES (NO EXCEPTIONS)
1) No consultant filler. Every line must reduce uncertainty or force a decision.
2) No onboarding/therapist openings. If vague, assume defaults and still deliver.
3) Ask ONLY ONE question (in "One Question:").
4) Exactly ONE 48-hour mission. Must include success criteria.
5) final.next_action MUST MATCH the 48h Mission (same mission).
6) ${truthGate}
7) ${webGate}
8) Output JSON ONLY.

MANDATORY CONTENT LABELS (must appear EXACTLY as written, once each):
${requiredLabelsText}

PERSONA (voice only; cannot override rules)
${personaKey}: ${personaText}

FEW-SHOT STYLE (copy this structure and sharpness):
${fewShot}

${internalExcerptsBlock || ""}

${webContextBlock || ""}

Now answer the user.

Return VALID JSON ONLY:
{
  "mode": "reply",
  "selected_character": "${personaKey}",
  "bubbles": [ { "speaker": "${personaKey}", "text": "..." } ],
  "final": { "decision": "ACCEPT" | "REJECT", "next_action": "..." }
}
`.trim();
}

function buildFewShotExamples(lang) {
  if (lang === "ar") {
    return `
Example
User: بدي أفتح محل حلاقة في الدوحة
Assistant:
Diagnosis: هذا Wheat لكن السوق مليان ناس تفتح بدون “ميزة”، فتصير تبدّل وقت بمال.
Wheat/Tomato: Wheat — خدمة متكررة وضرورية.
Leverage: اربح بالسهولة + الاشتراكات (دخل متكرر) + حجز واتساب + سرعة خدمة.
Friction: موقع غلط، تسعير بدون باقات، توظيف حلاق ممتاز، منافسة قريبة.
Unit Math: (عملاء/يوم)×(متوسط فاتورة)×(أيام/شهر) − (إيجار+رواتب+مواد). هدفك 30–40% هامش.
48h Mission: خلال 48 ساعة جهّز “عرض مؤسسين” اشتراك 199–299 + صورة واحدة + رابط واتساب، وبيع 20 اشتراك مسبق. النجاح: 20 دفعة أو 20 تعهد دفع مكتوب.
One Question: تستهدف اقتصادي ولا متوسط ولا فاخر؟`;
  }

  return `
Example
User: I want to open a barbershop in Doha
Assistant:
Diagnosis: It’s Wheat demand, but most people enter with no edge and get stuck trading hours for cash.
Wheat/Tomato: Wheat — recurring, necessary service.
Leverage: Win on convenience + repeat revenue: memberships + WhatsApp booking + fast turnaround.
Friction: wrong location, generic pricing, hiring talent, nearby competition.
Unit Math: (clients/day)×(avg ticket)×(days/month) − (rent+wages+supplies). Target 30–40% margin.
48h Mission: In 48h, create a “Founders Offer” membership (QAR 199–299), one poster, one WhatsApp booking link, and pre-sell 20 memberships. Success: 20 paid or 20 written commitments.
One Question: Are you targeting budget, mid, or premium?`;
}

/* ─────────────────────────────────────────────────────────────
 * GENERATION WITH VALIDATION + AUTO-RETRY
 * ───────────────────────────────────────────────────────────── */
async function generateWithValidation(env, { model, systemPrompt, userMessage, personaKey }) {
  const originalUserMessage = userMessage;
  let lastParsed = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const qcAddon =
      attempt === 1
        ? ""
        : `\n\nQC REGENERATION REQUIRED:\n- Fix violations: ${detectViolations(lastParsed).join(", ")}\n- Include all required labels.\n- Exactly ONE question.\n- Exactly ONE 48h mission with success criteria.\n- final.next_action must match the mission.\n- Output JSON ONLY.\n`;

    const response = await env.AI.run(model, {
      messages: [
        { role: "system", content: systemPrompt + qcAddon },
        { role: "user", content: originalUserMessage },
      ],
    });

    const rawText = stripCodeFences(extractText(response)).trim();
    const parsed = extractJsonObject(rawText);

    if (!parsed) {
      lastParsed = null;
      continue;
    }

    const cleaned = cleanResponseStrict(parsed, personaKey);
    lastParsed = cleaned;

    const violations = detectViolations(cleaned);
    if (violations.length === 0) return cleaned;
  }

  // Controlled fallback (still Money AI contract)
  return fallbackMoneyAI(personaKey);
}

/* ─────────────────────────────────────────────────────────────
 * VALIDATOR (the “guarantee”)
 * ───────────────────────────────────────────────────────────── */
function detectViolations(resultJson) {
  const violations = [];

  if (!resultJson) return ["null_result"];

  const asText = JSON.stringify(resultJson).toLowerCase();
  for (const p of BANNED_PHRASES) {
    if (asText.includes(p)) violations.push(`banned:${p}`);
  }

  const bubbles = Array.isArray(resultJson?.bubbles) ? resultJson.bubbles : [];
  if (!bubbles.length) violations.push("missing_bubbles");

  const combined = bubbles.map((b) => String(b?.text || "")).join("\n");
  for (const label of REQUIRED_LABELS) {
    if (!combined.includes(label)) violations.push(`missing_label:${label}`);
  }

  // Exactly one question in One Question line
  const oneQ = extractLineStartingWith(combined, "One Question:");
  if (!oneQ) violations.push("missing_one_question_line");
  else {
    const qCount = (oneQ.match(/[?؟]/g) || []).length;
    if (qCount !== 1) violations.push("one_question_not_exactly_one");
  }

  // Mission must include 48h + success criteria + action verb
  const missionLine = extractLineStartingWith(combined, "48h Mission:");
  if (!missionLine) violations.push("missing_mission_line");
  else {
    if (!/48/i.test(missionLine)) violations.push("mission_missing_48");
    if (!/(success|done when|proof|deliverable|النجاح|تم عندما)/i.test(missionLine)) {
      violations.push("mission_missing_success_criteria");
    }
    if (!/(write|send|call|visit|list|compare|calculate|build|draft|sell|pre-sell|اكتب|ارسل|اتصل|زر|قارن|احسب|بيع)/i.test(missionLine)) {
      violations.push("mission_not_actionable");
    }
  }

  // final.next_action must match mission
  const next = String(resultJson?.final?.next_action || "");
  if (!next) violations.push("missing_final_next_action");
  else if (missionLine) {
    const mission = missionLine.replace("48h Mission:", "").trim();
    if (!looseSameMission(mission, next)) violations.push("final_next_action_not_matching_mission");
    if (!isGoodAction(next)) violations.push("weak_next_action");
  }

  // Clamp checks
  if (bubbles.length > MAX_BUBBLES) violations.push("too_many_bubbles");
  for (const b of bubbles) {
    if (String(b?.text || "").length > MAX_BUBBLE_CHARS) violations.push("bubble_too_long");
  }

  // Decision sanity
  const d = String(resultJson?.final?.decision || "").toUpperCase();
  if (d !== "ACCEPT" && d !== "REJECT") violations.push("decision_invalid");

  return uniq(violations);
}

function isGoodAction(nextAction) {
  const t = String(nextAction || "").trim();
  if (t.length < 25) return false;
  if (!/(48|24)/i.test(t)) return false;
  if (!/(success|done when|proof|deliverable|النجاح|تم عندما)/i.test(t)) return false;
  return true;
}

function extractLineStartingWith(text, prefix) {
  const lines = String(text || "")
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);
  return lines.find((l) => l.startsWith(prefix)) || "";
}

function looseSameMission(mission, nextAction) {
  const a = normalizeTokens(mission);
  const b = normalizeTokens(nextAction);
  const common = a.filter((x) => b.includes(x));
  return common.length >= Math.min(6, Math.max(3, Math.floor(a.length * 0.4)));
}

function normalizeTokens(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/[^a-z0-9\u0600-\u06FF\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .filter((tok) => tok.length > 2)
    .slice(0, 60);
}

function uniq(arr) {
  return Array.from(new Set(arr));
}

/* ─────────────────────────────────────────────────────────────
 * JSON extraction (robust)
 * ───────────────────────────────────────────────────────────── */
function extractJsonObject(rawText) {
  const s = String(rawText || "").trim();

  // Direct parse
  try {
    return JSON.parse(s);
  } catch (_) {}

  // Find first {...} by brace matching
  const start = s.indexOf("{");
  if (start < 0) return null;

  let depth = 0;
  for (let i = start; i < s.length; i++) {
    const ch = s[i];
    if (ch === "{") depth++;
    if (ch === "}") depth--;
    if (depth === 0) {
      const candidate = s.slice(start, i + 1);
      try {
        return JSON.parse(candidate);
      } catch (_) {
        return null;
      }
    }
  }

  return null;
}

/* ─────────────────────────────────────────────────────────────
 * RESPONSE CLEANING (schema enforcement)
 * ───────────────────────────────────────────────────────────── */
function cleanResponseStrict(parsed, character) {
  const out = {
    mode: parsed?.mode === "council_debate" ? "council_debate" : "reply",
    selected_character: String(parsed?.selected_character || character),
    bubbles: [],
    final: { decision: "ACCEPT", next_action: "" },
  };

  const bubbles = Array.isArray(parsed?.bubbles) ? parsed.bubbles : [];
  out.bubbles = bubbles.length
    ? bubbles.map((b) => ({
        speaker: String(b?.speaker || out.selected_character),
        text: typeof b?.text === "string" ? b.text : String(b?.text ?? ""),
      }))
    : [{ speaker: out.selected_character, text: JSON.stringify(parsed) }];

  // Clamp
  out.bubbles = out.bubbles.slice(0, MAX_BUBBLES).map((b) => ({
    speaker: b.speaker,
    text: String(b.text || "").slice(0, MAX_BUBBLE_CHARS),
  }));

  const decision = String(parsed?.final?.decision || "ACCEPT").toUpperCase();
  out.final.decision = decision === "REJECT" ? "REJECT" : "ACCEPT";
  out.final.next_action = typeof parsed?.final?.next_action === "string" ? parsed.final.next_action : "";

  return out;
}

function fallbackMoneyAI(character) {
  const text =
    `Diagnosis: Your request is actionable, but we’re missing one variable to avoid guessing.\n` +
    `Wheat/Tomato: Wheat until proven otherwise — we focus on needs and leverage.\n` +
    `Leverage: Raise value/hour by choosing a narrow customer + repeat revenue.\n` +
    `Friction: The blocker is unclear target customer and pricing.\n` +
    `Unit Math: (customers/week) × (price) − (fixed costs). Margin first, then scale.\n` +
    `48h Mission: In 48h, write (customer + price range + differentiator), then message 10 prospects and get 3 “yes I’d pay” commitments. Success: 3 written pay commitments.\n` +
    `One Question: Who exactly is the customer (role + place + budget)?`;

  return {
    mode: "reply",
    selected_character: character,
    bubbles: [{ speaker: character, text }],
    final: {
      decision: "REJECT",
      next_action:
        "In 48h, write (customer + price range + differentiator), then message 10 prospects and get 3 “yes I’d pay” commitments. Success: 3 written pay commitments.",
    },
  };
}

/* ─────────────────────────────────────────────────────────────
 * HELPERS
 * ───────────────────────────────────────────────────────────── */
function extractText(response) {
  if (typeof response === "string") return response;
  if (response?.response) return typeof response.response === "string" ? response.response : JSON.stringify(response.response);
  if (response?.result) return typeof response.result === "string" ? response.result : JSON.stringify(response.result);
  return JSON.stringify(response);
}

function stripCodeFences(s) {
  return String(s || "").replace(/```json\s*/g, "").replace(/```\s*/g, "");
}

/* ─────────────────────────────────────────────────────────────
 * PERSONAS + ROUTING (kept)
 * ───────────────────────────────────────────────────────────── */
const PERSONAS = {
  KAREEM: `[KAREEM] Laziness/Efficiency. "If it requires effort, it's broken." Finds shortcuts.`,
  TURBO: `[TURBO] Speed/Execution. "Results by Friday." Action-oriented.`,
  WOLF: `[WOLF] ROI/Scale. Cold numbers. Compounding systems.`,
  LUNA: `[LUNA] Premium/Brand. Customer psychology + experience.`,
  THE_CAPTAIN: `[THE_CAPTAIN] Risk/Safety. Assumes failure; protects downside.`,
  TEMPO: `[TEMPO] Time Auditor. Turns hours into strategy.`,
  HAKIM: `[HAKIM] Wisdom/Stories. Short parables only when useful.`,
  UNCLE_WHEAT: `[UNCLE_WHEAT] Needs lens. Wheat vs tomato brutally clear.`,
  TOMMY_TOMATO: `[TOMMY_TOMATO] Hype/viral. Still obeys Money AI rules.`,
  THE_ARCHITECT: `[THE_ARCHITECT] Systems. Structured, decisive, compounding.`,
};

function runRoutingLogic(text, requestedCharacter) {
  if (requestedCharacter && PERSONAS[String(requestedCharacter)]) {
    return { character: String(requestedCharacter), killSwitchTriggered: false };
  }

  const t = String(text || "").toLowerCase();

  if (t.includes("council debate") || t.includes("debate") || t.includes("council")) {
    return { character: "THE_ARCHITECT", killSwitchTriggered: true };
  }

  if (t.includes("risk") || t.includes("safe")) return { character: "THE_CAPTAIN", killSwitchTriggered: false };
  if (t.includes("fast") || t.includes("quick") || t.includes("now")) return { character: "TURBO", killSwitchTriggered: false };
  if (t.includes("lazy") || t.includes("automate") || t.includes("easy")) return { character: "KAREEM", killSwitchTriggered: false };
  if (t.includes("brand") || t.includes("premium") || t.includes("luxury")) return { character: "LUNA", killSwitchTriggered: false };
  if (t.includes("hype") || t.includes("viral")) return { character: "TOMMY_TOMATO", killSwitchTriggered: false };
  if (t.includes("scale") || t.includes("10x") || t.includes("roi")) return { character: "WOLF", killSwitchTriggered: false };
  if (t.includes("time") || t.includes("hour") || t.includes("audit")) return { character: "TEMPO", killSwitchTriggered: false };
  if (t.includes("need") || t.includes("wheat") || t.includes("essential")) return { character: "UNCLE_WHEAT", killSwitchTriggered: false };
  if (t.includes("story") || t.includes("wisdom")) return { character: "HAKIM", killSwitchTriggered: false };

  // Arabic routing keywords
  if (/[\u0600-\u06FF]/.test(text || "")) {
    if (/(مخاطر|آمن|امان)/.test(text)) return { character: "THE_CAPTAIN", killSwitchTriggered: false };
    if (/(سريع|الآن|بسرعة)/.test(text)) return { character: "TURBO", killSwitchTriggered: false };
    if (/(وقت|ساعات|تدقيق)/.test(text)) return { character: "TEMPO", killSwitchTriggered: false };
  }

  return { character: "THE_ARCHITECT", killSwitchTriggered: false };
}
