/**
 * MONEY AI COUNCIL API + WEB SEARCH
 * ----------------------------------
 * - Web Search via Tavily API (or Brave Search)
 * - PDF Brain via Cloudflare Vectorize
 * - 10 Personas with Auto-Routing
 */

export default {
  async fetch(request, env) {
    // CORS
    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
        },
      });
    }

    // Parse Input
    const url = new URL(request.url);
    let userText = url.searchParams.get("text");
    
    if (!userText && request.method === "POST") {
      try {
        const body = await request.json();
        userText = body.text || body.message;
      } catch (e) {}
    }

    if (!userText) userText = "What is the rush to rich concept?";

    // Routing
    const router = runRoutingLogic(userText);

    // Kill Switch
    if (router.killSwitchTriggered) {
      return jsonResponse({
        mode: "reply",
        selected_character: "TEMPO",
        bubbles: [{ speaker: "TEMPO", text: "I don't trade in that currency. Back to business." }],
        final: { decision: "REJECT", next_action: "Ask about money, systems, or leverage." }
      });
    }

    try {
      // ═══════════════════════════════════════════════════════════
      // STEP 1: WEB SEARCH (if enabled)
      // ═══════════════════════════════════════════════════════════
      let webContext = "";
      
      // Only search for questions that need current info
      const needsSearch = /price|cost|current|today|latest|news|how much|market|trend|rate/i.test(userText);
      
      if (needsSearch && env.TAVILY_API_KEY) {
        try {
          const searchResults = await searchWeb(userText, env.TAVILY_API_KEY);
          if (searchResults) {
            webContext = `\n\nWEB SEARCH RESULTS:\n${searchResults}\n`;
          }
        } catch (e) {
          console.log("Search failed:", e.message);
        }
      }

      // ═══════════════════════════════════════════════════════════
      // STEP 2: BUILD PROMPT WITH ALL CONTEXT
      // ═══════════════════════════════════════════════════════════
      const systemPrompt = `
        ${GLOBAL_CONSTITUTION}
        
        CURRENT PERSONA: ${PERSONAS[router.character]}
        ${webContext}
        
        OUTPUT CONTRACT:
        ${OUTPUT_CONTRACT}
        
        INSTRUCTION:
        You are answering as ${router.character}.
        Use the PDF knowledge base AND web search results (if provided) to give accurate, current advice.
        RESPOND WITH VALID JSON ONLY.
      `;

      // ═══════════════════════════════════════════════════════════
      // STEP 3: CALL AI WITH COMBINED CONTEXT
      // ═══════════════════════════════════════════════════════════
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

      // Extract and clean response
      let rawText = extractText(response);
      rawText = rawText.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
      
      try {
        const parsed = JSON.parse(rawText);
        return jsonResponse(cleanResponse(parsed, router.character));
      } catch (e) {
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
        final: { decision: "REJECT", next_action: "Try again." }
      }, 500);
    }
  }
};

// ═══════════════════════════════════════════════════════════════════
// WEB SEARCH FUNCTION (Tavily API)
// ═══════════════════════════════════════════════════════════════════
async function searchWeb(query, apiKey) {
  const response = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      api_key: apiKey,
      query: query + " business money finance",
      search_depth: "basic",
      max_results: 5,
      include_answer: true,
      include_raw_content: false
    })
  });

  if (!response.ok) {
    throw new Error(`Tavily API error: ${response.status}`);
  }

  const data = await response.json();
  
  // Format results for the AI
  let context = "";
  
  if (data.answer) {
    context += `Summary: ${data.answer}\n\n`;
  }
  
  if (data.results && data.results.length > 0) {
    context += "Sources:\n";
    data.results.slice(0, 3).forEach((r, i) => {
      context += `${i + 1}. ${r.title}: ${r.content?.substring(0, 200)}...\n`;
    });
  }
  
  return context;
}

// ═══════════════════════════════════════════════════════════════════
// ALTERNATIVE: BRAVE SEARCH (if you prefer)
// ═══════════════════════════════════════════════════════════════════
async function searchWebBrave(query, apiKey) {
  const response = await fetch(
    `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query + " business finance")}&count=5`,
    {
      headers: {
        "X-Subscription-Token": apiKey,
        "Accept": "application/json"
      }
    }
  );

  if (!response.ok) {
    throw new Error(`Brave API error: ${response.status}`);
  }

  const data = await response.json();
  
  let context = "";
  if (data.web?.results) {
    context = "Web Results:\n";
    data.web.results.slice(0, 3).forEach((r, i) => {
      context += `${i + 1}. ${r.title}: ${r.description}\n`;
    });
  }
  
  return context;
}

// ═══════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════
function extractText(response) {
  if (typeof response === 'string') return response;
  if (response.response) {
    return typeof response.response === 'string' ? response.response : JSON.stringify(response.response);
  }
  if (response.result) {
    return typeof response.result === 'string' ? response.result : JSON.stringify(response.result);
  }
  return JSON.stringify(response);
}

function cleanResponse(parsed, character) {
  if (parsed.bubbles) {
    parsed.bubbles = parsed.bubbles.map(b => ({
      speaker: String(b.speaker || character),
      text: typeof b.text === 'string' ? b.text : JSON.stringify(b.text)
    }));
  }
  if (parsed.final) {
    parsed.final = {
      decision: String(parsed.final.decision || "ACCEPT"),
      next_action: typeof parsed.final.next_action === 'string' 
        ? parsed.final.next_action 
        : "Review the advice above."
    };
  }
  return parsed;
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*"
    }
  });
}

// ═══════════════════════════════════════════════════════════════════
// CONSTITUTION & PERSONAS
// ═══════════════════════════════════════════════════════════════════
const GLOBAL_CONSTITUTION = `
YOU ARE MONEY AI COUNCIL.
CORE DIRECTIVE: You exist ONLY for money, business, leverage, and systems.
You have access to: 1) PDF knowledge base, 2) Web search results (if provided).
Use BOTH sources to give accurate, current, actionable advice.
`;

const OUTPUT_CONTRACT = `
Output valid JSON ONLY. No markdown.
{
  "mode": "reply" | "council_debate",
  "selected_character": "NAME",
  "bubbles": [ { "speaker": "NAME", "text": "Plain text advice" } ],
  "final": { "decision": "ACCEPT/REJECT", "next_action": "Micro-mission" }
}
`;

const PERSONAS = {
  KAREEM: `[KAREEM] Laziness/Efficiency. "If it requires effort, it's broken." Finds shortcuts.`,
  TURBO: `[TURBO] Speed/Execution. "Results by Friday." Action-oriented.`,
  WOLF: `[WOLF] Greed/ROI. "10x or nothing." Cold, numerical.`,
  LUNA: `[LUNA] Satisfaction/Brand. "People pay for FEELING." Premium-focused.`,
  THE_CAPTAIN: `[THE_CAPTAIN] Security/Risk. "Assume everything fails." Protective.`,
  TEMPO: `[TEMPO] Time Auditor. "Time is currency." Tracks death cost.`,
  HAKIM: `[HAKIM] Wisdom. Uses parables and stories.`,
  UNCLE_WHEAT: `[UNCLE_WHEAT] Necessity. "Needs survive." Sells essentials.`,
  TOMMY_TOMATO: `[TOMMY_TOMATO] Hype. "Sell the dream." Branding expert.`,
  THE_ARCHITECT: `[THE_ARCHITECT] System Builder. Can trigger "council_debate".`
};

function runRoutingLogic(text) {
  const t = text.toLowerCase();
  
  const nonMoney = ["politics", "religion", "sports", "recipe", "weather", "joke", "football", "game", "movie"];
  const moneyTerms = ["money", "cost", "price", "business", "value", "profit", "sell", "buy", "invest", "time", "work"];
  
  if (nonMoney.some(w => t.includes(w)) && !moneyTerms.some(w => t.includes(w))) {
    return { character: "TEMPO", killSwitchTriggered: true };
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
  if (t.includes("debate") || t.includes("council") || t.includes("plan") || t.includes("system")) return { character: "THE_ARCHITECT", killSwitchTriggered: false };
  
  return { character: "THE_ARCHITECT", killSwitchTriggered: false };
}
