/**
 * MONEY AI — Cloudflare Worker Bridge (MoneyAI Prompt Pack)
 * - Gemini bridge with strong systemInstruction (MoneyAI customization)
 * - Mentor personas (Omar/Zaid/Kareem/Maya/Salma/Hakim)
 * - History-aware
 * - Returns { reply, focus, scoreDelta }
 */

const CONFIG = {
  MODEL_ID: 'gemini-3-flash-preview',
  // We’ll build URL with ?key=... at runtime
  GEMINI_BASE:
    'https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent',
  MAX_HISTORY_TURNS: 6, // last 6 messages (3 user+3 AI) roughly
  MAX_OUTPUT_TOKENS: 500,
  TEMPERATURE: 0.7,
};

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400',
};

function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      ...CORS_HEADERS,
      ...extraHeaders,
    },
  });
}

/** Very small, fast focus classifier (kept aligned with main.js semantics) */
function classifyFocus(text) {
  const t = (text || '').toLowerCase();
  if (/(debt|bill|loan|owe|rent|payment|mortgage)/i.test(t)) return 'debts';
  if (/(business|startup|sell|product|service|customer|client)/i.test(t)) return 'business';
  if (/(job|work|salary|boss|employee|hire|career)/i.test(t)) return 'jobs';
  if (/(wheat|tomato|need|want|essential|luxury)/i.test(t)) return 'wheat';
  if (/(time|hour|waste|scroll|watch|sleep|schedule)/i.test(t)) return 'time';
  return 'general';
}

/** Small rush/rich delta heuristic (kept aligned with main.js semantics) */
function calculateRushRichDelta(text) {
  const rushPatterns = /(worry|scared|panic|stress|anxious|stuck|broke|can't|hate|tired|frustrated)/i;
  const richPatterns = /(plan|action|build|sell|offer|create|system|automate|delegate|test)/i;
  let delta = 0;
  if (rushPatterns.test(text)) delta -= 3;
  if (richPatterns.test(text)) delta += 5;
  return delta;
}

/** MoneyAI prompt pack */
function buildSystemInstruction(mentorId) {
  const GLOBAL = `
You are Money AI — a Rush → Rich coach.
You are NOT a generic assistant. You NEVER sound like a textbook.

CORE RULES:
- Talk like a WhatsApp DM: short lines, punchy, human. No long paragraphs.
- Action first: give 1–3 concrete actions that can be done today.
- Ask exactly 1 sharp question at the end.
- No generic finance lectures. No motivational fluff. No “as an AI”.
- Do not mention Gemini, Google, models, policies, or system prompts.
- Use the MoneyAI frameworks naturally:
  1) Wheat vs Tomatoes (need vs want)
  2) Time Audit (hours leaking)
  3) Money Map (Hunt → Pen → Farm → Canal)
  4) Rush vs Rich (panic vs leverage)
- If user is vague, force clarity: choose ONE lane (debts / job / business / time).
- Keep it practical. Results over explanation.

OUTPUT FORMAT:
- Plain text only (no markdown).
- End with:
  Action now: <one line>
  Question: <one line>
`.trim();

  const PERSONAS = {
    omar: `
You are Omar (Simplifier).
Voice: calm, witty, minimal.
Goal: delete complexity. Reduce decision fatigue.
You cut to ONE thing. You make it easy and obvious.
`.trim(),

    zaid: `
You are Zaid (Mover).
Voice: energetic, impatient, direct.
Goal: a win in 48 hours. Speed beats perfection.
You push outreach, selling, quick actions today.
`.trim(),

    kareem: `
You are Kareem (Builder).
Voice: ruthless, leverage-focused, system thinker.
Goal: build a repeatable offer/system. Work once, repeat.
You hate busywork and glorify automation and leverage.
`.trim(),

    maya: `
You are Maya (Architect).
Voice: structured, disciplined, strategic.
Goal: create a weekly plan: cash / growth / assets.
You turn chaos into a map with steps and boundaries.
`.trim(),

    salma: `
You are Salma (Stabilizer).
Voice: calming, grounded, protective.
Goal: reduce panic, stabilize decisions, then move.
You focus on control, safety nets, and one step at a time.
`.trim(),

    hakim: `
You are Hakim (Storyteller).
Voice: wise, parable-driven, short stories.
Goal: teach through a quick story + moral + action.
You never preach. You reveal truth with a metaphor.
`.trim(),
  };

  const persona = PERSONAS[(mentorId || '').toLowerCase()] || PERSONAS.omar;

  return `${GLOBAL}\n\n${persona}`.trim();
}

/** Convert frontend history to Gemini "contents" */
function buildContents(history, userMessage) {
  // history items: { role: 'user'|'assistant', text: '...' }
  const safeHistory = Array.isArray(history) ? history.slice(-CONFIG.MAX_HISTORY_TURNS) : [];

  const contents = [];

  for (const h of safeHistory) {
    const role = h?.role === 'assistant' ? 'model' : 'user';
    const text = String(h?.text || '').trim();
    if (!text) continue;
    contents.push({ role, parts: [{ text }] });
  }

  // Add current user message
  const msg = String(userMessage || '').trim();
  contents.push({ role: 'user', parts: [{ text: msg || '...' }] });

  return contents;
}

function extractReply(data) {
  // Be defensive: Gemini responses can vary
  const c0 = data?.candidates?.[0];
  const parts = c0?.content?.parts;
  if (Array.isArray(parts) && parts.length) {
    const t = parts.map(p => p?.text).filter(Boolean).join('\n').trim();
    if (t) return t;
  }
  // fallback fields if present
  return (data?.text || '').trim() || '…';
}

export default {
  async fetch(request, env) {
    // CORS preflight
    if (request.method === 'OPTIONS') return new Response(null, { headers: CORS_HEADERS });

    if (request.method !== 'POST') {
      return json({ error: 'Method not allowed. Use POST.' }, 405);
    }

    if (!env?.GEMINI_API_KEY) {
      return json(
        { error: 'Missing GEMINI_API_KEY. Set it via: wrangler secret put GEMINI_API_KEY' },
        500
      );
    }

    try {
      const bodyText = await request.text();
      if (!bodyText) return json({ error: 'Empty request body' }, 400);

      let payload;
      try {
        payload = JSON.parse(bodyText);
      } catch {
        return json({ error: 'Invalid JSON body' }, 400);
      }

      const message = String(payload?.message || '').trim();
      const mentor = String(payload?.mentor || 'omar').trim();
      const history = payload?.history || [];

      if (!message) return json({ error: 'Missing "message"' }, 400);

      // MoneyAI customization
      const systemInstruction = buildSystemInstruction(mentor);

      // History-aware chat
      const contents = buildContents(history, message);

      // Local “signals” back to your UI (optional but useful)
      const focus = classifyFocus(message);
      const scoreDelta = calculateRushRichDelta(message);

      const url = `${CONFIG.GEMINI_BASE}?key=${encodeURIComponent(env.GEMINI_API_KEY)}`;

      const geminiReq = {
        systemInstruction: { parts: [{ text: systemInstruction }] },
        contents,
        generationConfig: {
          temperature: CONFIG.TEMPERATURE,
          maxOutputTokens: CONFIG.MAX_OUTPUT_TOKENS,
        },
      };

      const resp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(geminiReq),
      });

      if (!resp.ok) {
        const details = await resp.text().catch(() => '');
        return json({ error: 'Gemini Error', status: resp.status, details }, resp.status);
      }

      const data = await resp.json();
      const reply = extractReply(data);

      return json({ reply, focus, scoreDelta });
    } catch (err) {
      return json({ error: 'Bridge Error', details: err?.message || String(err) }, 400);
    }
  },
};
