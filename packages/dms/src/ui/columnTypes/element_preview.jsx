import React, { useContext, useState } from 'react';
import { get } from 'lodash-es';
import { CMSContext, ComponentContext, PageContext, DataSourceContext } from '../../patterns/page/context';
import { ThemeContext } from '../useTheme';
import { getRegisteredComponents } from '../../patterns/page/components/sections/componentRegistry';
import SectionComponents from '../../patterns/page/components/sections/components';

const { ViewComp: SectionViewComp } = SectionComponents;

function extractAtom(v) {
    return v?.$type === 'atom' ? v.value : v;
}

async function loadFullSection(falcor, app, type, id) {
    const appType = `${app}+${type}`;
    await falcor.get(['dms', 'data', appType, 'byId', [+id], ['id', 'data']]);
    const raw = falcor.getCache()?.dms?.data?.[appType]?.byId?.[+id] || {};
    const itemData = extractAtom(raw.data) || {};
    return { id: +id, ...itemData };
}

function PreviewModal({ section, onClose, apiLoad, apiUpdate }) {
    const { UI } = useContext(ThemeContext) || {};
    const { Modal } = UI || {};

    const element = section?.element || {};
    const elementType = get(element, ['element-type'], 'lexical');
    const RegisteredComponents = getRegisteredComponents();
    const component = RegisteredComponents[elementType] || RegisteredComponents['lexical'];
    const title = section?.title || elementType;

    const minimalPageCtx = { pageState: {}, apiLoad, apiUpdate, dataSources: [] };

    const noop = () => {};

    return (
        <Modal open={true} setOpen={onClose} className="w-full max-w-4xl max-h-[80vh] overflow-auto">
            <div className="p-4">
                <div className="flex items-center justify-between mb-4">
                    <div>
                        <h2 className="text-lg font-semibold">{title}</h2>
                        <span className="text-xs text-gray-400">{elementType}</span>
                    </div>
                    <button
                        onClick={onClose}
                        className="text-gray-400 hover:text-gray-600 text-2xl leading-none px-2"
                    >
                        ×
                    </button>
                </div>
                <PageContext.Provider value={minimalPageCtx}>
                    <DataSourceContext.Provider value={{
                        dataSources: {},
                        setDataSource: noop,
                        removeDataSource: noop,
                        createDataSource: noop,
                    }}>
                        <SectionViewComp
                            value={element}
                            onChange={noop}
                            component={component}
                            editPageMode={false}
                        />
                    </DataSourceContext.Provider>
                </PageContext.Provider>
            </div>
        </Modal>
    );
}

export function ElementPreviewView({ row, className }) {
    const { falcor } = useContext(CMSContext) || {};
    const { state, apiLoad, apiUpdate } = useContext(ComponentContext) || {};
    const { UI } = useContext(ThemeContext) || {};
    const { Button } = UI || {};
    const [loading, setLoading] = useState(false);
    const [section, setSection] = useState(null);

    const { app, type } = state?.externalSource || {};

    const handlePreview = async (e) => {
        e.stopPropagation();
        if (!falcor || !app || !type || !row?.id) return;
        setLoading(true);
        try {
            const fullSection = await loadFullSection(falcor, app, type, row.id);
            setSection(fullSection);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className={`flex items-center ${className || ''}`}>
            <Button onClick={handlePreview} disabled={loading}>
                {loading ? '…' : 'Preview'}
            </Button>
            {section && (
                <PreviewModal
                    section={section}
                    onClose={() => setSection(null)}
                    apiLoad={apiLoad}
                    apiUpdate={apiUpdate}
                />
            )}
        </div>
    );
}

export function ElementPreviewEdit(props) {
    return <ElementPreviewView {...props} />;
}
