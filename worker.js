/**
 * MONEY AI COUNCIL — ENHANCED WORKER v6 (Behavior-Locked + Output Contract + Hard Enforcement)
 * ------------------------------------------------------------------------------------------
 * Goal: Make outputs match "Money AI" (Rush→Rich OS), not generic chatbot.
 *
 * What this v6 adds on top of your v5:
 * 1) MONEY AI OUTPUT CONTRACT (machine-enforced): response must include these tags:
 *    - DIAGNOSIS:
 *    - WHEAT_TOMATO:
 *    - LEVERAGE_ECF:
 *    - FRICTION:
 *    - UNIT_MATH:
 *    - 48H_MISSION:
 *    - ONE_QUESTION:
 *
 * 2) Strong anti-generic enforcement:
 *    - hard banned phrases
 *    - rejects onboarding/consultant fluff
 *    - rejects multiple questions
 *    - rejects missing unit math / missing 48h mission
 *
 * 3) Council Debate mode (if user asks for debate/council):
 *    - orchestrates 3–5 personas debate quickly
 *
 * 4) "Greeting / vague" handler that still outputs Money AI contract
 *    - no therapist onboarding
 *    - gives a real 48h mission and ONE question
 *
 * 5) QC retry stays SYSTEM-only (never pollutes user message)
 *
 * ENV:
 * - env.AI (Workers AI binding)
 * - env.TAVILY_API_KEY (optional web search)
 * - env.MONEYAI_VECTORIZE (optional Vectorize binding)  // optional; you can set use_internal_rag=false via rewrite
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
    const { text } = await readInput(request);
    const userTextRaw = (text || "").trim() || "Explain Rush → Rich in one practical example.";

    // Quick greeting/vague detection (keeps Money AI contract)
    const isGreeting = isGreetingOnly(userTextRaw);

    // Persona routing
    const router = runRoutingLogic(userTextRaw);

    try {
      // ─────────────────────────────────────────────────────────────
      // STEP 0: QUERY REWRITE (intent/tool gating)
      // ─────────────────────────────────────────────────────────────
      const rewrite = await runQueryRewrite(env, userTextRaw);

      const normalizedQuery = rewrite?.normalized_query || userTextRaw;
      const useInternalRag = rewrite?.use_internal_rag ?? true;
      const useWebSearch = rewrite?.use_web_search ?? false;

      // ─────────────────────────────────────────────────────────────
      // STEP 1: INTERNAL RAG (Vectorize optional)
      // ─────────────────────────────────────────────────────────────
      let internalExcerptsBlock = "";
      if (useInternalRag) {
        const internalExcerpts = await retrieveInternalExcerpts(env, normalizedQuery, 8);
        internalExcerptsBlock = formatInternalExcerpts(internalExcerpts);
      }

      // ─────────────────────────────────────────────────────────────
      // STEP 2: WEB SEARCH (optional, tool-gated)
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
      // STEP 3: Build generation system prompt (behavior-locked)
      // ─────────────────────────────────────────────────────────────
      const systemPrompt = buildMoneyAIGenerationSystemPrompt({
        personaKey: router.character,
        personaText: PERSONAS[router.character],
        internalExcerptsBlock,
        webContextBlock,
        killSwitchTriggered: router.killSwitchTriggered,
      });

      // If user is greeting-only, force a controlled Money AI kickoff
      const userMessage = isGreeting
        ? buildGreetingKickoffUserMessage(userTextRaw)
        : userTextRaw;

      // ─────────────────────────────────────────────────────────────
      // STEP 4: Generate + validate + retry (SYSTEM-only QC)
      // ─────────────────────────────────────────────────────────────
      const result = await generateWithValidation(env, {
        model: MODEL_GENERATION,
        systemPrompt,
        userMessage,
        personaKey: router.character,
        killSwitchTriggered: router.killSwitchTriggered,
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
              text: "System error: " + (e?.message || String(e)),
            },
          ],
          final: {
            decision: "REJECT",
            next_action:
              "Within 48 hours: resend your question in one sentence and include (goal + city + budget). Success: message contains all 3.",
          },
        },
        500
      );
    }
  },
};

/* ─────────────────────────────────────────────────────────────
 * Models
 * ───────────────────────────────────────────────────────────── */
const MODEL_REWRITE = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";
const MODEL_GENERATION = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";

/* ─────────────────────────────────────────────────────────────
 * CORS / IO helpers
 * ───────────────────────────────────────────────────────────── */
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

  if (request.method === "GET") return { text: fromQuery };

  // POST
  let body = {};
  try {
    body = await request.json();
  } catch (_) {}

  return {
    text: body.text ?? body.message ?? body.query ?? fromQuery,
  };
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...corsHeaders(),
      "Content-Type": "application/json",
      "X-MoneyAI-Worker": "v6-behavior-locked",
    },
  });
}

/* ─────────────────────────────────────────────────────────────
 * Greeting / vague detection
 * ───────────────────────────────────────────────────────────── */
function isGreetingOnly(text) {
  const t = String(text || "").trim().toLowerCase();
  if (!t) return true;

  // Arabic and English common greetings; keep conservative.
  const greetings = [
    "hi",
    "hello",
    "hey",
    "sup",
    "yo",
    "good morning",
    "good evening",
    "مرحبا",
    "هلا",
    "السلام عليكم",
    "سلام",
    "أهلا",
    "اهلا",
  ];

  // If very short or matches greeting
  if (t.length <= 5) return true;
  return greetings.some((g) => t === g || t.startsWith(g + " "));
}

function buildGreetingKickoffUserMessage(original) {
  return (
    original +
    "\n\nYou must still respond as Money AI using the required tags. Ask ONE question only."
  );
}

/* ─────────────────────────────────────────────────────────────
 * Query rewrite (attention control)
 * ───────────────────────────────────────────────────────────── */
const QUERY_REWRITE_PROMPT = `
You are Money AI — Query Rewrite Engine.

You do NOT answer the user.
You output JSON for retrieval/tool gating only.

Rules:
- Keep normalized_query short and decision-focused.
- use_internal_rag = true for strategy/mindset/business planning.
- use_web_search = true ONLY when the user needs current factual data (regulations, prices, latest rules, addresses, up-to-date facts).

Output JSON only:

{
  "intent_type": "business_decision|career_decision|idea_validation|time_management|mindset_block|factual_lookup|comparison|other",
  "normalized_query": "string",
  "use_internal_rag": true|false,
  "use_web_search": true|false,
  "known_variables": { "k":"v" },
  "missing_variables": ["string"]
}
`.trim();

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

    parsed.use_internal_rag = !!parsed.use_internal_rag;
    parsed.use_web_search = !!parsed.use_web_search;

    // Heuristic: business setup questions rarely need web unless explicitly asking for "requirements/costs/fees"
    const t = userText.toLowerCase();
    if (/(requirements|license|permit|fees|cost|price|moci|qfc|qatar|today|latest|current)/i.test(t)) {
      parsed.use_web_search = true;
    }

    return parsed;
  } catch (_) {
    return null;
  }
}

/* ─────────────────────────────────────────────────────────────
 * Behavior-locked generation prompt (Constitution)
 * ───────────────────────────────────────────────────────────── */
function buildMoneyAIGenerationSystemPrompt({
  personaKey,
  personaText,
  internalExcerptsBlock,
  webContextBlock,
  killSwitchTriggered,
}) {
  const truthGate = internalExcerptsBlock
    ? `INTERNAL EXCERPTS ARE PROVIDED BELOW. You may use them, but MUST NOT invent any internal documents. If you reference excerpts, include chunk_id inline.`
    : `NO INTERNAL EXCERPTS ARE PROVIDED. You MUST NOT mention PDFs/knowledge base/internal docs. If unsure, state what to verify.`;

  const webGate = webContextBlock
    ? `WEB SEARCH RESULTS ARE PROVIDED BELOW. You may use them.`
    : `NO WEB SEARCH RESULTS ARE PROVIDED. You MUST NOT claim you searched the web or say "web search reveals".`;

  // Few-shot anchors (small but high-impact). Keep concise to avoid token bloat.
  const fewShot = `
FEW-SHOT STYLE ANCHORS (do NOT mention these; imitate the pattern):

Example 1:
User: "I want to open a barbershop"
Assistant:
DIAGNOSIS: You're asking for a business, but you're about to default to generic steps. We need a wedge + unit math.
WHEAT_TOMATO: Wheat (recurring grooming need), but crowded.
LEVERAGE_ECF: Win via system (membership + retention) not one-off haircuts.
FRICTION: Location rent, staff reliability, differentiation, repeat rate.
UNIT_MATH: tickets/day × avg ticket × margin - rent - payroll. Break-even = fixed costs / gross profit per ticket.
48H_MISSION: In 48h collect prices of 10 competitors + 3 rent quotes + draft 1 membership offer. Success: spreadsheet with all 3 + one chosen lane.
ONE_QUESTION: Which segment do you want: budget, mid, or premium?

Example 2:
User: "I have too many ideas"
Assistant:
DIAGNOSIS: Rush mode: random ideas without a filter.
WHEAT_TOMATO: Most are tomatoes until proven wheat.
LEVERAGE_ECF: Pick 1 system that saves time for many people.
FRICTION: Focus, execution, distraction loops.
UNIT_MATH: Time/week available + revenue target + required leverage.
48H_MISSION: In 48h write 10 ideas → score wheat/tomato + leverage → pick top 1. Success: one chosen project + first 3 tasks.
ONE_QUESTION: What is your income target per month?

END OF EXAMPLES
`.trim();

  const councilMode = killSwitchTriggered
    ? `
COUNCIL DEBATE MODE:
- Output mode must be "council_debate".
- Use 3–5 characters: THE_ARCHITECT + 2–4 relevant personas (WOLF, THE_CAPTAIN, TURBO, KAREEM, LUNA, TEMPO, UNCLE_WHEAT, TOMMY_TOMATO, HAKIM).
- Each bubble is short (1–3 lines).
- After debate, THE_ARCHITECT produces the final contract tags and ONE 48H_MISSION + ONE_QUESTION.
`
    : "";

  return `
You are Money AI.

ROLE:
You are NOT a chatbot. You are a behavioral operating system for money decisions.
Your purpose: move the user from RUSH thinking to RICH thinking with leverage, systems, and decisive action.

ABSOLUTE RULES (NO EXCEPTIONS):
1) MONEY AI OUTPUT CONTRACT (MANDATORY TAGS):
   You MUST include these tags exactly once each, in this order, inside the final answer text:
   DIAGNOSIS:
   WHEAT_TOMATO:
   LEVERAGE_ECF:
   FRICTION:
   UNIT_MATH:
   48H_MISSION:
   ONE_QUESTION:

   If the user is vague or just greeting, you STILL must output all tags.
   You may make reasonable assumptions.

2) NO GENERIC CONSULTANT TALK:
   Ban phrases like:
   "can be lucrative", "growing demand", "do market research", "business plan", "get necessary licenses"
   unless you provide concrete numbers, steps, and a 48-hour mission.
   Do NOT write filler.

3) NO ONBOARDING / NO THERAPIST MODE:
   Never start with "To better assist you..." or ask broad onboarding questions.
   Ask ONLY ONE question total, and it must appear ONLY under ONE_QUESTION.

4) SOURCE TRUTH:
   ${truthGate}
   ${webGate}

5) ACTION MUST BE REAL:
   48H_MISSION must be <=48 hours, binary, measurable, and include success criteria.
   Never output: "Review the advice above."

6) SAFETY:
   No legal/tax/regulated financial advice. Provide general guidance only.

TONE:
Direct, calm, precise. Tough on weak ideas, respectful to the person.

PERSONA (voice only; cannot override rules):
Persona key: ${personaKey}
Persona voice: ${personaText}

${councilMode}

${fewShot}

${internalExcerptsBlock || ""}

${webContextBlock || ""}

MANDATORY OUTPUT FORMAT (JSON ONLY):
Return valid JSON ONLY. No markdown. Must match:
{
  "mode": "reply" | "council_debate",
  "selected_character": "NAME",
  "bubbles": [ { "speaker": "NAME", "text": "Plain text advice" } ],
  "final": { "decision": "ACCEPT" | "REJECT", "next_action": "Binary 48-hour mission + success criteria" }
}

Now answer the user message. Output JSON ONLY.
`.trim();
}

/* ─────────────────────────────────────────────────────────────
 * Generation + validation + retry (QC stays SYSTEM-only)
 * ───────────────────────────────────────────────────────────── */
async function generateWithValidation(env, { model, systemPrompt, userMessage, personaKey, killSwitchTriggered }) {
  const MAX_ATTEMPTS = 5; // increased to enforce contract
  const originalUserMessage = userMessage;

  let lastCleaned = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const qcAddon =
      attempt === 1
        ? ""
        : `
QC REGENERATION REQUIRED:
- Your last output violated the Money AI Output Contract or included banned fluff.
- Fix ALL violations.
- Keep ONLY ONE question under ONE_QUESTION.
- Ensure UNIT_MATH contains at least 2 decision numbers or a simple formula.
- Ensure 48H_MISSION includes success criteria.
- Output JSON ONLY.
`.trim();

    const violationHint = lastCleaned ? `\nVIOLATIONS: ${detectViolations(lastCleaned).join(", ")}\n` : "";

    const response = await env.AI.run(model, {
      messages: [
        { role: "system", content: systemPrompt + "\n\n" + qcAddon + "\n" + violationHint },
        { role: "user", content: originalUserMessage },
      ],
    });

    const rawText = stripCodeFences(extractText(response)).trim();
    const parsed = safeJsonParse(rawText);

    if (!parsed) {
      if (attempt < MAX_ATTEMPTS) continue;
      return hardFallback(personaKey, "JSON formatting failed. Ask again in one sentence.");
    }

    const cleaned = cleanResponseStrict(parsed, personaKey, killSwitchTriggered);
    lastCleaned = cleaned;

    const violations = detectViolations(cleaned);
    if (violations.length === 0) {
      // Ensure final.next_action mirrors 48H_MISSION (contract enforcement)
      cleaned.final.next_action = deriveNextActionFromBubbles(cleaned) || cleaned.final.next_action;
      // If still weak, re-run one last internal check
      if (!isGoodAction(cleaned.final.next_action)) {
        // force a safe synthesized action from contract text
        cleaned.final.next_action =
          synthesizeFallbackActionFromContract(cleaned) ||
          "Within 48 hours: collect 10 competitor prices + choose 1 lane + write a 1-page offer. Success: doc + one decision.";
      }
      return cleaned;
    }
  }

  return hardFallback(
    personaKey,
    "Resend your question in one sentence and include: goal + budget + timeline. I’ll reply with a 48-hour mission."
  );
}

/* ─────────────────────────────────────────────────────────────
 * Strict cleaning / schema enforcement
 * ───────────────────────────────────────────────────────────── */
function cleanResponseStrict(parsed, character, killSwitchTriggered) {
  const out = {
    mode: parsed?.mode === "council_debate" ? "council_debate" : "reply",
    selected_character: String(parsed?.selected_character || character),
    bubbles: [],
    final: { decision: "ACCEPT", next_action: "" },
  };

  // If kill switch triggered, force council mode
  if (killSwitchTriggered) out.mode = "council_debate";

  const bubbles = Array.isArray(parsed?.bubbles) ? parsed.bubbles : [];
  out.bubbles = bubbles.length
    ? bubbles.map((b) => ({
        speaker: String(b?.speaker || out.selected_character),
        text: typeof b?.text === "string" ? b.text : String(b?.text ?? ""),
      }))
    : [{ speaker: out.selected_character, text: typeof parsed === "string" ? parsed : JSON.stringify(parsed) }];

  const decision = String(parsed?.final?.decision || "ACCEPT").toUpperCase();
  out.final.decision = decision === "REJECT" ? "REJECT" : "ACCEPT";
  out.final.next_action = typeof parsed?.final?.next_action === "string" ? parsed.final.next_action : "";

  return out;
}

/* ─────────────────────────────────────────────────────────────
 * Contract validation
 * ───────────────────────────────────────────────────────────── */
const REQUIRED_TAGS = [
  "DIAGNOSIS:",
  "WHEAT_TOMATO:",
  "LEVERAGE_ECF:",
  "FRICTION:",
  "UNIT_MATH:",
  "48H_MISSION:",
  "ONE_QUESTION:",
];

const BANNED_PHRASES = [
  // hallucination / drift
  "according to the pdf",
  "pdf knowledge base",
  "knowledge base",
  "review the advice above",
  "web search reveals",
  // generic filler / consultant
  "can be lucrative",
  "growing demand",
  "do market research",
  "market analysis",
  "comprehensive business plan",
  "create a business plan",
  "you'll need to obtain the necessary licenses",
  "obtain the necessary licenses",
  // onboarding fluff
  "to better assist you",
  "i need more information",
  "provide more information",
  "tell me more about your situation",
];

function detectViolations(resultJson) {
  const combinedText = flattenBubblesText(resultJson).toLowerCase();

  const violations = [];

  // tags
  for (const tag of REQUIRED_TAGS) {
    if (!combinedText.includes(tag.toLowerCase())) violations.push(`missing_tag:${tag}`);
  }

  // banned phrases
  for (const p of BANNED_PHRASES) {
    if (combinedText.includes(p)) violations.push(`banned_phrase:${p}`);
  }

  // Only ONE question
  const questionCount = countQuestions(flattenBubblesText(resultJson));
  if (questionCount > 1) violations.push(`too_many_questions:${questionCount}`);

  // UNIT_MATH must have some numbers or a formula indicator
  const unitMath = extractTagSection(flattenBubblesText(resultJson), "UNIT_MATH:");
  if (!looksLikeUnitMath(unitMath)) violations.push("weak_unit_math");

  // 48H action quality
  const mission = extractTagSection(flattenBubblesText(resultJson), "48H_MISSION:");
  if (!isGoodAction(mission)) violations.push("weak_48h_mission");

  // next_action must exist or we synthesize it later; still warn
  if (!resultJson?.final?.next_action || String(resultJson.final.next_action).trim().length < 8) {
    violations.push("missing_final_next_action");
  } else if (!isGoodAction(resultJson.final.next_action)) {
    violations.push("weak_final_next_action");
  }

  // ONE_QUESTION must contain a question mark OR end with a question in words
  const oneQ = extractTagSection(flattenBubblesText(resultJson), "ONE_QUESTION:");
  if (!looksLikeSingleQuestion(oneQ)) violations.push("weak_one_question");

  return violations;
}

function flattenBubblesText(resultJson) {
  const bubbles = Array.isArray(resultJson?.bubbles) ? resultJson.bubbles : [];
  return bubbles.map((b) => (b?.text ? String(b.text) : "")).join("\n\n");
}

function countQuestions(text) {
  const s = String(text || "");
  const qm = (s.match(/\?/g) || []).length;
  // Arabic question mark "؟"
  const aqm = (s.match(/؟/g) || []).length;
  return qm + aqm;
}

function extractTagSection(fullText, tag) {
  const t = String(fullText || "");
  const idx = t.indexOf(tag);
  if (idx === -1) return "";
  const after = t.slice(idx + tag.length);
  // end at next tag
  const nextIdxs = REQUIRED_TAGS
    .filter((x) => x !== tag)
    .map((x) => after.indexOf(x))
    .filter((i) => i >= 0);
  const end = nextIdxs.length ? Math.min(...nextIdxs) : after.length;
  return after.slice(0, end).trim();
}

function looksLikeUnitMath(section) {
  const s = String(section || "").trim();
  if (s.length < 10) return false;

  // Must contain at least 2 numbers OR a simple formula operator
  const numbers = s.match(/\d+/g) || [];
  const hasOps = /[=×x\*\/\+\-]/.test(s);
  return numbers.length >= 2 || (numbers.length >= 1 && hasOps);
}

function looksLikeSingleQuestion(section) {
  const s = String(section || "").trim();
  if (s.length < 3) return false;
  const qCount = countQuestions(s);
  if (qCount === 1) return true;
  // Allow no question mark but looks like a direct question
  return /^(which|what|who|where|when|why|how|هل|شو|اي|وين|متى|ليش|كيف)\b/i.test(s);
}

function isGoodAction(text) {
  const t = String(text || "").trim().toLowerCase();
  if (t.length < 18) return false;
  if (t.includes("review")) return false;

  const hasTime = /(48|24|hour|hrs|within|today|tomorrow|خلال|ساعة|اليوم|بكرا)/i.test(t);
  const hasVerb =
    /(collect|call|visit|write|list|compare|calculate|draft|build|ship|launch|send|create|price|quote|audit|score|choose|decide|talk|email|meet|اكتب|اجمع|اتصل|زر|قارن|احسب|ارسل|اختار|قرر)/i.test(
      t
    );
  const hasCriteria = /(success|done when|criteria|deliverable|proof|نتيجة|مخرجات|نجاح|تم)/i.test(t);

  return hasTime && hasVerb && (hasCriteria || t.includes(":"));
}

function deriveNextActionFromBubbles(resultJson) {
  const full = flattenBubblesText(resultJson);
  const mission = extractTagSection(full, "48H_MISSION:");
  if (isGoodAction(mission)) return mission;
  return "";
}

function synthesizeFallbackActionFromContract(resultJson) {
  const full = flattenBubblesText(resultJson);
  const mission = extractTagSection(full, "48H_MISSION:");
  if (mission && mission.length > 10) {
    // make it time-boxed if missing
    if (!/(48|24|hour|خلال|ساعة)/i.test(mission)) {
      return `Within 48 hours: ${mission} Success: you deliver proof (notes/doc/spreadsheet).`;
    }
    if (!/(success|done when|criteria|proof|نتيجة|مخرجات|نجاح|تم)/i.test(mission)) {
      return `${mission} Success: you deliver proof (notes/doc/spreadsheet).`;
    }
    return mission;
  }
  return "";
}

/* ─────────────────────────────────────────────────────────────
 * Vectorize RAG (optional)
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
  return `\n\nINTERNAL EXCERPTS:\n${lines.join("\n")}\n`;
}

/* ─────────────────────────────────────────────────────────────
 * Web search (Tavily optional)
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
 * Response extraction helpers
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

/* ─────────────────────────────────────────────────────────────
 * Hard fallback (still respects contract tags)
 * ───────────────────────────────────────────────────────────── */
function hardFallback(character, msg) {
  const fallbackText = [
    `DIAGNOSIS: ${msg}`,
    `WHEAT_TOMATO: Unknown until you pick a goal.`,
    `LEVERAGE_ECF: Stop trying to solve everything. Pick one lever that compounds.`,
    `FRICTION: Missing goal + budget + timeline.`,
    `UNIT_MATH: (time/week) + (income target) + (one lever) = plan.`,
    `48H_MISSION: Within 48 hours: write your goal + budget + timeline on one note and send it. Success: message contains all 3.`,
    `ONE_QUESTION: What is your goal for the next 90 days?`,
  ].join("\n");

  return {
    mode: "reply",
    selected_character: character,
    bubbles: [{ speaker: character, text: fallbackText }],
    final: {
      decision: "REJECT",
      next_action: "Within 48 hours: send (goal + budget + timeline). Success: message contains all 3.",
    },
  };
}

/* ─────────────────────────────────────────────────────────────
 * Personas (voice only)
 * ───────────────────────────────────────────────────────────── */
const PERSONAS = {
  KAREEM: `[KAREEM] Laziness/Efficiency. "If it requires effort, it's broken." Finds shortcuts.`,
  TURBO: `[TURBO] Speed/Execution. "Ship fast." Action-oriented.`,
  WOLF: `[WOLF] ROI. Cold unit math. Demands leverage.`,
  LUNA: `[LUNA] Premium & brand psychology. People pay for feeling.`,
  THE_CAPTAIN: `[THE_CAPTAIN] Risk & safety. Protects downside.`,
  TEMPO: `[TEMPO] Time auditor. Finds leaks and converts to systems.`,
  HAKIM: `[HAKIM] Wisdom. Short parables if useful.`,
  UNCLE_WHEAT: `[UNCLE_WHEAT] Necessity lens. Wheat vs Tomato clarity.`,
  TOMMY_TOMATO: `[TOMMY_TOMATO] Hype/viral lens but must obey contract.`,
  THE_ARCHITECT: `[THE_ARCHITECT] Systems builder. Structured, decisive, compounding systems.`,
};

/* ─────────────────────────────────────────────────────────────
 * Persona routing + council trigger
 * ───────────────────────────────────────────────────────────── */
function runRoutingLogic(text) {
  const t = String(text || "").toLowerCase();

  // Council trigger
  if (t.includes("council") || t.includes("debate") || t.includes("مناظرة") || t.includes("مجلس")) {
    return { character: "THE_ARCHITECT", killSwitchTriggered: true };
  }

  if (t.includes("risk") || t.includes("safe") || t.includes("مخاطر") || t.includes("آمن")) return { character: "THE_CAPTAIN", killSwitchTriggered: false };
  if (t.includes("fast") || t.includes("quick") || t.includes("now") || t.includes("سريع") || t.includes("الآن")) return { character: "TURBO", killSwitchTriggered: false };
  if (t.includes("lazy") || t.includes("automate") || t.includes("easy") || t.includes("كسل") || t.includes("سهل")) return { character: "KAREEM", killSwitchTriggered: false };
  if (t.includes("brand") || t.includes("premium") || t.includes("luxury") || t.includes("براند") || t.includes("فاخر")) return { character: "LUNA", killSwitchTriggered: false };
  if (t.includes("hype") || t.includes("viral") || t.includes("ترند") || t.includes("فايرل")) return { character: "TOMMY_TOMATO", killSwitchTriggered: false };
  if (t.includes("scale") || t.includes("10x") || t.includes("roi") || t.includes("عائد") || t.includes("ربح")) return { character: "WOLF", killSwitchTriggered: false };
  if (t.includes("time") || t.includes("hour") || t.includes("audit") || t.includes("وقت") || t.includes("ساعة")) return { character: "TEMPO", killSwitchTriggered: false };
  if (t.includes("need") || t.includes("wheat") || t.includes("essential") || t.includes("ضرورة") || t.includes("احتياج")) return { character: "UNCLE_WHEAT", killSwitchTriggered: false };
  if (t.includes("story") || t.includes("wisdom") || t.includes("قصة") || t.includes("حكمة")) return { character: "HAKIM", killSwitchTriggered: false };

  return { character: "THE_ARCHITECT", killSwitchTriggered: false };
}
