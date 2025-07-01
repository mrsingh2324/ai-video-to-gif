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
const fileUpload = require('express-fileupload');
const authRoutes = require('./routes/authRoutes');


const app = express();
const port = process.env.PORT || 5005;

// Logging Setup
const logDir = 'logs';
if (!fs.existsSync(logDir)) fs.mkdirSync(logDir);
const logger = winston.createLogger({
  level: 'debug',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.printf(({ level, message, timestamp }) => `[${timestamp}] ${level.toUpperCase()} — ${message}`)
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: path.join(logDir, 'server.log') }),
  ],
});

// Middleware
const allowedOrigins = [
  process.env.FRONTEND_DEV,
  process.env.FRONTEND_PROD
];
app.use(cors({
  origin: (origin, callback) => {
    logger.debug(`🌐 CORS request from: ${origin}`);
    if (!origin || allowedOrigins.includes(origin.replace(/\/$/, ''))) {
      return callback(null, true);
    }
    logger.warn(`❌ Blocked by CORS: ${origin}`);
    return callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
}));



app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// THEN add authRoutes
app.use('/api/auth', authRoutes);

app.use('/output', express.static('./output'));
app.use(fileUpload());
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Credentials', true);
  next();
});


// Directories Setup
const UPLOAD_DIR = './uploads';
const AUDIO_DIR = './audio';
const OUTPUT_DIR = './output';
[UPLOAD_DIR, AUDIO_DIR, OUTPUT_DIR].forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir);
});


// Multer Setup 
const storage = multer.diskStorage({
  destination: UPLOAD_DIR,
  filename: (req, file, cb) => {
    const unique = `${Date.now()}-${Math.random().toString(36).slice(2)}${path.extname(file.originalname)}`;
    cb(null, unique);
  }
});
const upload = multer({ storage });


const { exec } = require('child_process');


app.post('/api/download', async (req, res) => {
  try {
    const { url } = req.body;
    if (!url) return res.status(400).json({ error: 'No URL provided' });

    const baseName = `yt-${Date.now()}`;
    
    const videoPath = path.join(UPLOAD_DIR, `${baseName}.mp4`);
    const audioPath = path.join(AUDIO_DIR, `${baseName}.mp3`);
    const transcriptJsonPath = path.join(AUDIO_DIR, `${baseName}.json`);
    const extPath = path.join(AUDIO_DIR, `${baseName}.ext.txt`);
    
    fs.writeFileSync(extPath, '.mp4');

    logger.info(`🎬 Downloading from: ${url}`);

    // 1. Download YouTube video to uploads folder
    await new Promise((resolve, reject) => {
      const cmd = `yt-dlp -f best -o "${videoPath}" "${url}"`;
      exec(cmd, (error, stdout, stderr) => {
        if (error) {
          logger.error(`yt-dlp error: ${stderr}`);
          return reject(error);
        }
        logger.info(`✅ Downloaded video to: ${videoPath}`);
        resolve();
      });
    });

    // 2. Extract Audio from video
    await new Promise((resolve, reject) => {
      ffmpeg(videoPath)
        .noVideo()
        .audioCodec('libmp3lame')
        .on('start', cmd => logger.debug(`🎧 FFmpeg start: ${cmd}`))
        .on('error', err => {
          logger.error(`❌ FFmpeg error: ${err.message}`);
          reject(err);
        })
        .on('end', () => {
          logger.info(`🎶 Audio extracted to: ${audioPath}`);
          resolve();
        })
        .save(audioPath);
    });

    // 3. Transcribe using Whisper
    await new Promise((resolve, reject) => {
      const whisper = spawn('whisper', [
        audioPath,
        '--model', 'base',
        '--language', 'en',
        '--output_format', 'json',
        '--output_dir', AUDIO_DIR
      ]);

      whisper.stdout.on('data', data => logger.debug(`📤 Whisper stdout: ${data.toString()}`));
      whisper.stderr.on('data', data => logger.warn(`⚠️ Whisper stderr: ${data.toString()}`));
      
      whisper.on('close', code => {
        if (code === 0) {
          logger.info(`📝 Whisper transcription saved: ${transcriptJsonPath}`);
          resolve();
        } else {
          reject(new Error(`Whisper failed with code ${code}`));
        }
      });
    });

    // 4. Read & format transcript
    const transcriptJson = JSON.parse(fs.readFileSync(transcriptJsonPath, 'utf-8'));
    const transcript = transcriptJson.segments.map(s => s.text).join(' ');
    const timestamped = Object.fromEntries(
      transcriptJson.segments.map(s => [`${s.start.toFixed(2)}-${s.end.toFixed(2)}`, s.text])
    );

    fs.writeFileSync(
      path.join(AUDIO_DIR, `${baseName}.timestamps.json`),
      JSON.stringify(timestamped, null, 2)
    );

    res.json({ transcript, baseName });

  } catch (err) {
    logger.error(`❌ YouTube processing error: ${err.stack}`);
    res.status(500).json({ error: 'Failed to process YouTube video', detail: err.message });
  }
});


// /api/upload 
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

const FormData = require('form-data');
const assemblyApiKey = process.env.ASSEMBLY_API_KEY;
const uploadTranscribe = multer({ dest: AUDIO_DIR });

app.post('/api/transcribe', async (req, res) => {
  try {
    const file = req.files?.video;
    if (!file) return res.status(400).json({ error: 'No file uploaded' });

    const videoPath = path.join(UPLOAD_DIR, file.name);
    const baseName = path.parse(file.name).name;
    const ext = path.extname(file.name);
    const audioPath = path.join(AUDIO_DIR, `${baseName}.mp3`);

    await file.mv(videoPath);
    fs.writeFileSync(path.join(AUDIO_DIR, `${baseName}.ext.txt`), ext);

    await new Promise((resolve, reject) => {
      ffmpeg(videoPath)
        .noVideo()
        .audioCodec('libmp3lame')
        .on('end', resolve)
        .on('error', reject)
        .save(audioPath);
    });

    const uploadRes = await axios.post(
      'https://api.assemblyai.com/v2/upload',
      fs.createReadStream(audioPath),
      {
        headers: {
          authorization: process.env.ASSEMBLY_API_KEY,
          'transfer-encoding': 'chunked',
        }
      }
    );

    const { upload_url } = uploadRes.data;
    const transcribeRes = await axios.post(
      'https://api.assemblyai.com/v2/transcript',
      { audio_url: upload_url },
      { headers: { authorization: process.env.ASSEMBLY_API_KEY } }
    );

    const { id: transcriptId } = transcribeRes.data;
    let status = 'queued', transcript = '', words = [];

    while (status !== 'completed') {
      await new Promise(r => setTimeout(r, 4000));
      const poll = await axios.get(
        `https://api.assemblyai.com/v2/transcript/${transcriptId}`,
        { headers: { authorization: process.env.ASSEMBLY_API_KEY } }
      );
      status = poll.data.status;
      if (status === 'completed') {
        transcript = poll.data.text;
        words = poll.data.words || [];
      }
    }

    const segments = {};
    for (const w of words) {
      const k = `${(w.start/1000).toFixed(2)}-${(w.end/1000).toFixed(2)}`;
      segments[k] = (segments[k] || '') + `${w.text} `;
    }
    fs.writeFileSync(path.join(AUDIO_DIR, `${baseName}.timestamps.json`), JSON.stringify(segments, null, 2));

    res.json({ transcript, baseName });
  } catch (err) {
    logger.error('❌ Transcription error:', err.stack);
    res.status(500).json({ error: 'Transcription failed', detail: err.message });
  }
});

// /api/generate-clip 
app.post('/api/generate-clip', async (req, res) => {
  try {
    const { prompt, baseName } = req.body;
    const ext = fs.readFileSync(path.join(AUDIO_DIR, `${baseName}.ext.txt`), 'utf-8');
    const videoPath = path.join(UPLOAD_DIR, `${baseName}${ext}`);
    const structured = JSON.parse(fs.readFileSync(path.join(AUDIO_DIR, `${baseName}.timestamps.json`), 'utf-8'));

    const formatted = Object.entries(structured).map(([k, v]) => `${k}: ${v}`).join('\n');
    const promptForAI = `
You are given a transcript extracted from a video. Your task is to extract 2–3 short clip moments that best match the following GIF theme: "${prompt}"

Instructions:
- Use the transcript below to select clip-worthy moments that are visually interesting, funny, awkward, or emotional—based on the theme
- Each clip must be clearly grounded in actual text (no hallucinations or invented lines)
- Each clip must include:
  { "start": <number>, "end": <number>, "text": "<text>" }
- Clip duration: 3 to 8 seconds max
- Output format: A **JSON array only**, e.g., [{"start":12.0,"end":18.2,"text":"..."}]
- Do NOT output markdown or commentary—only return valid JSON

Transcript:
${formatted}
`



    logger.info('Sending prompt to AI Model...');
    const aiRes2 = await axios.post(
      'https://openrouter.ai/api/v1/chat/completions',
      {
        model: 'deepseek/deepseek-r1-0528-qwen3-8b:free',
        messages: [
          // { role: 'system', content: 'You are a helpful assistant.' },
          { role: 'user', content: promptForAI }
        ]
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'http://localhost:5173',
          'X-Title': 'AI-Gif-Creator'
        }
      }
    );
    let content = aiRes2.data.choices?.[0]?.message?.content?.trim();

    
    

    
    //``` if running locally
    
    // const aiRes = await axios.post('http://localhost:11434/api/chat', {
    //   model: 'phi3',
    //   messages: [{ role: 'user', content: promptForAI }],
    //   format: 'json',
    //   stream: false
    // });
    // let content = aiRes.data.message.content.trim();
    
    
    


    
    logger.debug(`AI Model response: ${content}`);
    
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
        isNaN(clip.start) ||
        isNaN(clip.end) ||
        clip.end <= clip.start
      ) {
        logger.warn(`⚠️ Skipping invalid clip [${i}]: ${JSON.stringify(clip)}`);
        continue;
      }
    
      const caption = (clip.text || '').replace(/[':\\]/g, '').substring(0, 50);
      const gifPath = path.join(OUTPUT_DIR, `${baseName}_clip_${gifIndex + 1}.gif`);
      const duration = (clip.end - clip.start).toFixed(2);
    
      await new Promise((resolve, reject) => {
        const command = ffmpeg(videoPath)
          .seekInput(clip.start)
          .duration(duration)
          .size('480x?')
          .fps(15)
          .format('gif')
          .videoFilters([
            `drawtext=text='${caption}':fontsize=28:fontcolor=white:x=(w-text_w)/2:y=h-th-40:box=1:boxcolor=black@0.6:boxborderw=4`
          ])
          .on('start', cmd => {
            logger.debug(`FFmpeg GIF generation started: ${cmd}`);
          })
          .on('progress', progress => {
            logger.info(`📈 Progress: ${progress.percent?.toFixed(1) || 0}%`);
          })
          .on('end', () => {
            logger.info(`✅ GIF ${gifIndex + 1} created: ${gifPath}`);
            resolve();
          })
          .on('error', err => {
            logger.error(`FFmpeg error: ${err.message}`);
            reject(err);
          });
    
        command.save(gifPath);
      });
    
      gifPaths.push({
        filename: path.basename(gifPath),
        url: `/output/${path.basename(gifPath)}`
      });
    
      gifIndex++;
    }
    

    res.json({ gifs: gifPaths });
  } catch (err) {
    logger.error(`GIF generation failed: ${err.stack}`);
    res.status(500).json({ error: 'GIF generation error', detail: err.message });
  }
});

// /api/gifs/:baseName 
app.get('/api/gifs/:baseName', (req, res) => {
  const { baseName } = req.params;
  const gifs = fs.readdirSync(OUTPUT_DIR)
    .filter(f => f.startsWith(baseName) && f.endsWith('.gif'))
    .map(f => ({ filename: f, url: `/output/${f}` }));
  logger.info(`Listing ${gifs.length} GIFs for ${baseName}`);
  res.json({ gifs });
});

app.get('/api/health', (req, res) => res.send('✅ Server is up!'));


console.log('✅ Backend started')
app.listen(port, () => logger.info(`🚀 Server running on http://localhost:${port}`));