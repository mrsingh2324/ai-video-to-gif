// App.jsx
import React, { useState } from 'react';
import axios from 'axios';

function App() {
  const [videoFile, setVideoFile] = useState(null);
  const [transcript, setTranscript] = useState('');
  const [prompt, setPrompt] = useState('funny');
  const [baseName, setBaseName] = useState('');
  const [gifUrls, setGifUrls] = useState([]);
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(false);

  const handleFileChange = e => {
    setVideoFile(e.target.files[0]);
    setTranscript('');
    setGifUrls([]);
    setBaseName('');
  };

  const handleUpload = async () => {
    if (!videoFile) return alert('Select a video file');
    setLoading(true);
    setStatus('Uploading and transcribing...');

    const formData = new FormData();
    formData.append('video', videoFile);

    try {
      const res = await axios.post('http://localhost:5005/api/upload', formData);
      console.log('Transcript response:', res);
      
      setTranscript(res.data.transcript);
      setBaseName(res.data.baseName);
      setStatus('Transcript generated');
    } catch {
      alert('Upload or transcription failed');
    } finally {
      setLoading(false);
    }
  };

  
  const handleGenerateGif = async () => {
    if (!prompt || !baseName) return alert('Missing prompt or transcript');
    setLoading(true);
    setStatus('Generating GIFs...');
    console.log('🧠 Sending prompt to backend...');
  
    try {
      const res = await axios.post('http://localhost:5005/api/generate-clip', { prompt, baseName });
  
      if (!res.data.gifs || res.data.gifs.length === 0) {
        setStatus('❌ No usable clips found in transcript for this prompt.');
        console.warn('No GIFs received from backend.');
        setGifUrls([]);
        return;
      }
  
      const allGifUrls = await Promise.all(
        res.data.gifs.map(async gif => {
          const gifRes = await axios.get(`http://localhost:5005${gif.url}`, { responseType: 'arraybuffer' });
          return {
            url: URL.createObjectURL(new Blob([gifRes.data], { type: 'image/gif' })),
            filename: gif.filename
          };
        })
      );
  
      setGifUrls(allGifUrls);
      setStatus(`✅ ${allGifUrls.length} GIF(s) ready!`);
      console.log('GIFs loaded:', allGifUrls);
    } catch (err) {
      console.error('GIF generation error:', err);
      alert('GIF generation failed. See console for details.');
      setStatus('❌ GIF generation failed');
    } finally {
      setLoading(false);
    }
  };
  

  return (
    <div style={{ padding: '2rem' }}>
      <h1>🎥 AI GIF Generator</h1>
      <input type="file" accept="video/*" onChange={handleFileChange} />
      <button onClick={handleUpload} disabled={loading}>Upload & Transcribe</button>
      <p>{status}</p>
      {gifUrls.length === 0 && status.includes('No usable') && (
  <p style={{ color: 'red' }}>Try using a different prompt or re-uploading.</p>
)}

      {transcript && (
        <div>
          <h3>Transcript</h3>
          <pre>{transcript}</pre>
          <input
            value={prompt}
            onChange={e => setPrompt(e.target.value)}
            placeholder="Enter a theme (e.g., funny, sad)"
            style={{ width: '300px' }}
          />
          <button onClick={handleGenerateGif} disabled={loading}>Generate GIFs</button>
        </div>
      )}

      {gifUrls.length > 0 && (
        <div>
          <h3>Generated GIFs</h3>
          <div style={{ display: 'flex', gap: '1rem' }}>
            {gifUrls.map((gif, i) => (
              <div key={i}>
                <img src={gif.url} alt={`GIF ${i + 1}`} width="300" />
                <a href={gif.url} download={gif.filename}>⬇️ Download</a>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
