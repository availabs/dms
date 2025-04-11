import { useState, useMemo, useContext } from 'react'
import get from 'lodash/get'
import { CMSContext } from '~/modules/dms/src'
const SourceThumb = ({ symbology, selectedSymbologyId, setSelectedSymbologyId, cat1, setCat1 }) => {
  const isActiveSymbology = selectedSymbologyId === symbology.symbology_id;
  const symCats = Array.isArray(symbology?.categories) ? symbology?.categories : []
  return (
    <div>
      <div 
        className={`w-full p-4 ${isActiveSymbology ? 'bg-blue-100 hover:bg-blue-200' : 'bg-white hover:bg-blue-50'} block border shadow flex`} 
        onClick={() => {
          if (isActiveSymbology) {
            setSelectedSymbologyId(null);
          } else {
            setSelectedSymbologyId(symbology.symbology_id);
          }
        }}
      >
        <div>
          <div className='text-xl font-medium w-full block'>
            <span>{symbology.name}</span>
          </div>
          <div>
            {symCats
              .map(cat => (typeof cat === 'string' ? [cat] : cat).map((s, i) => {
                const isActiveCat = s === cat1;

                let colorClass = 'bg-blue-100 text-blue-400 hover:bg-blue-400';

                if (isActiveSymbology || isActiveCat) {
                  //one level of color boldness
                  colorClass = 'bg-blue-300 text-blue-500 hover:bg-blue-400';
                  if (isActiveSymbology && isActiveCat) {
                    //two level of boldness
                    colorClass = 'bg-blue-400 text-blue-600 hover:bg-blue-500';
                  }
                }

                return (
                  <div 
                    key={i}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (isActiveCat) {
                        setCat1("")
                      }
                      else {
                        setCat1(s)
                      }
                    }} 
                    className={`inline hover:cursor-pointer text-xs p-1 px-2 ${colorClass}  mr-2`}
                  >
                    {s}
                  </div>
              )}))
            }
          </div>
          <div className='py-2 block'>
            {symbology.description}
          </div>
        </div>      
      </div>
    </div>

  );
};




export const SymbologiesList = ({selectedSymbologyId, setSelectedSymbologyId, symbologies}) => {
  const cctx = useContext(CMSContext);
  let { pgEnv='hazmit_dama', falcor, falcorCache } = cctx;


  const isListAll = window.location.pathname?.split('/')?.[0] === 'listall';
  const [layerSearch, setLayerSearch] = useState("");
  const [cat1, setCat1] = useState();
  const [cat2, setCat2] = useState();
  const [sort, setSort] = useState('asc');
  const sourceDataCat = 'Unknown'

  const categories = [...new Set(
    symbologies
        .filter(symbology => {
          const symCats = Array.isArray(symbology?.categories) ? symbology?.categories : []//JSON.parse(symbology?.categories)
          //console.log('symbology ', symbology.categories,) 
          
          return isListAll || (!isListAll && !symCats?.find(cat => cat.includes(sourceDataCat)))
        })
        .reduce((acc, s) => {
          let cats = Array.isArray(s?.categories) ?  s.categories : []
          return [...acc, ...(cats.map(s1 => s1[0]) || [])]
        }, []))
  ].sort()

  const categoriesCount = categories.reduce((acc, cat) => {
    acc[cat] = symbologies.filter(source => {
      return source.categories?.find(category => category.includes(cat))
    })?.length
    return acc;
  }, {})

  const selectedSymbology = useMemo(() => {
    return symbologies.find(symb => symb.symbology_id === selectedSymbologyId) ?? {}
  }, [symbologies,pgEnv,  selectedSymbologyId]);

  const actionButtonClassName = 'bg-transparent hover:bg-blue-100 rounded-sm p-2 ml-0.5 border-2';

  return (
    <div>
      <div className="py-4 flex flex-rows items-center">
        <input
            className="w-full text-lg p-2 border border-gray-300 "
            placeholder="Search symbologies"
            value={layerSearch}
            onChange={(e) => setLayerSearch(e.target.value)}
        />
        <button
            className={actionButtonClassName}
            title={'Toggle Sort'}
            onClick={() => setSort(sort === 'asc' ? 'desc' : 'asc')}
        >
          <i className={`fa-solid ${sort === 'asc' ? `fa-arrow-down-z-a` : `fa-arrow-down-a-z`} text-xl text-blue-400`}/>
        </button>
        <div
            onClick={() => {
              setCat1("")
              setLayerSearch("")
            }}
            className={actionButtonClassName} title={isListAll ? 'View Key Sources' : 'View All Sources'}>
          <i className={`fa-solid ${isListAll ? `fa-filter-list` : `fa-list-ul`} text-xl text-blue-400`}/>
        </div>
      </div>
      <div className={'flex flex-row'}>
        <div className={'w-full flex flex-col space-y-1.5 ml-1.5 max-h-[65dvh] overflow-auto scrollbar-sm'}>
          {
            symbologies
                .filter(source => {
                  const symCats = Array.isArray(source?.categories) ? source?.categories : []//JSON.parse(symbology?.categories)
          
                  return isListAll || (!isListAll && !symCats?.find(cat => cat.includes(sourceDataCat)))
                })
                .filter(source => {
                  let output = true;
                  if (cat1) {
                    output = false;
                    (get(source, "categories", []) || [])
                        .forEach(site => {
                          if (site[0] === cat1 && (!cat2 || site[1] === cat2)) {
                            output = true;
                          }
                        });
                  }
                  return output;
                })
                .filter(source => {
                  const symCats = Array.isArray(source?.categories) ? source?.categories : []
                  let searchTerm = (source.name + " " + (symCats || [])
                      .reduce((out,cat) => {
                        out += Array.isArray(cat) ? cat.join(' ') : typeof cat === 'string' ? cat : '';
                        return out
                      },'')) //get(source, "categories[0]", []).join(" "));
                  return !layerSearch.length > 2 || searchTerm.toLowerCase().includes(layerSearch.toLowerCase());
                })
                .sort((a,b) => {
                  const m = sort === 'asc' ? 1 : -1;
                  return m * a.name?.localeCompare(b.name)
                })
                .map((s, i) => (
                  <SourceThumb
                    cat1={cat1}
                    setCat1={setCat1}
                    key={i}
                    symbology={s}
                    selectedSymbologyId={selectedSymbologyId}
                    setSelectedSymbologyId={setSelectedSymbologyId}
                  />
                ))
          }
        </div>
      </div>
    </div>

    
  )
}