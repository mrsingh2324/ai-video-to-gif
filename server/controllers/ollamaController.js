// controllers/generateClipController.js
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const ffmpeg = require('fluent-ffmpeg');
const winston = require('winston');

const AUDIO_DIR = './audio';
const UPLOAD_DIR = './uploads';
const OUTPUT_DIR = './output';

exports.generateClip = async (req, res) => {
  try {
    const { prompt, baseName } = req.body;
    const ext = fs.readFileSync(path.join(AUDIO_DIR, `${baseName}.ext.txt`), 'utf-8');
    const videoPath = path.join(UPLOAD_DIR, `${baseName}${ext}`);
    const structured = JSON.parse(fs.readFileSync(path.join(AUDIO_DIR, `${baseName}.timestamps.json`), 'utf-8'));

    const formatted = Object.entries(structured).map(([k, v]) => `${k}: ${v}`).join('\n');
    const ollamaPrompt = `
You are given a video transcript with timestamps. Your task is:
- Return 2-3 clip objects
- Each clip must include start (number), end (number), and text (string)
- Each clip should be 3–8 seconds long
- Return valid JSON only: [{"start":3,"end":8,"text":"..."}]

Transcript:
${formatted}
Prompt: "${prompt}"
`;

    logger.info('Sending prompt to Ollama...');
    const aiRes = await axios.post('http://localhost:11434/api/chat', {
      model: 'phi3',
      messages: [{ role: 'user', content: ollamaPrompt }],
      format: 'json',
      stream: false
    });

    let content = aiRes.data.message.content.trim();
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
      logger.info(`Received ${clips.length} clip suggestions`);
    } catch (err) {
      logger.error(`❌ Failed to parse Ollama response. Raw content:\n${content}`);
      logger.error(`Parsing error: ${err.message}`);
      return res.status(500).json({ error: 'Invalid response from Ollama', detail: err.message });
    }

    const gifPaths = [];
    let gifIndex = 0;

    for (let i = 0; i < clips.length && gifIndex < 3; i++) {
      const clip = clips[i];

      if (
        typeof clip.start !== 'number' ||
        typeof clip.end !== 'number' ||
        isNaN(clip.start) || isNaN(clip.end) ||
        clip.end <= clip.start
      ) {
        logger.warn(`⚠️ Skipping invalid clip [${i}]: ${JSON.stringify(clip)}`);
        continue;
      }

      const caption = (clip.text || '').replace(/[':\\]/g, '').substring(0, 50);
      const gifPath = path.join(OUTPUT_DIR, `${baseName}_clip_${gifIndex + 1}.gif`);

      await new Promise((resolve, reject) => {
        ffmpeg(videoPath)
          .seekInput(clip.start)
          .duration(clip.end - clip.start)
          .size('480x?')
          .fps(15)
          .format('gif')
          .videoFilters(`drawtext=text='${caption}':fontsize=36:fontcolor=white:x=(w-text_w)/2:y=h-th-30:box=1:boxcolor=black@0.8:boxborderw=6`)
          .on('start', cmd => logger.debug(`FFmpeg GIF: ${cmd}`))
          .on('end', () => {
            logger.info(`✅ GIF ${gifIndex + 1} created: ${gifPath}`);
            resolve();
          })
          .on('error', err => {
            logger.error(`GIF FFmpeg error: ${err.message}`);
            reject(err);
          })
          .save(gifPath);
      });

      gifPaths.push({ filename: path.basename(gifPath), url: `/output/${path.basename(gifPath)}` });
      gifIndex++;
    }

    res.json({ gifs: gifPaths });
  } catch (err) {
    logger.error(`GIF generation failed: ${err.stack}`);
    res.status(500).json({ error: 'GIF generation error', detail: err.message });
  }
};
