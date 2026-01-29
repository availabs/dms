import React from 'react'

export const CreateDataset = ({ }) => {
  const { baseUrl, user, parent, falcor, siteType, type, damaDataTypes, datasources } = useContext(DatasetsContext);
  const [data, setData] = useState({name: ''});
  const ExternalComp = damaDataTypes[data?.type]?.sourceCreate?.component;
  return (
    <div>
      <select className={'w-full p-1 rounded-md border bg-white'}
        value={data.id}
        onChange={e => {
            const matchingSource = sources.find(s => s.id === e.target.value);
            if(matchingSource) {
                const numMatchingDocTypes = sources.filter(s => s.doc_type.includes(`${matchingSource.doc_type}_copy_`)).length;
                const clone = cloneDeep(matchingSource);
                // delete clone.id; remove on btn click since it's used to ID in select.
                clone.name = `${clone.name} copy (${numMatchingDocTypes+1})`
                setData(clone)
            }else if(damaDataTypes[e.target.value]){
                setData({...data, type: e.target.value})
            }else{
                setData({name: ''})
            }
        }}>
          <option key={'create-new'} value={undefined}>Create new</option>

            {
                Object.keys(damaDataTypes).map(source => (<option key={source} value={source}>{source}</option>))
            }
      </select>
      <input className={'p-1 mx-1 text-sm font-light w-full block'}
            key={'new-form-name'}
            value={data.name}
            placeholder={'Name'}
            onChange={e => setData({...data, name: e.target.value})}
      />
      {
          !damaDataTypes[data?.type] || !ExternalComp ? (
            <div>
              <button
                className={'p-1 mx-1 bg-blue-300 hover:bg-blue-500 text-white'}
                disabled={!data.name}
                onClick={async () => {
                      const clonedData = cloneDeep(data);
                      delete clonedData.id;
                      delete clonedData.views;
                      clonedData.doc_type = crypto.randomUUID();
                      await updateData({sources: [...(sources || []).filter(s => s.type === `${type}|source`), clonedData]})
                      window.location.reload()
                  }}
                  >add</button>
                  <button className={'p-1 mx-1 bg-red-300 hover:bg-red-500 text-white'}
                          onClick={() => {
                              setData({name: ''})
                              setIsAdding(false)
                          }}
                  >cancel</button>
              </div>
          ) : <ExternalComp context={DatasetsContext} source={data} />
      }
    </div>
  )
}
