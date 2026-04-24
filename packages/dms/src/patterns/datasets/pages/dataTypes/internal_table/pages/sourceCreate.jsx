import React, { useState, useCallback, useContext } from "react";
import { useNavigate } from "react-router";
import { DatasetsContext } from "../../../../context";
import { ThemeContext } from "../../../../../../ui/themeContext";
import Upload from "../../../../components/upload";
import { nameToSlug, getInstance } from "../../../../../../utils/type-utils";
import { clearDatasetsListCache } from "../../../../utils/datasetsListCache";

function getNewId(falcorRes) {
    return Object.keys(falcorRes?.json?.dms?.data?.byId || {})
        .find(k => k !== '$__path');
}

export default function SourceCreate({ context, source }) {
    const ctx = useContext(DatasetsContext);
    const { UI } = useContext(ThemeContext);
    const { falcor, parent, user, type, app, baseUrl, dmsEnv } = ctx;
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
            const sourceSlug = nameToSlug(source.name);
            if (!sourceSlug) {
                throw new Error('Name must contain at least one letter or number.');
            }

            // Determine parent for source type
            const dmsEnvInstance = dmsEnv ? getInstance(dmsEnv.type) : type;
            const sourceType = `${dmsEnvInstance}|${sourceSlug}:source`;

            // 1. Create source data_items row
            const sourceRes = await falcor.call(
                ["dms", "data", "create"],
                [app, sourceType, {
                    name: source.name.trim(),
                    type: 'internal_table',
                }]
            );
            const sourceId = getNewId(sourceRes);
            if (!sourceId) throw new Error('Failed to create source');

            // 2. Create view data_items row
            const viewType = `${sourceSlug}|v1:view`;
            const viewRes = await falcor.call(
                ["dms", "data", "create"],
                [app, viewType, { name: 'version 1' }]
            );
            const vId = getNewId(viewRes);
            if (!vId) throw new Error('Failed to create view');

            // 3. Update source with view ref
            await falcor.call(["dms", "data", "edit"], [app, +sourceId, {
                views: [{ ref: `${app}+${sourceSlug}|view`, id: +vId }]
            }]);

            // 4. Add source ref to dmsEnv (if available) or pattern (legacy)
            const sourceOwner = dmsEnv || parent;
            const existingRefs = (sourceOwner.sources || [])
                .filter(s => s.id)
                .map(s => ({ ref: s.ref || `${app}+${dmsEnvInstance}|source`, id: s.id }));

            await falcor.call(["dms", "data", "edit"], [app, sourceOwner.id, {
                sources: [...existingRefs, { ref: `${app}+${dmsEnvInstance}|source`, id: +sourceId }]
            }]);

            // 5. Invalidate caches — create-specific: length + byIndex only.
            // Existing byId entries are unaffected; don't nuke the whole subtree.
            await falcor.invalidate(['dms', 'data', app, 'byId', sourceOwner.id]);
            await falcor.invalidate(['uda', `${app}+${type}`, 'sources', 'length']);
            await falcor.invalidate(['uda', `${app}+${type}`, 'sources', 'byIndex']);
            clearDatasetsListCache();

            // 6. Transition to upload stage
            setCreatedSource({
                id: +sourceId,
                source_id: +sourceId,
                app,
                name: source.name.trim(),
                type: 'internal_table',
                sourceSlug,
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
                        type: `${createdSource.sourceSlug}|${viewId}:data`,
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
