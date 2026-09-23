import React from 'react';

// value: number of sections | { count, staleCount, isOpen }
export function SectionsChipView({ value, row = {}, className = '' }) {
    const count = typeof value === 'object' && value !== null ? value.count : value;
    const staleCount = typeof value === 'object' && value !== null ? (value.staleCount || 0) : 0;

    if (!count && count !== 0) return null;

    if (count === 0) {
        return (
            <span
                className={`inline-flex items-center gap-1 border border-dashed border-[var(--t-rule)] rounded-full px-2 py-0.5 text-[11px] font-semibold text-[var(--t-pencil)] select-none ${className}`}
                title="No sections — empty page"
            >
                0
            </span>
        );
    }

    return (
        <span
            className={`inline-flex items-center gap-1 border border-[var(--t-rule)] bg-[var(--t-panel)] rounded-full px-2 py-0.5 text-[11px] font-semibold text-[var(--t-graphite)] cursor-pointer select-none hover:border-[var(--t-rule-strong)] hover:bg-[var(--t-well)] transition-colors ${className}`}
            title={`${count} sections${staleCount ? ` — ${staleCount} on outdated views` : ''}`}
        >
            <span className="text-[10px] text-[var(--t-pencil)]">▸</span>
            {count}
            {staleCount > 0 && (
                <span className="w-1.5 h-1.5 rounded-full bg-orange-400 flex-shrink-0" title={`${staleCount} sections on outdated views`} />
            )}
        </span>
    );
}
