import { useState, useEffect } from "react";

import mapValues from "lodash/mapValues";
// import Dropdown from "react-dropdown";
// import "react-dropdown/style.css";

const FreeFormColumnNameInput = ({ publishStatus, field, col, onChange }) => {
  return (
    <input
      className="w-full p-2 flex-1 shadow bg-grey-50 focus:bg-blue-100 border-gray-300"
      disabled={publishStatus !== "AWAITING"}
      id={field}
      defaultValue={col || ""}
      onChange={onChange}
    />
  );
};

const ConstrainedColumnNameInput = ({
  publishStatus,
  field,
  col,
  availableDbColNames,
  onChange,
}) => {
  if (!availableDbColNames) {
    return "";
  }

  const matches = col && availableDbColNames.includes(col);

  const key = `col-names-dropdown-for-${field}`;

  const hasAvailableDbColNames = availableDbColNames.filter(Boolean).length > 0;

  if (!availableDbColNames.length) {
    return (
      <span style={{ color: "darkgray" }}>
        All table columns have been assigned.
      </span>
    );
  }

  if (matches && availableDbColNames.length === 1) {
    return <span className="text-center">{col}</span>;
  }

  return (
    <select
      key={key}
      className="w-full p-2 flex-1 shadow bg-grey-50 focus:bg-blue-100 border-gray-300"
      onChange={(e) => onChange(e.target.value)}
      value={matches ? col : ""}
      placeholder="Select the db column name"
      disabled={!hasAvailableDbColNames || publishStatus !== "AWAITING"}
    >
      <option>Choose db column </option>
      {availableDbColNames.map((col, i) => (
        <option key={i} value={col}>
          {col}
        </option>
      ))}
    </select>
  );
};

export const GisDatasetLayerDatabaseDbSchemaForm = ({ state, dispatch }) => {
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
      <span className="w-full p-10 text-center">
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

  const onChangeAllOmit = (e) => {
    setOmittedFields(mapValues(omittedFields, () => e.target.checked));
    setAllChecked(!e.target.checked);
  };

  const onChangeAllPreserveColumns = (e) => {
    const updatedVal = mapValues(preserveColumns, () => e.target.checked);
    setPreserveColumns(updatedVal);
    setallPreserveColumnsChecked(!e.target.checked);
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

  return (
    <div>
      <span className="text-lg font-bold">Field Names Mappings</span>
      <div>
        <table className="w-full">
          <thead>
            <tr>
              <th className="text-center" style={{ paddingRight: "40px" }}>
                Upload File Columns
              </th>
              <th className="text-center">Database Column Name</th>
              <th className="text-center">
                Omit
                <input
                  className="ml-2"
                  type="checkbox"
                  checked={!allChecked}
                  onChange={onChangeAllOmit}
                />
              </th>
              <th className="text-center">
                Mbtile
                <input
                  className="ml-2"
                  type="checkbox"
                  checked={!allPreserveColumnsChecked}
                  onChange={onChangeAllPreserveColumns}
                />
              </th>
            </tr>
          </thead>
          <tbody>
            {tableDescriptorColumnTypes.map(({ key, col }, rowIdx) => {
              let fieldColNameOptions;
              if (Array.isArray(availableDbColNames)) {
                fieldColNameOptions = assignedColNamesSet.has(col)
                  ? [col, ...availableDbColNames]
                  : availableDbColNames;
              }

              const ColNameCell = omittedFields[key] ? (
                <span />
              ) : (
                <InputElem
                  {...{
                    availableDbColNames: fieldColNameOptions,
                    publishStatus,
                    field: key,
                    col,
                    onChange: (e) => {
                      const value = e.target ? e.target.value : e;
                      dispatch({
                        type: "update_dbColName",
                        payload: { rowIdx, colName: value },
                      });
                    },
                  }}
                />
              );

              return (
                <tr key={key} className="border-b">
                  <td className="py-4 text-left">{key}</td>
                  <td className="text-center  p-2">{ColNameCell}</td>
                  <td className="text-center">
                    <input
                      type="checkbox"
                      checked={omittedFields[key]}
                      disabled={
                        fieldColNameOptions && fieldColNameOptions.length === 0
                      }
                      onChange={() => {
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
                      }}
                    />
                  </td>
                  <td className="text-center">
                    <input
                      type="checkbox"
                      checked={preserveColumns[col]}
                      disabled={
                        fieldColNameOptions && fieldColNameOptions.length === 0
                      }
                      onChange={() => {
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
                      }}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};
