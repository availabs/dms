import { useState, useEffect, useContext, useRef } from "react";

import { mapValues } from "lodash-es"
import { ThemeContext, getComponentTheme } from '../../../../../../../../ui/useTheme'
import { gisCreateTheme } from '../gisCreate.theme'
// import Dropdown from "react-dropdown";
// import "react-dropdown/style.css";

const FreeFormColumnNameInput = ({ publishStatus, field, col, onChange }) => {
  const { UI } = useContext(ThemeContext) || {};
  const { Input } = UI || {};
  return (
    <Input
      activeStyle="mono"
      disabled={publishStatus !== "AWAITING"}
      id={field}
      defaultValue={col || ""}
      onChange={onChange}
    />
  );
};

// "All table columns have been assigned." — v6 class, or the original inline gray (legacyInlineStyles)
const AllAssigned = () => {
  const { theme } = useContext(ThemeContext) || {};
  const t = { ...gisCreateTheme, ...(theme?.datasets?.gisCreate || {}) };
  return (
    <span className={t.allAssigned || undefined} style={t.legacyInlineStyles ? { color: "darkgray" } : undefined}>
      All table columns have been assigned.
    </span>
  );
};

const ConstrainedColumnNameInput = ({
  publishStatus,
  field,
  col,
  availableDbColNames,
  onChange,
}) => {
  const { theme, UI } = useContext(ThemeContext) || {};
  const t = { ...gisCreateTheme, ...(theme?.datasets?.gisCreate || {}) };
  const { Select } = UI || {};

  if (!availableDbColNames) {
    return "";
  }

  const matches = col && availableDbColNames.includes(col);

  const hasAvailableDbColNames = availableDbColNames.filter(Boolean).length > 0;

  if (!availableDbColNames.length) {
    return (
      <AllAssigned/>
    );
  }

  if (matches && availableDbColNames.length === 1) {
    return <span className={t.constrainedText}>{col}</span>;
  }

  return (
    <Select
      key={`col-names-dropdown-for-${field}`}
      options={availableDbColNames}
      value={matches ? col : ""}
      placeholder="Choose db column"
      onChange={v => onChange(v || "")}
      disabled={!hasAvailableDbColNames || publishStatus !== "AWAITING"}
    />
  );
};

// Mapping-table cells (UI.Table 'list', 2026-10-15 — was a hand-built <table>). Module-level so their identity
// is stable across renders (an inline Comp would remount the column-name input on every keystroke); each reads
// what it needs from its row. The wrapper takes the table's cell class.
const SchemaKeyCell = ({ row, className }) => (
  <div className={className}><span className={row?.ctx?.keyClass}>{row?.field}</span></div>
);
const SchemaDbColCell = ({ row, className }) => {
  const { ctx, field, col, rowIdx, options } = row || {};
  if (!ctx) return null;
  const { InputElem, omittedFields, publishStatus, dispatch } = ctx;
  return (
    <div className={className}>
      {omittedFields[field] ? <span /> : (
        <InputElem
          availableDbColNames={options}
          publishStatus={publishStatus}
          field={field}
          col={col}
          onChange={(e) => {
            const value = e?.target ? e.target.value : e;
            dispatch({ type: "update_dbColName", payload: { rowIdx, colName: value } });
          }}
        />
      )}
    </div>
  );
};
const SchemaOmitCell = ({ row, className }) => {
  const { ctx, field, options } = row || {};
  if (!ctx) return null;
  const { Checkbox, omittedFields, toggleOmit } = ctx;
  return (
    <div className={className}>
      <Checkbox value={!!omittedFields[field]} disabled={options && options.length === 0}
        onChange={() => toggleOmit(row)} />
    </div>
  );
};
const SchemaMbtileCell = ({ row, className }) => {
  const { ctx, col, options } = row || {};
  if (!ctx) return null;
  const { Checkbox, preserveColumns, togglePreserve } = ctx;
  return (
    <div className={className}>
      <Checkbox value={!!preserveColumns[col]} disabled={options && options.length === 0}
        onChange={() => togglePreserve(row)} />
    </div>
  );
};

export const GisDatasetLayerDatabaseDbSchemaForm = ({ state, dispatch }) => {
  const { theme, UI } = useContext(ThemeContext) || {};
  const t = { ...gisCreateTheme, ...(theme?.datasets?.gisCreate || {}) };
  const { Table, ColumnTypes } = UI || {};
  const gridRef = useRef();
  const {
    layerName,
    tableDescriptor,
    publishStatus,
    databaseColumnNames,
    mbtilesOptions
    } = state;

  //console.log('databaseColumnNames', databaseColumnNames)

  const [omittedFields, setOmittedFields] = useState(null);
  const [preserveColumns, setPreserveColumns] = useState(null);
  const [defaultMappings, setDefaultMappings] = useState(null);
  const [allChecked, setAllChecked] = useState(true);
  const [allPreserveColumnsChecked, setallPreserveColumnsChecked] =
    useState(true);

  const tableDescriptorColumnTypes =
    tableDescriptor && tableDescriptor.columnTypes;

  const gisDatasetFieldNamesToDbColumns =
    tableDescriptorColumnTypes &&
    tableDescriptorColumnTypes.reduce((acc, { key, col }) => {
      acc[key] = col || null;
      return acc;
    }, {});

  // console.log("gisDatasetFieldNamesToDbColumns", gisDatasetFieldNamesToDbColumns);
  useEffect(() => {
    if (defaultMappings === null && gisDatasetFieldNamesToDbColumns) {
      setDefaultMappings(gisDatasetFieldNamesToDbColumns);
    }
  }, [defaultMappings, gisDatasetFieldNamesToDbColumns]);

  useEffect(() => {
    if (gisDatasetFieldNamesToDbColumns && !omittedFields) {
      setOmittedFields(
        mapValues(gisDatasetFieldNamesToDbColumns, (v) => v === null)
      );
    }
  }, [gisDatasetFieldNamesToDbColumns, omittedFields]);

  useEffect(() => {
    if (gisDatasetFieldNamesToDbColumns && !preserveColumns) {
      const data = tableDescriptorColumnTypes.reduce((acc, { key, col }) => {
        acc[col] = key || null;
        return acc;
      }, {});
      setPreserveColumns(
        mapValues(data, (v) => v === null)
      );
    }
  }, [gisDatasetFieldNamesToDbColumns, preserveColumns]);

  if (!layerName) {
    return "";
  }

  if (!gisDatasetFieldNamesToDbColumns) {
    return (
      <span className={t.schemaFormWaitMsg}>
        Please wait... the server is analyzing the {layerName} layer. This may
        take a few moments.
      </span>
    );
  }

  if (!omittedFields) {
    return null;
  }

  const InputElem = (databaseColumnNames && databaseColumnNames.length > 0) 
    ? ConstrainedColumnNameInput
    : FreeFormColumnNameInput;

  const assignedColNamesSet = new Set(
    Object.values(gisDatasetFieldNamesToDbColumns)
      .filter(Boolean)
      .filter((k) => databaseColumnNames && databaseColumnNames.includes(k))
  );

  // the header / row checkboxes are the checkbox column type (onChange gets true, or undefined when cleared)
  const onChangeAllOmit = (v) => {
    const checked = !!v;
    setOmittedFields(mapValues(omittedFields, () => checked));
    setAllChecked(!checked);
  };

  const onChangeAllPreserveColumns = (v) => {
    const checked = !!v;
    const updatedVal = mapValues(preserveColumns, () => checked);
    setPreserveColumns(updatedVal);
    setallPreserveColumnsChecked(!checked);
    dispatch({
      type: "update",
      payload: { mbtilesOptions: {  ...mbtilesOptions , preserveColumns: updatedVal,} },
    });
  };

  // console.log('mbtilesOptions', mbtilesOptions)
  const availableDbColNames =
    databaseColumnNames && databaseColumnNames.length > 0 &&
    databaseColumnNames
      .filter((c) => !assignedColNamesSet.has(c))
      .filter(Boolean);

  const toggleOmit = ({ field: key, col, rowIdx, options: fieldColNameOptions }) => {
    const newOmittedFields = {
      ...omittedFields,
      [key]: !omittedFields[key],
    };

    setOmittedFields(newOmittedFields);

    const isAllChecked = Object.values(
      newOmittedFields
    ).some((v) => v === false);
    setAllChecked(isAllChecked);
    if (col) {
      dispatch({
        type: "update_dbColName",
        payload: { rowIdx, colName: "" },
      });
    } else if (!fieldColNameOptions) {
      dispatch({
        type: "update_dbColName",
        payload: {
          rowIdx,
          colName: defaultMappings[key],
        },
      });
    }
  };

  const togglePreserve = ({ col }) => {
    const newPreserveColumns = {
      ...preserveColumns,
      [col]: !preserveColumns[col],
    };

    setPreserveColumns(newPreserveColumns);

    const isAllPreserveColumnsChecked = Object.values(
      newPreserveColumns
    ).some((v) => v === false);
    setallPreserveColumnsChecked(
      isAllPreserveColumnsChecked
    );

    dispatch({
      type: "update",
      payload: { mbtilesOptions: { ...mbtilesOptions, preserveColumns: newPreserveColumns, } },
    });
  };

  const Checkbox = ColumnTypes.checkbox.EditComp;
  const ctx = {
    InputElem, omittedFields, preserveColumns, publishStatus, dispatch, Checkbox, toggleOmit, togglePreserve,
    keyClass: t.schemaFormTdKey,
  };
  const rows = tableDescriptorColumnTypes.map(({ key, col }, rowIdx) => ({
    field: key, col, rowIdx, ctx,
    options: Array.isArray(availableDbColNames)
      ? (assignedColNamesSet.has(col) ? [col, ...availableDbColNames] : availableDbColNames)
      : undefined,
  }));

  // Omit / Mbtile headers carry their select-all checkbox; the other headers keep the table's own label class
  const headerLabel = getComponentTheme(theme, 'table', t.tableStyle || undefined)?.headerCellLabel;
  const header = (attribute) => attribute.name === 'omit' || attribute.name === 'mbtile'
    ? <span className={t.schemaFormHeaderCheck}>
        <span className={headerLabel}>{attribute.display_name}</span>
        {attribute.name === 'omit'
          ? <Checkbox value={!allChecked} onChange={onChangeAllOmit} />
          : <Checkbox value={!allPreserveColumnsChecked} onChange={onChangeAllPreserveColumns} />}
      </span>
    : <span className={headerLabel} title={attribute.display_name}>{attribute.display_name}</span>;

  return (
    <div>
      <span className={t.schemaFormTitle}>Field Names Mappings</span>
      <div className={t.schemaFormCard || undefined}>
        <Table data={rows} gridRef={gridRef} isEdit={false} activeStyle={t.tableStyle || undefined}
          display={{ disableCellSelection: true }}
          controls={{ header: { displayFn: header } }}
          columns={[
            { name: "field", display_name: "Upload File Columns", show: true, type: "ui", Comp: SchemaKeyCell },
            { name: "dbcol", display_name: "Database Column Name", show: true, type: "ui", Comp: SchemaDbColCell },
            { name: "omit", display_name: "Omit", show: true, type: "ui", Comp: SchemaOmitCell, justify: "center", size: 100 },
            { name: "mbtile", display_name: "Mbtile", show: true, type: "ui", Comp: SchemaMbtileCell, justify: "center", size: 100 },
          ]}/>
      </div>
      {t.schemaFormHint ? <p className={t.schemaFormHint}>Omit drops a column from the table. Mbtile keeps it on the map tiles (for popups and styling).</p> : null}
    </div>
  );
};
