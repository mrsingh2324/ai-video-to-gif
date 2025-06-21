// controllers/chatController.js
const axios = require('axios');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const AUDIO_DIR = './audio';

const chatWithDeepSeek = async (req, res) => {
  const { prompt, baseName } = req.body;

  if (!prompt || !baseName) {
    return res.status(400).json({ error: 'Both prompt and baseName are required.' });
  }

  try {
    const ext = fs.readFileSync(path.join(AUDIO_DIR, `${baseName}.ext.txt`), 'utf-8');
    const transcriptJson = JSON.parse(fs.readFileSync(path.join(AUDIO_DIR, `${baseName}.timestamps.json`), 'utf-8'));

    const formatted = Object.entries(transcriptJson)
      .map(([k, v]) => `${k}: ${v}`)
      .join('\n');
    const deepSeekPrompt = `
You are given a video transcript with timestamps. Your task is:
- Return 2-3 clip objects
- Each clip must include start (number), end (number), and text (string)
- Each clip should be 3–8 seconds long
- Return valid JSON only: [{"start":3,"end":8,"text":"..."}]

Transcript:
${formatted}
Prompt: "${prompt}"
`;

    const response = await axios.post(
      'https://openrouter.ai/api/v1/chat/completions',
      {
        model: 'deepseek/deepseek-r1-0528-qwen3-8b:free',
        messages: [
          { role: 'system', content: 'You are a helpful assistant.' },
          { role: 'user', content: deepSeekPrompt }
        ]
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'http://localhost:3000',
          'X-Title': 'AI-Gif-Creator'
        }
      }
    );

    let content = response.data.choices[0].message.content.trim();
    if (content.startsWith('```')) content = content.replace(/```json|```/g, '').trim();

    let clips;
    try {
      const parsed = JSON.parse(content);
      if (Array.isArray(parsed)) {
        clips = parsed;
      } else if (Array.isArray(parsed.clips)) {
        clips = parsed.clips;
      } else if (typeof parsed === 'object' && parsed !== null) {
        clips = Object.values(parsed);
      } else {
        throw new Error('AI returned unrecognized format');
      }
    } catch (err) {
      console.error(`❌ Failed to parse DeepSeek response. Raw content:\n${content}`);
      return res.status(500).json({ error: 'Invalid response from DeepSeek', detail: err.message });
    }

    res.json({ clips });
  } catch (err) {
    console.error(`DeepSeek processing error: ${err.stack}`);
    res.status(500).json({ error: 'DeepSeek chat processing failed', detail: err.message });
  }
};

module.exports = { chatWithDeepSeek };