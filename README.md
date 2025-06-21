# 🎥 AI GIF Generator

Turn any uploaded video into meaningful captioned GIFs using Whisper for transcription and Ollama (LLM) for semantic clip selection.

---

## ✨ Features

- Upload `.mp4` or `.mov` videos
- Transcribe audio to text using OpenAI Whisper CLI
- Extract timestamped segments based on custom prompt using Ollama LLM
- Generate captioned GIFs using `ffmpeg` with overlayed text
- Download or preview generated GIFs in-browser

---

## 🗂 Project Structure (Post-Refactor)

server/
├── app.js # Express app with middleware and routes
├── server.js # Entrypoint (runs app)
├── routes/ # Route definitions
│ ├── upload.js
│ └── gif.js
├── controllers/ # Logic for endpoints
│ ├── uploadController.js
│ └── gifController.js
├── middleware/ # Multer upload handler
│ └── upload.js
├── utils/
│ └── logger.js # Winston logger
├── audio/ # Transcriptions and audio files
├── output/ # Generated GIFs
├── uploads/ # Raw videos
├── logs/ # Log files
client/
├── App.jsx # Frontend app
├── index.html
└── ...

yaml
Copy
Edit

---

## 🚀 Getting Started

### 1. Prerequisites

- Node.js 18+
- FFmpeg installed (`ffmpeg` in terminal)
- Python 3.8+ with Whisper CLI (`pip install openai-whisper`)
- Ollama running locally (`ollama run phi3`)

---

### 2. Clone & Install

bash
git clone https://github.com/yourname/ai-gif-generator.git
cd ai-gif-generator

# Install server dependencies

cd server
npm install

# Install client (Vite or CRA)

cd ../client
npm install
3. Start the App
bash
Copy
Edit

# In one terminal: start Ollama

ollama run phi3

# In another: start server

cd server
node server.js

# In another: start frontend

cd client
npm run dev
🔌 API Endpoints
POST /api/upload
video: multipart/form-data

⏳ Transcribes video to text

json
Copy
Edit
{
"transcript": "...",
"baseName": "1682398123-xyz"
}
POST /api/generate-clip
prompt: string (e.g., "funny")

baseName: from upload

Returns:

json
Copy
Edit
{
"gifs": [
{ "filename": "clip_1.gif", "url": "/output/clip_1.gif" }
]
}
GET /api/gifs/:baseName
Returns all GIFs for a given video.

🧠 Tips
Whisper runs best on short <5min clips

Prompts like "funny moments", "chapter intros", "motivational quotes" yield best results

If no GIFs are returned, try more general prompts

🧰 Dev Tools
Logger: All errors and steps are logged to logs/server.log

FFmpeg: Used for both audio extraction and GIF generation

Whisper: Must be callable via CLI (whisper file.mp3)

Ollama: Must be running and reachable on [http://localhost:11434](http://localhost:11434/)

🛠 Troubleshooting
❌ No GIFs generated?

Check logs: server/logs/server.log

Ensure prompt is understood by Ollama

Check if start/end values are numeric and 3–8s in length

❌ Whisper not found?

Install: pip install openai-whisper

Run which whisper and ensure it’s in PATH

📃 License
Satyam
