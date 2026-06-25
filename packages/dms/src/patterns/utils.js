/**
 * Shared utilities for cross-pattern use.
 * Keep this file small and dependency-free — it must import only from
 * packages (lodash, etc.) or sibling files at this same level.
 * Never import from inside a specific pattern here.
 */
import {getParent, nameToSlug} from "../utils/type-utils";

/**
 * Build a history object by appending a new entry to existing entries.
 * Returns only { id?, entries } — id tells updateDMSAttrs to edit the
 * existing page-edit row; entries is the data to store.
 * Resolved ref metadata (ref, created_at, etc.) is NOT included —
 * updateDMSAttrs rebuilds the ref from the format config.
 */
export function appendHistoryEntry(existingHistory, action, user) {
  const entry = { action, user: user?.email, time: new Date().toString() };
  const existingEntries = Array.isArray(existingHistory?.entries) ? existingHistory.entries : [];
  const entries = [...existingEntries, entry];
  // Only reuse existing row ID when entries are present — proof the DB row actually exists.
  // If id is set but entries is missing, the row is likely orphaned; create a fresh one so
  // updateDMSAttrs doesn't silently edit a non-existent row.
  if (existingHistory?.id && existingEntries.length > 0) {
    return { id: existingHistory.id, entries, _dirty: true };
  }
  return { entries, _dirty: true };
}

export function buildPageTemplateType(format) {
  const pattern = getParent(format?.type) || (format?.type || '').split('|')[0];
  return `${pattern}|page_template`;
}

export function sanitizeSectionsForTemplate(sections) {
  return (sections || []).map(s => {
    const clean = {...s};
    delete clean.id;
    delete clean.ref;
    delete clean.draft_id;
    delete clean.is_draft;
    return clean;
  });
}

// used in admin, and page patterns
export function buildPageTemplatePayload({name, description, sections, sectionGroups, user, existing}) {
  const now = new Date().toISOString();
  const slug = nameToSlug(name);
  const payload = {
    name,
    slug,
    description: description || '',
    draft_sections: sanitizeSectionsForTemplate(sections),
    draft_section_groups: sectionGroups || [],
    updatedAt: now,
    updatedBy: user?.email || '',
  };
  if (existing?.id) {
    payload.id = existing.id;
    payload.createdAt = existing.createdAt;
    payload.createdBy = existing.createdBy;
  } else {
    payload.createdAt = now;
    payload.createdBy = user?.email || '';
  }
  return payload;
}