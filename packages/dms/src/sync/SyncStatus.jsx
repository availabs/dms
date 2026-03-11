import React, { useState, useEffect } from 'react';
import { onStatusChange, getPendingCount } from './sync-manager.js';

export default function SyncStatus() {
  const [status, setStatus] = useState('disconnected');
  const [pending, setPending] = useState(0);

  useEffect(() => {
    const unsub = onStatusChange(async (s) => {
      setStatus(s);
      setPending(await getPendingCount());
    });
    return unsub;
  }, []);

  const colors = {
    connected: 'bg-green-500',
    syncing: 'bg-yellow-500',
    disconnected: 'bg-red-500',
  };

  return (
    <div className="fixed bottom-4 right-4 flex items-center gap-2 px-3 py-1.5
                    bg-white/90 rounded-full shadow-sm text-xs text-gray-600 z-50">
      <div className={`w-2 h-2 rounded-full ${colors[status] || colors.disconnected}`} />
      {status === 'syncing' && pending > 0 ? `Syncing (${pending})` : status}
    </div>
  );
}
