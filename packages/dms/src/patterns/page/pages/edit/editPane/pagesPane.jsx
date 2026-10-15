import React, { useEffect, Fragment, useRef, useState } from 'react'
import { useLocation, useSubmit, NavLink} from "react-router";
import { cloneDeep, get, isEqual } from "lodash-es"
import { CMSContext,PageContext } from '../../../context'
import {json2DmsForm, getUrlSlug, getPageAuthPermissions} from '../../_utils'
import {publish, discardChanges, insertSubPage, duplicateItem, newPage} from '../editFunctions'
import {ThemeContext, getComponentTheme} from "../../../../../ui/useTheme";
import { editPaneTheme } from "./editPane.theme";
import { editPanesTheme } from "./editPanes.theme";
import PageTemplatePicker from '../../../components/PageTemplatePicker';


function AddPageButton ({ t }) {
    const { item, dataItems, apiUpdate, baseUrl } = React.useContext(PageContext) || {};
    const { user } = React.useContext(CMSContext) || {};
    const { UI } = React.useContext(ThemeContext);
    const { Button } = UI;
    const [loading, setLoading] = useState(false);
    const [pickerOpen, setPickerOpen] = useState(false);

    const handleSelect = async (template) => {
        setLoading(true);
        await newPage(item, dataItems, user, apiUpdate, template, baseUrl);
        setLoading(false);
    };

    const picker = (
          <PageTemplatePicker
            open={pickerOpen}
            onClose={() => setPickerOpen(false)}
            onSelect={handleSelect}
          />
    );
    // v3: a compact "+ page" button beside the find box
    if (t) return (
        <>
          <button type='button' className={t.btnPrimary} onClick={() => setPickerOpen(true)} disabled={loading}>
            {loading ? 'Adding…' : '+ page'}
          </button>
          {picker}
        </>
    );
    return (
        <>
          <div className='px-4 py-2'>
            <Button activeStyle='actionFull' onClick={() => setPickerOpen(true)} disabled={loading}>
              {loading ? 'Adding Page' : '+ Add Page'}
            </Button>
          </div>
          <PageTemplatePicker
            open={pickerOpen}
            onClose={() => setPickerOpen(false)}
            onSelect={handleSelect}
          />
        </>
    )
}


function PagesPane () {
  const { item, dataItems, apiUpdate, baseUrl, pageState } =  React.useContext(PageContext) || {};
  const { isUserAuthed, user} = React.useContext(CMSContext);
  const { UI, theme: themeFromContext = {} } = React.useContext(ThemeContext)
  const t = { ...editPanesTheme, ...getComponentTheme(themeFromContext, 'pages.editPanes') };
  const [find, setFind] = useState('');
    const pageAuthPermissions = getPageAuthPermissions(pageState?.authPermissions);
    const {DraggableNav} = UI;
    const duplicatePage = (itemId) => {
        if (!itemId || !dataItems?.length) return;

        return duplicateItem(dataItems.find(dI => dI.id === itemId), dataItems, user, apiUpdate)
    }
    const canAdd = isUserAuthed(['create-page'], pageAuthPermissions);
  if (t.pagesWrap) {
    const {Icon} = UI;
    const q = find.trim().toLowerCase();
    const matches = q ? (dataItems || []).filter(d => (d.title || '').toLowerCase().includes(q) || (d.url_slug || '').toLowerCase().includes(q)) : [];
    return (
      <div className={t.pagesWrap}>
        <div className={t.pagesBar}>
          <label className={t.pagesFind}>
            <Icon icon='Search' className={t.pagesFindIcon} />
            <input className={t.pagesFindInput} placeholder='Find a page' value={find} onChange={e => setFind(e.target.value)} />
          </label>
          {canAdd ? <AddPageButton t={t} /> : null}
        </div>
        {q ? (
          matches.length
            ? matches.map(d => <PageRowV3 key={d.id} t={t} activeItem={item} item={d} dataItems={dataItems} edit flat duplicatePage={duplicatePage} />)
            : <div className={t.pagesNoMatch}>No page matches “{find}”.</div>
        ) : (
          <DraggableNav
              item={item}
              dataItems={dataItems}
              apiUpdate={apiUpdate}
              baseUrl={baseUrl}
              renderAddItemButton={null}
              containerClassName={t.pagesTree}
              listClassName={t.pagesTreeList}
              nestableStyle={t.pagesTreeStyle}
              NavComp={(props) => PageRowV3({...props, t, duplicatePage})}
          />
        )}
        <div className={t.pagesLegend}>
          <span className={t.pagesLegendItem}><span className={t.pageMarkDraft} />unpublished</span>
          <span className={t.pagesLegendItem}><Icon icon='EyeClosed' className={t.pageMarkIcon} />hidden from nav</span>
          <span className={t.pagesLegendItem}><Icon icon='Link' className={t.pageMarkIcon} />link</span>
        </div>
      </div>
    )
  }
  return (
      <div className="relative flex-1 w-full ">
          <DraggableNav
              item={item}
              dataItems={dataItems}
              apiUpdate={apiUpdate}
              baseUrl={baseUrl}
              renderAddItemButton={canAdd && <AddPageButton />}
              NavComp={(props) => DraggableNavItem({...props, duplicatePage})}
          />
      </div>
  )
}

export default PagesPane

// v3 page row: caret · title · status marks (unpublished · hidden from nav · link) · ⋯ menu.
// Same actions as DraggableNavItem (rename / duplicate the open page / delete).
function PageRowV3 ({activeItem, item: node, dataItems, handleCollapseIconClick, isExpanded, edit, duplicatePage, t, flat}) {
    // Nestable hands over a stripped tree node; the status marks need the full page row.
    const item = { ...(dataItems.find(d => d.id === node?.id) || {}), ...node }
    const { baseUrl } = React.useContext(CMSContext);
    const { UI } = React.useContext(ThemeContext);
    const { Icon, NavigableMenu } = UI;
    const { pathname = '/edit' } = useLocation();
    const submit = useSubmit()
    const [showDelete, setShowDelete] = React.useState(false)
    const [showRename, setShowRename] = React.useState(false)
    const [duplicating, setDuplicating] = React.useState(false);
    if(!dataItems.find(i => item?.id === i.id)) return;
    const isActive = item.id === activeItem?.id || pathname.endsWith(`/${item.url_slug}`)
    const hasChildren = !flat && item.children?.length
    return (
        <div key={item.id} className='max-w-full'>
            <div className={isActive ? t.pageRowActive : t.pageRow}>
                {hasChildren
                    ? <button type='button' className={t.pageCaret} onClick={() => handleCollapseIconClick()}>
                        <Icon icon={isExpanded ? 'ChevronDown' : 'ChevronRight'} className={t.pageCaretIcon} />
                      </button>
                    : <span className={t.pageCaretSpacer} />}
                <NavLink className={isActive ? t.pageLinkActive : t.pageLink} to={`${edit ? `${baseUrl}/edit` : baseUrl}/${item.url_slug || item.id}`}>{item.title || item.id}</NavLink>
                <span className={t.pageMarks}>
                    {item.published === 'draft' ? <span title='Unpublished' className={t.pageMarkDraft} /> : null}
                    {item.hide_in_nav ? <span title='Hidden from the nav'><Icon icon='EyeClosed' className={t.pageMarkIcon} /></span> : null}
                    {item.nav_link ? <span title='Link page'><Icon icon='Link' className={t.pageMarkIcon} /></span> : null}
                </span>
                <NavigableMenu
                  showTitle={false}
                  config={[
                    { name: 'Rename', icon: 'PencilSquare', onClick: () => setShowRename(true) },
                    item.id === activeItem?.id ? {
                        name: duplicating ? 'Duplicating...' : 'Duplicate', icon: 'Copy',
                        onClick: async () => { setDuplicating(true); await duplicatePage(item.id); setDuplicating(false) }
                    } : undefined,
                    { type: 'separator' },
                    { name: (<span className='text-[var(--t-brick)]'>Delete</span>), icon: 'TrashCan', onClick: () => setShowDelete(true) }
                  ].filter(f => f)}
                >
                  <span className={t.pageMenuBtn}><Icon icon={'Ellipsis'} className={t.pageMenuIcon} /></span>
                </NavigableMenu>
            </div>
            <DeleteModal
              t={t}
              item={item}
              open={showDelete}
              setOpen={() => setShowDelete(!showDelete)}
              onDelete={() => {
                async function deleteItem () {
                    await submit(json2DmsForm(item,'delete'), { method: "post", action: pathname })
                    setShowDelete(!showDelete)
                }
                deleteItem()
              }}
            />
            <RenameModal
              t={t}
              activeItem={activeItem}
              item={item}
              dataItems={dataItems}
              open={showRename}
              setOpen={() => setShowRename(!showRename)}
            />
        </div>
    )
}

function DraggableNavItem ({activeItem, item, dataItems, handleCollapseIconClick, isCollapsed, edit, duplicatePage}) {
    const { baseUrl, user } = React.useContext(CMSContext);
    const { theme, UI } = React.useContext(ThemeContext);

    const { Icon, NavigableMenu } = UI;
    const { apiUpdate } =  React.useContext(PageContext) || {}
    const { pathname = '/edit' } = useLocation();
    const submit = useSubmit()
    const [showDelete, setShowDelete] = React.useState(false)
    const [showRename, setShowRename] = React.useState(false)
    const [duplicating, setDuplicating] = React.useState(false);
    if(!dataItems.find(i => item?.id === i.id)) return;
    //-- this is not ideal, better to check id and parent
    const isActive = pathname.includes(item.url_slug)
   //console.log('apiUpdate', apiUpdate)
    return (
        <div key={item.id} className='group max-w-full'>
           {/* <div className='border-t border-transparent hover:border-blue-500 w-full relative'>
                <div className='hidden group-hover:block absolute -left-[5px] -top-[10px] hover:bg-blue-500 size-4 flex items-center rounded-full p-1 center'>+</div>
            </div>*/}
            <div className={`${isActive ? theme?.nestable?.navItemContainerActive : theme?.nestable?.navItemContainer} `}>

                <NavLink className={theme?.nestable?.navLink} to={`${edit ? `${baseUrl}/edit` : baseUrl}/${item.url_slug || item.id}`}>{item.title || item.id}</NavLink>

                <div className={'flex gap-0.5 items-center'}>
                    {/*{
                        [
                            {
                                name: (<span className=''>Rename</span>),
                                onClick: () => setShowRename(true)
                            },
                            {
                                name: (<span className='text-[var(--t-brick)]'>Delete</span>),
                                onClick: () =>  {

                                    setShowDelete(true)
                                }
                            }
                        ].map(modal => <div onClick={modal.onClick}>{modal.name}</div>)
                    }*/}
                    <NavigableMenu
                      showTitle={false}
                      config={[
                        {
                          name: (<span className=''>Rename</span>),
                          onClick: () => setShowRename(true)
                        },
                        item.id === activeItem.id ? {
                            name: (<span className=''>{duplicating ? 'Duplicating...' : 'Duplicate'}</span>),
                            onClick: async () => {
                                if(item.id === activeItem.id){
                                    setDuplicating(true);
                                    await duplicatePage(item.id);
                                    setDuplicating(false)
                                }
                            }
                        } : undefined,
                          {
                          name: (<span className='text-[var(--t-brick)]'>Delete</span>),
                          onClick: () => setShowDelete(true)
                        }
                      ].filter(f => f)}
                    >
                      <div className='flex items-center text-[var(--t-pencil)] hover:text-[var(--t-graphite)] rounded-full hover:bg-[var(--t-cobalt-soft)]'>
                        <Icon icon={'EllipsisVertical'} className='size-5' />
                      </div>
                    </NavigableMenu>
                    {/*unpublished pill*/}
                    {/*{hasChanges ?  <DraftPage className={'text-orange-500'} />  : null}*/}

                    {/*unpublished children pill*/}
                    {/*{unpublishedChildren ? <Pill text={unpublishedChildren} activeStyle={'orange'} /> : null}*/}
                    {/*total children pill*/}
                    {/*{allChildren ? <Pill text={allChildren} activeStyle={'gray'} /> : null}*/}
                </div>


                {!item.children?.length ? <div className='size-6'/> : isCollapsed  ?
                    <Icon icon={'ArrowRight'} className={theme?.nestable?.collapsIcon}  onClick={() => handleCollapseIconClick()}/> :
                    <Icon icon={'ArrowDown'} className={theme?.nestable?.collapsIcon} onClick={() => handleCollapseIconClick()}/>
                }


            </div>
            {/*<div className='border-t border-transparent hover:border-blue-500 w-full relative'>
                <div className='hidden group-hover:block absolute left-0 -bottom-0 hover:bg-blue-500 size-4 flex items-center rounded-full p-1'>+</div>
            </div>*/}
            <DeleteModal
              item={item}
              open={showDelete}
              setOpen={() => setShowDelete(!showDelete)}
              onDelete={() => {
                async function deleteItem () {
                    await submit(json2DmsForm(item,'delete'), { method: "post", action: pathname })
                    setShowDelete(!showDelete)
                }
                deleteItem()
              }}
            />

            <RenameModal
              activeItem={activeItem}
              item={item}
              dataItems={dataItems}
              open={showRename}
              setOpen={() => setShowRename(!showRename)}
            />
        </div>
    )

}

function DeleteModal ({title, prompt, item={}, open, setOpen, onDelete, t})  {
  const cancelButtonRef = useRef(null);
  const { UI } = React.useContext(ThemeContext) || {};
  const {Button, Dialog} = UI;
  const [loading, setLoading] = useState(false);

  // v3 Pages pane (default theme): the shared UI.DeleteModal (Cancel action + solid brick Delete).
  // The pre-v3 pane (project themes) keeps the markup below unchanged.
  if (t) {
    const { DeleteModal: SharedDeleteModal } = UI;
    return (
      <SharedDeleteModal
        title={title || `Delete ${item.title || 'this page'}`}
        prompt={prompt || 'All of the page data will be permanently removed. This cannot be undone.'}
        open={open}
        setOpen={() => setOpen()}
        onDelete={onDelete}
      />
    );
  }

  return (
    <Dialog
      open={open}
      onClose={setOpen}
      initialFocus={cancelButtonRef}
    >
      <div className="sm:flex sm:items-start">
        <div className="mx-auto flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-[var(--t-brick-soft)] sm:mx-0 sm:h-10 sm:w-10">
          <i className="fa fa-danger h-6 w-6 text-[var(--t-brick)]" aria-hidden="true" />
        </div>
        <div className="mt-3 text-center sm:ml-4 sm:mt-0 sm:text-left">
          <h3 className="text-base font-semibold leading-6 text-[var(--t-ink)]">
              {title || `Delete ${item.title || ''} ${item.id}`}
          </h3>
          <div className="mt-2">
            <p className="text-sm text-[var(--t-graphite)]">
                {prompt || `Are you sure you want to delete this page? All of the page data will be permanently removed
              from our servers forever. This action cannot be undone.`}
            </p>
          </div>
        </div>
      </div>
      <div className="mt-5 sm:mt-4 flex flex-row-reverse gap-2">
        <Button
          activeStyle='dangerSolid'
          disabled={loading}
          onClick={onDelete}
        >
          Delet{loading ? 'ing...' : 'e'}
        </Button>
        <Button
          activeStyle='action'
          onClick={() => setOpen()}
          forwardref={cancelButtonRef}
        >
          Cancel
        </Button>
      </div>
    </Dialog>
  )
}


function RenameModal ({title, prompt, item={}, dataItems, open, setOpen, t})  {
  const cancelButtonRef = useRef(null)
  const { UI } = React.useContext(ThemeContext)
  const { user } = React.useContext(CMSContext) || {};
  const { apiUpdate } =  React.useContext(PageContext) || {};
  const {Button, Dialog} = UI;
  const submit = useSubmit();
  const { pathname = '/edit' } = useLocation();
  const [loading, setLoading] = useState(false)
  const [newName, setNewName] = useState(item.title)

  const update = () => {
    // ----------
    // to do --- update child urls of parent that gets changed
    // ----------
    const updateItem = async () => {
      let editItem = dataItems.filter(d => d.id === item.id)?.[0] || item
      if(newName !== editItem.title) {
        // let history = editItem.history ? cloneDeep(item.history) : []
        // let edit = {
        //   type: `changed page title to ${newName}`,
        //   user: user.email,
        //   time: new Date().toString()
        // }
        // history.push(edit)

        const newItem = {
          id: editItem.id,
          title: newName,
          parent: editItem?.parent
        }
        newItem.url_slug = getUrlSlug(newItem, dataItems)
        const newPathName = pathname.endsWith(item.url_slug) ? pathname.replace(new RegExp(item.url_slug + '$'), newItem.url_slug) : pathname;

        setLoading(true)
        //await submit(json2DmsForm(newItem), { method: "post", action: newPathName })
        await apiUpdate({data: newItem, newPath: newPathName})
        setLoading(false)
        setOpen()
      }
    }
    updateItem()
  }

  // v3 Pages pane (default theme): title, one field, Cancel (action) + Rename (primary).
  if (t) return (
    <Dialog open={open} onClose={() => setOpen()} initialFocus={cancelButtonRef}>
      <h3 className={t.modalTitle}>Rename page</h3>
      <label className={t.field}>
        <span className={t.fieldLabel}>title</span>
        <input className={t.input} value={newName || ''} onChange={e => setNewName(e.target.value)}
               onKeyDown={e => { if (e.key === 'Enter' && newName && newName !== item.title) update(); }} autoFocus />
      </label>
      <div className={t.modalActions}>
        <Button activeStyle='action' onClick={() => setOpen()} ref={cancelButtonRef}>Cancel</Button>
        <Button activeStyle='primary' disabled={loading || !newName || newName === item.title} onClick={update}>
          {loading ? 'Saving…' : 'Rename'}
        </Button>
      </div>
    </Dialog>
  );

  return (
    <Dialog
      open={open}
      onClose={() => {}}
      initialFocus={cancelButtonRef}
    >
      <div className="sm:flex sm:items-start">
        <div className="mx-auto flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-[var(--t-cobalt-soft)] sm:mx-0 sm:h-10 sm:w-10">
          <i className="fa fa-danger h-6 w-6 text-[var(--t-brick)]" aria-hidden="true" />
        </div>
        <div className="mt-3 text-center sm:ml-4 sm:mt-0 sm:text-left w-full">
          <h3 className="text-base font-semibold leading-6 text-[var(--t-ink)]">
              Rename {item.title}
          </h3>
          <div className="mt-2 w-full">
            <input value={newName} onChange={e => setNewName(e.target.value)} />
          </div>
        </div>
      </div>
      <div className="mt-5 sm:mt-4 flex flex-row-reverse gap-2">
        <Button
          disabled={loading}
          onClick={update}
        >
          { loading ? 'Saving...' : 'Submit' }
        </Button>
        <Button
          activeStyle='action'
          onClick={() => setOpen()}
          ref={cancelButtonRef}
        >
          Cancel
        </Button>
      </div>
    </Dialog>
  )
}


export function PublishButton () {
  const {item, apiLoad, apiUpdate, reqPermissions, pageState } =  React.useContext(PageContext) || {}
  const hasChanges = item.published === 'draft' || item.has_changes
  const { user, authPermissions, isUserAuthed, pattern, sitePatterns, type, app, baseUrl } = React.useContext(CMSContext) || {};
  const pageAuthPermissions = getPageAuthPermissions(pageState?.authPermissions);
  const { UI, theme: themeFromContext = {} } = React.useContext(ThemeContext)
  const {Button} = UI;
  const t = { ...editPaneTheme, ...getComponentTheme(themeFromContext, 'pages.editPane') };
  if(!isUserAuthed(['publish-page'], pageAuthPermissions)) return null;
  // what each pattern type's onPagePublish gets (editFunctions publish)
  const publishContext = { pattern, sitePatterns, type, app, baseUrl, apiLoad };
  // '' publishBtn → the pre-v6 UI.Button pair (project themes, via src/themes/_legacy/pages.js)
  if (!t.publishBtn) return (
    <div className={t.publishWrapper}>
      { hasChanges && (
        <Button
          onClick={() => discardChanges(user,item, apiUpdate)}
        >
          <span className='text-nowrap'> Discard </span>
        </Button>
      )}
      <Button
          disabled={!hasChanges}
          activeStyle={hasChanges ? 'active' : undefined}
          onClick={() => publish(user,item, apiUpdate, publishContext)}
      >
        <span className='text-nowrap'> {hasChanges ? `Publish` : `No Changes`} </span>

      </Button>
    </div>
  )
  return (
    <div className={t.publishWrapper}>
      {t.publishStatus ? (
        <span className={t.publishStatus}>
          <span className={hasChanges ? t.publishStatusDotDraft : t.publishStatusDotPublished} />
          {hasChanges ? 'Draft' : 'Published'}
        </span>
      ) : null}
      { hasChanges && (
        <button type='button' className={t.discardBtn} onClick={() => discardChanges(user,item, apiUpdate)}>
          Discard
        </button>
      )}
      <button
          type='button'
          disabled={!hasChanges}
          className={hasChanges ? t.publishBtn : t.publishBtnDisabled}
          onClick={() => publish(user,item, apiUpdate, publishContext)}
      >
        {hasChanges ? `Publish` : `No Changes`}
      </button>
    </div>
  )
}
