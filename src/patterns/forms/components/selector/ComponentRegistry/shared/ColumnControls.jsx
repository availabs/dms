import {useNavigate} from "react-router-dom";
import RenderColumnControls from "./RenderColumnControls";
import RenderFilterControls from "./RenderFilterControls";
import RenderGroupControls from "./RenderGroupControls";
import RenderActionControls from "./RenderActionControls";
import RenderSwitch from "./Switch";
import React from "react";
import {RenderAllowEditControls} from "./RenderAllowEditControls";
import {RenderAllowSearchParamsControls} from "./RenderAllowSearchParamsControls";

// renders controls based on props passed. if any setters are not passed for a controller, it's not rendered.
export const ColumnControls = ({
    attributes, setAttributes,
    visibleAttributes, setVisibleAttributes,
    groupBy, setGroupBy,
    fn, setFn,
    filters, setFilters, filterValueDelimiter,
    actions, setActions,
    allowEditInView, setAllowEditInView,
    allowSearchParams, setAllowSearchParams

}) => {
    const navigate = useNavigate();
    return (
        <>
            <RenderColumnControls attributes={attributes} setAttributes={setAttributes}
                                  visibleAttributes={visibleAttributes} setVisibleAttributes={setVisibleAttributes}
                                  fn={fn} setFn={setFn} groupBy={groupBy}
            />
            <RenderFilterControls attributes={attributes} visibleAttributes={visibleAttributes}
                                  filters={filters} setFilters={setFilters}
                                  delimiter={filterValueDelimiter} navigate={navigate}
            />
            <RenderGroupControls attributes={attributes} visibleAttributes={visibleAttributes}
                                 groupBy={groupBy} setGroupBy={setGroupBy}
            />
            <RenderActionControls attributes={attributes} visibleAttributes={visibleAttributes}
                                  actions={actions} setActions={setActions}
            />

            <RenderAllowEditControls allowEditInView={allowEditInView} setAllowEditInView={setAllowEditInView} />

            <RenderAllowSearchParamsControls allowSearchParams={allowSearchParams} setAllowSearchParams={setAllowSearchParams} />
        </>
    )
}