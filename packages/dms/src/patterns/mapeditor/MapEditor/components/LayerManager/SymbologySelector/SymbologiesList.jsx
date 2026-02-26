import React, { useEffect, useState, useMemo } from 'react'
import SourcesLayout from "../../../../SourceLayout";
import { MapEditorContext } from "../../../../context"
import get from 'lodash/get'
import { getAttributes } from "../../../../attributes";

import SourceCategories from "../../../../SourceCategories";
import { SymbologyContext } from '../../../';

const SourceThumb = ({ symbology, selectedSymbologyId, setSelectedSymbologyId, cat1, setCat1 }) => {
  const isActiveSymbology = selectedSymbologyId === symbology.id;
  const symCats = Array.isArray(symbology?.categories) ? symbology?.categories : []
  return (
    <div>
      <div 
        className={`w-full p-4 ${isActiveSymbology ? 'bg-blue-100 hover:bg-blue-200' : 'bg-white hover:bg-blue-50'} block border shadow flex`} 
        onClick={() => {
          if (isActiveSymbology) {
            setSelectedSymbologyId(null);
          } else {
            setSelectedSymbologyId((symbology.id || symbology.symbology_id));
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




export const SymbologiesList = ({selectedSymbologyId, setSelectedSymbologyId}) => {
  const { falcorCache, pgEnv, baseUrl } = React.useContext(MapEditorContext);
  const { symbologies } = React.useContext(SymbologyContext);

  const isListAll = window.location.pathname.replace(`${baseUrl}/`, '')?.split('/')?.[0] === 'listall';
  const [layerSearch, setLayerSearch] = useState("");
  const [cat1, setCat1] = useState();
  const [cat2, setCat2] = useState();
  const [sort, setSort] = useState('asc');
  const sourceDataCat = 'Unknown';

// console.log("SymbologiesList::symbologies", symbologies);

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
  }, [pgEnv, falcorCache, selectedSymbologyId]);

  const actionButtonClassName = 'bg-transparent hover:bg-blue-100 rounded-sm p-2 ml-0.5 border-2';

  return (
    <SourcesLayout baseUrl={baseUrl} isListAll={isListAll} hideBreadcrumbs={true}>
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
        <div className={'w-1/4 flex flex-col space-y-1.5 max-h-[65dvh] overflow-auto scrollbar-sm'}>
          <SourceCategories 
            symbology={selectedSymbology}
            editingCategories={!!selectedSymbologyId}
            entityType={'symbologies'}
          />
          {(categories || [])
              .filter(cat => cat !== sourceDataCat)
              .sort((a,b) => a.localeCompare(b))
              .map(cat => (
              <div
                  key={cat}
                  className={`${cat1 === cat || cat2 === cat ? `bg-blue-100 hover:bg-blue-200` : `bg-white hover:bg-blue-50`}  hover:cursor-pointer p-2 rounded-md flex items-center`}
                  onClick={() => {
                    if (cat === cat1) {
                      setCat1("")
                    }
                    else {
                      setCat1(cat)
                    }
                  }}
              >
                <i className={'fa fa-category'} /> 
                {cat}
                <div className={'bg-blue-200 text-blue-600 text-xs w-5 h-5 ml-2 shrink-0 grow-0 rounded-lg flex items-center justify-center border border-blue-300'}>
                  {categoriesCount[cat]}
                </div>
              </div>
          ))
          }
        </div>
        <div className={'w-3/4 flex flex-col space-y-1.5 ml-1.5 max-h-[65dvh] overflow-auto scrollbar-sm'}>
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
                    baseUrl={baseUrl}
                    selectedSymbologyId={selectedSymbologyId}
                    setSelectedSymbologyId={setSelectedSymbologyId}
                  />
                ))
          }
        </div>
      </div>
    </SourcesLayout>

    
  )
}