import React, {useContext} from "react";
import { ThemeContext } from "../../../../../../../ui/useTheme";
import {MapContext} from "./";

export const SymbologySelector = () => {
    const { state, setState, doApiLoad } = useContext(MapContext);
    const { UI } = useContext(ThemeContext) || {};
    const { ComboBox } = UI || {};

    const [dmsSymbologies, setDmsSymbologies] = React.useState([]);

    React.useEffect(() => {
        doApiLoad()
            .then(res => {
                setDmsSymbologies(res.map(sym => ({
                    ...sym,
                    symbology: {
                        ...sym.symbology,
                        id: sym.id
                    }
                })))
            });
    }, [doApiLoad]);

    const symbologies = dmsSymbologies;

// console.log("SymbologySelector::state.symbologies", state.symbologies);

// console.log("SymbologySelector::symbologies", symbologies);

    const activeSym = Object.values(state?.symbologies)[0]?.id || Object.values(state?.symbologies)[0]?.symbology_id;
    // useEffect(() => {
    //     const activeSymbology = state.symbologies?.[activeSym];
    //     const existingSym = symbologies.find(d => +d.id === +activeSym);
    //     console.log('?????????????????/', activeSymbology, existingSym)
    //     if(existingSym && !isEqual(activeSymbology, existingSym)){
    //         setState(draft => {
    //             draft.symbologies = {[activeSym.id]: {...existingSym, isVisible: true}}
    //         })
    //     }
    // }, [symbologies]);

// console.log("SymbologySelector::activeSym", activeSym);

    const symOptions = symbologies.map(sym => ({label: sym.name, key: sym.id || sym.symbology_id }));
    const layerOptions = Object.values(state.symbologies?.[activeSym]?.symbology?.layers || {}).map((layer, i) => ({label: layer.name?.length && layer.name !== ' ' ? layer.name : `layer - ${i+1}`, key: layer.id}));

// console.log("SymbologySelector::state.symbologies", Object.values(state.symbologies?.[activeSym]?.symbology?.layers || {}))
// console.log("SymbologySelector::symOptions", symOptions)
// console.log("SymbologySelector::layerOptions", layerOptions)

    return (
        <div className={'flex w-full bg-white items-center'}>
            <label className={'p-1'}>Symbology: </label>
            <div className={'w-1/2'}>
                <ComboBox
                    className={'flex-row-reverse'}
                    placeholder={'Search...'}
                    options={symOptions}
                    value={activeSym}
                    onChange={e => {
                        const sym = symbologies.find(f => +f.id === +e) || {};
                        if(!sym?.id) return;
                        // console.log('[sym', sym, e, symOptions)
                        setState(draft => {
                            draft.symbologies = {[e]: {...sym, isVisible: true}}
                        })
                    }}
                />
            </div>
            <label className={'p-1'}>Layer: </label>
            <div className={'w-1/2'}>
                <ComboBox
                    className={'flex-row-reverse'}
                    placeholder={'Search...'}
                    options={layerOptions}
                    value={state.symbologies?.[activeSym]?.symbology?.activeLayer}
                    onChange={e => {
                        const currLayer = state.symbologies?.[activeSym]?.symbology?.layers?.[e] || {};
                        // console.log('currView', state.symbologies, e)
                        if(currLayer) {
                            setState(draft => {
                                draft.symbologies[activeSym].symbology.activeLayer = e;
                            })
                        }
                    }}
                />
            </div>
        </div>
    )
}