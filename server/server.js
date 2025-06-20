// server.js
const express = require('express');
const multer = require('multer');
const ffmpeg = require('fluent-ffmpeg');
const fs = require('fs');
const cors = require('cors');
const path = require('path');
const axios = require('axios');
const { spawn } = require('child_process');
const winston = require('winston');
require('dotenv').config();

const app = express();
const port = 5005;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// === Logger ===
const logDir = 'logs';
if (!fs.existsSync(logDir)) fs.mkdirSync(logDir);

const logger = winston.createLogger({
  level: 'debug',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.printf(({ level, message, timestamp }) => `[${timestamp}] ${level.toUpperCase()} — ${message}`)
  ),
  transports: [
    new winston.transports.File({ filename: path.join(logDir, 'server.log') }),
    new winston.transports.Console()
  ]
});

// === Directories ===
const UPLOAD_DIR = './uploads';
const AUDIO_DIR = './audio';
const OUTPUT_DIR = './output';
[UPLOAD_DIR, AUDIO_DIR, OUTPUT_DIR].forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir);
});

// === Multer Setup ===
const storage = multer.diskStorage({
  destination: UPLOAD_DIR,
  filename: (req, file, cb) => {
    const uniqueName = `${Date.now()}-${Math.random().toString(36).substring(7)}${path.extname(file.originalname)}`;
    cb(null, uniqueName);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.match(/video\/(mp4|quicktime)/)) return cb(new Error('Invalid file type'));
    cb(null, true);
  }
});
app.use('/output', express.static(OUTPUT_DIR));

// === Upload & Transcribe ===
app.post('/api/upload', upload.single('video'), async (req, res) => {
  try {
    if (!req.file) throw new Error('No file uploaded');

    const videoPath = req.file.path;
    const baseName = path.basename(videoPath, path.extname(videoPath));
    const audioPath = path.join(AUDIO_DIR, `${baseName}.mp3`);
    const transcriptJsonPath = path.join(AUDIO_DIR, `${baseName}.json`);
    const extPath = path.join(AUDIO_DIR, `${baseName}.ext.txt`);
    fs.writeFileSync(extPath, path.extname(videoPath));

    logger.info(`Uploaded video: ${videoPath}`);

    await new Promise((resolve, reject) => {
      ffmpeg(videoPath)
        .noVideo()
        .audioCodec('libmp3lame')
        .on('start', cmd => logger.debug(`FFmpeg start: ${cmd}`))
        .on('error', err => {
          logger.error(`FFmpeg error: ${err.message}`);
          reject(err);
        })
        .on('end', () => {
          logger.info(`Audio extracted to: ${audioPath}`);
          resolve();
        })
        .save(audioPath);
    });

    await new Promise((resolve, reject) => {
      const whisper = spawn('whisper', [audioPath, '--model', 'base', '--language', 'en', '--output_format', 'json', '--output_dir', AUDIO_DIR]);
      whisper.stdout.on('data', data => logger.debug(`Whisper stdout: ${data.toString()}`));
      whisper.stderr.on('data', data => logger.warn(`Whisper stderr: ${data.toString()}`));
      whisper.on('close', code => {
        if (code === 0) {
          logger.info(`Whisper finished: ${transcriptJsonPath}`);
          resolve();
        } else {
          reject(new Error(`Whisper failed with code ${code}`));
        }
      });
    });

    const transcriptJson = JSON.parse(fs.readFileSync(transcriptJsonPath, 'utf-8'));
    const transcript = transcriptJson.segments.map(s => s.text).join(' ');
    const timestamped = Object.fromEntries(transcriptJson.segments.map(s => [`${s.start.toFixed(2)}-${s.end.toFixed(2)}`, s.text]));
    fs.writeFileSync(path.join(AUDIO_DIR, `${baseName}.timestamps.json`), JSON.stringify(timestamped, null, 2));

    res.json({ transcript, baseName });
  } catch (err) {
    logger.error(`Upload error: ${err.stack}`);
    res.status(500).json({ error: 'Upload failed', detail: err.message });
  }
});

// === Generate GIFs ===
app.post('/api/generate-clip', async (req, res) => {
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
        // Convert object to sorted array by key
        clips = Object.values(parsed);
      } else {
        throw new Error('AI returned an unrecognized format');
      }

      logger.info(`Received ${clips.length} clip suggestions`);
    } catch (err) {
      logger.error(`❌ Failed to parse Ollama response. Raw content:\n${content}`);
      logger.error(`Parsing error: ${err.message}`);
      return res.status(500).json({ error: 'Invalid response from Ollama', detail: err.message });
    }


    logger.info(`Received ${clips.length} clip suggestions`);

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
    logger.warn(`⚠️ Skipping invalid clip [${i}]:`, JSON.stringify(clip));
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
});

// === List GIFs ===
app.get('/api/gifs/:baseName', (req, res) => {
  const { baseName } = req.params;
  const gifs = fs.readdirSync(OUTPUT_DIR)
    .filter(f => f.startsWith(baseName) && f.endsWith('.gif'))
    .map(f => ({ filename: f, url: `/output/${f}` }));
  logger.info(`Listing ${gifs.length} GIFs for ${baseName}`);
  res.json({ gifs });
});

app.listen(port, () => logger.info(`🚀 Server running on http://localhost:${port}`));
