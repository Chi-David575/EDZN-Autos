const express = require('express');
const { authenticateToken } = require('../src/auth');

const SYSTEM_PROMPT =
  "You are the EDZN Autos AI Car Doctor, embedded in a Nigerian roadside-assistance app. " +
  "A car owner describes a symptom or fault. Give a short, plain-language likely diagnosis " +
  "(2-4 sentences), a rough sense of urgency (safe to drive / drive carefully / stop now), " +
  "and one clear next step. If it sounds urgent or unsafe, clearly say so and recommend " +
  "booking an emergency mechanic or towing on EDZN. Keep replies under 120 words, no markdown " +
  "headers, conversational.";

const MAX_MESSAGES = 20;
const MAX_TEXT = 2000;

function aiDoctorRouter() {
  const router = express.Router();

  router.post('/', authenticateToken, async (req, res) => {
    const { messages } = req.body;
    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: 'messages array is required' });
    }
    if (messages.length > MAX_MESSAGES) {
      return res.status(400).json({ error: 'Too many messages.' });
    }
    if (!process.env.ANTHROPIC_API_KEY) {
      return res.status(500).json({ error: 'Server is missing ANTHROPIC_API_KEY.' });
    }
    try {
      const anthropicMessages = messages.slice(-MAX_MESSAGES).map((m) => ({
        role: m.role === 'user' ? 'user' : 'assistant',
        content: String(m.text || '').slice(0, MAX_TEXT)
      }));
      if (!anthropicMessages.some((m) => m.role === 'user' && m.content.trim())) {
        return res.status(400).json({ error: 'A user message is required.' });
      }
      if (anthropicMessages[0].role !== 'user') {
        anthropicMessages.unshift({ role: 'user', content: 'Please diagnose this car issue.' });
      }

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
        return res.status(502).json({ error: 'AI service error' });
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
