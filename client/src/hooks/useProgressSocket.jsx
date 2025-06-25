// hooks/useProgressSocket.js
import { useEffect, useState } from 'react';
import { io } from 'socket.io-client';

const socket = io('http://localhost:5005'); // replace with your actual backend URL

export default function useProgressSocket() {
  const [progress, setProgress] = useState({ percent: 0, step: 'Waiting for update...' });

  useEffect(() => {
    socket.on('progress', data => {
      setProgress(data);
    });

    return () => {
      socket.off('progress');
    };
  }, []);

  return progress;
}
