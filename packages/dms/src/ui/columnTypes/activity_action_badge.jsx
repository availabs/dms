import React from 'react';

// published is stored as '' (published) or 'draft' (unpublished) — never boolean true.
// has_changes arrives from UDA as the string 'true'/'false', not a boolean.
function isPublishedRow(row) {
    return row.published !== 'draft' && String(row.has_changes) !== 'true';
}

function sameTime(a, b) {
    if (!a || !b) return false;
    return Math.abs(new Date(a) - new Date(b)) < 5000;
}

// Status pill (2026-10-13, ui-controls.html): r4 mono, token tones. Used by the admin activity tables.
export function ActivityActionBadgeView({ row }) {
    if (!row) return null;
    if (isPublishedRow(row)) {
        return <span className="inline-flex items-center h-[18px] px-1.5 rounded t-metaXS bg-[var(--t-go-soft)] text-[var(--t-go)]">Published</span>;
    }
    if (sameTime(row.created_at, row.updated_at)) {
        return <span className="inline-flex items-center h-[18px] px-1.5 rounded t-metaXS bg-[var(--t-cobalt-soft)] text-[var(--t-cobalt)]">Created</span>;
    }
    return <span className="inline-flex items-center h-[18px] px-1.5 rounded t-metaXS bg-[var(--t-well)] text-[var(--t-graphite)]">Edited</span>;
}
