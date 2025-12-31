/**
 * ═══════════════════════════════════════════════════════════════════════════
 * MONEY AI — Cloudflare Worker Bridge
 * Connects to Gemini 1.5 Flash API
 * 
 * Deploy: wrangler deploy
 * Free Tier: 100k requests/day (Cloudflare) + 1500 req/day (Gemini)
 * ═══════════════════════════════════════════════════════════════════════════
 */

// ═══════════════════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════

const CONFIG = {
  // Gemini API endpoint
  GEMINI_URL: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent',
  
  // Rate limiting
  RATE_LIMIT_PER_IP: 30,      // requests per window
  RATE_LIMIT_WINDOW: 3600,    // 1 hour in seconds
  
  // Response limits
  MAX_TOKENS: 512,
  TEMPERATURE: 0.8,
  
  // CORS origins (add your domains)
  ALLOWED_ORIGINS: [
    'http://localhost:3000',
    'http://localhost:5500',
    'http://127.0.0.1:5500',
    'https://your-app.pages.dev',
    'https://moneyai.app',
    'https://human1stai.rr-rshemodel.workers.dev',
    'null' // For local file:// testing
  ]
};

// ═══════════════════════════════════════════════════════════════════════════
// MENTOR SYSTEM PROMPTS
// ═══════════════════════════════════════════════════════════════════════════

const SYSTEM_PROMPTS = {
  base: `You are a Money AI mentor helping someone transform from "Rush" (survival mode, trading time for money, panic-driven) to "Rich" (systems-based, leveraged, calm abundance).

CORE FRAMEWORKS YOU TEACH:
1. **Wheat vs Tomatoes**: Wheat = things people NEED (food, transport, health). Tomatoes = things people WANT (luxury, premium). Wheat businesses survive recessions. Always ask: "Is this wheat or tomatoes?"

2. **Time Audit**: Track hours as currency. SHE (Standard Human Efficiency) = 5 productive units/hour. Most people waste 60% of waking hours on $0-paying activities.

3. **Money Map Stages**:
   - HUNT: Trading time directly for money (jobs, freelance)
   - PEN: Capturing "first sheep" - one repeatable client/system
   - FARM: Multiple pens working together
   - CANAL: Systems that flow without you

4. **5 Motivators**: Detect what drives them:
   - Laziness → Show them shortcuts and automation
   - Speed → Give 48-hour action plans
   - Greed/Ambition → Show scaling paths
   - Satisfaction → Focus on mastery and meaning
   - Security → Build safety nets first

RESPONSE RULES:
- Maximum 3-4 sentences per response
- Always end with ONE actionable question or task
- Never use corporate jargon or motivational fluff
- Be direct, warm, slightly provocative
- Use metaphors from farming, hunting, building
- Detect their pain (debts, no job, weak business, wasted time) and address it`,

  mentors: {
    omar: `You are OMAR, the Simplifier.
Tagline: "Make it easy."
Style: Cuts through complexity. Eliminates decision fatigue. Makes the next step obvious.
Tone: Friendly, direct, slightly lazy (in a strategic way). You hate unnecessary effort.
Signature moves: "What's the ONE thing?" / "Delete before you add." / "If it's not simple, it's not ready."`,

    zaid: `You are ZAID, the Mover.
Tagline: "Fast wins only."
Style: 48-hour action plans. No theory, just movement. Speed over perfection.
Tone: Energetic, impatient with excuses, motivating through momentum.
Signature moves: "What can you do in the next 2 hours?" / "Send 3 messages NOW." / "Stop planning, start testing."`,

    kareem: `You are KAREEM, the Builder.
Tagline: "More. But smarter."
Style: Systems thinking. Leverage. Build once, benefit forever.
Tone: Strategic, ambitious, sees patterns others miss.
Signature moves: "What are you repeating that could be a system?" / "Your first sheep matters more than your hundredth." / "Low leverage is expensive."`,

    maya: `You are MAYA, the Architect.
Tagline: "Discipline is freedom."
Style: Structure, frameworks, organized plans. 3 lanes: Cash / Growth / Assets.
Tone: Calm, methodical, reassuringly organized.
Signature moves: "Let's build your week in 3 lanes." / "Chaos is expensive." / "What do you control?"`,

    salma: `You are SALMA, the Stabilizer.
Tagline: "Breathe. Then move."
Style: Reduces panic. Finds calm in chaos. Nervous system regulation.
Tone: Warm, grounding, never judgmental about fear.
Signature moves: "You're not behind. You're overloaded." / "What's ONE thing you control right now?" / "Panic makes bad decisions."`,

    hakim: `You are HAKIM, the Storyteller.
Tagline: "Stories hide truth better than facts."
Style: Teaches through parables, metaphors, ancient wisdom. Weekly wisdom only.
Tone: Wise, patient, speaks in stories that land hours later.
Signature moves: Uses farmer parables, desert metaphors, river analogies. Never gives direct advice - only stories that illuminate.`
  }
};

// ═══════════════════════════════════════════════════════════════════════════
// FOCUS DETECTION
// ═══════════════════════════════════════════════════════════════════════════

function detectFocus(message) {
  const lower = message.toLowerCase();
  
  if (/debt|bill|loan|owe|rent|payment|mortgage|credit/i.test(lower)) {
    return { focus: 'debts', context: 'User is dealing with debt/bills. Focus on damage control, buying time, and finding quick income.' };
  }
  if (/business|startup|sell|product|service|customer|client|idea/i.test(lower)) {
    return { focus: 'business', context: 'User has a business idea. Apply Wheat vs Tomatoes test. Check necessity level.' };
  }
  if (/job|work|salary|boss|employee|hire|career|fired|quit/i.test(lower)) {
    return { focus: 'jobs', context: 'User is dealing with employment. Map their time-for-money exchange. Find leverage points.' };
  }
  if (/wheat|tomato|need|want|essential|luxury/i.test(lower)) {
    return { focus: 'wheat', context: 'User is thinking about value hierarchy. Help them push their offer up the necessity ladder.' };
  }
  if (/time|hour|waste|scroll|watch|sleep|schedule|busy/i.test(lower)) {
    return { focus: 'time', context: 'User has time leaks. Help them do a Time Audit. Find $0-paying hours to convert.' };
  }
  
  return { focus: 'general', context: 'General money mindset discussion. Identify their main pain point first.' };
}

// ═══════════════════════════════════════════════════════════════════════════
// RATE LIMITING (Using Cloudflare KV)
// ═══════════════════════════════════════════════════════════════════════════

async function checkRateLimit(ip, env) {
  if (!env.RATE_LIMITER) {
    // KV not configured, allow request
    return { allowed: true, remaining: CONFIG.RATE_LIMIT_PER_IP };
  }

  const key = `ratelimit:${ip}`;
  const data = await env.RATE_LIMITER.get(key, 'json');
  const now = Math.floor(Date.now() / 1000);

  if (!data || data.resetAt < now) {
    // New window
    await env.RATE_LIMITER.put(key, JSON.stringify({
      count: 1,
      resetAt: now + CONFIG.RATE_LIMIT_WINDOW
    }), { expirationTtl: CONFIG.RATE_LIMIT_WINDOW });
    
    return { allowed: true, remaining: CONFIG.RATE_LIMIT_PER_IP - 1 };
  }

  if (data.count >= CONFIG.RATE_LIMIT_PER_IP) {
    return { 
      allowed: false, 
      remaining: 0,
      resetAt: data.resetAt 
    };
  }

  // Increment count
  await env.RATE_LIMITER.put(key, JSON.stringify({
    count: data.count + 1,
    resetAt: data.resetAt
  }), { expirationTtl: data.resetAt - now });

  return { allowed: true, remaining: CONFIG.RATE_LIMIT_PER_IP - data.count - 1 };
}

// ═══════════════════════════════════════════════════════════════════════════
// CORS HANDLING
// ═══════════════════════════════════════════════════════════════════════════

function getCorsHeaders(request) {
  const origin = request.headers.get('Origin') || '';
  const isAllowed = CONFIG.ALLOWED_ORIGINS.some(o => 
    origin === o || origin.endsWith('.pages.dev') || origin.includes('localhost')
  );

  return {
    'Access-Control-Allow-Origin': isAllowed ? origin : CONFIG.ALLOWED_ORIGINS[0],
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400'
  };
}

function handleOptions(request) {
  return new Response(null, {
    status: 204,
    headers: getCorsHeaders(request)
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// GEMINI API CALL
// ═══════════════════════════════════════════════════════════════════════════

async function callGemini(systemPrompt, userMessage, history, env) {
  const apiKey = env.GEMINI_API_KEY;
  
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY not configured');
  }

  // Build conversation contents
  const contents = [];
  
  // Add history if provided
  if (history && history.length > 0) {
    for (const msg of history.slice(-6)) { // Last 6 messages for context
      contents.push({
        role: msg.role === 'user' ? 'user' : 'model',
        parts: [{ text: msg.text }]
      });
    }
  }
  
  // Add current user message
  contents.push({
    role: 'user',
    parts: [{ text: userMessage }]
  });

  const response = await fetch(`${CONFIG.GEMINI_URL}?key=${apiKey}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      contents,
      systemInstruction: {
        parts: [{ text: systemPrompt }]
      },
      generationConfig: {
        maxOutputTokens: CONFIG.MAX_TOKENS,
        temperature: CONFIG.TEMPERATURE,
        topP: 0.95,
        topK: 40
      },
      safetySettings: [
        { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_ONLY_HIGH' },
        { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_ONLY_HIGH' },
        { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_ONLY_HIGH' },
        { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_ONLY_HIGH' }
      ]
    })
  });

  if (!response.ok) {
    const error = await response.text();
    console.error('Gemini API error:', error);
    throw new Error(`Gemini API error: ${response.status}`);
  }

  const data = await response.json();
  
  if (!data.candidates || !data.candidates[0]?.content?.parts?.[0]?.text) {
    throw new Error('Invalid response from Gemini');
  }

  return data.candidates[0].content.parts[0].text;
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN HANDLER
// ═══════════════════════════════════════════════════════════════════════════

export default {
  async fetch(request, env, ctx) {
    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return handleOptions(request);
    }

    // Friendly response for GET requests (browser visits)
    if (request.method === 'GET') {
      const html = `<!DOCTYPE html>
<html>
<head>
  <title>Money AI Bridge</title>
  <style>
    body { 
      font-family: system-ui; 
      background: #0a0c10; 
      color: #f1f5f9; 
      display: flex; 
      align-items: center; 
      justify-content: center; 
      min-height: 100vh; 
      margin: 0;
    }
    .card { 
      background: #12151c; 
      padding: 40px; 
      border-radius: 16px; 
      text-align: center;
      border: 1px solid #1a1f2a;
      max-width: 400px;
    }
    h1 { color: #f59e0b; margin: 0 0 10px; }
    p { color: #94a3b8; margin: 10px 0; }
    .status { 
      display: inline-block;
      padding: 4px 12px; 
      background: #22c55e22; 
      color: #22c55e; 
      border-radius: 20px; 
      font-size: 12px;
      margin-top: 20px;
    }
    code { 
      background: #1a1f2a; 
      padding: 2px 8px; 
      border-radius: 4px; 
      font-size: 13px;
    }
  </style>
</head>
<body>
  <div class="card">
    <h1>💰 Money AI Bridge</h1>
    <p>Cloudflare Worker → Gemini 1.5 Flash</p>
    <p style="font-size: 13px;">This endpoint accepts <code>POST</code> requests only.</p>
    <span class="status">✓ Worker Online</span>
  </div>
</body>
</html>`;
      return new Response(html, {
        headers: { 'Content-Type': 'text/html' }
      });
    }

    // Only allow POST for API
    if (request.method !== 'POST') {
      return new Response(JSON.stringify({ error: 'Method not allowed' }), {
        status: 405,
        headers: { ...getCorsHeaders(request), 'Content-Type': 'application/json' }
      });
    }

    try {
      // Rate limiting
      const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
      const rateLimit = await checkRateLimit(ip, env);

      if (!rateLimit.allowed) {
        return new Response(JSON.stringify({
          error: 'Rate limit exceeded',
          resetAt: rateLimit.resetAt
        }), {
          status: 429,
          headers: {
            ...getCorsHeaders(request),
            'Content-Type': 'application/json',
            'X-RateLimit-Remaining': '0',
            'X-RateLimit-Reset': String(rateLimit.resetAt)
          }
        });
      }

      // Parse request
      const body = await request.json();
      const { mentor, message, history, sessionId } = body;

      if (!message || typeof message !== 'string') {
        return new Response(JSON.stringify({ error: 'Message required' }), {
          status: 400,
          headers: { ...getCorsHeaders(request), 'Content-Type': 'application/json' }
        });
      }

      // Validate mentor
      const mentorId = mentor || 'omar';
      const mentorPrompt = SYSTEM_PROMPTS.mentors[mentorId];
      
      if (!mentorPrompt) {
        return new Response(JSON.stringify({ error: 'Invalid mentor' }), {
          status: 400,
          headers: { ...getCorsHeaders(request), 'Content-Type': 'application/json' }
        });
      }

      // Detect focus and build context
      const { focus, context } = detectFocus(message);
      
      // Compose full system prompt
      const fullSystemPrompt = `${SYSTEM_PROMPTS.base}

${mentorPrompt}

CURRENT CONTEXT:
${context}

Remember: Keep responses under 4 sentences. End with an action or question.`;

      // Call Gemini
      const reply = await callGemini(fullSystemPrompt, message, history, env);

      // Analyze response for Rush/Rich scoring
      const rushPatterns = /worry|scared|panic|stress|stuck|broke|can't|hate|tired/i;
      const richPatterns = /plan|action|build|sell|create|system|automate|test/i;
      
      let scoreDelta = 0;
      if (rushPatterns.test(message)) scoreDelta -= 2;
      if (richPatterns.test(message)) scoreDelta += 3;
      if (richPatterns.test(reply)) scoreDelta += 1;

      // Return response
      return new Response(JSON.stringify({
        reply,
        mentor: mentorId,
        focus,
        scoreDelta,
        rateLimitRemaining: rateLimit.remaining
      }), {
        status: 200,
        headers: {
          ...getCorsHeaders(request),
          'Content-Type': 'application/json',
          'X-RateLimit-Remaining': String(rateLimit.remaining)
        }
      });

    } catch (error) {
      console.error('Worker error:', error);
      
      return new Response(JSON.stringify({
        error: 'Internal server error',
        message: error.message
      }), {
        status: 500,
        headers: { ...getCorsHeaders(request), 'Content-Type': 'application/json' }
      });
    }
  }
};
