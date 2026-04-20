import React, { useEffect, useMemo, useState } from "react";
import { get } from "lodash-es";
import SourcesLayout from "../../../../SourceLayout";
import { MapEditorContext } from "../../../../context"
import { SourceAttributes, ViewAttributes, getAttributes } from "../../../../attributes";
import { DEFAULT_SOURCE } from "../SourceSelector";
import { dmsColumnTypes } from "../../../../../../"
import { makeLexicalFormat } from "../../../../utils";
import { ThemeContext } from "../../../../../../ui/themeContext";

const SourceThumb = ({ source, selectedSource, setSource, cat1, setCat1 }) => {
  const { pgEnv, baseUrl, useFalcor } = React.useContext(MapEditorContext);
  const { falcor, falcorCache } = useFalcor();
  const { UI } = React.useContext(ThemeContext) || {}
  const { Icon } = UI
  const activeViewId = selectedSource.viewId;

  const isActiveSource = selectedSource?.sourceId === source.source_id;
  const lengthPath = ["uda", pgEnv, "sources", "byId", source.source_id, "views", "length"];

  useEffect(() => {
    async function fetchData() {
      const resp = await falcor.get(lengthPath);
      await falcor.get([
        "uda", pgEnv, "sources", "byId",
        source.source_id, "views", "byIndex",
        { from: 0, to: get(resp.json, lengthPath, 0) - 1 },
        Object.values(ViewAttributes)
      ]);
    }
    fetchData();
  }, [falcor, falcorCache, source, pgEnv]);

  const viewLength = useMemo(() => {
    return parseInt(get(falcorCache, lengthPath, 0))
  }, [falcorCache]);

  const sourceViews = useMemo(() => {
    return Object.values(
      get(falcorCache,["uda", pgEnv, "sources", "byId", source.source_id, "views", "byIndex"], {}
    )).map(d => getAttributes(get(falcorCache, d.value, {})))
    .sort((a,b) => new Date(b?._created_timestamp) - new Date(a?._created_timestamp));
  }, [falcorCache, source.source_id]);

  const Lexical = dmsColumnTypes.lexical.ViewComp;

  return (
    <div>
      <div
        className={`w-full p-4 ${isActiveSource ? 'bg-blue-100 hover:bg-blue-200' : 'bg-white hover:bg-blue-50'} overflow-hidden block border shadow flex`}
        onClick={() => {
          if (selectedSource.sourceId !== source.source_id) {

            const newSource = {
              ...source,
              add: true,
              sourceId: source.source_id,
            };
            if (viewLength === 1 && sourceViews.length === 1) {
              newSource.viewId = sourceViews[0].view_id;
            }
            setSource(newSource);
          } else {
            setSource({ ...DEFAULT_SOURCE, add: true });
          }
        }}
      >
        <div>
          <div className='text-xl font-medium w-full block'>
            <span>{source.name}</span>
          </div>
          <div>
            {(get(source, 'categories', []) || [])
              .map(cat => (typeof cat === 'string' ? [cat] : cat).map((s, i) => {
                const isActiveCat = s === cat1;

                let colorClass = 'bg-blue-100 text-blue-400 hover:bg-blue-400';

                if (isActiveSource || isActiveCat) {
                  //one level of color boldness
                  colorClass = 'bg-blue-300 text-blue-500 hover:bg-blue-400';
                  if (isActiveSource && isActiveCat) {
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
            <Lexical value={makeLexicalFormat(source.description)}/>
          </div>
        </div>
      </div>
      {
        isActiveSource && <>
          <div className='bg-gray-200 shadow grid grid-cols-10 '>
            <div className="border-bottom border-black border-b-2 pl-4 col-span-6">Name</div>
            <div className="border-bottom border-black border-b-2 pl-[7px] col-span-2">Date uploaded</div>
            <div className="border-bottom border-black border-b-2 pl-[3px] col-span-2">Last modified</div>
          </div>
          {
            sourceViews.map((view, i) => {
              const isActiveView = activeViewId === view.view_id;
              const isDarkRow = i % 2 == 0;

              const rowColorClass = isActiveView
                ? "bg-gray-300 hover:bg-gray-400"
                : isDarkRow
                ? "bg-gray-200 hover:bg-gray-300"
                : "bg-gray-100 hover:bg-gray-200";

              return (
                <div
                  key={`sourceview_row_${view.view_id}`}
                  className={`${rowColorClass} px-4  shadow grid grid-cols-10 gap-4`}
                  onClick={() => {
                    if (!isActiveView) {
                      setSource({ ...selectedSource, viewId: view.view_id });
                    } else {
                      setSource({ ...selectedSource, viewId: undefined });
                    }
                  }}
                >
                  <div
                    className="col-span-6"
                  >
                    <div>
                      {view.version ?? view.view_id}
                    </div>
                  </div>
                  <div className="flex items-center col-span-2">
                    {new Date(view._created_timestamp).toLocaleDateString()}
                  </div>
                  <div className="flex items-center col-span-2">
                    {new Date(view._modified_timestamp).toLocaleDateString()}
                    {isActiveView && <Icon icon="CircleCheck" className='ml-2 text-green-700 h-5 w-5'/>}
                  </div>
                </div>
              )
            })
          }
        </>
      }
    </div>

  );
};


const SourcesList = ({selectedSource, setSource}) => {
  const [layerSearch, setLayerSearch] = useState("");
  const [cat1, setCat1] = useState();
  const [cat2, setCat2] = useState();
  const {pgEnv, baseUrl, useFalcor} = React.useContext(MapEditorContext);
  const { falcor, falcorCache } = useFalcor();
  const [sort, setSort] = useState('asc');
  const sourceDataCat = 'Unknown'
  const isListAll = window.location.pathname.replace(`${baseUrl}/`, '')?.split('/')?.[0] === 'listall';

  useEffect(() => {
    async function fetchData() {
      const lengthPath = ["uda", pgEnv, "sources", "length"];
      const resp = await falcor.get(lengthPath);
      await falcor.get([
        "uda", pgEnv, "sources", "byIndex",
        { from: 0, to: get(resp.json, lengthPath, 0) - 1 },
        Object.values(SourceAttributes)
      ]);
    }

    fetchData();
  }, [falcor, pgEnv]);

  const sources = useMemo(() => {
    return Object.values(get(falcorCache, ["uda", pgEnv, "sources", "byIndex"], []))
      .map(ref => getAttributes(get(falcorCache, ref.value, {})))
  }, [falcorCache, pgEnv]);

  const categories = [...new Set(
      sources
          .filter(source => {
            return isListAll || (!isListAll && !source.categories?.find(cat => cat.includes(sourceDataCat)))
          })
          .reduce((acc, s) => [...acc, ...(s.categories?.map(s1 => s1[0]) || [])], []))].sort()

  const categoriesCount = categories.reduce((acc, cat) => {
    acc[cat] = sources.filter(source => {
      return source.categories?.find(category => category.includes(cat))
    })?.length
    return acc;
  }, {})
  const actionButtonClassName = 'bg-transparent hover:bg-blue-100 rounded-sm p-2 ml-0.5 border-2'
  return (
    <SourcesLayout baseUrl={baseUrl} isListAll={isListAll} hideBreadcrumbs={true}>
      <div className="py-4 flex flex-rows items-center">
        <input
            className="w-full text-lg p-2 border border-gray-300 "
            placeholder="Search datasources"
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
        <div className={'w-3/4 flex flex-col space-y-1.5 ml-1.5 max-h-[65dvh] overflow-y-auto overflow-x-hidden scrollbar-sm'}>
          {
            sources
                .filter(source => {
                  return isListAll || (!isListAll && !source.categories?.find(cat => cat.includes(sourceDataCat)))
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
                  let searchTerm = (source.name + " " + (source?.categories || [])
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
                    source={s}
                    baseUrl={baseUrl}
                    selectedSource={selectedSource}
                    setSource={setSource}
                  />
                ))
          }
        </div>
      </div>
    </SourcesLayout>

  );
};


export default SourcesList;
