import {useRef, useState, useEffect} from "react";
import Icons, {ArrowDown, TouchInteraction} from "../../../../ui/icons"

const RenderIconSelector = ({onClick, icon}) => {
    const [open, setOpen] = useState(false);
    const [search, setSearch] = useState('');
    const Value = icon ? Icons[icon] : () => <span>icon</span>;
    return (
        <div className="p-1 bg-white border rounded-md">
            <button
                type="button"
                className="flex w-full justify-between items-center bg-white rounded-md shadow-sm"
                id="dropdown-button"
                onClick={() => setOpen(!open)}
            >
                <Value />
                <ArrowDown width={15} height={15}/>
            </button>

            <div
                className={open ? "grid grid-cols-5 gap-2 absolute z-10 mt-2 w-full bg-white border border-gray-300 rounded-md shadow-lg" : 'hidden'}
                role="menu"
            >
                <input key={'search'} className={'p-1 mx-1 text-sm rounded-md col-span-5'} placeholder={'search...'}
                       value={search} onChange={e => setSearch(e.target.value)}/>
                {Object.keys(Icons)
                    .filter(icon => icon.toLowerCase().includes(search.toLowerCase()))
                    .sort((a, b) => a.localeCompare(b))
                    .map(icon => {
                        const Comp = Icons[icon];

                        return (
                            <button
                                key={icon}
                                className="flex items-center justify-center w-full px-1 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-md"
                                role="menuitem"
                                onClick={() => onClick(icon)}
                            >
                                <Comp height={16} width={16}/>
                            </button>
                        )
                    })}
            </div>
        </div>
    )
}
const RenderAction = ({actions, setActions, action = {}}) => {
    const [isEditing, setIsEditing] = useState(false);
    const [newAction, setNewAction] = useState(action);

    return (
        <div className={'w-full'}>
            {
                isEditing ? (
                    <div className={'flex flex-col w-full px-2 py-1 text-gray-500'}>
                        <input className={'px-1 my-0.5 border w-full rounded-md'} disabled
                               placeholder={'name'}
                               value={newAction.name || ''}
                               onChange={e => setNewAction({...newAction, name: e.target.value})}
                        />

                        <div className={'grid grid-cols-3 gap-1'}>
                            <RenderIconSelector icon={newAction.icon} onClick={e => setNewAction({...newAction, icon: e})} />

                            <select className={'p-1 bg-white border rounded-md'}
                                    value={newAction.display}
                                    onChange={e => setNewAction({...newAction, display: e.target.value})}
                            >
                                {
                                    [undefined, 'edit only', 'view only', 'both'].map(option => <option
                                        key={option || 'default'}
                                        value={option}>{option || 'display'}</option>)
                                }
                            </select>
                            <select className={'p-1 bg-white border rounded-md'}
                                    value={newAction.type}
                                    onChange={e => setNewAction({...newAction, type: e.target.value})}
                            >
                                {
                                    [undefined, 'delete', 'url'].map(option => <option key={option || 'default'}
                                                                                       value={option}>{option || 'type'}</option>)
                                }
                            </select>
                        </div>

                        <div className={'my-0.5 flex w-full justify-end'}>
                            {
                                newAction.type === 'url' ?
                                    <input className={'px-1 border w-full rounded-md'}
                                           placeholder={'url'}
                                           value={newAction.url || ''}
                                           onChange={e => setNewAction({...newAction, url: e.target.value})}
                                    />
                                    : null
                            }
                            <div>
                                <button className={'px-1 border rounded-md place-self-end'}
                                        onClick={() => {
                                            setActions(actions.map(oldA => oldA.name === newAction.name ? newAction : oldA))
                                            setIsEditing(false)
                                        }}
                                >save
                                </button>
                                <button className={'px-1 border rounded-md place-self-end'}
                                        onClick={() => {
                                            setIsEditing(false)
                                        }}
                                >cancel
                                </button>
                            </div>
                        </div>

                    </div>
                ) : (
                    <div
                        className="flex items-center cursor-pointer px-2 mx-1 text-sm text-gray-700 hover:bg-gray-100 hover:text-gray-900 rounded-md"
                    >
                        <div key={'icon'} className={'h-4 w-4 m-0.5 cursor-pointer text-gray-800'}>
                            <TouchInteraction height={14} width={14}/>
                        </div>

                        <div key={'action.name'} className={'flex justify-between m-1 w-full'}>
                            {action.name}
                            <button key={'action-edit'} className={'p-0.5 m-0.5 text-gray-500 text-sm border rounded-md '}
                                    onClick={() => setIsEditing(!isEditing)}>
                                {isEditing ? 'cancel' : 'edit'}
                            </button>
                            <button key={'action-delete'} className={'p-0.5 m-0.5 text-gray-500 text-sm border rounded-md '}
                                    onClick={() => setActions(actions.filter(a => a.name !== action.name))}>
                                delete
                            </button>
                        </div>
                    </div>
                )
            }
        </div>
    )
}

const RenderAddAction = ({actions, setActions}) => {
    const blankAction = {name: '', url: ''};
    const [isAdding, setIsAdding] = useState(false);
    const [newAction, setNewAction] = useState(blankAction);

    return (
        <div className={'w-full flex flex-col justify-end'}>
            <button className={'w-fit p-0.5 m-0.5 text-gray-500 text-sm border place-self-end rounded-md'}
                    onClick={() => setIsAdding(!isAdding)}>{'+ add new'}</button>
            {
                isAdding ? (
                    <div className={'flex flex-col w-full px-2 py-1 text-gray-500'}>
                        <input className={'px-1 my-0.5 border w-full rounded-md'}
                               placeholder={'name'}
                               value={newAction.name}
                               onChange={e => setNewAction({...newAction, name: e.target.value})}
                        />

                        <div className={'grid grid-cols-3 gap-1'}>

                            <RenderIconSelector icon={newAction.icon} onClick={e => setNewAction({...newAction, icon: e})}/>

                            <select className={'p-1 bg-white border rounded-md'}
                                    value={newAction.display}
                                    onChange={e => setNewAction({...newAction, display: e.target.value})}
                            >
                                {
                                    [undefined, 'edit only', 'view only', 'both'].map(option => <option
                                        key={option || 'default'}
                                        value={option}>{option || 'display'}</option>)
                                }
                            </select>
                            <select className={'p-1 bg-white border rounded-md'}
                                    value={newAction.type}
                                    onChange={e => setNewAction({...newAction, type: e.target.value})}
                            >
                                {
                                    [undefined, 'delete', 'url'].map(option => <option key={option || 'default'}
                                                                                       value={option}>{option || 'type'}</option>)
                                }
                            </select>
                        </div>

                        <div className={'my-0.5 flex w-full justify-end'}>
                            {
                                newAction.type === 'url' ?
                                    <input className={'px-1 border w-full rounded-md'}
                                           placeholder={'url'}
                                           value={newAction.url}
                                           onChange={e => setNewAction({...newAction, url: e.target.value})}
                                    />
                                    : null
                            }
                            <button className={'px-1 border rounded-md place-self-end'}
                                    onClick={() => {
                                        setActions([...actions, newAction])
                                        setNewAction(blankAction)
                                    }}
                            >add
                            </button>
                            <button className={'px-1 border rounded-md place-self-end'}
                                    onClick={() => {
                                        setIsAdding(false)
                                        setNewAction(blankAction)
                                    }}
                            >cancel
                            </button>
                        </div>

                    </div>
                ) : null
            }
        </div>
    )
}
export default function RenderActionControls({
                                                 actions = [], setActions
                                             }) {
    // each action has:
    // name: used as title, fallback if no icon is selected
    // icon: used as text on button
    // type: delete, url
    // url: if type is url, provide text box
    // display: edit only, view only, both
    if (!setActions) return;
    const menuRef = useRef(null);
    const [search, setSearch] = useState();
    const [isOpen, setIsOpen] = useState(false);
    const menuBtnId = 'menu-btn-action-controls'

    // ================================================== close on outside click start =================================
    const handleClickOutside = (e) => {
        if (menuRef.current && !menuRef.current.contains(e.target) && e.target.id !== menuBtnId) {
            setIsOpen(false);
        }
    };

    useEffect(() => {
        document.addEventListener('mousedown', handleClickOutside);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, []);
    // ================================================== close on outside click end ===================================

    return (
        <div className="relative inline-block text-left">
            <div>
                <div id={menuBtnId}
                    className={`inline-flex w-full justify-center items-center rounded-md px-1.5 py-1 text-sm font-regular text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 ${isOpen ? `bg-gray-50` : `bg-white hover:bg-gray-50`} cursor-pointer`}
                    onClick={e => setIsOpen(!isOpen)}>
                    Action <ArrowDown height={18} width={18} className={'mt-1'}/>
                </div>
            </div>

            <div ref={menuRef}
                className={`${isOpen ? 'visible transition ease-in duration-200' : 'hidden transition ease-in duration-200'} absolute left-0 z-10 w-72 origin-top-left divide-y divide-gray-100 rounded-md bg-white shadow-lg ring-1 ring-black ring-opacity-5 transition focus:outline-none`}
            >
                <input key={'search'} className={'px-3 py-1 w-full rounded-md'} placeholder={'search...'}
                       onChange={e => {
                           setSearch(e.target.value)
                       }}/>
                <RenderAddAction ket={'add-action'} actions={actions} setActions={setActions}/>
                <div key={'actions'} className="py-1 max-h-[500px] overflow-auto scrollbar-sm">
                    {
                        actions
                            .filter(a => a && (!search || (a.name).toLowerCase().includes(search.toLowerCase())))
                            .map((action, i) => (
                                <RenderAction key={i} action={action} actions={actions} setActions={setActions} />
                            ))
                    }

                </div>
            </div>
        </div>
    )
}
