import RenderColumnControls from "./RenderColumnControls";
import RenderFilterControls from "./RenderFilterControls";
import RenderGroupControls from "./RenderGroupControls";
import RenderActionControls from "./RenderActionControls";
import {RenderAllowEditControls} from "./RenderAllowEditControls";
import {RenderAllowSearchParamsControls} from "./RenderAllowSearchParamsControls";

// renders controls based on props passed. if any setters are not passed for a controller, it's not rendered.
export const ColumnControls = ({
    attributes, setAttributes,
    visibleAttributes, setVisibleAttributes,
    customColNames, setCustomColNames,
    notNull, setNotNull,
    groupBy, setGroupBy,
    fn, setFn,
    filters, setFilters,
    actions, setActions,
    allowEditInView, setAllowEditInView,
    allowSearchParams, setAllowSearchParams
}) => (
    <div className={'flex items-center'}>
        <RenderColumnControls attributes={attributes} setAttributes={setAttributes}
                              visibleAttributes={visibleAttributes} setVisibleAttributes={setVisibleAttributes}
                              customColNames={customColNames} setCustomColNames={setCustomColNames}
                              notNull={notNull} setNotNull={setNotNull}
                              fn={fn} setFn={setFn} groupBy={groupBy}
        />
        <RenderFilterControls attributes={attributes} filters={filters} setFilters={setFilters} />

        <RenderGroupControls attributes={attributes} groupBy={groupBy} setGroupBy={setGroupBy} />

        <RenderActionControls actions={actions} setActions={setActions} />

        <RenderAllowEditControls allowEditInView={allowEditInView} setAllowEditInView={setAllowEditInView} />

        <RenderAllowSearchParamsControls allowSearchParams={allowSearchParams} setAllowSearchParams={setAllowSearchParams} />
    </div>
)