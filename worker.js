/**
 * MONEY AI COUNCIL — FIXED WORKER v7 (RELAXED VALIDATION)
 * ------------------------------------------------------------------------------
 * Fixes from v6:
 * 1) Relaxed validation - allows conversational responses without strict 48h actions
 * 2) Handles "what's my name?" type questions properly
 * 3) Less strict isGoodAction() function
 * 4) detectViolations() skips action check for short conversational responses
 *
 * Plus all v6 features:
 * - Parses and uses conversation history from request body
 * - Builds multi-turn messages array for the model
 * - Maintains context awareness across conversation
 *
 * Plus all v5 features:
 * - Language detection: replies in user's language (Arabic/English/mixed)
 * - Query rewrite outputs user_language and keeps normalized_query in same language
 * - QC retry NEVER appended to user text (prevents English override)
 * - Blocks onboarding fluff ("to better assist you...") via system rules + validator
 * - Truth-gating: no "PDF knowledge base" unless excerpts exist
 *
 * ENV:
 * - env.AI (Workers AI binding)
 * - env.TAVILY_API_KEY (optional web search)
 * - env.MONEYAI_VECTORIZE (optional Vectorize binding)
 */

export default {
  async fetch(request, env) {
    // ─────────────────────────────────────────────────────────────
    // CORS
    // ─────────────────────────────────────────────────────────────
    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
        },
      });
    }

    // ─────────────────────────────────────────────────────────────
    // Parse input (NOW WITH HISTORY SUPPORT)
    // ─────────────────────────────────────────────────────────────
    const url = new URL(request.url);
    let userText = url.searchParams.get("text");
    let conversationHistory = [];  // ✅ NEW: Parse conversation history
    let chatId = null;

    if (!userText && request.method === "POST") {
      try {
        const body = await request.json();
        userText = body.text || body.message || body.query;
        
        // ✅ NEW: Extract conversation history from request
        if (Array.isArray(body.history)) {
          conversationHistory = body.history
            .filter(msg => msg && msg.role && msg.content)
            .map(msg => ({
              role: msg.role === 'user' ? 'user' : 'assistant',
              content: String(msg.content || '').slice(0, 2000)  // Limit length
            }))
            .slice(-20);  // Keep last 20 messages max
        }
        
        chatId = body.chatId || null;
      } catch (_) {}
    }

    if (!userText) userText = "Explain Rush → Rich in one practical example.";

    // ─────────────────────────────────────────────────────────────
    // Language detect (fast + deterministic)
    // ─────────────────────────────────────────────────────────────
    const detectedLang = detectUserLanguage(userText);

    // ─────────────────────────────────────────────────────────────
    // Route persona
    // ─────────────────────────────────────────────────────────────
    const router = runRoutingLogic(userText);

    try {
      // ─────────────────────────────────────────────────────────────
      // STEP 0: QUERY REWRITE (tool gating + normalized query + language)
      // ─────────────────────────────────────────────────────────────
      const rewrite = await runQueryRewrite(env, userText, detectedLang);

      const normalizedQuery = rewrite?.normalized_query || userText;
      const useInternalRag = rewrite?.use_internal_rag ?? true;
      const useWebSearch = rewrite?.use_web_search ?? false;

      // language from rewrite (preferred), else fallback to detectedLang
      const userLanguage = rewrite?.user_language || detectedLang;

      // ─────────────────────────────────────────────────────────────
      // STEP 1: INTERNAL RAG (Vectorize optional)
      // ─────────────────────────────────────────────────────────────
      let internalExcerptsBlock = "";
      if (useInternalRag) {
        const internalExcerpts = await retrieveInternalExcerpts(env, normalizedQuery, 8);
        internalExcerptsBlock = formatInternalExcerpts(internalExcerpts);
      }

      // ─────────────────────────────────────────────────────────────
      // STEP 2: WEB SEARCH (ONLY if rewrite says so)
      // ─────────────────────────────────────────────────────────────
      let webContextBlock = "";
      if (useWebSearch && env.TAVILY_API_KEY) {
        try {
          const searchResults = await searchWeb(normalizedQuery, env.TAVILY_API_KEY);
          if (searchResults) webContextBlock = `\n\nWEB SEARCH RESULTS (external):\n${searchResults}\n`;
        } catch (e) {
          console.log("Web search failed:", e?.message || e);
        }
      }

      // ─────────────────────────────────────────────────────────────
      // STEP 3: BUILD SINGLE SYSTEM PROMPT
      // ─────────────────────────────────────────────────────────────
      const systemPrompt = buildMoneyAIGenerationSystemPrompt({
        personaKey: router.character,
        personaText: PERSONAS[router.character],
        internalExcerptsBlock,
        webContextBlock,
        userLanguage,
      });

      // ─────────────────────────────────────────────────────────────
      // STEP 4: CALL MODEL WITH HISTORY + VALIDATE + AUTO-RETRY
      // ─────────────────────────────────────────────────────────────
      const result = await generateWithValidation(env, {
        model: MODEL_GENERATION,
        systemPrompt,
        userMessage: userText,
        conversationHistory,  // ✅ NEW: Pass history to generation
        personaKey: router.character,
      });

      return jsonResponse(result, 200);
    } catch (e) {
      return jsonResponse(
        {
          mode: "reply",
          selected_character: router.character,
          bubbles: [{ speaker: router.character, text: "System error: " + (e?.message || String(e)) }],
          final: { decision: "REJECT", next_action: localizeAction("Try again with a shorter question.", detectedLang) },
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
 * LANGUAGE DETECTION
 * ───────────────────────────────────────────────────────────── */
function detectUserLanguage(text) {
  const s = String(text || "");
  // Arabic Unicode ranges (basic + extended)
  const hasArabic = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]/.test(s);
  const hasLatin = /[A-Za-z]/.test(s);
  if (hasArabic && hasLatin) return "mixed";
  if (hasArabic) return "ar";
  return "en";
}

function localizeAction(actionEn, lang) {
  if (lang === "ar") {
    // keep it simple Arabic
    // (we do not auto-translate long text; just provide a usable Arabic fallback)
    if (actionEn.toLowerCase().includes("try again")) return "أعد المحاولة بسؤال أقصر وواضح.";
    return "نفّذ المهمة خلال 48 ساعة وارجع بالنتيجة.";
  }
  return actionEn;
}

/* ─────────────────────────────────────────────────────────────
 * QUERY REWRITE PROMPT
 * ───────────────────────────────────────────────────────────── */
const QUERY_REWRITE_PROMPT = `
You are Money AI — Query Rewrite Engine.

You do NOT answer the user.
You output retrieval-ready JSON.

CRITICAL LANGUAGE RULE:
- Detect the user's language.
- Keep normalized_query in the SAME language as the user's message.
- Return user_language: "ar" | "en" | "mixed".
- Do NOT translate Arabic to English.

TOOL POLICY:
- use_internal_rag = true for anything involving business decisions, ideas, execution, Rush→Rich, Wheat/Tomato, SHE, ECF, motivators.
- use_web_search = true ONLY if fresh external facts are needed (licenses, permits, regulations, prices, addresses, current rules, "today/latest", official requirements).

OUTPUT JSON ONLY. No prose.

Schema:
{
  "user_language": "ar|en|mixed",
  "intent_type": "business_decision|career_decision|idea_validation|time_management|mindset_block|factual_lookup|comparison|other",
  "normalized_query": "<short decision-focused query in same language>",
  "use_internal_rag": true|false,
  "use_web_search": true|false,
  "known_variables": { "<key>": "<value>" },
  "missing_variables": [ "<string>" ]
}
`.trim();

/* ─────────────────────────────────────────────────────────────
 * GENERATION SYSTEM PROMPT (SINGLE SYSTEM PROMPT)
 * ───────────────────────────────────────────────────────────── */
function buildMoneyAIGenerationSystemPrompt({
  personaKey,
  personaText,
  internalExcerptsBlock,
  webContextBlock,
  userLanguage,
}) {
  const truthGate = internalExcerptsBlock
    ? `INTERNAL EXCERPTS ARE PROVIDED BELOW. You may use them and may cite them ONLY by the provided chunk ids.`
    : `NO INTERNAL EXCERPTS ARE PROVIDED. You MUST NOT mention PDFs, "knowledge base", internal documents, or imply internal sources. If a detail requires confirmation, say what to verify.`;

  const webGate = webContextBlock
    ? `WEB SEARCH RESULTS ARE PROVIDED BELOW. You may use them.`
    : `NO WEB SEARCH RESULTS ARE PROVIDED. You MUST NOT claim you searched the web or reference "web search reveals" statements.`;

  const languageRule =
    userLanguage === "ar"
      ? `LANGUAGE RULE: The user language is Arabic. Respond in Arabic (simple, Gulf/Levant-friendly).`
      : userLanguage === "mixed"
        ? `LANGUAGE RULE: The user mixed Arabic/English. Respond in the dominant language of the last user message; if unclear, use Arabic.`
        : `LANGUAGE RULE: Respond in English.`;

  return `
You are Money AI.

${languageRule}

ROLE
You are a business + mindset execution engine. You move users from RUSH thinking to RICH thinking.
Your job: (1) diagnosis, (2) decision framework applied to this case, (3) ONE measurable next action.

CONVERSATION CONTEXT
You have access to the conversation history. Use it to:
- Maintain context and remember what was discussed
- Reference previous advice, decisions, or user statements
- Understand what "this", "that", "it" refer to from prior messages
- Build on earlier recommendations rather than repeating
- REMEMBER user details like their name, situation, goals mentioned earlier
- If user asks "what's my name?" and they told you earlier, ANSWER with their name

HANDLING SIMPLE QUESTIONS
For simple conversational questions (like "what's my name?", "what did I say?", "remind me"):
- Answer directly from conversation history
- Keep the response short and direct
- The next_action can be simple like "Continue our conversation" or "Ask your next question"
- Do NOT force a 48-hour business action for casual questions

ABSOLUTE RULES (NO EXCEPTIONS)
1) NO GENERIC FILLER:
   Never write vague phrases like "can be lucrative", "growing demand", "do market research", "get necessary licenses", "create a comprehensive business plan".
   Every line must reduce uncertainty or force a decision.

2) NO ONBOARDING / NO THERAPIST MODE:
   Never start with: "To better assist you...", "I need more information...", "Provide more information..."
   If the user is vague, make reasonable assumptions and still produce a concrete plan.
   You may ask ONLY ONE specific question at the end.

3) NO FAKE SOURCES (TRUTH RULE):
   ${truthGate}
   If you reference internal sources, include the chunk id inline.

4) NO TOOL HALLUCINATION:
   ${webGate}

5) ALWAYS PRODUCE A REAL ACTION:
   Every response MUST include exactly ONE action that is:
   - time-boxed (≤ 48 hours)
   - binary (done / not done)
   - measurable (clear success criteria)
   Never output "Review the advice above."

6) SAFETY:
   No legal/tax/regulated financial advice. Give general educational guidance + suggest consulting professionals when needed. No guarantees.

MONEY AI ENGINE (apply silently)
A) Wheat vs Tomato (Need Strength) — 1 line classification + why
B) Leverage & ECF — identify time-for-money trap; propose ONE leverage lever
C) Execution Friction — top 2–4 real blockers (not vague)
D) Unit Math — 2–5 decision numbers; if unknown, fast estimation steps
E) 48-hour move — force momentum

MOTIVATOR FIT
Infer primary motivator (laziness/speed/ambition/satisfaction/security) and shape the action to be followable.

TONE
Direct, calm, precise. Tough on weak ideas, respectful to the person.

MANDATORY OUTPUT FORMAT (JSON ONLY)
Return valid JSON ONLY. No markdown. Must match:
{
  "mode": "reply" | "council_debate",
  "selected_character": "NAME",
  "bubbles": [ { "speaker": "NAME", "text": "Plain text advice" } ],
  "final": { "decision": "ACCEPT" | "REJECT", "next_action": "Binary 48-hour micro-mission + success criteria" }
}

CURRENT PERSONA
Persona key: ${personaKey}
Persona voice: ${personaText}
Persona is voice only. Persona must NEVER override the rules above.

${internalExcerptsBlock || ""}

${webContextBlock || ""}

Now answer the user message. Output JSON ONLY.
`.trim();
}

/* ─────────────────────────────────────────────────────────────
 * GENERATION WITH VALIDATION + AUTO-RETRY (NOW WITH HISTORY)
 * ───────────────────────────────────────────────────────────── */
async function generateWithValidation(env, { model, systemPrompt, userMessage, conversationHistory = [], personaKey }) {
  const MAX_ATTEMPTS = 3;

  // Never mutate original user message; keep it stable to preserve language.
  const originalUserMessage = userMessage;

  let lastParsed = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    // Append QC to SYSTEM prompt ONLY (not user)
    const qcAddon =
      attempt === 1
        ? ""
        : `
QC REGENERATION REQUIRED:
- Fix violations listed below.
- Do NOT add onboarding fluff.
- Do NOT mention PDFs/knowledge base unless internal excerpts exist.
- Provide exactly ONE 48-hour binary action with success criteria.
- Output JSON ONLY.
`.trim();

    const violationHint = lastParsed ? `\nVIOLATIONS TO FIX: ${detectViolations(lastParsed).join(", ")}\n` : "";

    // =====================================================
    // ✅ FIX: Build messages array WITH conversation history
    // =====================================================
    const messages = [
      { role: "system", content: systemPrompt + "\n\n" + qcAddon + "\n" + violationHint },
    ];
    
    // Add conversation history (if any)
    if (conversationHistory && conversationHistory.length > 0) {
      for (const msg of conversationHistory) {
        messages.push({
          role: msg.role,
          content: msg.content
        });
      }
    }
    
    // Add the current user message (may already be in history, but ensures it's the last)
    // Only add if not already the last message in history
    const lastHistoryMsg = conversationHistory[conversationHistory.length - 1];
    const currentMsgAlreadyInHistory = lastHistoryMsg?.role === 'user' && lastHistoryMsg?.content === originalUserMessage;
    
    if (!currentMsgAlreadyInHistory) {
      messages.push({ role: "user", content: originalUserMessage });
    }

    const response = await env.AI.run(model, { messages });

    let rawText = stripCodeFences(extractText(response)).trim();

    const parsed = safeJsonParse(rawText);
    if (!parsed) {
      if (attempt < MAX_ATTEMPTS) continue;
      return hardFallback(personaKey, "I couldn't format JSON. Re-ask in one sentence.");
    }

    const cleaned = cleanResponseStrict(parsed, personaKey);
    lastParsed = cleaned;

    const violations = detectViolations(cleaned);
    if (violations.length === 0) return cleaned;

    // loop and try again (QC stays in system prompt)
  }

  // After attempts, return safe fallback (never leak QC)
  return hardFallback(
    personaKey,
    "Please resend your question in one sentence and include your city + budget + goal."
  );
}

/* ─────────────────────────────────────────────────────────────
 * VALIDATION (updated to catch onboarding fluff + banned phrases)
 * ───────────────────────────────────────────────────────────── */
function detectViolations(resultJson) {
  const text = JSON.stringify(resultJson).toLowerCase();

  const badPhrases = [
    // hallucination / drift
    "according to the pdf",
    "pdf knowledge base",
    "knowledge base",
    "review the advice above",
    "web search reveals",
    // generic filler (only flag these for business questions, not conversational)
    // "can be lucrative",  // Removed - too strict
    // "growing demand",    // Removed - too strict
    // "do market research", // Removed - too strict
    // onboarding fluff (your screenshot issue)
    "to better assist you",
    "i need more information",
    "provide more information",
  ];

  const violations = [];
  for (const p of badPhrases) {
    if (text.includes(p)) violations.push(p);
  }

  // Only check next_action if the response looks like a business response
  // Skip action validation for short conversational responses
  const bubbleText = resultJson?.bubbles?.[0]?.text || "";
  const isConversational = bubbleText.length < 200;  // Short responses are likely conversational
  
  if (!isConversational) {
    const next = resultJson?.final?.next_action || "";
    if (!isGoodAction(next)) violations.push("weak_next_action");
  }

  return violations;
}

function isGoodAction(nextAction) {
  if (typeof nextAction !== "string") return false;
  const t = nextAction.toLowerCase().trim();
  
  // Allow shorter actions for conversational responses (minimum 10 chars)
  if (t.length < 10) return false;
  
  // Block only the most generic non-actions
  if (t === "review the advice above" || t === "review the advice above.") return false;
  
  // For conversational questions, any reasonable action is fine
  // Only enforce strict validation for longer, business-focused actions
  if (t.length < 30) return true;  // Short actions are OK
  
  // For longer actions, prefer time-bound but don't require it
  const hasTime = /(\b24\b|\b48\b|hour|hrs|day|week|today|tomorrow|اليوم|بكرا|خلال|ساعة)/i.test(t);
  const hasMeasure = /(send|collect|write|call|visit|price|quote|calculate|list|compare|draft|build|ask|tell|share|check|confirm|اكتب|اجمع|اتصل|زر|قارن|احسب|ارسل)/i.test(t);

  // Accept if it has either time OR action verb (not both required)
  return hasTime || hasMeasure || t.length >= 20;
}

/* ─────────────────────────────────────────────────────────────
 * QUERY REWRITE CALL (passes detected language as hint)
 * ───────────────────────────────────────────────────────────── */
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

    parsed.use_internal_rag = !!parsed.use_internal_rag;
    parsed.use_web_search = !!parsed.use_web_search;

    // Ensure user_language exists
    if (!parsed.user_language) parsed.user_language = detectedLang;

    // Extra: web search triggers
    const t = userText.toLowerCase();
    if (/(license|permit|registration|requirements|moci|qfc|qatar)/i.test(t)) {
      parsed.use_web_search = true;
    }
    if (/[\u0600-\u06FF]/.test(userText) && /(ترخيص|تصريح|تسجيل|متطلبات|وزارة|قطر)/.test(userText)) {
      parsed.use_web_search = true;
    }

    return parsed;
  } catch (_) {
    return null;
  }
}

/* ─────────────────────────────────────────────────────────────
 * VECTORIZE RAG (OPTIONAL) — truth-gated
 * ───────────────────────────────────────────────────────────── */
async function retrieveInternalExcerpts(env, query, topK = 8) {
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
  const lines = excerpts.slice(0, 8).map((x) => {
    const snippet = (x.text || "").trim().replace(/\s+/g, " ");
    const clipped = snippet.length > 420 ? snippet.slice(0, 420) + "…" : snippet;
    return `- [chunk_id: ${x.chunk_id}] [source: ${x.source}] ${clipped}`;
  });
  return `\n\nINTERNAL EXCERPTS (truth-gated):\n${lines.join("\n")}\n`;
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
      query: query,
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

function safeJsonParse(s) {
  try {
    return JSON.parse(s);
  } catch (_) {
    return null;
  }
}

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
        text: typeof b?.text === "string" ? b.text : JSON.stringify(b?.text ?? ""),
      }))
    : [{ speaker: character, text: typeof parsed === "string" ? parsed : JSON.stringify(parsed) }];

  const decision = String(parsed?.final?.decision || "ACCEPT").toUpperCase();
  out.final.decision = decision === "REJECT" ? "REJECT" : "ACCEPT";

  out.final.next_action = typeof parsed?.final?.next_action === "string" ? parsed.final.next_action : "";

  return out;
}

function hardFallback(character, msg) {
  return {
    mode: "reply",
    selected_character: character,
    bubbles: [{ speaker: character, text: msg }],
    final: {
      decision: "REJECT",
      next_action:
        "Within 48h: re-ask in 1 sentence + include your budget and target segment. Success: you send those 2 details.",
    },
  };
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      // Debug header so you can confirm you are hitting THIS worker
      "X-MoneyAI-Worker": "v7-relaxed-validation",
    },
  });
}

/* ─────────────────────────────────────────────────────────────
 * PERSONAS (voice only)
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

function runRoutingLogic(text) {
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
