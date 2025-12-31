/**
 * MONEY AI — Cloudflare Worker Bridge (Gemini 3 Optimized)
 * Fixes 502 Bad Gateway and implements Gemini 3 Flash Preview
 */

const CONFIG = {
  // UPGRADED MODEL: gemini-1.5-flash is now deprecated.
  MODEL_ID: 'gemini-3-flash-preview', 
  GEMINI_URL: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent',
};

/**
 * MONEY AI — Cloudflare Worker Bridge (Gemini 3 Optimized)
 * Fixes 502 Bad Gateway and implements Gemini 3 Flash Preview
 */

const CONFIG = {
  // UPGRADED MODEL: gemini-1.5-flash is now deprecated.
  MODEL_ID: 'gemini-3-flash-preview', 
  GEMINI_URL: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent',
};

export default {
  async fetch(request, env) {
    // 1. Handle CORS Preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { 
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST',
          'Access-Control-Allow-Headers': 'Content-Type',
        } 
      });
    }

    try {
      // 2. FIX: Read the body as text FIRST to avoid stream errors
      const bodyText = await request.text();
      if (!bodyText) {
        throw new Error("Empty request body");
      }

      const { message, mentor, history } = JSON.parse(bodyText);

      // 3. SECURE CALL TO GEMINI
      // Ensure you are using the correct model (gemini-3-flash-preview)
      const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent?key=${env.GEMINI_API_KEY}`;

      const response = await fetch(GEMINI_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [{ text: `System: You are ${mentor || 'Omar'}. User: ${message}` }]
          }]
        })
      });

      // 4. Handle non-JSON or error responses from Google
      if (!response.ok) {
        const errTile = await response.text();
        return new Response(JSON.stringify({ error: "Gemini Error", details: errTile }), { 
          status: response.status,
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
        });
      }

      const data = await response.json();
      const reply = data.candidates[0].content.parts[0].text;

      return new Response(JSON.stringify({ reply }), {
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      });

    } catch (err) {
      // This catches the "Unexpected end of JSON input" and returns a helpful 400
      return new Response(JSON.stringify({ error: "Bridge Error", details: err.message }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      });
    }
  }
};
