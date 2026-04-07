import React from "react";

export const DefaultExpandedRow = ({values, theme}) =>
    <div className="flex flex-col divide-y">
        {values.map(({key, value}, i) =>
            <div key={key || `key-${i}`} className="flex-1 p-2">
                {key ? <div className={'font-semibold'}>{key}:</div> : null}
                <span className>{value}</span>
            </div>
        )
        }
    </div>