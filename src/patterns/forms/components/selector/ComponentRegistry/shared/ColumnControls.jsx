import RenderColumnControls from "./RenderColumnControls";
import RenderFilterControls from "./RenderFilterControls";
import RenderGroupControls from "./RenderGroupControls";
import RenderActionControls from "./RenderActionControls";
import RenderMoreControls from "./RenderMoreControls";

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
   showTotal, setShowTotal,
   striped, setStriped,
   allowDownload, setAllowDownload,
   allowEditInView, setAllowEditInView,
   allowSearchParams, setAllowSearchParams,
   usePagination, setUsePagination,
   pageSize, setPageSize
}) => (
    <div className={'flex items-center'}>
        <RenderColumnControls attributes={attributes} setAttributes={setAttributes}
                              visibleAttributes={visibleAttributes} setVisibleAttributes={setVisibleAttributes}
                              customColNames={customColNames} setCustomColNames={setCustomColNames}
                              notNull={notNull} setNotNull={setNotNull}
                              fn={fn} setFn={setFn} groupBy={groupBy}
        />
        <RenderFilterControls attributes={attributes} filters={filters} setFilters={setFilters}/>

        <RenderGroupControls attributes={attributes} groupBy={groupBy} setGroupBy={setGroupBy}/>

        <RenderActionControls actions={actions} setActions={setActions}/>

        <RenderMoreControls showTotal={showTotal} setShowTotal={setShowTotal}
                            striped={striped} setStriped={setStriped}
                            allowDownload={allowDownload} setAllowDownload={setAllowDownload}
                            allowEditInView={allowEditInView} setAllowEditInView={setAllowEditInView}
                            allowSearchParams={allowSearchParams} setAllowSearchParams={setAllowSearchParams}
                            usePagination={usePagination} setUsePagination={setUsePagination}
                            pageSize={pageSize} setPageSize={setPageSize}
        />
    </div>
)