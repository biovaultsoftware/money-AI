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
    // 1. Handle CORS (Essential for your HTML to talk to the Worker)
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    try {
      // 2. THE 502 FIX: Read the body text fully to avoid ReadableStream errors on mobile
      const bodyText = await request.text();
      const { message, persona } = JSON.parse(bodyText);

      // 3. SECURE API CALL
      const response = await fetch(`${CONFIG.GEMINI_URL}?key=${env.GEMINI_API_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [{ text: `System: You are ${persona || 'Omar'}. Keep it to 3 sentences. End with a task.\nUser: ${message}` }]
          }],
          generationConfig: {
            // NEW IN GEMINI 3: Controlled reasoning levels
            // Use 'minimal' for the fastest "Money AI" experience
            thinking_level: 'minimal' 
          }
        })
      });

      const data = await response.json();
      
      // Handle Google API errors
      if (data.error) throw new Error(data.error.message);

      const reply = data.candidates[0].content.parts[0].text;

      return new Response(JSON.stringify({ reply }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });

    } catch (err) {
      return new Response(JSON.stringify({ error: 'Bridge Error', details: err.message }), {
        status: 502,
        headers: corsHeaders
      });
    }
  }
};
