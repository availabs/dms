import React from 'react';

const statusDotClass = {
    draft: 'bg-amber-400',
    published: 'bg-emerald-400',
    ghost: 'bg-gray-300',
    orphan: 'bg-red-500',
};

export function TreeNodeView({ value, row = {}, className = '' }) {
    const {
        _depth = 0,
        _hasChildren = false,
        _isExpanded = false,
        _isOrphan = false,
        _isGhost = false,
        _childCount = 0,
        _slug = '',
        _pendingBelow = 0,
        _onToggleExpand,
        published = '',
        has_changes = false,
    } = row;

    const title = _isGhost ? '(untitled)' : (value || 'New Page');

    const dotVariant = _isOrphan ? 'orphan' : _isGhost ? 'ghost' : published === 'draft' ? 'draft' : 'published';

    const handleCaretClick = (e) => {
        e.stopPropagation();
        _onToggleExpand?.();
    };

    return (
        <div
            className={`flex items-center min-w-0 overflow-hidden group ${className}`}
            style={{ paddingLeft: _depth * 26 }}
        >
            {/* drag handle — visible on row hover */}
            <span className="text-gray-300 cursor-grab w-3.5 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity text-xs select-none mr-0.5">
                ⠿
            </span>

            {/* expand / collapse caret */}
            {_hasChildren ? (
                <button
                    className="w-[18px] h-[18px] rounded flex-shrink-0 inline-flex items-center justify-center text-gray-400 hover:bg-gray-200 hover:text-gray-700 text-[10px] cursor-pointer border-none bg-transparent"
                    onClick={handleCaretClick}
                    title={_isExpanded ? 'Collapse' : 'Expand'}
                >
                    {_isExpanded ? '▼' : '▶'}
                </button>
            ) : (
                <span className="w-[18px] h-[18px] flex-shrink-0 inline-flex" />
            )}

            {/* status dot */}
            <span className={`w-2 h-2 rounded-full flex-shrink-0 mx-1.5 ${statusDotClass[dotVariant]}`} />

            {/* title */}
            <span
                className={`font-semibold truncate cursor-pointer ${
                    _isGhost
                        ? 'text-gray-300 italic font-normal'
                        : 'text-gray-800 hover:text-gray-600'
                }`}
                title={title}
            >
                {title}
            </span>

            {/* child count badge */}
            {_hasChildren && (
                <span className="ml-1.5 text-[10px] text-gray-400 bg-gray-100 rounded-full px-1.5 font-semibold flex-shrink-0">
                    {_childCount}
                </span>
            )}

            {/* rollup chip — pending-publish descendants count */}
            {!_isExpanded && _pendingBelow > 0 && (
                <span
                    className="ml-1.5 text-[10px] text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-1.5 font-semibold flex-shrink-0 cursor-pointer"
                    onClick={handleCaretClick}
                    title={`${_pendingBelow} pages below need publishing — click to expand`}
                >
                    ▾ {_pendingBelow} to publish
                </span>
            )}

            {/* ghost chip */}
            {_isGhost && (
                <span className="ml-1.5 text-[10px] text-gray-500 bg-gray-100 rounded-full px-1.5 font-semibold flex-shrink-0">
                    ghost
                </span>
            )}

            {/* url slug */}
            {!_isGhost && _slug && (
                <span className="ml-2 text-[11px] font-mono text-gray-400 truncate flex-shrink min-w-0 max-w-[160px]">
                    {_slug}
                </span>
            )}
        </div>
    );
}
