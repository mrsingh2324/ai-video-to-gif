#!/bin/bash

echo "🔧 Installing FFmpeg, Python, and yt-dlp..."

apt-get update && \
apt-get install -y ffmpeg curl python3-pip && \
pip install yt-dlp

echo "✅ build.sh completed"
