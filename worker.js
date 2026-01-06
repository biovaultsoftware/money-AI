/**
 * MONEY AI COUNCIL — WORKER v6 (B: AI Search AutoRAG + Anti-Generic Output + QC)
 * --------------------------------------------------------------------------------
 * Drop-in replacement for worker-with-search.js
 *
 * Primary fix: your model isn't "dumb" — it's unconstrained.
 * When the knowledge base is treated as factual, it starts roleplaying "PDF says..." and becomes generic.
 *
 * v6 design:
 * 1) Query Rewrite decides: need web? need playbook retrieval? (AutoRAG)
 * 2) AutoRAG is used as a *coaching playbook* (stories, scripts, structure) — NOT as factual authority.
 * 3) Web search is ONLY for fresh facts. If no web results, the model must not claim facts.
 * 4) Generation prompt is strict JSON + anti-generic rules + 48h micro-mission.
 * 5) QC validator enforces: no banned phrases, no fake sources, no generic filler, 1 real action.
 *
 * ENV:
 * - env.AI (Workers AI binding)
 * - env.TAVILY_API_KEY (optional)
 * - Optional AutoRAG: env.AI.autorag("<name>") must exist in your account.
 */

export default {
  async fetch(request, env) {
    // ─────────────────────────────────────────────────────────────
    // CORS
    // ─────────────────────────────────────────────────────────────
    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: corsHeaders(),
      });
    }

    const url = new URL(request.url);

    // Health check
    if (url.pathname === "/health") {
      return jsonResponse(
        {
          ok: true,
          worker: "moneyai-council-v6",
          hasAI: !!env.AI,
          hasTavily: !!env.TAVILY_API_KEY,
          hasAutoRAG: !!(env.AI && typeof env.AI.autorag === "function"),
        },
        200
      );
    }

    // ─────────────────────────────────────────────────────────────
    // Parse input
    // ─────────────────────────────────────────────────────────────
    let userText = url.searchParams.get("text");
    let requestedPersona = url.searchParams.get("persona");

    if (!userText && request.method === "POST") {
      try {
        const body = await request.json();
        userText = body.text || body.message || body.query;
        requestedPersona = requestedPersona || body.persona || body.character;
      } catch (_) {}
    }

    if (!userText) userText = "Explain Rush → Rich with one practical example.";

    // ─────────────────────────────────────────────────────────────
    // Language + Persona routing
    // ─────────────────────────────────────────────────────────────
    const detectedLang = detectUserLanguage(userText);
    const router = runRoutingLogic(userText, requestedPersona);

    try {
      // ─────────────────────────────────────────────────────────────
      // STEP 0: QUERY REWRITE
      // ─────────────────────────────────────────────────────────────
      const rewrite = await runQueryRewrite(env, userText, detectedLang);
      const normalizedQuery = rewrite?.normalized_query || userText;
      const userLanguage = rewrite?.user_language || detectedLang;

      // Default: playbook retrieval ON, because this is how we enforce behavior.
      const usePlaybookRag = rewrite?.use_playbook_rag ?? true;
      const useWebSearch = rewrite?.use_web_search ?? false;

      // ─────────────────────────────────────────────────────────────
      // STEP 1: PLAYBOOK RAG (AutoRAG) — coaching style, NOT facts
      // ─────────────────────────────────────────────────────────────
      let playbookBlock = "";
      if (usePlaybookRag) {
        const playbook = await retrievePlaybookExcerpts(env, normalizedQuery, 10);
        playbookBlock = formatPlaybookExcerpts(playbook);
      }

      // ─────────────────────────────────────────────────────────────
      // STEP 2: WEB SEARCH (ONLY when needed)
      // ─────────────────────────────────────────────────────────────
      let webContextBlock = "";
      if (useWebSearch && env.TAVILY_API_KEY) {
        try {
          const web = await searchWeb(normalizedQuery, env.TAVILY_API_KEY);
          if (web) webContextBlock = `\n\nWEB RESULTS (external factual context):\n${web}\n`;
        } catch (e) {
          console.log("Web search failed:", e?.message || e);
        }
      }

      // ─────────────────────────────────────────────────────────────
      // STEP 3: SINGLE SYSTEM PROMPT
      // ─────────────────────────────────────────────────────────────
      const systemPrompt = buildMoneyAIGenerationSystemPrompt({
        personaKey: router.character,
        personaText: PERSONAS[router.character],
        playbookBlock,
        webContextBlock,
        userLanguage,
      });

      // ─────────────────────────────────────────────────────────────
      // STEP 4: GENERATE + VALIDATE + RETRY
      // ─────────────────────────────────────────────────────────────
      const result = await generateWithValidation(env, {
        model: MODEL_GENERATION,
        systemPrompt,
        userMessage: userText,
        personaKey: router.character,
        userLanguage,
      });

      return jsonResponse(result, 200, {
        "X-MoneyAI-Worker": "v6-autorag-qc",
        "X-MoneyAI-Lang": userLanguage,
        "X-MoneyAI-Web": String(!!webContextBlock),
        "X-MoneyAI-Playbook": String(!!playbookBlock),
      });
    } catch (e) {
      return jsonResponse(
        {
          mode: "reply",
          selected_character: router.character,
          bubbles: [
            {
              speaker: router.character,
              text: "System error: " + (e?.message || String(e)),
            },
          ],
          final: {
            decision: "REJECT",
            next_action: localizeAction("Try again with a shorter question.", detectedLang),
          },
        },
        500,
        { "X-MoneyAI-Worker": "v6-autorag-qc" }
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
 * QUERY REWRITE PROMPT
 * ───────────────────────────────────────────────────────────── */
const QUERY_REWRITE_PROMPT = `
You are Money AI — Query Rewrite Engine.

You DO NOT answer the user.
You output retrieval-ready JSON only.

LANGUAGE RULE:
- Detect user language.
- Keep normalized_query in SAME language.
- user_language: "ar" | "en" | "mixed".

TOOL POLICY:
- use_playbook_rag: true for almost everything. This is NOT factual RAG; it is a coaching playbook.
- use_web_search: true ONLY when the user needs fresh external facts (licenses, permits, registrations, addresses, current prices, "today/latest", official rules).

OUTPUT JSON ONLY (no prose), matching schema:
{
  "user_language": "ar|en|mixed",
  "intent_type": "business_decision|career_decision|idea_validation|time_management|mindset_block|factual_lookup|comparison|other",
  "normalized_query": "<short decision-focused query in same language>",
  "use_playbook_rag": true,
  "use_web_search": false,
  "known_variables": { "key": "value" },
  "missing_variables": ["string"]
}
`.trim();

async function runQueryRewrite(env, userText, detectedLang) {
  try {
    const hint = `User language hint: ${detectedLang}. Keep normalized_query in same language.`;

    const resp = await env.AI.run(MODEL_REWRITE, {
      messages: [
        { role: "system", content: QUERY_REWRITE_PROMPT },
        { role: "user", content: hint + "\n\nUser message:\n" + userText },
      ],
    });

    const raw = stripCodeFences(extractText(resp)).trim();
    const parsed = safeJsonParse(raw);
    if (!parsed || typeof parsed !== "object") return null;

    // Normalize booleans
    parsed.use_playbook_rag = parsed.use_playbook_rag !== false;
    parsed.use_web_search = !!parsed.use_web_search;

    if (!parsed.user_language) parsed.user_language = detectedLang;

    // Simple deterministic web-search triggers (backup)
    const t = String(userText || "").toLowerCase();
    const ar = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]/.test(userText || "");

    const mustFreshEn = /(license|permit|registration|requirements|moci|qfc|qatar|address|fee|cost|price|latest|today|now)/i;
    const mustFreshAr = /(ترخيص|تصريح|تسجيل|متطلبات|وزارة|قطر|عنوان|رسوم|تكلفة|سعر|اليوم|الآن)/;

    if (mustFreshEn.test(t) || (ar && mustFreshAr.test(userText))) {
      parsed.use_web_search = true;
    }

    return parsed;
  } catch (e) {
    console.log("rewrite failed:", e?.message || e);
    return null;
  }
}

/* ─────────────────────────────────────────────────────────────
 * PLAYBOOK RAG (AutoRAG)
 * ───────────────────────────────────────────────────────────── */
const AUTORAG_NAME = "human1stai"; // change if your AutoRAG index has a different name

async function retrievePlaybookExcerpts(env, query, topK = 10) {
  // This is used as a *style/playbook* context. Never cite as factual authority.
  try {
    if (!env?.AI || typeof env.AI.autorag !== "function") return [];

    const rag = env.AI.autorag(AUTORAG_NAME);

    // Cloudflare has had slight API differences; try multiple shapes.
    let res = null;
    if (rag && typeof rag.search === "function") {
      res = await rag.search({ query, topK });
    } else if (rag && typeof rag.query === "function") {
      res = await rag.query(query, { topK });
    } else if (rag && typeof rag.run === "function") {
      res = await rag.run({ query, topK });
    }

    const matches = res?.matches || res?.results || res?.documents || [];

    return matches
      .slice(0, topK)
      .map((m, i) => {
        const id = String(m.id ?? m.document_id ?? m.chunk_id ?? `playbook_${i + 1}`);
        const text = String(m.text ?? m.content ?? m.document ?? m.metadata?.text ?? "");
        const score = typeof m.score === "number" ? m.score : null;
        const source = String(m.source ?? m.metadata?.source ?? m.metadata?.title ?? "playbook");
        return { id, score, source, text };
      })
      .filter((x) => x.text.trim().length > 0);
  } catch (e) {
    console.log("autorag failed:", e?.message || e);
    return [];
  }
}

function formatPlaybookExcerpts(excerpts) {
  if (!excerpts || excerpts.length === 0) return "";

  const lines = excerpts.slice(0, 10).map((x) => {
    const s = x.text.trim().replace(/\s+/g, " ");
    const clipped = s.length > 420 ? s.slice(0, 420) + "…" : s;
    return `- [id:${x.id}] ${clipped}`;
  });

  return `\n\nPLAYBOOK EXCERPTS (style + scripts; not factual authority):\n${lines.join("\n")}\n`;
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
    data.results.slice(0, 4).forEach((r, i) => {
      const title = r.title || "Source";
      const content = String(r.content || "").substring(0, 260);
      const url = r.url ? ` (${r.url})` : "";
      context += `${i + 1}. ${title}${url}: ${content}...\n`;
    });
  }

  return context.trim();
}

/* ─────────────────────────────────────────────────────────────
 * GENERATION SYSTEM PROMPT
 * ───────────────────────────────────────────────────────────── */
function buildMoneyAIGenerationSystemPrompt({
  personaKey,
  personaText,
  playbookBlock,
  webContextBlock,
  userLanguage,
}) {
  const languageRule =
    userLanguage === "ar"
      ? `LANGUAGE: Arabic. Use simple Arabic (Gulf/Levant-friendly).`
      : userLanguage === "mixed"
        ? `LANGUAGE: Mixed Arabic/English. Reply in the dominant language of the user message; if unclear, use Arabic.`
        : `LANGUAGE: English.`;

  const webGate = webContextBlock
    ? `WEB FACTS AVAILABLE BELOW. Use them when you need external facts. If web facts do NOT include a detail, do NOT claim it.`
    : `NO WEB FACTS PROVIDED. You MUST NOT claim you searched the web or cite regulations, costs, addresses, official requirements as facts. You may say what to verify.`;

  // Few-shots: force the voice to match Money AI.
  const fewshot = `
FEW-SHOT STYLE ANCHOR (do not mention this section):
User: "I want to open a barbershop in Doha."
Good Money AI response shape:
- Diagnosis: Why they asked (rush seeking certainty)
- Wheat/Tomato: barber = semi-wheat (repeat need) + satisfaction layer
- Unit math: chairs, cuts/day, price range assumption, rent stress test, breakeven
- Frictions: location, staffing, retention, licensing (verify sources)
- 48h mission: visit 3 neighborhoods + collect competitor prices + write a 1-page unit sheet

User: "I'm wasting 3 hours/day commuting."
Good shape:
- Turn time leak into paid service test with 3–5 people
- 48h mission: message 5 neighbors with one offer
`.trim();

  return `
You are Money AI.
${languageRule}

CORE IDENTITY
You are not a generic advisor. You are an execution coach that converts time into money by building simple systems.
Time is the real currency. Rich thinking builds compounding systems (hunt→pen→farm→canal→village).

ABSOLUTE RULES (NO EXCEPTIONS)
1) NO GENERIC FILLER:
   Never write phrases like: "can be lucrative", "growing demand", "do market research", "create a business plan", "get necessary licenses".
   Every sentence must contain a decision, a number/assumption, a constraint, a tradeoff, or a specific next move.

2) NO FAKE SOURCES:
   Do NOT say "according to the PDF/knowledge base".
   The PLAYBOOK EXCERPTS are guidance for coaching style only, not authority.

3) TOOL HONESTY:
   ${webGate}

4) ALWAYS PRODUCE ONE REAL ACTION:
   Exactly ONE action, time-boxed ≤ 48 hours, binary done/not-done, with clear success criteria.

5) SAFETY:
   No legal/tax/regulated financial advice. If user needs legal compliance, say "verify with a PRO/municipality" — but still give practical steps.

MONEY AI ENGINE (apply silently)
A) Wheat vs Tomato (Need Strength) — 1 line
B) Leverage/ECF — 1 lever to avoid trading hours for money forever
C) Execution Friction — 2–4 real blockers (not vague)
D) Unit Math — 2–6 decision numbers with assumptions
E) 48h move — force momentum

TONE
Direct. Calm. No fluff. Respectful.

MANDATORY OUTPUT FORMAT (JSON ONLY)
Return valid JSON ONLY. No markdown.
{
  "mode": "reply" | "council_debate",
  "selected_character": "NAME",
  "bubbles": [ { "speaker": "NAME", "text": "Plain text" } ],
  "final": { "decision": "ACCEPT" | "REJECT", "next_action": "Binary 48-hour micro-mission + success criteria" }
}

CURRENT PERSONA (voice only; rules override persona)
Persona key: ${personaKey}
Persona voice: ${personaText}

${fewshot}

${playbookBlock || ""}

${webContextBlock || ""}

Now answer the user message. Output JSON ONLY.
`.trim();
}

/* ─────────────────────────────────────────────────────────────
 * GENERATION + VALIDATION
 * ───────────────────────────────────────────────────────────── */
async function generateWithValidation(env, { model, systemPrompt, userMessage, personaKey, userLanguage }) {
  const MAX_ATTEMPTS = 3;
  const originalUserMessage = userMessage;

  let lastGood = null;
  let lastViolations = [];

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const qc =
      attempt === 1
        ? ""
        : `\nQC REGEN REQUIRED: Fix these violations: ${lastViolations.join(", ")}.\nDo NOT add filler. Output JSON ONLY. Ensure exactly ONE 48h binary next_action with success criteria.`;

    const response = await env.AI.run(model, {
      messages: [
        { role: "system", content: systemPrompt + qc },
        { role: "user", content: originalUserMessage },
      ],
    });

    const raw = stripCodeFences(extractText(response)).trim();
    const parsed = safeJsonParse(raw);

    if (!parsed) {
      lastViolations = ["invalid_json"];
      continue;
    }

    const cleaned = cleanResponseStrict(parsed, personaKey);

    const violations = detectViolations(cleaned, userLanguage);
    if (violations.length === 0) return cleaned;

    lastGood = cleaned;
    lastViolations = violations;
  }

  // Best-effort fallback: keep it usable.
  return (
    lastGood || {
      mode: "reply",
      selected_character: personaKey,
      bubbles: [
        {
          speaker: personaKey,
          text: userLanguage === "ar" ? "صار خطأ في توليد الرد بشكل صحيح." : "Generation failed formatting rules.",
        },
      ],
      final: {
        decision: "REJECT",
        next_action:
          userLanguage === "ar"
            ? "خلال 48 ساعة: اكتب سؤالك بجملة واحدة + اذكر الميزانية والهدف. النجاح: ترسل هالمعلومتين."
            : "Within 48h: re-ask in 1 sentence + include budget and goal. Success: you send those 2 details.",
      },
    }
  );
}

/* ─────────────────────────────────────────────────────────────
 * VALIDATION (anti-generic + anti-fake-sources)
 * ───────────────────────────────────────────────────────────── */
function detectViolations(resultJson, userLanguage) {
  const text = JSON.stringify(resultJson).toLowerCase();

  const badPhrases = [
    // fake sources
    "according to the pdf",
    "pdf knowledge base",
    "knowledge base",
    "internal documents",
    // fake tool usage
    "web search reveals",
    "a web search reveals",
    // generic filler
    "can be lucrative",
    "growing demand",
    "do market research",
    "market analysis",
    "comprehensive business plan",
    "business plan",
    "you'll need to obtain the necessary licenses",
    "obtain the necessary licenses",
    "register your business",
    "it is important to",
    "i recommend conducting",
    // onboarding fluff
    "to better assist you",
    "i need more information",
    "provide more information",
    "tell me more about",
    // useless action
    "review the advice above",
  ];

  const violations = [];
  for (const p of badPhrases) {
    if (text.includes(p)) violations.push(p);
  }

  // Ensure structure
  if (!resultJson?.bubbles?.length) violations.push("missing_bubbles");
  if (!resultJson?.final) violations.push("missing_final");

  // Ensure exactly ONE action
  const next = resultJson?.final?.next_action;
  if (!isGoodAction(next, userLanguage)) violations.push("weak_next_action");

  return violations;
}

function isGoodAction(nextAction, lang) {
  if (typeof nextAction !== "string") return false;
  const t = nextAction.trim();
  if (t.length < 18) return false;
  if (/review/i.test(t)) return false;

  const hasTime =
    lang === "ar" || /[\u0600-\u06FF]/.test(t)
      ? /(24|48|ساعة|خلال|اليوم|بكرا)/i.test(t)
      : /(24|48|hour|hrs|today|tomorrow)/i.test(t);

  const hasBinary =
    lang === "ar" || /[\u0600-\u06FF]/.test(t)
      ? /(النجاح|تم|ارسل|أرسل|اجمع|اتصل|زر|قارن|اكتب|احسب)/i.test(t)
      : /(success|send|collect|write|call|visit|price|quote|calculate|list|compare|draft|build)/i.test(t);

  return hasTime && hasBinary;
}

/* ─────────────────────────────────────────────────────────────
 * LANGUAGE DETECTION
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
    if (actionEn.toLowerCase().includes("try again")) return "أعد المحاولة بسؤال أقصر وواضح.";
    return "نفّذ المهمة خلال 48 ساعة وارجع بالنتيجة.";
  }
  return actionEn;
}

/* ─────────────────────────────────────────────────────────────
 * RESPONSE CLEANUP
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
        speaker: String(b?.speaker || character),
        text: typeof b?.text === "string" ? b.text : String(b?.text ?? ""),
      }))
    : [{ speaker: character, text: typeof parsed === "string" ? parsed : JSON.stringify(parsed) }];

  const decision = String(parsed?.final?.decision || "ACCEPT").toUpperCase();
  out.final.decision = decision === "REJECT" ? "REJECT" : "ACCEPT";
  out.final.next_action = typeof parsed?.final?.next_action === "string" ? parsed.final.next_action : "";

  // Guard: ensure next_action exists even if model forgets
  if (!out.final.next_action) {
    out.final.decision = "REJECT";
    out.final.next_action =
      "Within 48h: rewrite your question in one sentence + add budget + goal. Success: you send those 2 details.";
  }

  return out;
}

/* ─────────────────────────────────────────────────────────────
 * HELPERS
 * ───────────────────────────────────────────────────────────── */
function extractText(response) {
  if (typeof response === "string") return response;
  if (response?.response) return typeof response.response === "string" ? response.response : JSON.stringify(response.response);
  if (response?.result) return typeof response.result === "string" ? response.result : JSON.stringify(response.result);
  if (response?.output_text) return String(response.output_text);
  return JSON.stringify(response);
}

function stripCodeFences(s) {
  return String(s || "")
    .replace(/```json\s*/g, "")
    .replace(/```\s*/g, "")
    .trim();
}

function safeJsonParse(s) {
  try {
    return JSON.parse(s);
  } catch (_) {
    return null;
  }
}

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

function jsonResponse(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...corsHeaders(),
      "Content-Type": "application/json",
      ...extraHeaders,
    },
  });
}

/* ─────────────────────────────────────────────────────────────
 * PERSONAS
 * ───────────────────────────────────────────────────────────── */
const PERSONAS = {
  KAREEM: `[KAREEM] Laziness/Efficiency. "If it requires effort, it's broken." Finds shortcuts.`,
  TURBO: `[TURBO] Speed/Execution. "Results by Friday." Action-oriented.`,
  WOLF: `[WOLF] Greed/ROI. "10x or nothing." Cold, numerical.`,
  LUNA: `[LUNA] Satisfaction/Brand. "People pay for FEELING." Premium-focused.`,
  THE_CAPTAIN: `[THE_CAPTAIN] Security/Risk. "Assume everything fails." Protective.`,
  TEMPO: `[TEMPO] Time Auditor. "Time is currency." Tracks time leaks + effort cost.`,
  HAKIM: `[HAKIM] Wisdom. Uses parables and stories.`,
  UNCLE_WHEAT: `[UNCLE_WHEAT] Necessity. "Needs survive." Sells essentials.`,
  TOMMY_TOMATO: `[TOMMY_TOMATO] Hype. "Sell the dream." Branding expert.`,
  THE_ARCHITECT: `[THE_ARCHITECT] System Builder. Structured, decisive, compounding systems.`,
};

function runRoutingLogic(text, requestedPersona) {
  const t = String(text || "").toLowerCase();

  // Explicit persona request overrides
  if (requestedPersona && PERSONAS[String(requestedPersona).toUpperCase()]) {
    return { character: String(requestedPersona).toUpperCase(), killSwitchTriggered: false };
  }

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

  // Arabic routing
  if (/[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]/.test(text || "")) {
    if (/(مخاطر|آمن|امان)/.test(text)) return { character: "THE_CAPTAIN", killSwitchTriggered: false };
    if (/(سريع|الآن|بسرعة)/.test(text)) return { character: "TURBO", killSwitchTriggered: false };
    if (/(وقت|ساعات|تدقيق)/.test(text)) return { character: "TEMPO", killSwitchTriggered: false };
  }

  return { character: "THE_ARCHITECT", killSwitchTriggered: false };
}
