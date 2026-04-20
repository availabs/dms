import React, {useContext, useEffect, useMemo} from 'react';

import { MapEditorContext } from './context'
import { ThemeContext } from "../../ui/themeContext"

import { Link, useParams } from 'react-router'
import { get } from 'lodash-es'


const Item = (to, icon, span, condition) => (
    condition === undefined || condition ?
        <Link to={ to } >
            <div className='px-6 py-2 bg-blue-500 text-white hover:text-blue-100'>
                <div className='hover:translate-x-2 transition duration-100 ease-out hover:ease-in'>
                    <i className={`${icon} `} />
                    <span className='pl-2'>{span}</span>
                </div>
            </div>
        </Link>
    : null
)

const SourcesLayout = ({children, fullWidth, hideBreadcrumbs, isListAll }) => {
  return (

    <div className='w-full h-full bg-slate-100'>
      <div className={`${fullWidth ? '' : 'max-w-6xl mx-auto'} h-full flex flex-col`}>
        {hideBreadcrumbs ? '' :  <div className=''>
          <Breadcrumbs fullWidth={fullWidth} isListAll={isListAll} />
        </div> }
        <div className='flex-1 flex flex-col'>
          {children}
        </div>
      </div>
    </div>
  )
}

export const Header = ({baseUrl=''}) => {
  const { UI } = React.useContext(ThemeContext) || {};
  const { Dropdown } = UI;

  return (
    <div className='pt-[2px]'>
      <div className='h-full z-50'>
        <Dropdown control={
          <div className='px-2 flex text-lg'>
            <div className=' font-medium text-gray-800'> Data Manager</div>
            <div className='fal fa-angle-down px-3 mt-[6px] '/>
          </div>}
          className={`text-gray-800 group z-50`}
          openType='click'
        >
          <div className='p-1 bg-blue-500 text-base z-40'>
            <div key={'Sources'} className='py-1 '>
              {Item(`${baseUrl}/`, 'fa fa-files flex-shrink-0  pr-1', 'Sources')}
            </div>
            <div key={'Map Editor'} className='py-1 '>
              {Item(`${baseUrl}/mapeditor`, 'fa fa-pen-to-square flex-shrink-0  pr-1', 'Map Editor')}
            </div>
            <div key={'Activity'} className='py-1 '>
              {Item(`${baseUrl}/tasks`, 'fa fa-list flex-shrink-0  pr-1', 'Activity')}
            </div>
            <div key={'Upload'} className='py-1 '>
              {Item(`${baseUrl}/create/source`, 'fa fa-file-plus flex-shrink-0  pr-1', 'Upload')}
            </div>
            <div key={'Schedule Tasks'} className='py-1 '>
              {Item(`${baseUrl}/schedules`, 'fa fa-clock flex-shrink-0  pr-1', 'Schedule Tasks')}
            </div>
          </div>
        </Dropdown>
      </div>

    </div>
  )
}

export const DataManagerHeader = () => {
  const { UI } = React.useContext(ThemeContext) || {};
  const { Dropdown } = UI;
  // const { pgEnv } = React.useContext(MapEditorContext)
  // const baseUrl = '/'
  const { baseUrl='/', user={}} = {}

  return (
    <div className='pt-[2px]'>
      { user?.authLevel >= 5 ?
        (
          <div className='h-full'>
            <Dropdown control={
              <div className='px-2 flex text-lg'>
                <div className=' font-medium text-gray-800'> Data Manager</div>
                <div className='fal fa-angle-down px-3 mt-[6px] '/>

              </div>}
              className={`text-gray-800 group`} openType='click'
            >
              <div className='p-1 bg-blue-500 text-base'>
                <div className='py-1 '>
                    {Item(`${baseUrl}/create/source`, 'fa fa-file-plus flex-shrink-0  pr-1', 'Add New Datasource')}
                </div>
                {/*<div className='py-1 '>
                    {Item(`${baseUrl}/settings`, 'fa fa-cog flex-shrink-0  pr-1', 'Datamanager Settings')}
                </div>*/}
              </div>
            </Dropdown>
          </div>
        )
        : <div/>
      }
    </div>
  )
}


export default SourcesLayout

const Breadcrumbs =  ({fullWidth, isListAll}) => {
  const { sourceId, page, cat1, cat2} = useParams()
  const { pgEnv, baseUrl, falcor , falcorCache } = React.useContext(MapEditorContext)

  // console.log('BreadCrumbs', baseUrl)

  useEffect(() => {
    async function fetchData () {
      return sourceId ? await falcor.get(
        [
          "uda", pgEnv, "sources", "byId", sourceId,
          ["categories", "name", "data_type"]
        ]
      ) : Promise.resolve({})
    }
    fetchData()
  }, [falcor, sourceId, pgEnv])

  const pages = useMemo(() => {
    let attr = get(falcorCache, ["uda", pgEnv, "sources", "byId", sourceId], {})
    /*if(!get(attr, 'categories[0]', false)) {
      return [{name:'',to:''}]
    }*/

    let catList = get(attr ,'categories[0]', false) || [cat1,cat2].filter(d => d)

    // console.log('BreadCrumbs', catList, cat1, cat2, get(attr ,'categories[0]', false))

    let cats = typeof catList !== 'object' ? []
      : catList.map((d,i) => {
        return {
          name: d,
          href: `${baseUrl}${isListAll ? '/listall' : ''}/cat/${i > 0 ? catList[i-1] + '/' : ''}${d}`        }
      })
    cats.push({name:attr.name})
    return cats

  },[falcorCache,sourceId,pgEnv, cat1, cat2, baseUrl])

  return (
    <nav className="border-b border-gray-200 flex " aria-label="Breadcrumb">
      <ol className={`${fullWidth ? `w-full` : `max-w-screen-xl w-full mx-auto`}  px-4 flex space-x-4 sm:px-6 lg:px-8`}>
        <li className="flex">
          <div className="flex items-center">
            <Link to={`${baseUrl || '/'}${isListAll ? `/listall` : ``}`} className={"hover:text-[#bbd4cb] text-[#679d89]"}>
              <i className="fad fa-database flex-shrink-0 h-5 w-5" aria-hidden="true" />
              <span className="sr-only">Data Sources</span>
            </Link>
          </div>
        </li>
        {pages.map((page,i) => (
          <li key={i} className="flex">
            <div className="flex items-center">
              <svg
                className="flex-shrink-0 w-6 h-full text-gray-300"
                viewBox="0 0 30 44"
                preserveAspectRatio="none"
                fill="currentColor"
                xmlns="http://www.w3.org/2000/svg"
                aria-hidden="true"
              >
                <path d="M.293 0l22 22-22 22h1.414l22-22-22-22H.293z" />
              </svg>
              {page.href ?
                <Link
                  to={page.href}
                  className="ml-4 text-sm font-medium text-gray-500 hover:text-gray-700"
                  aria-current={page.current ? 'page' : undefined}
                >
                  {page.name}
                </Link> :
                <div
                  className="ml-4 text-sm font-medium text-gray-500 hover:text-gray-700"
                  aria-current={page.current ? 'page' : undefined}
                >
                  {page.name}
                </div>
              }
            </div>
          </li>
        ))}
      </ol>
    </nav>
  )
}
