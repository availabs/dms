import { useContext } from 'react'
import { SymbologyContext } from '../../../'
import set from 'lodash/set'
import { generateDefaultName } from '../SymbologyControl/components/SaveChangesMenu'
export const DuplicateLayerItem = ({ layer }) => {
  const { state, setState  } = useContext(SymbologyContext);

  const duplicateLayer = () => { 
    let newLayer = JSON.stringify({
      ...layer,
      name: generateDefaultName(layer.name),
      order: Object.values(state.symbology.layers).length
    });

    const newLayerId = Math.random().toString(36).replace(/[^a-z]+/g, '');
    newLayer = newLayer.replaceAll(layer.id, newLayerId)

    setState(draft => {
      set(draft, `symbology.layers[${newLayerId}]`,JSON.parse(newLayer))
    })
  }

  return (
  <div 
    onClick={duplicateLayer}
    className={`hover:bg-pink-50 flex w-full items-center text-slate-600 rounded-md px-2 py-2 text-sm`}
  >
    Duplicate layer
  </div>
)}