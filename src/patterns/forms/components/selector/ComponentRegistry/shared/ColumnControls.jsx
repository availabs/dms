import RenderColumnControls from "./RenderColumnControls";
import RenderFilterControls from "./RenderFilterControls";
import RenderGroupControls from "./RenderGroupControls";
import RenderActionControls from "./RenderActionControls";
import RenderMoreControls from "./RenderMoreControls";

// renders controls based on props passed. if any setters are not passed for a controller, it's not rendered.
export const ColumnControls = () => (
    <div className={'flex items-center'}>
        <RenderColumnControls />
        {/*<RenderFilterControls attributes={attributes} filters={filters} setFilters={setFilters}/>*/}

        {/*<RenderGroupControls attributes={attributes} groupBy={groupBy} setGroupBy={setGroupBy} setFn={setFn}/>*/}

        <RenderActionControls />

        <RenderMoreControls />
    </div>
)