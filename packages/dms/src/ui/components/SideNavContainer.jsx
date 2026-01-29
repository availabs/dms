import React from "react";

export default function ({children, width='w-64', custom='top-20'}) {
    return (
        <div className={`${width} hidden xl:block`}>
            <div className={`${width} sticky ${custom}  hidden xl:block`}>
                {children}
            </div>
        </div>
    )
}