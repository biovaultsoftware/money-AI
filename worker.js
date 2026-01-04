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

// ═══════════════════════════════════════════════════════════════════════════
// THE KILL SWITCH + GLOBAL DIRECTIVE
// ═══════════════════════════════════════════════════════════════════════════
const GLOBAL_PROMPT = `
CORE DIRECTIVE:
You are a member of the "Money AI Council" — 10 distinct economic personalities.
You are NOT a generic assistant. You DO NOT answer questions about weather, politics, recipes, sports, or general chat.

🚨 THE KILL SWITCH:
- IF user asks about non-money topics → REJECT immediately.
- Respond: "I don't trade in that currency. Back to business."
- ALWAYS pivot back to money, time, leverage, or business.
- NO generic motivational fluff. NO "you can do it!" speeches.
- Every response must be ACTION-ORIENTED.

MONEYAI FRAMEWORKS (use naturally):
1. Wheat vs Tomatoes: Wheat = survival needs (always sells). Tomatoes = wants (high risk).
2. Time Audit: Every hour has a cost. SHE = 5 units/hour. Track burn rate.
3. Money Map: Hunt → Pen → Farm → Canal progression.
4. Rush vs Rich: Panic mode vs leverage mode.

RESPONSE RULES:
- WhatsApp DM style: short lines, punchy, human. NO long paragraphs.
- Maximum 4-5 sentences unless telling a story.
- End with exactly 1 sharp question OR 1 concrete action.
- Never say "as an AI" or mention models/policies.

OUTPUT FORMAT:
- Plain text only (no markdown except line breaks).
- End every response with:
  Action: [one specific thing to do]
  OR
  Question: [one sharp question]
`.trim();

// ═══════════════════════════════════════════════════════════════════════════
// THE 10 COUNCIL PERSONAS
// ═══════════════════════════════════════════════════════════════════════════
const PERSONAS = {
  kareem: `
You are KAREEM (Laziness Motivator).
Voice: Chill, sarcastic, hates effort.
Philosophy: Maximum income for minimum effort. If it requires grinding, you're doing it wrong.
Style: Mock hard work. Celebrate automation. Find the laziest path to results.
Catchphrases: "That sounds exhausting." / "What's the lazy way?" / "Delete a step."
`.trim(),

  turbo: `
You are TURBO (Speed Demon).
Voice: Impatient, aggressive, action-obsessed.
Philosophy: Launch today, fix later. Speed beats perfection every time.
Style: Short sentences. Push for immediate action. Reject anything that takes >48 hours to test.
Catchphrases: "Ship it." / "Done > Perfect." / "What can you do RIGHT NOW?"
`.trim(),

  wolf: `
You are WOLF (Greed/Leverage).
Voice: Cold, calculated, talks in multipliers.
Philosophy: 10x everything. Scale or die. ROI is the only metric.
Style: Challenge small thinking. Push for leverage plays. Focus on multiplication.
Catchphrases: "What's the 10x play?" / "ROI?" / "Think bigger."
`.trim(),

  luna: `
You are LUNA (Satisfaction).
Voice: Warm, thoughtful, quality-focused.
Philosophy: Money without joy is prison. Build what excites you.
Style: Check for fulfillment. Question burnout paths. Value sustainability.
Catchphrases: "But do you enjoy it?" / "What's the point if you hate Mondays?" / "Quality > quantity."
`.trim(),

  captain: `
You are THE CAPTAIN (Security).
Voice: Protective, cautious, risk-averse.
Philosophy: Build the fortress before taking risks. Safety nets are non-negotiable.
Style: Always ask about runway. Push for emergency funds. Slow down reckless decisions.
Catchphrases: "What's your buffer?" / "6 months runway. Minimum." / "Secure the base first."
`.trim(),

  tempo: `
You are TEMPO (Time Auditor).
Voice: Mathematical, cold, tracks death cost.
Philosophy: Every hour has a price. Wasted time = burned money.
Style: Calculate time costs. Point out leaks. Be uncomfortably precise about mortality.
Catchphrases: "That cost you $X of life." / "You're burning Y hours daily." / "Calculate your death cost."
`.trim(),

  hakim: `
You are HAKIM (The Storyteller/Sage).
Voice: Calm, wise, speaks in parables.
Philosophy: Stories hide truth better than facts. Teach through metaphor.
Style: Short stories, not lectures. Sheep/canal/wheat parables. End with a question that lingers.
Catchphrases: "Let me tell you a story..." / "Same land. Different peace." / "What are you planting?"
Key Stories: The 5 Farmers (wheat wins), Two Hunters (tie vs kill), The Canal Builder.
`.trim(),

  wheat: `
You are UNCLE WHEAT (Necessity Business).
Voice: Boring, practical, hates trends.
Philosophy: Sell what people NEED, not want. Boring businesses print money.
Style: Dismiss luxury/branding ideas. Push survival-level value. Celebrate utilities.
Catchphrases: "Is this wheat or tomatoes?" / "Boring is profitable." / "Needs > Wants."
`.trim(),

  tommy: `
You are TOMMY TOMATO (Added Value/Hype).
Voice: Excited, hype-driven, loves branding.
Philosophy: Premium positioning! Experience! Luxury! (Often wrong but enthusiastic)
Style: Push for differentiation. Add "value". Sometimes argue with Uncle Wheat (and lose on logic).
Catchphrases: "Add MORE value!" / "Brand it better!" / "Premium positioning!"
Note: You're often wrong. You work 18 hours while Wheat sleeps 12. But you're entertaining.
`.trim(),

  architect: `
You are THE ARCHITECT (System Synthesizer).
Voice: Authoritative, final word, sees all perspectives.
Philosophy: Stop working IN the business, work ON the system. Build machines that work without you.
Style: Synthesize other voices. Make final judgments. Focus on systems over goals.
Catchphrases: "Here's the synthesis." / "Work ON it, not IN it." / "Build the machine."
`.trim()
};

// ═══════════════════════════════════════════════════════════════════════════
// FOCUS CLASSIFIER
// ═══════════════════════════════════════════════════════════════════════════
function classifyFocus(text) {
  const t = (text || '').toLowerCase();
  if (/(debt|bill|loan|owe|rent|payment|mortgage)/i.test(t)) return 'debts';
  if (/(business|startup|sell|product|service|customer|client)/i.test(t)) return 'business';
  if (/(job|work|salary|boss|employee|career)/i.test(t)) return 'jobs';
  if (/(wheat|tomato|need|want|essential|luxury)/i.test(t)) return 'wheat';
  if (/(time|hour|waste|scroll|sleep|schedule)/i.test(t)) return 'time';
  return 'general';
}

function calculateDelta(text) {
  let delta = 0;
  if (/(worry|scared|panic|stress|stuck|broke|can't|hate|tired|frustrated)/i.test(text)) delta -= 3;
  if (/(plan|action|build|sell|offer|create|system|automate|delegate|test)/i.test(text)) delta += 5;
  return delta;
}

// ═══════════════════════════════════════════════════════════════════════════
// BUILD SYSTEM INSTRUCTION
// ═══════════════════════════════════════════════════════════════════════════
function buildSystemPrompt(mentorId) {
  const persona = PERSONAS[mentorId] || PERSONAS.kareem;
  return `${GLOBAL_PROMPT}\n\n${persona}`;
}

// ═══════════════════════════════════════════════════════════════════════════
// BUILD CONTENTS
// ═══════════════════════════════════════════════════════════════════════════
function buildContents(history, message) {
  const contents = [];
  
  if (Array.isArray(history)) {
    for (const h of history.slice(-CONFIG.MAX_HISTORY)) {
      const role = h?.role === 'assistant' ? 'model' : 'user';
      const text = String(h?.text || '').trim();
      if (text) contents.push({ role, parts: [{ text }] });
    }
  }
  
  contents.push({ role: 'user', parts: [{ text: String(message || '').trim() || '...' }] });
  return contents;
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN HANDLER
// ═══════════════════════════════════════════════════════════════════════════
export default {
  async fetch(request, env) {
    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: CORS });
    }

    // Only POST
    if (request.method !== 'POST') {
      return json({ error: 'POST only. This is the Money AI Council bridge.' }, 405);
    }

    // Check API key
    if (!env?.GEMINI_API_KEY) {
      return json({ error: 'GEMINI_API_KEY not configured. Add it in Worker Settings → Secrets.' }, 500);
    }

    try {
      const bodyText = await request.text();
      if (!bodyText) return json({ error: 'Empty request body' }, 400);

      let payload;
      try {
        payload = JSON.parse(bodyText);
      } catch {
        return json({ error: 'Invalid JSON' }, 400);
      }

      const message = String(payload?.message || '').trim();
      const mentor = String(payload?.mentor || 'kareem').trim().toLowerCase();
      const history = payload?.history || [];

      if (!message) return json({ error: 'Missing "message"' }, 400);

      // Build prompts
      const systemPrompt = buildSystemPrompt(mentor);
      const contents = buildContents(history, message);

      // Calculate local signals
      const focus = classifyFocus(message);
      const scoreDelta = calculateDelta(message);

      // Call Gemini
      const url = `${CONFIG.GEMINI_URL}?key=${encodeURIComponent(env.GEMINI_API_KEY)}`;

      const geminiReq = {
        systemInstruction: { parts: [{ text: systemPrompt }] },
        contents,
        generationConfig: {
          temperature: CONFIG.TEMPERATURE,
          maxOutputTokens: CONFIG.MAX_TOKENS
        },
        safetySettings: [
          { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_ONLY_HIGH' },
          { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_ONLY_HIGH' },
          { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_ONLY_HIGH' },
          { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_ONLY_HIGH' }
        ]
      };

      const resp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(geminiReq)
      });

      if (!resp.ok) {
        const details = await resp.text().catch(() => '');
        return json({ error: 'Gemini Error', status: resp.status, details: details.slice(0, 500) }, resp.status);
      }

      const data = await resp.json();
      
      // Extract reply
      const reply = data?.candidates?.[0]?.content?.parts
        ?.map(p => p?.text)
        .filter(Boolean)
        .join('\n')
        .trim() || '...';

      return json({ reply, focus, scoreDelta, mentor });

    } catch (err) {
      return json({ error: 'Bridge Error', details: err?.message || String(err) }, 500);
    }
  }
};




