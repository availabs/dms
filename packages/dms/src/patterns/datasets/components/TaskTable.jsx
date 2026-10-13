import React from "react";

// A plain read-only <table> for the task list / task events (v6). Columns use the same
// `{name, display_name, Comp}` shape as UI.Table; a Comp gets `{value}` only (no grid props).
// Classes come from the caller's theme: table, tableScroll, th, tr, trAlt (striped odd rows), td.
export default function TaskTable({ columns, data, t, striped = false }) {
  return (
    <div className={t.tableScroll}>
      <table className={t.table}>
        <thead>
          <tr>
            {columns.map((c) => <th key={c.name} className={t.th}>{c.display_name}</th>)}
          </tr>
        </thead>
        <tbody>
          {data.map((row, i) => (
            <tr key={i} className={striped && i % 2 ? t.trAlt : t.tr}>
              {columns.map(({ name, Comp }) => (
                <td key={name} className={t.td}>
                  {Comp ? <Comp value={row[name]}/> : row[name]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
