import React, {useEffect} from 'react'
import { cloneDeep } from "lodash-es"
import { isEqual } from "lodash-es"
import { CMSContext } from '../../context'
import {ThemeContext} from "../../../../ui/useTheme";

function MenuItemsEditor({onSave, onCancel, items}) {
    let [newItems, setNewItems] = React.useState(JSON.stringify( (items || []), null , 3 ));

    useEffect(() => {
        if(!isEqual(items, newItems)) setNewItems(JSON.stringify( (items || []), null , 3 ));
    }, [items]);

  return (
    <div>
      (
          <div>

            <div className='w-full'>
              <textarea
                className='p-2 bg-white w-full'
                value={newItems}
                onChange={(e) => setNewItems(e.target.value)}
              />
            </div>
          </div>

      <div className='flex justify-end py-2'>
        <div className='bg-slate-300 rounded px-2 py-1 text-slate-100 cursor-pointer' onClick={onCancel} >Cancel</div>
        <div className='bg-blue-500 rounded px-2 py-1 text-white cursor-pointer ml-2' onClick={() => onSave(JSON.parse(newItems) || items)}>Save</div>
      </div>
    </div>
  )
}

function FormatManager ({item, dataItems, attributes, apiLoad, apiUpdate, format, logo, rightMenu,themes, ...props}) {
    const { theme, UI } = React.useContext(ThemeContext);
    const {Layout, SideNavContainer, Icon} = UI;
  const [ additionalSectionAttributes, setAdditionalSectionAttributes ] = React.useState([])
  const [ pattern, setPattern ] = React.useState({})

  const PatternFormat = {
    app: format.app,
    type: "pattern",
    attributes: [
      { key: "format",
        type: "json",
      }
    ]
  }

  React.useEffect(() => {
      const loadData = async () => {
        const {app, type} = format
        let data = await apiLoad({
            children: [{
                action: "list",
                path: "/*",
                filter: {
                  options: JSON.stringify({ filter: { "data->>'doc_type'": [format.type] }}),
                }
            }],
            format: PatternFormat
        })
        // console.log('got data', data, format.type)
        setAdditionalSectionAttributes( cloneDeep(data?.[0]?.additionalSectionAttributes || []))
        setPattern( cloneDeep( {theme: {},...data?.[0]} || {}))
      }
      loadData()
  },[])

  function saveAttributes () {
    let update =  apiUpdate({data:{id: pattern.id, additionalSectionAttributes}, config:{format:PatternFormat}})
    setPattern({...pattern, additionalSectionAttributes})
  }

  return (
      <div className='flex h-full flex-col'>
          <div>
              section attributes
              <MenuItemsEditor items={additionalSectionAttributes} onSave={setAdditionalSectionAttributes} onCancel={() => setAdditionalSectionAttributes(pattern.additionalSectionAttributes)} />
          </div>
          <button
              onClick={saveAttributes}
              disabled={isEqual(pattern.additionalSectionAttributes, additionalSectionAttributes)}
              className='bg-blue-500 disabled:bg-slate-300  disabled:border-slate-400  rounded px-3 border border-blue-400 shadow  py-1 text-white cursor-pointer mx-2'
          >
              Save
          </button>
        </div>
  )
}


export default FormatManager
