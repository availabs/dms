import React, {useEffect} from 'react'
import { NavLink, Link, useSubmit, useNavigate, useLocation, useParams} from "react-router-dom";
import cloneDeep from 'lodash/cloneDeep'

import { SideNav } from '~/modules/avl-components/src'
import { getInPageNav } from "~/modules/dms/src/patterns/page/layout/utils/inPageNavItems.js";
import { json2DmsForm }  from '~/modules/dms/src/patterns/page/layout/nav'

import { PageControls } from './TemplateControls'


const theme = {
  page: {
    container: 'flex-1  w-full h-full ',
    content: '',
  }
}

export function TemplateEdit ({
  item, dataItems, updateAttribute ,attributes, setItem, status, params
}) {
  const navigate = useNavigate()
  const submit = useSubmit()
  
  const { pathname = '/edit' } = useLocation()
  //const { baseUrl } = React.useContext(CMSContext)
  const baseUrl = '/admin/templates'
  const { id } = params
  
  
  const inPageNav = getInPageNav(dataItems, baseUrl);


  const saveSection = (v) => {
    updateAttribute('sections', v)
    const newItem = cloneDeep(item)
    newItem.sections = v
    // console.log('save section', newItem)
    submit(json2DmsForm(newItem), { method: "post", action: `${baseUrl}/edit/${id}` })
    // save section
  }

  //console.log('page edit', attributes['sections'])
  const ContentEdit = attributes['sections'].EditComp
 
  return (
    <div key={id} className='flex flex-1 h-full w-full px-1 md:px-6 py-6'>
      {item?.sidebar === 'show' ? 
          (<div className='w-64 hidden xl:block'>
            <div className='w-64 fixed hidden xl:block h-screen'> 
              <div className='h-[calc(100%_-_8rem)] overflow-y-auto overflow-x-hidden'>
                <SideNav {...inPageNav} /> 
              </div>
            </div>
          </div>)
        : ''}
      <div className='flex-1 flex border shadow bg-white px-4 '>
        <div className={theme.page.container}>
          <div className='text-base font-light leading-7'>
            <ContentEdit
              value={item['sections']} 
              onChange={saveSection}         
              {...attributes['sections']}
            />
          </div>
        </div>
      </div>
      <div className='w-52 hidden xl:block'>
        <div className='w-52 fixed hidden xl:block h-screen'> 
          <PageControls 
            item={item} 
            dataItems={dataItems}
            setItem={setItem}
            edit={true}
            status={status}
            attributes={attributes}
            updateAttribute={updateAttribute}
          />
        </div>
      </div>
    </div>   
  ) 
}


