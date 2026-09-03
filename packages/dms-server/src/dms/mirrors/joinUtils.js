'use strict';

/**
 * ⚠ MIRROR — hand-converted CommonJS copy of the client's
 * src/dms/packages/dms/src/patterns/page/components/sections/components/dataWrapper/utils/joinUtils.js
 *
 * See src/dms/planning/tasks/current/pattern-filter-sync.md's Tier 2 design section
 * "⚠ DRIFT WARNING" for why this exists as a mirror instead of an import.
 */

function calculateIsJoinPresent(join) {
  return !!(join?.sources && Object.keys(join.sources).length > 0);
}

module.exports = { calculateIsJoinPresent };
