/**
 * ═══════════════════════════════════════════════════════════════════════════
 * MONEY AI — Cloudflare Worker Bridge (Debug Version)
 * Connects to Gemini 1.5 Flash API
 * ═══════════════════════════════════════════════════════════════════════════
 */

const CONFIG = {
  GEMINI_URL: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent',
  MAX_TOKENS: 512,
  TEMPERATURE: 0.8
};

const SYSTEM_PROMPT = `You are a Money AI mentor helping someone transform from "Rush" (survival mode) to "Rich" (systems-based abundance).

RULES:
- Maximum 3-4 sentences per response
- Always end with ONE actionable question or task
- Be direct, warm, slightly provocative
- Use metaphors from farming, hunting, building

You are OMAR, the Simplifier. Tagline: "Make it easy."
Style: Cuts through complexity. Makes the next step obvious.
Tone: Friendly, direct, strategic laziness.`;

// CORS headers
function getCorsHeaders(request) {
  const origin = request.headers.get('Origin') || '*';
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400'
  };
}

export default {
  async fetch(request, env, ctx) {
    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: getCorsHeaders(request) });
    }

    // Friendly GET response
    if (request.method === 'GET') {
      const hasKey = !!env.GEMINI_API_KEY;
      const keyPreview = hasKey ? env.GEMINI_API_KEY.slice(0, 10) + '...' : 'NOT SET';
      
      const html = `<!DOCTYPE html>
<html>
<head><title>Money AI Bridge</title>
<style>
  body { font-family: system-ui; background: #0a0c10; color: #f1f5f9; 
         display: flex; align-items: center; justify-content: center; 
         min-height: 100vh; margin: 0; }
  .card { background: #12151c; padding: 40px; border-radius: 16px; 
          text-align: center; border: 1px solid #1a1f2a; max-width: 500px; }
  h1 { color: #f59e0b; margin: 0 0 10px; }
  p { color: #94a3b8; margin: 10px 0; }
  .status { display: inline-block; padding: 6px 16px; border-radius: 20px; 
            font-size: 13px; margin: 10px 0; font-weight: 600; }
  .ok { background: #22c55e22; color: #22c55e; }
  .err { background: #ef444422; color: #ef4444; }
  code { background: #1a1f2a; padding: 4px 8px; border-radius: 4px; font-size: 12px; }
  .debug { text-align: left; background: #1a1f2a; padding: 16px; 
           border-radius: 8px; margin-top: 20px; font-size: 12px; }
</style>
</head>
<body>
  <div class="card">
    <h1>💰 Money AI Bridge</h1>
    <p>Cloudflare Worker → Gemini 1.5 Flash</p>
    
    <div class="status ${hasKey ? 'ok' : 'err'}">
      ${hasKey ? '✓ API Key Configured' : '✗ API Key Missing'}
    </div>
    
    <div class="debug">
      <strong>Debug Info:</strong><br><br>
      API Key: <code>${keyPreview}</code><br>
      Endpoint: <code>POST /</code><br>
      Status: ${hasKey ? 'Ready to receive requests' : 'Add GEMINI_API_KEY secret in Settings'}
    </div>
    
    ${!hasKey ? `
    <p style="margin-top: 20px; font-size: 13px;">
      <strong>To fix:</strong> Go to Settings → Variables and Secrets → Add:<br>
      Name: <code>GEMINI_API_KEY</code><br>
      Value: Your key from Google AI Studio
    </p>
    ` : ''}
  </div>
</body>
</html>`;
      return new Response(html, { headers: { 'Content-Type': 'text/html' } });
    }

    // Only POST for API
    if (request.method !== 'POST') {
      return new Response(JSON.stringify({ error: 'Method not allowed' }), {
        status: 405,
        headers: { ...getCorsHeaders(request), 'Content-Type': 'application/json' }
      });
    }

    try {
      // Check for API key
      if (!env.GEMINI_API_KEY) {
        return new Response(JSON.stringify({
          error: 'GEMINI_API_KEY not configured',
          fix: 'Go to Worker Settings → Variables and Secrets → Add GEMINI_API_KEY'
        }), {
          status: 500,
          headers: { ...getCorsHeaders(request), 'Content-Type': 'application/json' }
        });
      }

      // Parse request
      let body;
      try {
        body = await request.json();
      } catch (e) {
        return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
          status: 400,
          headers: { ...getCorsHeaders(request), 'Content-Type': 'application/json' }
        });
      }

      const { mentor, message, history } = body;

      if (!message || typeof message !== 'string') {
        return new Response(JSON.stringify({ error: 'Message required' }), {
          status: 400,
          headers: { ...getCorsHeaders(request), 'Content-Type': 'application/json' }
        });
      }

      // Build Gemini request
      const contents = [];
      
      // Add history if provided
      if (history && Array.isArray(history)) {
        for (const msg of history.slice(-6)) {
          contents.push({
            role: msg.role === 'user' ? 'user' : 'model',
            parts: [{ text: msg.text }]
          });
        }
      }
      
      // Add current message
      contents.push({
        role: 'user',
        parts: [{ text: message }]
      });

      // Call Gemini API
      const geminiResponse = await fetch(`${CONFIG.GEMINI_URL}?key=${env.GEMINI_API_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents,
          systemInstruction: {
            parts: [{ text: SYSTEM_PROMPT }]
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

      // Handle Gemini errors
      if (!geminiResponse.ok) {
        const errorText = await geminiResponse.text();
        console.error('Gemini API error:', errorText);
        
        return new Response(JSON.stringify({
          error: 'Gemini API error',
          status: geminiResponse.status,
          details: errorText.slice(0, 500)
        }), {
          status: 502,
          headers: { ...getCorsHeaders(request), 'Content-Type': 'application/json' }
        });
      }

      const data = await geminiResponse.json();
      
      // Extract reply
      const reply = data.candidates?.[0]?.content?.parts?.[0]?.text;
      
      if (!reply) {
        return new Response(JSON.stringify({
          error: 'No response from Gemini',
          rawResponse: JSON.stringify(data).slice(0, 500)
        }), {
          status: 500,
          headers: { ...getCorsHeaders(request), 'Content-Type': 'application/json' }
        });
      }

      // Detect focus
      const lower = message.toLowerCase();
      let focus = 'general';
      if (/debt|bill|loan|owe|rent|payment/i.test(lower)) focus = 'debts';
      else if (/business|startup|sell|product|service/i.test(lower)) focus = 'business';
      else if (/job|work|salary|boss|career/i.test(lower)) focus = 'jobs';
      else if (/time|hour|waste|scroll|schedule/i.test(lower)) focus = 'time';

      // Return success response
      return new Response(JSON.stringify({
        reply,
        mentor: mentor || 'omar',
        focus,
        scoreDelta: 0
      }), {
        status: 200,
        headers: { ...getCorsHeaders(request), 'Content-Type': 'application/json' }
      });

    } catch (error) {
      console.error('Worker error:', error);
      
      return new Response(JSON.stringify({
        error: 'Internal server error',
        message: error.message,
        stack: error.stack?.slice(0, 300)
      }), {
        status: 500,
        headers: { ...getCorsHeaders(request), 'Content-Type': 'application/json' }
      });
    }
  }
};
