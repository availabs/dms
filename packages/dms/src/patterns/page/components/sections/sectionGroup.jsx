import React from 'react'
import { Link, useLocation } from 'react-router'
import { ThemeContext } from "../../../../ui/useTheme";
import { PageContext, CMSContext } from '../../context'
import { getInPageNav } from '../../pages/_utils'
import { appendHistoryEntry } from '../../pages/edit/editFunctions'

import SectionArray from './sectionArray'

export default function SectionGroup ({group, attributes, edit}) {
  const { theme,  UI } = React.useContext(ThemeContext);
  const { user } = React.useContext(CMSContext) || {};

  const { apiUpdate, item, updateAttribute, pageState, clearActionParam } = React.useContext(PageContext);
  const { SideNav, LayoutGroup, Modal } = UI;

  const inPageNav = getInPageNav(item,theme)
  const styleIndex = theme.layoutGroup.styles.map(d => d.name).indexOf(group.theme || 'default')
  const activeStyle =  styleIndex === -1 ? 0 : styleIndex
  const sectionAttributes =  attributes?.['sections']?.attributes
  const SectionArrayComp = React.useMemo(() => {
      return edit ?
        ( attributes?.['sections']?.EditComp || SectionArray?.EditComp ) :
        ( attributes?.['sections'].ViewComp || SectionArray?.ViewComp )
  }, [])

  const isModal = group.isModal && !edit;
  const modalParamKey = group.modalParamKey;
  const isOpen = isModal
      ? (pageState?.filters?.some(f => f.searchKey === modalParamKey && f.type === 'action' && f.values?.[0] !== undefined))
      : true;

  if (isModal && !isOpen) return null;
  if (isModal) {
      // return (
      //     <Modal open={isModal && isOpen} setOpen={() => clearActionParam(modalParamKey)}>
      //         <SectionArrayComp
      //             group={group}
      //             value={item?.['sections'] || [] }
      //             attr={sectionAttributes}
      //             onChange={(update, action) => updateSections({update, action, item, user, apiUpdate, updateAttribute})}
      //         />
      //     </Modal>
      // );
    return (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
        onClick={() => clearActionParam(modalParamKey)}
      >
        <div
          className="relative bg-white rounded-lg shadow-xl w-full max-w-4xl mx-4 max-h-[90vh] overflow-y-auto"
          onClick={e => e.stopPropagation()}
        >
          <button
            className="absolute top-3 right-3 text-gray-400 hover:text-gray-700 z-10 text-xl leading-none"
            onClick={() => clearActionParam(modalParamKey)}
          >✕</button>
          <SectionArrayComp
            group={group}
            value={item?.['sections'] || [] }
            attr={sectionAttributes}
            onChange={(update, action) => updateSections({update, action, item, user, apiUpdate, updateAttribute})}
          />
        </div>
      </div>
    );
  }

  return (
    <LayoutGroup
      activeStyle={ activeStyle }
      outerChildren={
        item?.sidebar && group.name === 'default' && (
          <div className={`${theme?.pages?.sectionGroup?.sideNavContainer1} ${item?.sidebar === 'left' ? '': 'order-2'}`}>
            <div className={theme?.pages?.sectionGroup?.sideNavContainer2}>
              <div className={theme?.pages?.sectionGroup?.sideNavContainer3}>
                <SideNav {...inPageNav} />
              </div>
            </div>
          </div>
        )
      }
    >
      <SectionArrayComp
        group={group}
        value={item?.[edit ? 'draft_sections' : 'sections'] || [] }
        attr={sectionAttributes}
        onChange={(update, action ) => updateSections({update, action, item, user, apiUpdate, updateAttribute})}
      />
    </LayoutGroup>
  )
}


const updateSections = async ({update, action, item, user, apiUpdate, updateAttribute}) => {
    // const headerSection = item['draft_sections']?.filter(d => d.is_header)?.[0]
    const history = action
      ? appendHistoryEntry(item.history, action, user)
      : (item.history || {})

    //Testing here
    if(updateAttribute) {
      updateAttribute('','',{
        'has_changes': true,
        'history': history,
        'draft_sections': update.filter(d => d)
      })
    }

    // ----------------
    // only need to send id, and data to update, not whole
    // --------------------
    const newItem = {
      id: item?.id,
      draft_sections: update.filter(d => d),
      has_changes: true,
      history,
    }
    //console.log('editFunction saveSection newItem',newItem, update)
    await apiUpdate({data: newItem, skipNavigate: true})
}
