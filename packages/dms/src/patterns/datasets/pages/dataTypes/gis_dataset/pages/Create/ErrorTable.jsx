import { useContext, useRef } from 'react'
import { ThemeContext } from '../../../../../../../ui/useTheme'
import { gisCreateTheme } from './gisCreate.theme'

// The GIS create flow's error report (upload / layer analysis / publish): one row, the message and the ETL
// context id, on UI.Table's `t.errorTableStyle` named style (2026-10-15, ui-raw-html-to-ui-components.md —
// was three hand-built <table>s with inline styles for project themes).
const MessageCell = ({ value, className, row }) => (
  <div className={className}><span className={row?.msgClass}>{value}</span></div>
);
const ContextCell = ({ value, className, row }) => (
  <div className={className}><span className={row?.ctxClass}>{value}</span></div>
);

export default function GisErrorTable({ title, message, etlContextId }) {
  const { theme, UI } = useContext(ThemeContext) || {};
  const t = { ...gisCreateTheme, ...(theme?.datasets?.gisCreate || {}) };
  const { Table } = UI || {};
  const gridRef = useRef();
  return (
    <div className={t.errorTableWrap}>
      <Table gridRef={gridRef} isEdit={false} activeStyle={t.errorTableStyle || undefined}
        display={{ disableCellSelection: true, disableColumnResize: true }}
        data={[{ message, etlContextId, msgClass: t.errTd, ctxClass: t.errTdCtx }]}
        columns={[
          { name: 'message', display_name: title, show: true, type: 'ui', Comp: MessageCell },
          { name: 'etlContextId', display_name: 'ETL Context ID', show: true, type: 'ui', Comp: ContextCell, size: 220 },
        ]}/>
    </div>
  );
}
