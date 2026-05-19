import React, { useState } from 'react'
import { SymbologyContext } from '../../'
import LegendPanel from './LegendPanel'
import LayerPanel from './LayerPanel'
import PluginPanel from './PluginPanel'
import SymbologyControl from './SymbologyControl'
import SourceSelector from './SourceSelector'

const TABS = [
  { name: 'Legend', Component: LegendPanel },
  { name: 'Layers', Component: LayerPanel },
  { name: 'Plugins', Component: PluginPanel },
];

// Inline tab implementation rather than UI.Tabs because SourceSelector lives
// in the same flex row as the tab triggers — UI.Tabs owns its tablist <div>
// and can't accept sibling content there.
function LayerManager () {
  const { state } = React.useContext(SymbologyContext);
  const [tabIdx, setTabIdx] = useState(0);
  const ActivePanel = TABS[tabIdx].Component;

  return(
    <div className='p-4'>
      <div className='bg-white/95 w-[340px] rounded-lg drop-shadow-lg pointer-events-auto flex flex-col min-h-[400px] max-h-[calc(100vh_-_111px)] overflow-hidden'>
        <div className='shrink-0'>
          <SymbologyControl />
        </div>
        {state?.id && (
          <>
            <div className='flex justify-between items-center border-b shrink-0'>
              <div role="tablist">
                {TABS.map(({name}, i) => (
                  <button
                    key={name}
                    type="button"
                    role="tab"
                    aria-selected={i === tabIdx}
                    onClick={() => setTabIdx(i)}
                    className={`${i === tabIdx ?
                      'text-slate-600 border-b font-medium border-slate-600' :
                      'text-slate-400'} mx-1 text-sm p-2 cursor-pointer`}
                  >
                    {name}
                  </button>
                ))}
              </div>
              <SourceSelector />
            </div>
            <div className='flex-1 min-h-0 overflow-y-auto overflow-x-hidden scroll-xs' role="tabpanel">
              <ActivePanel />
            </div>
          </>
        )}
      </div>
    </div>
  )
}



export default LayerManager