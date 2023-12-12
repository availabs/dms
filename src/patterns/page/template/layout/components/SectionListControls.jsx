import React from "react";
import {SectionThumb} from "./Sectionthumb.jsx";

export const SectionListControls = ({sections=[], sectionControls, source, onChange}) => {
    console.log('SectionListControls',sectionControls)
    return (
        <div>
            {sections.map(s => (
                <SectionThumb
                    key={s.id}
                    section={s}
                    source={source}
                    sectionControl={sectionControls?.[s.id] || {}}
                    updateSectionControl={(d) => {
                        onChange({...sectionControls, ...{[s.id]: d}})
                    }}
                />
            ))}
        </div>
    )
}