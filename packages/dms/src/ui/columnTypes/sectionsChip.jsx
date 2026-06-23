import React from 'react';

// value: number of sections | { count, staleCount, isOpen }
export function SectionsChipView({ value, row = {}, className = '' }) {
    const count = typeof value === 'object' && value !== null ? value.count : value;
    const staleCount = typeof value === 'object' && value !== null ? (value.staleCount || 0) : 0;

    if (!count && count !== 0) return null;

    if (count === 0) {
        return (
            <span
                className={`inline-flex items-center gap-1 border border-dashed border-gray-300 rounded-full px-2 py-0.5 text-[11px] font-semibold text-gray-400 select-none ${className}`}
                title="No sections — empty page"
            >
                0
            </span>
        );
    }

    return (
        <span
            className={`inline-flex items-center gap-1 border border-gray-300 bg-white rounded-full px-2 py-0.5 text-[11px] font-semibold text-gray-600 cursor-pointer select-none hover:border-amber-400 hover:bg-amber-50 transition-colors ${className}`}
            title={`${count} sections${staleCount ? ` — ${staleCount} on outdated views` : ''}`}
        >
            <span className="text-[8px] text-gray-400">▶</span>
            {count}
            {staleCount > 0 && (
                <span className="w-1.5 h-1.5 rounded-full bg-orange-400 flex-shrink-0" title={`${staleCount} sections on outdated views`} />
            )}
        </span>
    );
}
