import {useState, useContext, useCallback, useMemo} from "react";
import {ComponentContext} from '../../../../../../context'
import {ThemeContext, getComponentTheme} from "../../../../../../../../ui/useTheme";
import {actionControlsTheme} from "./ActionControls.theme";

// 2026-10-16 (ui-raw-html-to-ui-components.md): every control is a UI component; layout from
// theme.pages.actionControls (ActionControls.theme.js). The icon picker lists the theme's registered icons
// (theme.Icons — it was an empty list before). `display` / `actionType` are UI.Select with a placeholder and
// deselect: unset is empty, never the placeholder text (the old native selects stored 'display' / 'type').
const DISPLAY_OPTIONS = ['edit only', 'view only', 'both'];
const TYPE_OPTIONS = ['delete', 'url'];

const RenderIconSelector = ({onClick, icon}) => {
    const { UI, theme: themeFromContext = {} } = useContext(ThemeContext) || {};
    const t = { ...actionControlsTheme, ...getComponentTheme(themeFromContext, 'pages.actionControls') };
    const { Icon, Button, Input } = UI;
    const [open, setOpen] = useState(false);
    const [search, setSearch] = useState('');
    const iconNames = useMemo(() => Object.keys(themeFromContext?.Icons || {}).sort((a, b) => a.localeCompare(b)), [themeFromContext?.Icons]);
    const matches = useMemo(() => {
        const q = search.trim().toLowerCase();
        return (q ? iconNames.filter(n => n.toLowerCase().includes(q)) : iconNames).slice(0, 120);
    }, [iconNames, search]);

    return (
        <div className={t.iconPicker}>
            <Button activeStyle="fieldTrigger" aria-expanded={open} aria-label="Icon" onClick={() => setOpen(!open)}>
                <Icon icon={icon || 'TouchInteraction'} className={t.pickIcon} />
                <Icon icon={'CaretDown'} className={t.pickIcon} />
            </Button>
            {open ? (
                <div className={t.iconMenu} role="menu">
                    <Input aria-label="Search icons" placeholder={'search...'}
                           value={search} autoFocus onChange={e => setSearch(e.target.value)}/>
                    <div className={t.iconGrid}>
                        {matches.map(name => (
                            <Button
                                key={name}
                                activeStyle={name === icon ? 'iconPickOn' : 'iconPick'}
                                role="menuitem"
                                title={name}
                                aria-label={name}
                                onClick={() => { onClick(name); setOpen(false); }}
                            >
                                <Icon icon={name} className={t.pickIcon} />
                            </Button>
                        ))}
                    </div>
                    {!matches.length && <div className={t.iconEmpty}>No icons match.</div>}
                </div>
            ) : null}
        </div>
    )
}

const ActionForm = ({value, setValue, nameDisabled, onSave, saveLabel, onCancel}) => {
    const { UI, theme: themeFromContext = {} } = useContext(ThemeContext) || {};
    const t = { ...actionControlsTheme, ...getComponentTheme(themeFromContext, 'pages.actionControls') };
    const { Button, Input, Select } = UI;
    return (
        <div className={t.form}>
            <Input aria-label="Action name" placeholder={'name'} disabled={nameDisabled}
                   value={value.name || ''}
                   onChange={e => setValue({...value, name: e.target.value})}
            />
            <div className={t.selectRow}>
                <RenderIconSelector icon={value.icon} onClick={e => setValue({...value, icon: e})} />
                <Select placeholder={'display'} allowDeselect
                        options={DISPLAY_OPTIONS}
                        value={value.display}
                        onChange={v => setValue({...value, display: v || undefined})}
                />
                <Select placeholder={'type'} allowDeselect
                        options={TYPE_OPTIONS}
                        value={value.actionType}
                        onChange={v => setValue({...value, actionType: v || ''})}
                />
            </div>
            <div className={t.formActions}>
                {value.actionType === 'url' ? (
                    <span className={t.urlField}>
                        <Input aria-label="URL" placeholder={'url'}
                               value={value.url || ''}
                               onChange={e => setValue({...value, url: e.target.value})}
                        />
                    </span>
                ) : null}
                <Button activeStyle="primary" onClick={onSave}>{saveLabel}</Button>
                <Button activeStyle="action" onClick={onCancel}>cancel</Button>
            </div>
        </div>
    )
}

const RenderAction = ({updateAction, deleteAction, action = {}}) => {
    const { UI, theme: themeFromContext = {} } = useContext(ThemeContext) || {};
    const t = { ...actionControlsTheme, ...getComponentTheme(themeFromContext, 'pages.actionControls') };
    const { Icon, Button } = UI;
    const [isEditing, setIsEditing] = useState(false);
    const [newAction, setNewAction] = useState(action);

    if (isEditing) {
        return (
            <ActionForm value={newAction} setValue={setNewAction} nameDisabled saveLabel="save"
                        onSave={() => { updateAction(newAction); setIsEditing(false); }}
                        onCancel={() => setIsEditing(false)} />
        );
    }
    return (
        <div className={t.row}>
            <Icon icon="Reorder" className={t.grip} />
            <Icon icon={action.icon || 'TouchInteraction'} className={t.rowIcon} />
            <div key={`${action.name}`} className={t.rowBody}>
                <span className={t.rowName}>{action.name}</span>
                <Button activeStyle="linkMeta" onClick={() => setIsEditing(true)}>edit</Button>
                <Button activeStyle="linkMetaDanger" onClick={() => deleteAction(action)}>delete</Button>
            </div>
        </div>
    )
}

const RenderAddAction = ({addAction}) => {
    // {type: action, actionType: link / delete, name, url}
    const blankAction = {show: true, actionType: '', name: '', url: ''};
    const { UI, theme: themeFromContext = {} } = useContext(ThemeContext) || {};
    const t = { ...actionControlsTheme, ...getComponentTheme(themeFromContext, 'pages.actionControls') };
    const [isAdding, setIsAdding] = useState(false);
    const [newAction, setNewAction] = useState(blankAction);

    return (
        <div className={t.addWrap}>
            <span className={t.addTriggerWrap}>
                <UI.Button activeStyle="small" aria-expanded={isAdding} onClick={() => setIsAdding(!isAdding)}>{'+ add new'}</UI.Button>
            </span>
            {isAdding ? (
                <ActionForm value={newAction} setValue={setNewAction} saveLabel="add"
                            onSave={() => { addAction(newAction); setNewAction(blankAction); }}
                            onCancel={() => { setIsAdding(false); setNewAction(blankAction); }} />
            ) : null}
        </div>
    )
}

// action columns can be:
// data link columns: uses existing column to show links with provided text or the cell's value. these can receive the cell's value in search params
// other link columns: adds a column; these are simply links to the address mentioned. these can receive grouped column value as search param
// delete

// linkCol: {isLink, linkText, linkAddress}
// action: {name, actionType: delete/url, icon, display: edit/view/both}
export default function ActionControls({context, isInMenu=false, dwAPI}) {
    // each action has:
    // name: used as title, fallback if no icon is selected. only needed if it's not data column.
    // name: if action is related to a column, use its name. oterwise empty
    // icon: used as text on button
    // actionType: delete, link, dataLink; link and dataLink may get used to differentiate
    // url: if type is url, provide text box
    // display: edit only, view only, both
    // attach search params
    const ctx = useContext(context || ComponentContext) || {};
    // dwAPI.state/setState are getters that always return live values,
    // so reading them here gets the current state even if dwAPI was captured earlier.
    const state = dwAPI?.state || ctx.state;
    const setState = dwAPI?.setState || ctx.setState;
    const columns = state?.columns || [];
    const {UI, theme: themeFromContext = {}} = useContext(ThemeContext) || {UI: {}};
    const t = { ...actionControlsTheme, ...getComponentTheme(themeFromContext, 'pages.actionControls') };
    const {Icon, Button, Popup, Input, DraggableList} = UI;
    const [search, setSearch] = useState();
    const actionColumns = columns.filter(column => column.actionType); //two types of actions.
    const filteredActionColumns = actionColumns.filter(a => a && (!search || (a.name).toLowerCase().includes(search.toLowerCase())));

    // Reorders just the actionType columns, writing each reordered entry back into
    // the same draft.columns slot the (possibly search-filtered) list occupied —
    // other columns, and any action not currently visible under the search filter,
    // keep their existing position.
    const reorderActions = useCallback((updatedItems) => {
        setState?.(draft => {
            const indices = [];
            draft.columns.forEach((column, idx) => {
                if (column.actionType && updatedItems.some(a => a.name === column.name)) indices.push(idx);
            });
            indices.forEach((columnIdx, i) => {
                draft.columns[columnIdx] = updatedItems[i];
            });
        });
    }, [setState]);

    // takes in one action, adds or updates it.
    const updateAction = useCallback((action={}) => {
        setState?.(draft => {
            const idx = draft.columns.findIndex(column => column.name === action.name && (column.actionType));
            if(idx !== -1) {
                draft.columns[idx] = action;
            }else{
                draft.columns.push(action);
            }
        })
    }, [setState, columns])

    const deleteAction = useCallback((action={})=> {
        setState?.(draft => {
            const idx = draft.columns.findIndex(column => column.actionType && column.name === action.name);
            if(idx !== -1){
                draft.columns.splice(idx, 1);
            }
        })
    }, [setState, columns])

    const addAction = useCallback((action={})=> {
        setState?.(draft => {
            draft.columns.push(action)
        })
    }, [setState, columns])

    const body = (
        <>
            <Input aria-label="Search actions"
                   placeholder={'search...'}
                   onChange={e => setSearch(e.target.value)} />
            <RenderAddAction addAction={addAction} />
            <div key={'actions'} className={t.list}>
                <DraggableList
                    dataItems={filteredActionColumns}
                    onChange={reorderActions}
                    renderItem={({item: action}) => (
                        <RenderAction key={action.name} action={action} updateAction={updateAction} deleteAction={deleteAction} />
                    )}
                />
            </div>
        </>
    );

    if(isInMenu){
        return <div className={t.menuPanel}>{body}</div>
    }

    return (
        <div className={t.triggerWrap}>
            <Popup button={<Button activeStyle='action'>
                Action <Icon icon={'ArrowDown'} className={t.triggerIcon}/>
            </Button>}>
                {
                    ({open}) => (
                        <div className={open ? t.panel : t.panelHidden}>{body}</div>
                    )
                }
            </Popup>
        </div>
    )
}
