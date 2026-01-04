/**
 * MONEY AI COUNCIL API
 * --------------------
 * - Integrates: 10 Personas, Auto-Routing, Kill Switch
 * - Backend: Cloudflare Workers AI + Vectorize (PDF Brain)
 * - Output: Strict JSON with clean text
 */

export default {
  async fetch(request, env) {
    // 1. HANDLE CORS
    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
        },
      });
    }

    // 2. PARSE INPUT
    const url = new URL(request.url);
    let userText = url.searchParams.get("text");
    
    if (!userText && request.method === "POST") {
      try {
        const body = await request.json();
        userText = body.text || body.message;
      } catch (e) {}
    }

    if (!userText) userText = "What is the rush to rich concept?";

    // 3. LOGIC ENGINE: KILL SWITCH & ROUTING
    const router = runRoutingLogic(userText);

    // Kill Switch
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
      RESPOND WITH VALID JSON ONLY. NO MARKDOWN. NO EXTRA TEXT.
    `;

    try {
      // 5. CALL THE AI
      const response = await env.AI.run('@cf/meta/llama-3.3-70b-instruct-fp8-fast', {
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userText }
        ],
        context: {
          id: "human1stai",
          type: "ai-search"
        }
      });

      // 6. EXTRACT AND CLEAN THE RESPONSE
      let rawText = "";
      
      // Handle different response structures from Cloudflare AI
      if (typeof response === 'string') {
        rawText = response;
      } else if (response.response) {
        rawText = typeof response.response === 'string' 
          ? response.response 
          : JSON.stringify(response.response);
      } else if (response.result) {
        rawText = typeof response.result === 'string'
          ? response.result
          : JSON.stringify(response.result);
      } else {
        rawText = JSON.stringify(response);
      }
      
      // Clean markdown and try to parse as JSON
      rawText = rawText.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
      
      try {
        const parsed = JSON.parse(rawText);
        
        // Ensure bubbles have string text
        if (parsed.bubbles) {
          parsed.bubbles = parsed.bubbles.map(b => ({
            speaker: String(b.speaker || router.character),
            text: typeof b.text === 'string' ? b.text : JSON.stringify(b.text)
          }));
        }
        
        // Ensure final has string values
        if (parsed.final) {
          parsed.final = {
            decision: String(parsed.final.decision || "ACCEPT"),
            next_action: typeof parsed.final.next_action === 'string' 
              ? parsed.final.next_action 
              : "Review the advice above."
          };
        }
        
        return jsonResponse(parsed);
      } catch (e) {
        // JSON parsing failed - return raw text as bubble
        return jsonResponse({
          mode: "reply",
          selected_character: router.character,
          bubbles: [{ speaker: router.character, text: rawText }],
          final: { decision: "ACCEPT", next_action: "Review the advice above." }
        });
      }

    } catch (e) {
      return jsonResponse({ 
        mode: "reply",
        selected_character: router.character,
        bubbles: [{ speaker: router.character, text: "System error: " + e.message }],
        final: { decision: "REJECT", next_action: "Try again." },
        error: e.message 
      }, 500);
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
You MUST output valid JSON ONLY. No markdown. No code blocks.
Schema:
{
  "mode": "reply" | "council_debate",
  "selected_character": "NAME",
  "bubbles": [ { "speaker": "NAME", "text": "Your advice as plain text string" } ],
  "final": { "decision": "ACCEPT or REJECT", "next_action": "Micro-mission as plain text string" }
}
IMPORTANT: All text values must be plain strings, not objects.
`;

const PERSONAS = {
  KAREEM: `[KAREEM] Laziness/Efficiency. "If it requires effort, it's broken." Sarcastic, finds shortcuts.`,
  TURBO: `[TURBO] Speed/Execution. "Results by Friday." Aggressive, action-oriented, short responses.`,
  WOLF: `[WOLF] Greed/ROI. "I only care how big it gets." Cold, numerical, always asks about 10x.`,
  LUNA: `[LUNA] Satisfaction/Brand. "People pay for FEELING." Warm, premium, quality-focused.`,
  THE_CAPTAIN: `[THE_CAPTAIN] Security/Risk. "Assume everything goes wrong." Protective, builds safety nets.`,
  TEMPO: `[TEMPO] Time Auditor. "Time is the currency." Mathematical, tracks hours and death cost.`,
  HAKIM: `[HAKIM] Wisdom. "Change how they think." Calm, uses parables and stories.`,
  UNCLE_WHEAT: `[UNCLE_WHEAT] Necessity. "Needs survive." Boring billionaire, sells essentials.`,
  TOMMY_TOMATO: `[TOMMY_TOMATO] Hype. "Sell the dream." Visionary, branding expert, adds excitement.`,
  THE_ARCHITECT: `[THE_ARCHITECT] System Builder. Structured thinking. ONLY persona allowed to trigger "council_debate" mode.`
};

function runRoutingLogic(text) {
  const t = text.toLowerCase();
  
  // Kill Switch - reject non-money topics
  const nonMoney = ["politics", "religion", "sports", "recipe", "weather", "joke", "football", "game", "movie"];
  const moneyTerms = ["money", "cost", "price", "business", "value", "profit", "sell", "buy", "invest", "time", "work"];
  
  if (nonMoney.some(w => t.includes(w)) && !moneyTerms.some(w => t.includes(w))) {
    return { character: "TEMPO", killSwitchTriggered: true };
  }

  // Smart Routing based on keywords
  if (t.includes("risk") || t.includes("safe") || t.includes("protect")) return { character: "THE_CAPTAIN", killSwitchTriggered: false };
  if (t.includes("fast") || t.includes("quick") || t.includes("now") || t.includes("today")) return { character: "TURBO", killSwitchTriggered: false };
  if (t.includes("lazy") || t.includes("tired") || t.includes("automate") || t.includes("easy")) return { character: "KAREEM", killSwitchTriggered: false };
  if (t.includes("brand") || t.includes("premium") || t.includes("luxury") || t.includes("feel")) return { character: "LUNA", killSwitchTriggered: false };
  if (t.includes("hype") || t.includes("viral") || t.includes("exciting")) return { character: "TOMMY_TOMATO", killSwitchTriggered: false };
  if (t.includes("scale") || t.includes("10x") || t.includes("multiply") || t.includes("roi")) return { character: "WOLF", killSwitchTriggered: false };
  if (t.includes("time") || t.includes("hour") || t.includes("audit") || t.includes("waste")) return { character: "TEMPO", killSwitchTriggered: false };
  if (t.includes("need") || t.includes("essential") || t.includes("wheat") || t.includes("necessity")) return { character: "UNCLE_WHEAT", killSwitchTriggered: false };
  if (t.includes("story") || t.includes("wisdom") || t.includes("parable") || t.includes("lesson")) return { character: "HAKIM", killSwitchTriggered: false };
  if (t.includes("debate") || t.includes("council") || t.includes("plan") || t.includes("system") || t.includes("all")) return { character: "THE_ARCHITECT", killSwitchTriggered: false };
  
  // Default to Architect
  return { character: "THE_ARCHITECT", killSwitchTriggered: false };
}
