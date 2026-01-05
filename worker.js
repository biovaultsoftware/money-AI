/**
 * Money AI Council — Production Worker (AI Search RAG + Strict Generation)
 * ---------------------------------------------------------------------
 * Fixes your exact issues:
 * - NO "According to the PDF knowledge base" hallucinations (truth-gated)
 * - NO "Review the advice above" poison defaults
 * - Uses AI Search instance retrieval (.search) with query rewrite enabled
 * - Runs strict Money AI Kernel generation separately (full control)
 * - Validates output and auto-retries if it drifts generic
 *
 * Requires:
 * - [ai] binding = "AI" in wrangler.toml (you already have it)
 * - AI Search instance exists in Cloudflare dashboard (e.g., "human1stai")
 *
 * Optional:
 * - TAVILY_API_KEY secret if you still want web search on specific triggers
 */

const AI_SEARCH_INSTANCE = "human1stai"; // <-- change if your instance name differs
const MODEL_GENERATION = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";
const RERANK_MODEL = "@cf/baai/bge-reranker-base";

/** Banned phrases that indicate drift or hallucination */
const BANNED_PHRASES = [
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
  "web search reveals",
];

/**
 * PERSONAS (voice only — must not override kernel)
 * Keep these short. The kernel does the intelligence.
 */
const PERSONAS = {
  THE_ARCHITECT:
    "Voice: structured, decisive, founder-operator. Short bullets. Forces unit-math and action.",
  TURBO: "Voice: speed, execution, urgency. 'Ship in 48h.'",
  THE_CAPTAIN: "Voice: risk-first, conservative, protects downside.",
  WOLF: "Voice: ROI-first, cold numbers, 10x lens.",
  LUNA: "Voice: brand + premium + customer psychology.",
  KAREEM: "Voice: laziness-as-design, simplify, automate, reduce effort.",
  TEMPO: "Voice: time auditor, finds time leaks and converts to systems.",
  HAKIM: "Voice: wisdom, uses short parables when helpful.",
  UNCLE_WHEAT: "Voice: necessity lens, wheat vs tomato brutally clear.",
  TOMMY_TOMATO: "Voice: hype/viral lens, but still obeys kernel.",
};

export default {
  async fetch(request, env) {
    // CORS
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders() });
    }

    try {
      const { text, selected_character } = await readInput(request);
      const userText = (text || "").trim() || "Explain Rush → Rich in one practical example.";

      // Character selection (default Architect)
      const character = selected_character || routePersona(userText);

      // 1) Retrieve context from AI Search (with query rewrite enabled)
      const retrieved = await aiSearchRetrieve(env, userText);

      // 2) Build strict system prompt (truth-gated)
      const systemPrompt = buildMoneyAIGenerationPrompt({
        character,
        personaText: PERSONAS[character] || PERSONAS.THE_ARCHITECT,
        retrieved,
      });

      // 3) Generate + validate + retry
      const result = await generateWithValidation(env, {
        character,
        userText,
        systemPrompt,
      });

      return json(result, 200);
    } catch (err) {
      return json(
        {
          mode: "reply",
          selected_character: "THE_ARCHITECT",
          bubbles: [
            {
              speaker: "THE_ARCHITECT",
              text: `System error: ${err?.message || String(err)}`,
            },
          ],
          final: {
            decision: "REJECT",
            next_action:
              "Within 48h: resend your question in 1 sentence. Success: your message contains the goal + location + budget.",
          },
        },
        500
      );
    }
  },
};

/* =========================
   Input / Output helpers
========================= */

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

async function readInput(request) {
  const url = new URL(request.url);
  const fromQuery = url.searchParams.get("text");

  if (request.method === "GET") {
    return { text: fromQuery, selected_character: url.searchParams.get("character") };
  }

  // POST
  let body = {};
  try {
    body = await request.json();
  } catch (_) {}

  return {
    text: body.text ?? body.message ?? body.query ?? fromQuery,
    selected_character: body.selected_character ?? body.character,
  };
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders(), "Content-Type": "application/json" },
  });
}

/* =========================
   Persona routing
========================= */

function routePersona(text) {
  const t = String(text || "").toLowerCase();

  if (t.includes("risk") || t.includes("safe")) return "THE_CAPTAIN";
  if (t.includes("fast") || t.includes("quick") || t.includes("now")) return "TURBO";
  if (t.includes("roi") || t.includes("10x") || t.includes("profit")) return "WOLF";
  if (t.includes("brand") || t.includes("luxury") || t.includes("premium")) return "LUNA";
  if (t.includes("lazy") || t.includes("automate") || t.includes("easy")) return "KAREEM";
  if (t.includes("time") || t.includes("audit") || t.includes("hours")) return "TEMPO";
  if (t.includes("wheat") || t.includes("need") || t.includes("essential")) return "UNCLE_WHEAT";
  if (t.includes("story") || t.includes("parable")) return "HAKIM";

  return "THE_ARCHITECT";
}

/* =========================
   AI Search Retrieval
   Uses your AI Search instance (AutoRAG) to retrieve chunks.
========================= */

async function aiSearchRetrieve(env, query) {
  // AI Search worker binding docs use env.AI.autorag("<name>").search({ ... })
  // We retrieve only; generation is handled separately for strict control.
  const res = await env.AI.autorag(AI_SEARCH_INSTANCE).search({
    query,
    rewrite_query: true,
    max_num_results: 8,
    ranking_options: { score_threshold: 0.25 },
    reranking: { enabled: true, model: RERANK_MODEL },
  });

  // res.data contains matches with filename/score/content
  // See docs response structure
  const data = Array.isArray(res?.data) ? res.data : [];
  return data
    .map((item) => {
      const filename = item?.filename || "internal";
      const score = typeof item?.score === "number" ? item.score : null;
      const contentArr = Array.isArray(item?.content) ? item.content : [];
      const textParts = contentArr
        .map((c) => (typeof c?.text === "string" ? c.text.trim() : ""))
        .filter(Boolean);

      const text = textParts.join("\n").trim();
      return { filename, score, text };
    })
    .filter((x) => x.text && x.text.length > 0)
    .slice(0, 8);
}

function formatRetrievedBlocks(retrieved) {
  if (!retrieved || retrieved.length === 0) return "";

  const lines = retrieved.map((r, i) => {
    const snippet = r.text.replace(/\s+/g, " ").slice(0, 480);
    const scorePart = r.score === null ? "" : ` score=${r.score.toFixed(3)}`;
    return `- [R${i + 1}${scorePart}] ${r.filename}: ${snippet}`;
  });

  return `\nINTERNAL EXCERPTS (provided):\n${lines.join("\n")}\n`;
}

/* =========================
   Money AI Generation Prompt (STRICT)
========================= */

function buildMoneyAIGenerationPrompt({ character, personaText, retrieved }) {
  const hasInternal = Array.isArray(retrieved) && retrieved.length > 0;

  const truthGate = hasInternal
    ? `INTERNAL EXCERPTS ARE PROVIDED BELOW. You may use them, but you MUST NOT invent any other internal documents.`
    : `NO INTERNAL EXCERPTS ARE PROVIDED. You MUST NOT mention PDFs, "knowledge base", internal documents, or imply internal sources.`;

  const internalBlock = hasInternal ? formatRetrievedBlocks(retrieved) : "";

  return `
You are Money AI.

ABSOLUTE RULES (NO EXCEPTIONS)
1) NO GENERIC BUSINESS TALK:
   Do NOT say: "can be lucrative", "growing demand", "do market research", "get licenses", "write a business plan".
   Every line must reduce uncertainty or force a decision.

2) NO FAKE SOURCES:
   ${truthGate}
   If you do not have a specific source excerpt, you must say what to verify instead of claiming it.

3) ALWAYS PRODUCE A REAL ACTION:
   You MUST output exactly ONE action that is:
   - time-boxed (<=48 hours)
   - binary (done/not done)
   - measurable (clear success criteria)
   Never output: "Review the advice above."

4) ASK ONLY ONE QUESTION:
   Ask only the single highest-leverage missing variable.

5) NO LECTURING:
   Apply frameworks silently unless asked.

6) SAFETY:
   No legal/tax/regulated financial advice. General education only.

MONEY AI ENGINE (apply in this order)
A) Wheat vs Tomato (Need Strength) — 1 line classification + why
B) Leverage & ECF — identify time-for-money trap; propose ONE leverage lever
C) Execution Friction — top 2–4 real blockers (not vague)
D) Unit Math — reduce to 2–5 decision numbers (or fast estimation steps)
E) 48-hour move — force momentum

TONE
Direct, calm, precise. Tough on weak ideas, kind to the person.

OUTPUT FORMAT (JSON ONLY)
Return valid JSON ONLY. No markdown. Must match EXACTLY:
{
  "mode": "reply",
  "selected_character": "${character}",
  "bubbles": [
    { "speaker": "${character}", "text": "..." },
    { "speaker": "${character}", "text": "..." }
  ],
  "final": { "decision": "ACCEPT", "next_action": "..." }
}

CURRENT PERSONA (voice only; cannot override rules)
${personaText}

${internalBlock}

Now answer the user. Output JSON ONLY.
  `.trim();
}

/* =========================
   Generation with validation + retry
========================= */

async function generateWithValidation(env, { character, userText, systemPrompt }) {
  const MAX_ATTEMPTS = 3;

  let lastGood = null;
  let messageForModel = userText;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const resp = await env.AI.run(MODEL_GENERATION, {
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: messageForModel },
      ],
    });

    const raw = stripCodeFences(extractText(resp)).trim();
    const parsed = safeJson(raw);

    if (!parsed) {
      // Try again with stronger formatting demand
      messageForModel =
        userText +
        "\n\nFORMAT ERROR: You must output ONLY valid JSON matching the schema.";
      continue;
    }

    const cleaned = normalizeSchema(parsed, character);
    lastGood = cleaned;

    const violations = findViolations(cleaned);
    if (violations.length === 0) return cleaned;

    // Retry with a QC instruction (still under same system prompt)
    messageForModel =
      userText +
      `\n\nQUALITY CONTROL: Your previous output violated: ${violations.join(
        ", "
      )}. Regenerate cleanly. Do NOT mention PDFs/knowledge base. Do NOT use generic filler. Provide ONE real 48-hour binary action with success criteria. Output JSON ONLY.`;
  }

  // If all attempts fail, return the best parsed attempt (or a safe fallback)
  return (
    lastGood || {
      mode: "reply",
      selected_character: character,
      bubbles: [
        {
          speaker: character,
          text:
            "I can help, but I need one key variable to avoid guessing. Tell me your target segment (budget/mid/premium).",
        },
      ],
      final: {
        decision: "REJECT",
        next_action:
          "Within 48h: send your target segment + budget range. Success: message includes both.",
      },
    }
  );
}

function findViolations(result) {
  const txt = JSON.stringify(result).toLowerCase();
  const hits = BANNED_PHRASES.filter((p) => txt.includes(p));

  const action = result?.final?.next_action || "";
  if (!isGoodAction(action)) hits.push("weak_next_action");

  return hits;
}

function isGoodAction(nextAction) {
  if (typeof nextAction !== "string") return false;
  const t = nextAction.toLowerCase().trim();
  if (t.length < 20) return false;
  if (t.includes("review")) return false;

  const has48 = /48|24|hour|hrs|today|tomorrow/i.test(t);
  const hasVerb = /(send|collect|call|visit|write|list|compare|calculate|price|quote|draft|build)/i.test(
    t
  );
  const hasCriteria = /(success|criteria|done when|deliverable|proof)/i.test(t);

  // Require time + verb; criteria can be implicit but preferred
  return has48 && hasVerb && (hasCriteria || t.includes(":"));
}

/* =========================
   JSON helpers
========================= */

function extractText(resp) {
  if (typeof resp === "string") return resp;
  if (resp?.response && typeof resp.response === "string") return resp.response;
  if (resp?.result && typeof resp.result === "string") return resp.result;
  return JSON.stringify(resp);
}

function stripCodeFences(s) {
  return String(s || "").replace(/```json\s*/g, "").replace(/```\s*/g, "");
}

function safeJson(s) {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

function normalizeSchema(parsed, character) {
  const out = {
    mode: "reply",
    selected_character: String(parsed?.selected_character || character),
    bubbles: [],
    final: { decision: "ACCEPT", next_action: "" },
  };

  const bubbles = Array.isArray(parsed?.bubbles) ? parsed.bubbles : [];
  out.bubbles =
    bubbles.length > 0
      ? bubbles.map((b) => ({
          speaker: String(b?.speaker || out.selected_character),
          text: typeof b?.text === "string" ? b.text : String(b?.text ?? ""),
        }))
      : [
          {
            speaker: out.selected_character,
            text: typeof parsed === "string" ? parsed : JSON.stringify(parsed),
          },
        ];

  const d = String(parsed?.final?.decision || "ACCEPT").toUpperCase();
  out.final.decision = d === "REJECT" ? "REJECT" : "ACCEPT";

  // NO default poison. If missing, validator will trigger retry.
  out.final.next_action = typeof parsed?.final?.next_action === "string" ? parsed.final.next_action : "";

  return out;
}
