// components/ProgressBar.js
import React from 'react';
import useProgressSocket from '../hooks/useProgressSocket';

export default function ProgressBar() {
  const { percent, step } = useProgressSocket();

  if (!step) return null; // don't show if nothing yet

  return (
    <div className="w-full max-w-xl mx-auto mt-4 bg-gray-800 p-4 rounded-lg shadow">
      <p className="text-sm mb-2 text-white font-medium">{step}</p>
      <div className="w-full bg-gray-700 rounded-full h-3 overflow-hidden">
        <div
          className="bg-blue-500 h-full transition-all duration-300"
          style={{ width: `${percent}%` }}
        />
      </div>
      <p className="text-xs text-right mt-1 text-gray-300">{percent}%</p>
    </div>
  );
}
