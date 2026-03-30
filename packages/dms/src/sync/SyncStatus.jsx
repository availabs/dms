import React, { useState, useEffect } from 'react';
import { onStatusChange, getPendingCount, onCollabChange, getCollabInfo } from './sync-manager.js';

export default function SyncStatus() {
  const [status, setStatus] = useState('disconnected');
  const [pending, setPending] = useState(0);
  const [collab, setCollab] = useState(getCollabInfo());

  useEffect(() => {
    const unsub = onStatusChange(async (s) => {
      setStatus(s);
      setPending(await getPendingCount());
    });
    return unsub;
  }, []);

  useEffect(() => {
    return onCollabChange(setCollab);
  }, []);

  const colors = {
    connected: 'bg-green-500',
    syncing: 'bg-yellow-500',
    disconnected: 'bg-red-500',
  };

  const label = status === 'syncing' && pending > 0
    ? `Syncing (${pending})`
    : status;

  return (
    <div className="fixed bottom-4 right-4 flex items-center gap-2 px-3 py-1.5
                    bg-white/90 rounded-full shadow-sm text-xs text-gray-600 z-50">
      <div className={`w-2 h-2 rounded-full ${colors[status] || colors.disconnected}`} />
      {label}
      {collab.rooms > 0 && (
        <>
          <div className="w-px h-3 bg-gray-300" />
          <div className="flex items-center gap-1">
            <svg className="w-3 h-3 text-blue-500" viewBox="0 0 16 16" fill="currentColor">
              <path d="M7 14s-1 0-1-1 1-4 5-4 5 3 5 4-1 1-1 1H7zm4-6a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM5.5 8a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zM.22 13c.223-1.13 1.49-3 4.78-3 .67 0 1.23.09 1.7.24C5.9 10.9 5 12.04 5 13.5c0 .28.04.5.09.5H1c-.55 0-1-.45-.78-1z"/>
            </svg>
            <span className="text-blue-600">
              {collab.peers > 1 ? collab.peers : collab.rooms}
            </span>
          </div>
        </>
      )}
    </div>
  );
}
