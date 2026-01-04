/**
 * MONEY AI COUNCIL API
 * --------------------
 * - Integrates: 10 Personas, Auto-Routing, Kill Switch
 * - Backend: Cloudflare Workers AI + Vectorize (PDF Brain)
 * - Output: Strict JSON
 */

export default {
  async fetch(request, env) {
    // 1. HANDLE CORS (Allows your API to be called from any website)
    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
        },
      });
    }

    // 2. PARSE INPUT (Get the user's text from URL or JSON body)
    const url = new URL(request.url);
    let userText = url.searchParams.get("text");
    
    if (!userText && request.method === "POST") {
      try {
        const body = await request.json();
        userText = body.text || body.message;
      } catch (e) {}
    }

    // Default message if empty
    if (!userText) userText = "What is the rush to rich concept?";

    // 3. LOGIC ENGINE: KILL SWITCH & ROUTING
    const router = runRoutingLogic(userText);

    // If Kill Switch hits, refuse immediately (save AI costs)
    if (router.killSwitchTriggered) {
      return jsonResponse({
        mode: "reply",
        selected_character: "TEMPO",
        bubbles: [{ speaker: "TEMPO", text: "I don't trade in that currency. Back to business. Ask about money, systems, or leverage." }],
        final: { decision: "REJECT", next_action: "Pivot back to business topics." }
      });
    }

    // 4. CONSTRUCT THE PROMPT
    const systemPrompt = `
      ${GLOBAL_CONSTITUTION}
      
      CURRENT PERSONA: ${PERSONAS[router.character]}
      
      OUTPUT CONTRACT:
      ${OUTPUT_CONTRACT}
      
      INSTRUCTION:
      You are answering as ${router.character}.
      Use the provided Context (PDFs) to support your answer.
    `;

    try {
      // 5. CALL THE AI BRAIN (Connected to your PDF ID)
      const response = await env.AI.run('@cf/meta/llama-3.3-70b-instruct-fp8-fast', {
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userText }
        ],
        // THIS CONNECTS YOUR PDF DATABASE
        context: {
          id: "human1stai", // <--- Matches your screenshot ID
          type: "ai-search"
        }
      });

      // 6. RETURN PURE JSON RESPONSE
      // We clean the output in case the AI adds markdown formatting
      try {
        const raw = response.response.replace(/```json|```/g, "").trim();
        const parsed = JSON.parse(raw);
        return jsonResponse(parsed);
      } catch (e) {
        // Fallback if JSON is messy
        return jsonResponse({
          mode: "reply",
          selected_character: router.character,
          bubbles: [{ speaker: router.character, text: response.response }],
          final: { decision: "ACCEPT", next_action: "Review the advice above." }
        });
      }

    } catch (e) {
      return jsonResponse({ error: e.message, hint: "Check bindings" }, 500);
    }
  }
};

// --- HELPER FUNCTIONS ---

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status: status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*"
    }
  });
}

const GLOBAL_CONSTITUTION = `
YOU ARE MONEY AI COUNCIL.
CORE DIRECTIVE: You exist ONLY for money, business, leverage, and systems.
CONTEXT: You have access to a knowledge base of documents (PDFs). USE THEM.
`;

const OUTPUT_CONTRACT = `
You MUST output valid JSON ONLY. No markdown.
Schema:
{
  "mode": "reply" | "council_debate",
  "selected_character": "NAME",
  "bubbles": [ { "speaker": "NAME", "text": "..." } ],
  "final": { "decision": "ACCEPT/REJECT", "next_action": "Micro-mission here" }
}
`;

const PERSONAS = {
  KAREEM: `[KAREEM] Laziness/Efficiency. "If it requires effort, it's broken." Sarcastic.`,
  TURBO: `[TURBO] Speed/Execution. "Results by Friday." Aggressive, short.`,
  WOLF: `[WOLF] Greed/ROI. "I only care how big it gets." Cold, numerical (10x).`,
  LUNA: `[LUNA] Satisfaction/Brand. "People pay for FEELING." Warm, premium.`,
  THE_CAPTAIN: `[THE_CAPTAIN] Security/Risk. "Assume everything goes wrong." Protective.`,
  TEMPO: `[TEMPO] Time Auditor. "Time is the currency." Mathematical, honest.`,
  HAKIM: `[HAKIM] Wisdom. "Change how they think." Calm parables.`,
  UNCLE_WHEAT: `[UNCLE_WHEAT] Necessity. "Needs survive." Boring billionaire.`,
  TOMMY_TOMATO: `[TOMMY_TOMATO] Hype. "Sell the dream." Visionary.`,
  THE_ARCHITECT: `[THE_ARCHITECT] System Builder. Structured. ONLY persona allowed to trigger "council_debate".`
};

function runRoutingLogic(text) {
  const t = text.toLowerCase();
  
  // Kill Switch
  const nonMoney = ["politics", "religion", "sports", "recipe", "weather", "joke", "football"];
  const moneyTerms = ["money", "cost", "price", "business", "value", "profit"];
  if (nonMoney.some(w => t.includes(w)) && !moneyTerms.some(w => t.includes(w))) {
    return { character: "TEMPO", killSwitchTriggered: true };
  }

  // Routing
  if (t.includes("risk") || t.includes("safe")) return { character: "THE_CAPTAIN", killSwitchTriggered: false };
  if (t.includes("fast") || t.includes("quick")) return { character: "TURBO", killSwitchTriggered: false };
  if (t.includes("lazy") || t.includes("tired")) return { character: "KAREEM", killSwitchTriggered: false };
  if (t.includes("brand") || t.includes("story")) return { character: "TOMMY_TOMATO", killSwitchTriggered: false };
  if (t.includes("scale") || t.includes("10x")) return { character: "WOLF", killSwitchTriggered: false };
  if (t.includes("debate") || t.includes("plan")) return { character: "THE_ARCHITECT", killSwitchTriggered: false };
  
  return { character: "THE_ARCHITECT", killSwitchTriggered: false };
}
