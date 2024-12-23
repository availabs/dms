import RenderSwitch from "./Switch";
import {ArrowDown, Group} from "../../../../ui/icons";
import {useRef, useState, useEffect} from "react";

export default function RenderGroupControls({
                                                 attributes, groupBy, setGroupBy, setFn
                                             }) {
    if(!setGroupBy) return;
    const menuRef = useRef(null);
    const [search, setSearch] = useState();
    const [isOpen, setIsOpen] = useState(false);
    const menuBtnId = 'menu-btn-group-controls'

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
                    Group <ArrowDown height={18} width={18} className={'mt-1'}/>
                </div>
            </div>

            <div ref={menuRef}
                className={`${isOpen ? 'visible transition ease-in duration-200' : 'hidden transition ease-in duration-200'} absolute left-0 z-10 w-72 origin-top-left divide-y divide-gray-100 rounded-md bg-white shadow-lg ring-1 ring-black ring-opacity-5 transition focus:outline-none`}
            >
                <input className={'px-3 py-1 w-full rounded-md'} placeholder={'search...'}
                       onChange={e => {
                           setSearch(e.target.value)
                       }}/>
                <div className="py-1 max-h-[500px] overflow-auto scrollbar-sm">
                    {
                        attributes
                            .filter(a => a && (!search || (a.display_name || a.name).toLowerCase().includes(search.toLowerCase())))
                            .map((attribute, i) => (
                                <div
                                    key={i}
                                    className="flex items-center cursor-pointer px-2 py-1 text-sm text-gray-700 hover:bg-gray-100 hover:text-gray-900"
                                    onClick={() => {
                                        const newFilters = !groupBy.find(f => f === attribute.name) ?
                                            [...groupBy, attribute.name] :
                                            groupBy.filter(attr => attr !== attribute.name);

                                        setGroupBy(newFilters);
                                        if(!groupBy.length) setFn && setFn({});
                                    }}
                                >
                                    <div className={'h-4 w-4 m-1 cursor-pointer text-gray-800'}>
                                        <Group height={14} width={14} />
                                    </div>

                                    <div className={'flex justify-between m-1 w-full'}>
                                        {attribute.display_name || attribute.name}

                                        <RenderSwitch
                                            enabled={groupBy.find(f => f === attribute.name) ? true : false}
                                            setEnabled={() => {}}
                                        />
                                    </div>
                                </div>
                            ))
                    }
                </div>
            </div>
        </div>
    )
}
