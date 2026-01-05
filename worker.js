/**
 * MONEY AI COUNCIL — FIXED WORKER (RAG + Query Rewrite + Truth-Gating + Validation)
 * ------------------------------------------------------------------------------
 * Fixes the exact failures you saw:
 * 1) Removes “PDF knowledge base” hallucinations (truth-gated internal excerpts only)
 * 2) Removes “Review the advice above” poison defaults (no fake actions)
 * 3) Adds Query Rewrite → tool gating (web search only when truly needed)
 * 4) Adds optional Vectorize RAG (if binding exists) + safe fallback if not
 * 5) Adds validator + auto-retry when output violates Money AI rules
 *
 * REQUIRED ENV (recommended):
 * - env.AI (Cloudflare Workers AI binding)
 * - env.TAVILY_API_KEY (optional web search)
 * - env.MONEYAI_VECTORIZE (optional Vectorize binding)  <-- set this in wrangler.toml
 *
 * NOTES:
 * - This worker returns JSON compatible with your UI:
 *   { mode, selected_character, bubbles[], final{decision,next_action} }
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
    // Parse input
    // ─────────────────────────────────────────────────────────────
    const url = new URL(request.url);
    let userText = url.searchParams.get("text");

    if (!userText && request.method === "POST") {
      try {
        const body = await request.json();
        userText = body.text || body.message || body.query;
      } catch (_) {}
    }

    if (!userText) userText = "Explain Rush → Rich in one practical example.";

    // ─────────────────────────────────────────────────────────────
    // Route persona (keep your existing logic)
    // ─────────────────────────────────────────────────────────────
    const router = runRoutingLogic(userText);

    try {
      // ─────────────────────────────────────────────────────────────
      // STEP 0: QUERY REWRITE (tool gating + normalized query)
      // ─────────────────────────────────────────────────────────────
      const rewrite = await runQueryRewrite(env, userText);

      // If rewrite fails, fall back safely
      const normalizedQuery = rewrite?.normalized_query || userText;
      const useInternalRag = rewrite?.use_internal_rag ?? true; // Money AI defaults to internal rules
      const useWebSearch = rewrite?.use_web_search ?? false;

      // ─────────────────────────────────────────────────────────────
      // STEP 1: INTERNAL RAG (Vectorize) — optional but strongly recommended
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
      // STEP 3: BUILD ONE SYSTEM PROMPT (NO SECOND SYSTEM PROMPT)
      // ─────────────────────────────────────────────────────────────
      const systemPrompt = buildMoneyAIGenerationSystemPrompt({
        personaKey: router.character,
        personaText: PERSONAS[router.character],
        internalExcerptsBlock,
        webContextBlock,
      });

      // ─────────────────────────────────────────────────────────────
      // STEP 4: CALL MODEL + VALIDATE + AUTO-RETRY
      // ─────────────────────────────────────────────────────────────
      const result = await generateWithValidation(env, {
        model: MODEL_GENERATION,
        systemPrompt,
        userMessage: userText,
        personaKey: router.character,
      });

      return jsonResponse(result, 200);
    } catch (e) {
      return jsonResponse(
        {
          mode: "reply",
          selected_character: router.character,
          bubbles: [{ speaker: router.character, text: "System error: " + (e?.message || String(e)) }],
          final: { decision: "REJECT", next_action: "Try again with a shorter question." },
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
 * QUERY REWRITE PROMPT
 * ───────────────────────────────────────────────────────────── */
const QUERY_REWRITE_PROMPT = `
You are Money AI — Query Rewrite Engine.

Your role is NOT to answer the user.
Your role is to produce the BEST possible input for Money AI generation:
- detect intent
- normalize the query
- decide whether internal RAG and/or web search are required
- extract known variables + missing variables

TOOL POLICY:
- use_internal_rag = true for anything involving business decisions, ideas, execution, Rush→Rich, Wheat/Tomato, SHE, ECF, motivators.
- use_web_search = true ONLY if fresh external facts are needed (licenses, permits, regulations, prices, addresses, current rules, “today/latest”, official requirements).

OUTPUT JSON ONLY. No prose.

Schema:
{
  "intent_type": "business_decision|career_decision|idea_validation|time_management|mindset_block|factual_lookup|comparison|other",
  "normalized_query": "<short decision-focused query>",
  "use_internal_rag": true|false,
  "use_web_search": true|false,
  "known_variables": { "<key>": "<value>" },
  "missing_variables": [ "<string>" ]
}
`.trim();

/* ─────────────────────────────────────────────────────────────
 * GENERATION SYSTEM PROMPT (Money AI Kernel) — SINGLE SYSTEM PROMPT
 * ───────────────────────────────────────────────────────────── */
function buildMoneyAIGenerationSystemPrompt({
  personaKey,
  personaText,
  internalExcerptsBlock,
  webContextBlock,
}) {
  // Truth gate: if no internal excerpts, the model must not reference “PDF/knowledge base”
  const truthGate = internalExcerptsBlock
    ? `INTERNAL EXCERPTS ARE PROVIDED BELOW. You may use them and may cite them ONLY by the provided chunk ids.`
    : `NO INTERNAL EXCERPTS ARE PROVIDED. You MUST NOT mention PDFs, "knowledge base", internal documents, or imply internal sources. If a detail requires internal or official confirmation, say what to verify.`;

  // Web gate: if web context absent, must not imply it searched
  const webGate = webContextBlock
    ? `WEB SEARCH RESULTS ARE PROVIDED BELOW. You may use them.`
    : `NO WEB SEARCH RESULTS ARE PROVIDED. You MUST NOT claim you searched the web or reference "web search reveals" style statements.`;

  return `
You are Money AI.

ROLE
You are a business + mindset execution engine. You move users from RUSH thinking (reactive, low-leverage) to RICH thinking (calm, systems, compounding).
Your job is to convert the user’s message into:
(1) a clear diagnosis, (2) a decision framework applied to THIS case, (3) ONE measurable next action.

ABSOLUTE RULES (NO EXCEPTIONS)
1) NO GENERIC FILLER:
   Never write vague phrases like “can be lucrative”, “growing demand”, “do market research”, “get necessary licenses”, “create a comprehensive business plan”
   unless you provide specific decision variables and a concrete plan the user can execute in ≤48 hours.

2) NO FAKE SOURCES (TRUTH RULE):
   ${truthGate}
   If you do reference any internal source, you must quote or paraphrase it and include the chunk id in-line.

3) NO TOOL HALLUCINATION:
   ${webGate}

4) ALWAYS PRODUCE A REAL ACTION:
   Every response MUST include exactly ONE action that is:
   - time-boxed (≤ 48 hours)
   - binary (done / not done)
   - measurable (clear success criteria)
   Never output “Review the advice above.”

5) ASK ONLY ONE QUESTION:
   Ask ONLY the single highest-leverage missing variable.

6) SAFETY:
   No legal/tax/regulated financial advice. Give general educational guidance + suggest consulting the right professional when needed.
   No guarantees.

MONEY AI ENGINE (apply silently, don’t lecture)
Use this order for business/career/idea questions:
A) Wheat vs Tomato (Need Strength) — 1 line classification + why
B) Leverage & ECF (value per hour) — identify time-for-money trap; propose ONE leverage lever
C) Execution Friction — list top 2–4 real blockers (not vague)
D) Unit Math — reduce to 2–5 decision numbers; if unknown, show fast estimation method
E) 48-hour move — force momentum

MOTIVATOR FIT
Infer primary motivator (laziness/speed/ambition/satisfaction/security) and shape the action to be followable.

TONE
Direct, calm, precise. Tough on weak ideas, respectful to the person. No speeches.

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
IMPORTANT: Persona is voice only. Persona must NEVER override the rules above.

${internalExcerptsBlock || ""}

${webContextBlock || ""}

Now answer the user message. Output JSON ONLY.
`.trim();
}

/* ─────────────────────────────────────────────────────────────
 * GENERATION WITH VALIDATION + AUTO-RETRY
 * ───────────────────────────────────────────────────────────── */
async function generateWithValidation(env, { model, systemPrompt, userMessage, personaKey }) {
  const MAX_ATTEMPTS = 3;

  let lastRaw = "";
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const response = await env.AI.run(model, {
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage },
      ],
    });

    let rawText = extractText(response);
    rawText = stripCodeFences(rawText).trim();
    lastRaw = rawText;

    // Try parse JSON
    const parsed = safeJsonParse(rawText);
    if (!parsed) {
      // Hard retry: force JSON
      if (attempt < MAX_ATTEMPTS) continue;
      return hardFallback(personaKey, "I couldn’t format JSON. Re-ask in one sentence.");
    }

    const cleaned = cleanResponseStrict(parsed, personaKey);

    // Validate Money AI rules (block the exact junk you saw)
    const violations = detectViolations(cleaned);
    if (violations.length === 0) return cleaned;

    // Retry with a stricter nudge baked into the user message (no extra system prompts)
    if (attempt < MAX_ATTEMPTS) {
      userMessage =
        userMessage +
        `\n\n(QUALITY CONTROL: Your previous output violated rules: ${violations.join(
          ", "
        )}. Regenerate VALID JSON. Do NOT mention PDFs/knowledge base unless internal excerpts exist. Provide ONE real 48-hour binary action with success criteria. Do NOT use generic phrases.)`;
      continue;
    }

    // If still violating after retries, return best-effort but safe
    return hardFallback(
      personaKey,
      "Regenerate: provide 1 concrete 48-hour action with success criteria and do not reference PDFs/knowledge base."
    );
  }

  // Should never hit
  return hardFallback(personaKey, "Try again.");
}

function detectViolations(resultJson) {
  const text = JSON.stringify(resultJson).toLowerCase();

  const badPhrases = [
    "according to the pdf",
    "pdf knowledge base",
    "knowledge base",
    "review the advice above",
    "can be lucrative",
    "growing demand",
    "do market research",
    "market analysis",
    "comprehensive business plan",
    "you'll need to obtain the necessary licenses",
  ];

  const violations = [];
  for (const p of badPhrases) {
    if (text.includes(p)) violations.push(p);
  }

  // Also require next_action quality
  const next = resultJson?.final?.next_action || "";
  if (!isGoodAction(next)) violations.push("weak_next_action");

  return violations;
}

function isGoodAction(nextAction) {
  if (typeof nextAction !== "string") return false;
  const t = nextAction.toLowerCase().trim();
  if (t.length < 18) return false;
  if (t.includes("review")) return false;
  // heuristic: must contain either a time box or success criteria hint
  const hasTime = /(\b24\b|\b48\b|hour|hrs|today|tomorrow)/i.test(t);
  const hasMeasure = /(send|collect|write|call|visit|price|quote|calculate|list|compare|draft|build)/i.test(t);
  return hasTime && hasMeasure;
}

/* ─────────────────────────────────────────────────────────────
 * QUERY REWRITE CALL
 * ───────────────────────────────────────────────────────────── */
async function runQueryRewrite(env, userText) {
  try {
    const resp = await env.AI.run(MODEL_REWRITE, {
      messages: [
        { role: "system", content: QUERY_REWRITE_PROMPT },
        { role: "user", content: userText },
      ],
    });
    const raw = stripCodeFences(extractText(resp)).trim();
    const parsed = safeJsonParse(raw);
    if (!parsed || typeof parsed !== "object") return null;

    // Normalize booleans
    parsed.use_internal_rag = !!parsed.use_internal_rag;
    parsed.use_web_search = !!parsed.use_web_search;

    // Extra: web search if user explicitly asks “requirements/license/permit”
    const t = userText.toLowerCase();
    if (/(license|permit|registration|requirements|moci|qfc|qatar)/i.test(t)) {
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
  // Expect a Vectorize binding in wrangler.toml:
  // [vars] / [[vectorize]] binding = "MONEYAI_VECTORIZE"
  const idx = env.MONEYAI_VECTORIZE;
  if (!idx || typeof idx.query !== "function") return [];

  try {
    // Vectorize API typically supports: idx.query(query, { topK, returnMetadata: true })
    const res = await idx.query(query, { topK, returnMetadata: true });

    const matches = res?.matches || res?.results || [];
    return matches
      .slice(0, topK)
      .map((m, i) => ({
        chunk_id: String(m.id ?? m.chunk_id ?? `chunk_${i + 1}`),
        score: typeof m.score === "number" ? m.score : null,
        text:
          m.metadata?.text ||
          m.metadata?.content ||
          m.text ||
          m.document ||
          "",
        source:
          m.metadata?.source ||
          m.metadata?.doc ||
          m.metadata?.title ||
          "internal",
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
  // Enforce schema, never inject fake defaults like “Review the advice above.”
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

  // Do NOT invent a next_action; if missing, force validator to retry.
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
      next_action: "Within 48h: re-ask in 1 sentence + include your budget and target segment. Success: you send those 2 details.",
    },
  };
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
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

  // Council debate trigger
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

  return { character: "THE_ARCHITECT", killSwitchTriggered: false };
}
