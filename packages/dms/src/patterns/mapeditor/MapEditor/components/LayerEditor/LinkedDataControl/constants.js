export const JOIN_AGG_OPS = ["", "sum", "count", "avg", "min", "max"];

export const LINKED_DATA_ROW_CAP = 1_000_000;
export const JOIN_COLUMN_MARKER = "(join)";

export const getJoinOutputNameFromExpr = (expr) => {
  const aliasMatch = String(expr).match(/\s+as\s+("?)([^"]+)\1\s*$/i);
  if (aliasMatch?.[2]) return aliasMatch[2];
  return String(expr).trim();
};

export const getJoinOutputKey = (columnConfig) => {
  if (!columnConfig?.name) return "";
  if (columnConfig.fn === "count") return `count_${columnConfig.name}`;
  if (columnConfig.fn) return `${columnConfig.fn}_${columnConfig.name}`;
  return columnConfig.name;
};

export const getJoinOutputLabel = (columnConfig) => {
  if (columnConfig?.alias?.trim()) return columnConfig.alias.trim();
  return getJoinOutputKey(columnConfig);
};

export const formatJoinOptionLabel = (label, isJoined = false) => {
  const safeLabel = label || "";
  return isJoined ? `${safeLabel} ${JOIN_COLUMN_MARKER}` : safeLabel;
};
