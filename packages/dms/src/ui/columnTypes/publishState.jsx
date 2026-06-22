import React from 'react';

// value: { published: '' | 'draft', hasChanges: boolean }
export function PublishStateView({ value, className = '' }) {
    if (!value || typeof value !== 'object') return null;
    const { published, hasChanges } = value;

    const isDraft = published === 'draft';

    return (
        <span className={`inline-flex items-center gap-1 ${className}`}>
            {isDraft ? (
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                    Draft
                </span>
            ) : (
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
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
    );
}
