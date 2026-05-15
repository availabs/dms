Internal and external data sources need a toggle on their metadata page to set or unset a column as an index.
A dedicated UDA route backs the toggle so the DDL (CREATE/DROP INDEX) is handled server-side.

The feature is implemented. Remaining work: support unsetting the index from the UI
(passing `null` to the `setIndex` CALL route).

metadata page: src/dms/packages/dms/src/patterns/datasets/pages/dataTypes/gis_dataset/pages/metadata.jsx
uda: src/dms/packages/dms-server/src/routes/uda/uda.route.js
