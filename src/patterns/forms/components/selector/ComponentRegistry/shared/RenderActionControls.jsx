import RenderSwitch from "./Switch";
import {ArrowDown, TouchInteraction} from "../../../../ui/icons";
import {useRef, useState, useEffect} from "react";

const RenderAction = ({actions, setActions, action={}}) => {
    const [isEditing, setIsEditing] = useState(false);
    const [newAction, setNewAction] = useState(action);

    return (
        <div className={'w-full'}>
            {
                isEditing ? (
                    <div className={'flex flex-col w-full px-2 py-1 text-gray-500'}>
                        <input className={'px-1 my-0.5 border w-full rounded-md'} disabled
                               placeholder={'name'}
                               value={newAction.name}
                               onChange={e => setNewAction({...newAction, name: e.target.value})}
                        />

                        <div className={'grid grid-cols-2 gap-1'}>
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
                        <div className={'h-4 w-4 m-0.5 cursor-pointer text-gray-800'}>
                            <TouchInteraction height={14} width={14}/>
                        </div>

                        <div className={'flex justify-between m-1 w-full'}>
                            {action.name}
                            <button className={'p-0.5 m-0.5 text-gray-500 text-sm border rounded-md '}
                                    onClick={() => setIsEditing(!isEditing)}>
                                {isEditing ? 'cancel' : 'edit'}
                            </button>
                            <button className={'p-0.5 m-0.5 text-gray-500 text-sm border rounded-md '}
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

const RenderAddAction = ({actions, setActions, action = {}}) => {
    const [isAdding, setIsAdding] = useState(false);
    const [newAction, setNewAction] = useState(action);

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

                        <div className={'grid grid-cols-2 gap-1'}>
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
                                        setNewAction({})
                                    }}
                            >add
                            </button>
                            <button className={'px-1 border rounded-md place-self-end'}
                                    onClick={() => {
                                        setIsAdding(false)
                                        setNewAction({})
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
    if(!setActions) return;
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
                <input className={'px-3 py-1 w-full rounded-md'} placeholder={'search...'}
                       onChange={e => {
                           setSearch(e.target.value)
                       }}/>
                <RenderAddAction actions={actions} setActions={setActions}/>
                <div className="py-1 max-h-[500px] overflow-auto scrollbar-sm">
                    {
                        actions
                            .filter(a => a && (!search || (a.name).toLowerCase().includes(search.toLowerCase())))
                            .map((action, i) => (
                                <RenderAction action={action} actions={actions} setActions={setActions} />
                            ))
                    }

                </div>
            </div>
        </div>
    )
}
