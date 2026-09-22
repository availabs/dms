import React from 'react';
import { timeAgo } from '../../patterns/page/pages/_utils';

export function LastPublishedView({ value, row }) {
    // value = _lastPublished (ISO from history), row has _lastPublishedBy and published state
    const isDraft = row?.published === 'draft';

    if (isDraft) {
        return <span className="text-[var(--t-pencil)] text-xs italic">Never</span>;
    }
    if (!value) {
        // Published but no history entry found (pre-history pages)
        return <span className="text-[var(--t-pencil)] text-xs">—</span>;
    }
    const by = row?._lastPublishedBy;
    const full = by ? `${new Date(value).toLocaleString()} by ${by}` : new Date(value).toLocaleString();
    return (
        <span title={full} className="text-xs text-[var(--t-graphite)] cursor-default">
            {timeAgo(value)}
            {by && <span className="text-[var(--t-pencil)] ml-1">by {by.split('@')[0]}</span>}
        </span>
    );
}
