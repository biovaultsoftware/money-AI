/**
 * MONEY AI — Cloudflare Worker Bridge (MoneyAI Prompt Pack)
 * - Uses REAL Gemini systemInstruction (not "System: ..." text)
 * - Enforces MoneyAI behavior + 6 mentor personas
 * - Keeps same response shape: { reply }
 *
 * Docs: systemInstruction is supported in v1beta generateContent request body.
 */

const CONFIG = {
  MODEL_ID: "gemini-3-flash-preview",
  GEMINI_BASE: "https://generativelanguage.googleapis.com/v1beta/models",
};

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function json(status, obj, extraHeaders = {}) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...CORS_HEADERS,
      ...extraHeaders,
    },
  });
}

/**
 * MoneyAI Global Rules (the “brain”)
 * - WhatsApp style
 * - Action-first (launch results, not product)
 * - 12-message discipline
 * - No lectures, no generic fluff
 */
function moneyAIGlobalSystem() {
  return `
You are Money AI — a human-first wealth companion.
You are NOT a generic assistant.

CORE RULES (non-negotiable):
1) Speak like WhatsApp: short lines, direct, human. No long paragraphs.
2) Action-first: always end with ONE clear next action + ONE question.
3) No theory dumping. No “here’s a long explanation”. Show results.
4) 12-message discipline: keep replies tight. If user chats endlessly, redirect to action.
5) Always identify: Rush mode vs Rich mode. Calm them if Rush. Build leverage if Rich.
6) Always push toward: systems, leverage, repeatable offers, time-saving.
7) Use MoneyAI mental models when relevant:
   - Wheat vs Tomatoes (need vs want)
   - Money Map (Hunt → Pen → Farm → Canal)
   - 5 Motivators (Laziness, Speed, Greed, Satisfaction, Safety)
8) Never mention “Gemini”, “LLM”, “system prompt”, or “policy”.
9) If user asks for a plan: give a 48-hour micro-plan (3 steps max).
10) Always be specific, not motivational fluff.

OUTPUT STYLE:
- Max ~8–12 lines.
- Prefer bullets and short sentences.
- Finish with:
  • Next move: <one action>
  • Question: <one question>
`.trim();
}

/**
 * Mentor personas (tone + approach)
 */
function mentorSystem(mentor) {
  const m = String(mentor || "Omar").toLowerCase();

  const personas = {
    omar: `
You are OMAR (Simplifier).
You cut complexity. You make money steps feel easy and obvious.
You hate dashboards, theory, and overthinking.
You reduce to: one offer, one channel, one next action.
`,
    zaid: `
You are ZAID (Mover).
You push speed and execution.
You give 48-hour action plans.
You challenge excuses and force a decision.
`,
    kareem: `
You are KAREEM (Builder).
You think in leverage: systems, automation, compounding.
You turn jobs into offers, offers into funnels, funnels into machines.
`,
    maya: `
You are MAYA (Architect).
You are structured, disciplined, and calm.
You turn chaos into a clear schedule, rules, and checkpoints.
`,
    salma: `
You are SALMA (Stabilizer).
You reduce panic. You ground the user.
You help them stop emotional spending and impulsive decisions.
Then you move them gently into action.
`,
    hakim: `
You are HAKIM (Storyteller).
You teach using short parables + analogies (5 farmers style).
But still end with one action + one question.
Keep stories short (6–10 lines).
`,
  };

  // default to Omar if unknown
  return (personas[m] || personas.omar).trim();
}

/**
 * Build Gemini "contents" array from history + latest message.
 * Supports history formats like:
 *  - [{ role: "user"|"model", text: "..." }, ...]
 *  - [{ role: "user"|"assistant", content: "..." }, ...]
 */
function buildContents(history, message) {
  const contents = [];

  if (Array.isArray(history)) {
    for (const h of history) {
      if (!h) continue;
      const roleRaw = (h.role || "").toLowerCase();
      const role =
        roleRaw === "assistant" || roleRaw === "model" ? "model" : "user";
      const text = h.text ?? h.content ?? h.message ?? "";
      if (typeof text === "string" && text.trim()) {
        contents.push({
          role,
          parts: [{ text: text.trim() }],
        });
      }
    }
  }

  // append current user message
  if (typeof message === "string" && message.trim()) {
    contents.push({
      role: "user",
      parts: [{ text: message.trim() }],
    });
  }

  return contents;
}

export default {
  async fetch(request, env) {
    // CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: CORS_HEADERS });
    }

    // allow only POST
    if (request.method !== "POST") {
      return json(405, { error: "Method Not Allowed. Use POST." });
    }

    try {
      if (!env.GEMINI_API_KEY) {
        return json(500, {
          error: "Server misconfigured",
          details: "Missing GEMINI_API_KEY secret in Worker env.",
        });
      }

      const bodyText = await request.text();
      if (!bodyText) return json(400, { error: "Empty request body" });

      let payload;
      try {
        payload = JSON.parse(bodyText);
      } catch (e) {
        return json(400, { error: "Invalid JSON", details: e.message });
      }

      const { message, mentor, history } = payload || {};
      if (!message || typeof message !== "string") {
        return json(400, { error: "Missing 'message' string" });
      }

      const systemText = `${moneyAIGlobalSystem()}\n\n${mentorSystem(mentor)}`;

      const contents = buildContents(history, message);
      if (!contents.length) {
        return json(400, { error: "No contents to send" });
      }

      const url = `${CONFIG.GEMINI_BASE}/${encodeURIComponent(
        CONFIG.MODEL_ID
      )}:generateContent?key=${encodeURIComponent(env.GEMINI_API_KEY)}`;

      const geminiReq = {
        // IMPORTANT: official field name (camelCase)
        systemInstruction: {
          parts: [{ text: systemText }],
        },
        contents,
        generationConfig: {
          temperature: 0.6,
          topP: 0.9,
          maxOutputTokens: 350,
        },
      };

      const resp = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(geminiReq),
      });

      if (!resp.ok) {
        const errText = await resp.text();
        return json(resp.status, {
          error: "Gemini Error",
          details: errText,
        });
      }

      const data = await resp.json();

      // safest extraction
      const reply =
        data?.candidates?.[0]?.content?.parts
          ?.map((p) => p?.text)
          ?.filter(Boolean)
          ?.join("\n")
          ?.trim() || "";

      if (!reply) {
        return json(502, {
          error: "Empty model reply",
          details: data,
        });
      }

      return json(200, { reply });
    } catch (err) {
      return json(400, { error: "Bridge Error", details: err.message });
    }
  },
};
