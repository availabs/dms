import React from 'react'

export default function PatternTitle({ title }) {
  React.useEffect(() => {
    if (typeof document === 'undefined') return;
    const next = typeof title === 'string' ? title.trim() : '';
    if (!next) return;
    const prev = document.title;
    document.title = next;
    return () => { document.title = prev; };
  }, [title]);
  return null;
}
