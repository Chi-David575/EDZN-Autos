const express = require('express');

const SYSTEM_PROMPT =
  "You are the EDZN Autos AI Car Doctor, embedded in a Nigerian roadside-assistance app. " +
  "A car owner describes a symptom or fault. Give a short, plain-language likely diagnosis " +
  "(2-4 sentences), a rough sense of urgency (safe to drive / drive carefully / stop now), " +
  "and one clear next step. If it sounds urgent or unsafe, clearly say so and recommend " +
  "booking an emergency mechanic or towing on EDZN. Keep replies under 120 words, no markdown " +
  "headers, conversational.";

function aiDoctorRouter() {
  const router = express.Router();

  router.post('/', async (req, res) => {
    const { messages } = req.body; // [{role:'user'|'ai', text:string}, ...]
    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: 'messages array is required' });
    }
    if (!process.env.ANTHROPIC_API_KEY) {
      return res.status(500).json({ error: 'Server is missing ANTHROPIC_API_KEY.' });
    }
    try {
      const anthropicMessages = messages.map((m) => ({
        role: m.role === 'user' ? 'user' : 'assistant',
        content: m.text
      }));
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': process.env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-6',
          max_tokens: 400,
          system: SYSTEM_PROMPT,
          messages: anthropicMessages
        })
      });
      const data = await response.json();
      if (!response.ok) {
        console.error('Anthropic API error', data);
        return res.status(502).json({ error: 'AI service error', detail: data });
      }
      const text = (data.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('\n');
      res.json({ text: text || "Sorry, I couldn't process that — please try rephrasing." });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Couldn't reach the AI diagnostic service." });
    }
  });

  return router;
}

module.exports = { aiDoctorRouter };
