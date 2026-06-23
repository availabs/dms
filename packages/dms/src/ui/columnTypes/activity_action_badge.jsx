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

export function ActivityActionBadgeView({ row }) {
    if (!row) return null;
    if (isPublishedRow(row)) {
        return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">Published</span>;
    }
    if (sameTime(row.created_at, row.updated_at)) {
        return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-blue-50 text-blue-700 border border-blue-200">Created</span>;
    }
    return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-gray-100 text-gray-600 border border-gray-200">Edited</span>;
}
