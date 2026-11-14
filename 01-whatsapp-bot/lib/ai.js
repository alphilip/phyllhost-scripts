// lib/ai.js — .ai <prompt> with a pluggable provider chain.
// Tries Groq, then Gemini, then a free no-key fallback, in that order.
// When no API key is set, the providers that need one are simply skipped.
// Every failure is caught — the command answers with a friendly error
// instead of crashing the bot.
const axios = require('axios');
const config = require('../config');

const SYSTEM_PROMPT =
  'You are a helpful WhatsApp assistant. Keep replies short (under 600 characters) ' +
  'and plain-text friendly: no markdown tables, minimal formatting.';

async function askGroq(prompt) {
  const { groqApiKey, groqModel } = config.ai;
  if (!groqApiKey) return null;
  const { data } = await axios.post(
    'https://api.groq.com/openai/v1/chat/completions',
    {
      model: groqModel,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: prompt }
      ],
      max_tokens: 500,
      temperature: 0.7
    },
    { headers: { Authorization: `Bearer ${groqApiKey}` }, timeout: 30000 }
  );
  const text = data?.choices?.[0]?.message?.content;
  return text ? text.trim() : null;
}

async function askGemini(prompt) {
  const { geminiApiKey, geminiModel } = config.ai;
  if (!geminiApiKey) return null;
  const { data } = await axios.post(
    `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${geminiApiKey}`,
    {
      contents: [{ parts: [{ text: `${SYSTEM_PROMPT}\n\nUser: ${prompt}` }] }],
      generationConfig: { maxOutputTokens: 500, temperature: 0.7 }
    },
    { timeout: 30000 }
  );
  const text = data?.candidates?.[0]?.content?.parts?.map((p) => p.text).join('');
  return text ? text.trim() : null;
}

// Free no-key fallback (Pollinations text endpoint).
async function askFree(prompt) {
  const { data } = await axios.get(
    `https://text.pollinations.ai/${encodeURIComponent(prompt)}`,
    { params: { model: 'openai' }, timeout: 30000, responseType: 'text' }
  );
  const text = typeof data === 'string' ? data.trim() : '';
  return text || null;
}

// Provider chain — add your own provider here by adding one more
// async function above and one line below.
const PROVIDERS = [
  { name: 'Groq', fn: askGroq },
  { name: 'Gemini', fn: askGemini },
  { name: 'free fallback', fn: askFree }
];

/**
 * Ask the AI. Returns { answer, provider } or throws when all providers fail.
 */
async function ask(prompt) {
  if (!prompt || !prompt.trim()) throw new Error('Usage: .ai <prompt>\nExample: .ai Write a short birthday message.');
  const errors = [];
  for (const provider of PROVIDERS) {
    try {
      const answer = await provider.fn(prompt.trim());
      if (answer) return { answer, provider: provider.name };
    } catch (err) {
      errors.push(`${provider.name}: ${err.response?.data?.error?.message || err.message}`);
    }
  }
  throw new Error(
    'AI is unavailable right now (all providers failed). ' +
    'Set GROQ_API_KEY or GEMINI_API_KEY in .env for a reliable provider.\n' +
    errors.join(' | ')
  );
}

module.exports = { ask, askGroq, askGemini, askFree };
