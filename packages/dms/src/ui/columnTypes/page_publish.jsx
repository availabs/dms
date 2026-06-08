import React, { useContext, useState } from 'react';
import { CMSContext } from '../../patterns/page/context';
import { ComponentContext } from '../../patterns/page/context';
import { publish, discardChanges } from '../../patterns/page/pages/edit/editFunctions';

function extractAtom(v) {
    return v?.$type === 'atom' ? v.value : v;
}

async function loadFullPage(falcor, app, type, id) {
    const appType = `${app}+${type}`;
    await falcor.get(['dms', 'data', appType, 'byId', [+id], ['id', 'data']]);
    const raw = falcor.getCache()?.dms?.data?.[appType]?.byId?.[+id] || {};
    const itemData = extractAtom(raw.data) || {};
    return { id: +id, ...itemData };
}

export function PagePublishView({ row, className }) {
    const { falcor, user } = useContext(CMSContext) || {};
    const { apiUpdate, state } = useContext(ComponentContext) || {};
    const [loading, setLoading] = useState(false);

    const { app, type } = state?.externalSource || {};
    const published = row?.published;
    const hasChanges = row?.has_changes;
    const isPublished = published !== 'draft' && published !== undefined && published !== null;

    const statusLabel = !isPublished ? 'Draft' : hasChanges ? 'Changes' : 'Published';
    const statusColor = !isPublished
        ? 'bg-amber-100 text-amber-700'
        : hasChanges
            ? 'bg-blue-100 text-blue-700'
            : 'bg-green-100 text-green-700';

    const handlePublish = async (e) => {
        e.stopPropagation();
        if (!falcor || !apiUpdate || !app || !type || !row?.id) return;
        setLoading(true);
        try {
            const fullItem = await loadFullPage(falcor, app, type, row.id);
            await publish(user, fullItem, apiUpdate);
        } finally {
            setLoading(false);
        }
    };

    const handleDiscard = async (e) => {
        e.stopPropagation();
        if (!falcor || !apiUpdate || !app || !type || !row?.id) return;
        setLoading(true);
        try {
            const fullItem = await loadFullPage(falcor, app, type, row.id);
            await discardChanges(user, fullItem, apiUpdate);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className={`flex items-center gap-1 ${className || ''}`}>
            <span className={`px-2 py-0.5 rounded text-xs font-medium ${statusColor}`}>
                {statusLabel}
            </span>
            {(hasChanges || !isPublished) && (
                <button
                    disabled={loading}
                    onClick={handlePublish}
                    className="px-2 py-0.5 rounded text-xs font-medium bg-green-600 text-white hover:bg-green-700 disabled:opacity-50"
                >
                    {loading ? '…' : 'Publish'}
                </button>
            )}
            {hasChanges && isPublished && (
                <button
                    disabled={loading}
                    onClick={handleDiscard}
                    className="px-2 py-0.5 rounded text-xs font-medium bg-gray-200 text-gray-700 hover:bg-gray-300 disabled:opacity-50"
                >
                    Discard
                </button>
            )}
        </div>
    );
}

export function PagePublishEdit(props) {
    return <PagePublishView {...props} />;
}
