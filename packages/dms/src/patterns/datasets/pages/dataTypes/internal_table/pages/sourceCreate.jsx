import React, { useState, useCallback, useContext } from "react";
import { useNavigate } from "react-router";
import { DatasetsContext } from "../../../../context";
import { ThemeContext } from "../../../../../../ui/themeContext";
import Upload from "../../../../components/upload";

function nameToDocType(name) {
    return name
        .toLowerCase()
        .trim()
        .replace(/[\s-]+/g, '_')
        .replace(/[^a-z0-9_]/g, '');
}

function getNewId(falcorRes) {
    return Object.keys(falcorRes?.json?.dms?.data?.byId || {})
        .find(k => k !== '$__path');
}

export default function SourceCreate({ context, source }) {
    const ctx = useContext(DatasetsContext);
    const { UI } = useContext(ThemeContext);
    const { falcor, parent, user, type, app, baseUrl } = ctx;
    const navigate = useNavigate();
    const { Button } = UI;

    const [stage, setStage] = useState('idle'); // idle | creating | uploading
    const [createdSource, setCreatedSource] = useState(null);
    const [viewId, setViewId] = useState(null);
    const [error, setError] = useState(null);

    const handleCreate = async () => {
        if (!source.name?.trim()) return;
        setStage('creating');
        setError(null);

        try {
            const doc_type = nameToDocType(source.name);
            if (!doc_type) {
                throw new Error('Name must contain at least one letter or number.');
            }

            // 1. Create source data_items row
            const sourceRes = await falcor.call(
                ["dms", "data", "create"],
                [app, `${type}|source`, {
                    name: source.name.trim(),
                    type: 'internal_table',
                    doc_type,
                }]
            );
            const sourceId = getNewId(sourceRes);
            if (!sourceId) throw new Error('Failed to create source');

            // 2. Create view data_items row
            const viewRes = await falcor.call(
                ["dms", "data", "create"],
                [app, `${type}|source|view`, { name: 'version 1' }]
            );
            const vId = getNewId(viewRes);
            if (!vId) throw new Error('Failed to create view');

            // 3. Update source with view ref
            await falcor.call(["dms", "data", "edit"], [app, +sourceId, {
                views: [{ ref: `${app}+${type}|source|view`, id: +vId }]
            }]);

            // 4. Update parent to include new source ref
            const existingRefs = (parent.sources || [])
                .filter(s => s.id)
                .map(s => ({ ref: s.ref || `${app}+${type}|source`, id: s.id }));

            await falcor.call(["dms", "data", "edit"], [app, parent.id, {
                sources: [...existingRefs, { ref: `${app}+${type}|source`, id: +sourceId }]
            }]);

            // 5. Invalidate caches
            await falcor.invalidate(['dms', 'data', app, 'byId', parent.id]);
            await falcor.invalidate(['uda', `${app}+${type}`, 'sources']);

            // 6. Transition to upload stage
            setCreatedSource({
                id: +sourceId,
                source_id: +sourceId,
                app,
                name: source.name.trim(),
                type: 'internal_table',
                doc_type,
                config: '{}',
            });
            setViewId(+vId);
            setStage('uploading');
        } catch (e) {
            console.error('Error creating internal_table dataset:', e);
            setError(e.message);
            setStage('idle');
        }
    };

    // Thin apiUpdate for Upload.EditComp (used only for metadata updates after publish)
    const localApiUpdate = useCallback(async ({data, config}) => {
        if (!data?.id) return;
        const row = {};
        for (const [key, value] of Object.entries(data)) {
            if (!['id', 'updated_at', 'created_at'].includes(key)) {
                row[key] = value;
            }
        }
        await falcor.call(["dms", "data", "edit"], [app, data.id, row]);
        await falcor.invalidate(['dms', 'data', app, 'byId', data.id]);
    }, [falcor]);

    if (stage === 'uploading' && createdSource && viewId) {
        return (
            <div className="flex flex-col gap-4">
                <Upload.EditComp
                    onChange={() => {}}
                    size={1}
                    format={{
                        app,
                        type: `${createdSource.doc_type}-${viewId}`,
                        config: createdSource.config || '{}',
                    }}
                    view_id={viewId}
                    parent={createdSource}
                    apiLoad={() => {}}
                    apiUpdate={localApiUpdate}
                    context={DatasetsContext}
                />
                <div>
                    <Button
                        type="plain"
                        onClick={() => navigate(`${baseUrl}/internal_source/${createdSource.id}`)}
                    >
                        Go to Dataset
                    </Button>
                </div>
            </div>
        );
    }

    return (
        <div className="flex flex-col gap-2">
            {error && <div className="text-red-500 text-sm">{error}</div>}
            <Button
                disabled={!source.name?.trim() || stage === 'creating'}
                onClick={handleCreate}
            >
                {stage === 'creating' ? 'Creating...' : 'Create & Upload'}
            </Button>
        </div>
    );
}
