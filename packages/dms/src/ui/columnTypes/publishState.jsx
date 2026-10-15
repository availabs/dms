import React from 'react';

// value: { published: '' | 'draft', hasChanges: boolean, isOrphan?: boolean }
export function PublishStateView({ value, className = '' }) {
    if (!value || typeof value !== 'object') return null;
    const { published, hasChanges, isOrphan } = value;

    if (isOrphan) {
        return (
            <span className={`inline-flex items-center gap-1 ${className}`}>
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-red-50 text-red-700 border border-red-200">
                    Orphan
                </span>
            </span>
        );
    }

    const isDraft = published === 'draft';

    // className is the table's cell class (flex-wrap + padding): it goes on the wrapper, and the pill + dot
    // sit in their own row that never wraps, so the unpublished-changes dot stays beside the pill.
    return (
        <span className={className}>
        <span className="inline-flex items-center gap-1 whitespace-nowrap">
            {isDraft ? (
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                    Draft
                </span>
            ) : (
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-[var(--t-go-soft)] text-[var(--t-go)] border border-transparent">
                    Published
                </span>
            )}
            {!isDraft && hasChanges && (
                <span
                    className="inline-block w-2 h-2 rounded-full bg-amber-400 flex-shrink-0"
                    title="Unpublished changes"
                />
            )}
        </span>
        </span>
    );
}
