import React, { useState } from 'react';
import axios from 'axios';
// import ProgressBar from './components/ProgressBar';
// import './App.css';

// const server = 'https://ai-video-to-gif.onrender.com';
const server = 'http://localhost:5005';



function App() {
  const [videoFile, setVideoFile] = useState(null);
  const [transcript, setTranscript] = useState('');
  const [prompt, setPrompt] = useState('');
  const [baseName, setBaseName] = useState('');
  const [gifUrls, setGifUrls] = useState([]);
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(false);

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [isLoginMode, setIsLoginMode] = useState(true);
  const [loggedInUser, setLoggedInUser] = useState(null);

  const [useYoutube, setUseYoutube] = useState(false);
  const [youtubeUrl, setYoutubeUrl] = useState('');




  const handleAuth = async () => {
    if (!username || !password || (!isLoginMode && !confirm)) {
      return setStatus('❌ All fields are required');
    }

    if (!isLoginMode && password !== confirm) {
      return setStatus('❌ Passwords do not match');
    }

    const endpoint = isLoginMode ? '/login' : '/register';
    setLoading(true);
    setStatus(isLoginMode ? '🔐 Logging in...' : '🧾 Registering...');

    try {
      const res = await axios.post(`${server}/api/auth${endpoint}`, {
        username,
        password,
        ...(isLoginMode ? {} : { confirmPassword: confirm })
      });

      if (res.data.username || res.data.message) {
        setStatus(`✅ ${res.data.message || 'Logged in'}`);
        setLoggedInUser(username);
      } else {
        setStatus('❌ Unknown response from server');
      }
    } catch (err) {
      setStatus(`❌ ${err.response?.data?.error || 'Authentication failed'}`);
    } finally {
      setLoading(false);
    }
  };


  const handleFileChange = e => {
    setVideoFile(e.target.files[0]);
    setTranscript('');
    setGifUrls([]);
    setBaseName('');
    setPrompt('');

  };

  const handleUpload = async () => {
    if (useYoutube && !youtubeUrl) return alert('Paste a YouTube link first');
    if (!useYoutube && !videoFile) return alert('Upload a video first');
  
    setTranscript('');
    setGifUrls([]);
    setBaseName('');
    setLoading(true);
    setStatus('⏬ Processing video...');

    try {
      let res;

      if (useYoutube) {
        if (!youtubeUrl) return alert('Paste a YouTube link first');
        res = await axios.post(`${server}/api/download`, { url: youtubeUrl }, {
          headers: { 'Content-Type': 'application/json' }
        });
      } else {
        if (!videoFile) return alert('Upload a video first');
        const formData = new FormData();
        formData.append('video', videoFile);
        res = await axios.post(`${server}/api/transcribe`, formData, {
          headers: { 'Content-Type': 'multipart/form-data' }
        });
      }
      

      setTranscript(res.data.transcript);
      setBaseName(res.data.baseName || videoFile.name.split('.')[0]);
      setStatus('✅ Transcript ready');
    } catch (err) {
      console.error('Upload error:', err);
      setStatus('❌ Video processing failed');
    } finally {
      setLoading(false);
    }
  };




  // Uncomment the following lines if you want to handle video upload and transcription using whisper
  // if (!videoFile) return alert('Select a video file');
  // setLoading(true);
  // setStatus('📤 Uploading and transcribing...');

  // const formData = new FormData();
  // formData.append('video', videoFile);

  // try {
  //   const res = await axios.post(`${server}/api/upload`, formData);
  //   setTranscript(res.data.transcript);
  //   setBaseName(res.data.baseName);
  //   setStatus('✅ Transcript generated');
  // } catch {
  //   setStatus('❌ Upload or transcription failed');
  // } finally {
  //   setLoading(false);
  // }



  const handleGenerateGif = async () => {
    if (!prompt || !baseName) return alert('Missing prompt or transcript');
    setLoading(true);
    setStatus('🧠 Generating GIFs...');
    try {
      const res = await axios.post(`${server}/api/generate-clip`, { prompt, baseName });

      if (!res.data.gifs || res.data.gifs.length === 0) {
        setStatus('❌ No usable clips found for this prompt');
        setGifUrls([]);
        return;
      }

      const allGifUrls = await Promise.all(
        res.data.gifs.map(async gif => {
          const gifRes = await axios.get(`${server}${gif.url}`, { responseType: 'arraybuffer' });
          return {
            url: URL.createObjectURL(new Blob([gifRes.data], { type: 'image/gif' })),
            filename: gif.filename
          };
        })
      );

      setGifUrls(allGifUrls);
      setStatus(`✅ ${allGifUrls.length} GIF(s) ready!`);
    } catch (err) {
      console.error('GIF generation error:', err);
      setStatus('❌ GIF generation failed');
    } finally {
      setLoading(false);
    }
  };


  return (
    <div className="min-h-screen min-w-screen flex items-center justify-center bg-gray-950 text-white px-6 py-8">
      <div className="max-w-xl mx-auto space-y-6 bg-gray-800 p-6 rounded-lg shadow-lg">
        <h1 className="text-3xl font-bold text-center mb-4">🎥 AI GIF Generator</h1>

        {!loggedInUser ? (
          <div className="space-y-4 bg-gray-900 p-4 rounded shadow">
            <h2 className="text-xl font-semibold text-center text-white">
              {isLoginMode ? 'Login' : 'Register'}
            </h2>

            <input
              className="w-full p-2 rounded-md bg-gray-800 border border-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="Username"
              value={username}
              onChange={e => setUsername(e.target.value)}
            />
            <input
              className="w-full p-2 rounded-md bg-gray-800 border border-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="Password"
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
            />
            {!isLoginMode && (
              <input
                className="w-full p-2 rounded-md bg-gray-800 border border-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                placeholder="Confirm Password"
                type="password"
                value={confirm}
                onChange={e => setConfirm(e.target.value)}
              />
            )}

            <button
              onClick={handleAuth}
              className={`w-full py-2 text-white font-semibold rounded-md transition duration-200 ${loading
                ? 'bg-gray-600 cursor-not-allowed'
                : 'bg-indigo-600 hover:bg-indigo-700 shadow-md hover:shadow-lg'
                }`}
              disabled={loading}
            >
              {loading ? 'Processing...' : isLoginMode ? 'Login' : 'Register'}
            </button>

            <p className="text-sm text-center text-gray-400 mt-2">
              {isLoginMode ? 'Need an account?' : 'Already have an account?'}{' '}
              <button
                className="text-indigo-400 hover:text-indigo-300 hover:underline font-medium transition"
                onClick={() => setIsLoginMode(!isLoginMode)}
              >
                {isLoginMode ? 'Register' : 'Login'}
              </button>
            </p>

            {status && (
              <p
                className={`text-center text-sm font-medium ${status.startsWith('✅') ? 'text-green-400' : 'text-red-400'
                  }`}
              >
                {status}
              </p>
            )}
          </div>

        ) : (
          <>
            <p className="text-sm text-green-400 text-center">👋 Welcome, {loggedInUser}</p>
            <div className="space-y-4">
              <label className="flex items-center gap-3">
                <input
                  type="checkbox"
                  checked={useYoutube}
                  onChange={e => setUseYoutube(e.target.checked)}
                />
                Use YouTube URL instead
              </label>

              {useYoutube ? (
                <input
                  type="text"
                  placeholder="Paste YouTube video link"
                  value={youtubeUrl}
                  onChange={e => setYoutubeUrl(e.target.value)}
                  className="w-full p-2 rounded bg-gray-800 border border-gray-600 text-white"
                />
              ) : (
                <input
                  type="file"
                  accept="video/*"
                  onChange={handleFileChange}
                  className="block w-full text-sm file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-purple-600 file:text-white hover:file:bg-purple-700 file:cursor-pointer"
                />
              )}

              {status && (
                <p className={`text-sm font-medium ${status.startsWith('✅') ? 'text-green-400' : 'text-red-400'}`}>
                  {status}
                </p>
              )}

              {/* <ProgressBar /> */}

              {/* <button
                onClick={handleUpload}
                disabled={loading}
                className="bg-green-600 hover:bg-green-700 disabled:bg-gray-400 px-4 py-2 rounded text-white"
              >
                {loading ? 'Uploading...' : 'Process Video'}
              </button> */}
            </div>

            <div className="space-y-4">
              {/* <input
                type="file"
                accept="video/*"
                onChange={handleFileChange}
                className="block w-full text-sm file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-purple-600 file:text-white hover:file:bg-purple-700 file:cursor-pointer file:transition-colors file:duration-200 file:ease-in-out"
              /> */}
              <button
                onClick={handleUpload}
                disabled={loading}
                className="bg-green-600 hover:bg-green-700 disabled:bg-gray-400 disabled:opacity-50 px-4 py-2 rounded text-white  "
              >
                {loading ? 'Uploading...' : 'Upload & Transcribe'}
              </button>
              <p className="text-sm text-gray-300">{status}</p>
            </div>

            {transcript && (
              <div className="mt-6 space-y-4">
                <h4 className="text-lg font-semibold">📝 Transcript</h4>
                <div className="bg-gray-800 p-4 rounded text-sm max-h-40 overflow-x-hidden overflow-y-auto scrollbar-thin scrollbar-thumb-gray-600 scrollbar-track-gray-950 whitespace-pre-wrap text-gray-200">
                  {transcript}
                </div>

                <input
                  value={prompt || ""}
                  onChange={e => setPrompt(e.target.value)}
                  className="w-full p-2 bg-gray-800  text-white  border border-gray-600 rounded mb-2"
                  placeholder="Prompt (e.g., funny moments, deep thoughts, motivational quotes, etc.)"
                />
                <button
                  onClick={handleGenerateGif}
                  disabled={loading}
                  className="bg-indigo-600  hover:bg-indigo-700  px-4 py-2 rounded text-white disabled:bg-gray-400 disabled:opacity-50"
                >
                  {loading ? 'Generating...' : 'Generate GIFs'}
                </button>
              </div>
            )}


            {gifUrls.length > 0 && (
              <div className="mt-10">
                <h3 className="text-lg  font-semibold mb-3 mb-4">🎞️ Generated GIFs</h3>
                <div className="grid grid-cols-1  md:grid-cols-2 gap-4 ">
                  {gifUrls.map((gif, i) => (
                    <div key={i} className="bg-gray-800 rounded shadow p-4">
                      <img src={gif.url} alt={`GIF ${i + 1}`} className="w-full rounded mb-2" />
                      <a
                        href={gif.url}
                        download={gif.filename}
                        className="text-indigo-400 block mt-2 text-sm hover:underline hover:text-indigo-300"
                      >
                        ⬇️ Download {gif.filename}
                      </a>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export default App;
