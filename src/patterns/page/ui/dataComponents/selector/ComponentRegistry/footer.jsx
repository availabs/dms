import React from "react";
import {Link} from "react-router-dom";
import {PageContext} from "../../../../pages/view";


export const Footer = () => {
    const {dataItems, item} = React.useContext(PageContext);

    const parents = dataItems.filter(({parent, hide_in_nav, title}) => !parent & !hide_in_nav)
        // (
        //     title.toLowerCase().includes('at risk') ||
        //     title.toLowerCase().includes('hazards') ||
        //     title.toLowerCase().includes('planning') ||
        //     title.toLowerCase().includes('climate')
        // ))
    .map(parentItem => ({
        root: parentItem,
        children: dataItems.filter(({parent}) => parent === parentItem.id)
    }));

    return (
        <div className={'my-2 flex flex-col gap-[8px] max-w-[1362px] mx-auto text-[#37576B]  overflow-hidden'}>
            <div className={'p-[56px] md:h-[386px] md:max-h-[386px] md:min-h-[386px] bg-white flex flex-col md:flex-row flex-1 px-4 xl:px-[64px] rounded-[12px] shadow-md divide-x divide-[#E0EBF0] justify-center'}>
                {
                    parents.map(parent => (
                        <div key={parent.root.url_slug} className={'flex flex-col p-4 pl-[24px] gap-[12px] w-[282px] overflow-hidden'}>
                            <Link to={parent.root.url_slug}
                                  className={'text-[#2D3E4C] font-[Oswald] font-medium text-[14px] leading-[14px] uppercase tracking-normal'}>
                                {parent.root.title}
                            </Link>
                            {
                                parent.children.filter((_, i) => i <= 5).map((child) =>
                                    <Link key={child.url_slug} to={child.url_slug} className={'text-[#37576B] font-normal text-[16px] leading-[22.4px] tracking-normal'}>
                                        {child.title}
                                    </Link>
                                )
                            }
                        </div>
                    ))
                }
            </div>

            <div className={'p-[16px] md:px-[25px] md:px-[56px] flex flex-col md:flex-row items-center justify-between md:h-[70px] md:max-h-[70px] md:min-h-[70px] bg-white flex flex-1 px-4 xl:px-[64px] rounded-[12px] shadow-md'}>
                <div>© 2024 MitigateNY, All Rights Reserved.</div>
                <div className={'flex gap-[24px] '}>
                    <Link to={"#"}>Privacy Policy</Link>
                    <Link to={"#"}>Terms and Conditions</Link>
                </div>
            </div>
        </div>
    )
}

export default {
    "name": 'Footer: MNY',
    "type": 'Footer',
    useDataSource: false,
    defaultState: {   
    },
    controls: {
        
    },
    "EditComp": Footer,
    "ViewComp": Footer
}