import { useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { CMSContext, PageContext } from '../../context';
import { ThemeContext, getComponentTheme } from '../../../../ui/useTheme';
import { getParent, nameToSlug } from '../../../../utils/type-utils';
import {
  buildTemplateType,
  buildTemplatePayload,
  affectedFieldPaths,
  mergeAppliedProvenance,
} from './template_utils';
import { templateManagerTheme } from './TemplateManager.theme';

/**
 * TemplateManager — "copy/paste from the DB" for a configured section.
 *
 * Rendered inside the section menu's "Templates" group (gated behind the
 * component registry's `supportsTemplates` flag). Saves the live resolved
 * component config as a named template row, and lists/applies templates that
 * match THIS section's component type (exact-type query, pattern-scoped).
 *
 * Data flows through the API layer only: `apiLoad`/`apiUpdate` from PageContext.
 * Apply mirrors the existing paste mechanism — write the new element-data via
 * the section `onChange`, then bump `compKey` (setKey) to remount the
 * dataWrapper so it re-initialises from the applied state.
 *
 * Props:
 *   componentType  registry name, e.g. 'Spreadsheet'
 *   sectionValue   the section value object (layout attrs + element + provenance)
 *   dwState        live resolved dataWrapper state (source of the saved config)
 *   setKey         section setKey — bump to force a dataWrapper remount on apply
 *   onChange       section onChange — persists the applied element-data + layout
 */
export default function TemplateManager({ componentType, sectionValue, dwState, setKey, onChange }) {
  const { apiLoad, apiUpdate, format } = useContext(PageContext) || {};
  const { user } = useContext(CMSContext) || {};
  const { UI, theme: themeFromContext = {} } = useContext(ThemeContext) || {};
  const { Button, Input, Switch, Icon } = UI || {};
  const t = { ...templateManagerTheme, ...getComponentTheme(themeFromContext, 'pages.templateManager') };

  // Pattern-scoped exact type. The page pattern's format.type is `${pattern}|page`,
  // so the parent IS the pattern. Fallback splits on the first pipe.
  const pattern = getParent(format?.type) || (format?.type || '').split('|')[0];
  const templateType = useMemo(
    () => buildTemplateType({ pattern, componentType }),
    [pattern, componentType]
  );

  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(false);
  const [name, setName] = useState('');
  const [includeSource, setIncludeSource] = useState(true);
  const [includeLayout, setIncludeLayout] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  // CRUD confirm state (v1.1): inline two-step guards, no modal.
  const [pendingOverwrite, setPendingOverwrite] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [deletingId, setDeletingId] = useState(null);

  const loadTemplates = useCallback(async () => {
    if (!apiLoad || !templateType || !format?.app) return;
    setLoading(true);
    try {
      const rows = await apiLoad({
        format: { app: format.app, type: templateType, attributes: ['id', 'app', 'type', 'data'] },
        children: [{ type: () => {}, action: 'list', path: '/' }],
      });
      const list = (rows || [])
        .filter(r => r && r.id && r.name)
        .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
      setTemplates(list);
    } catch (e) {
      console.error('<TemplateManager:load>', e);
      setError('Could not load templates.');
    } finally {
      setLoading(false);
    }
  }, [apiLoad, templateType, format?.app]);

  useEffect(() => { loadTemplates(); }, [loadTemplates]);

  const trimmed = (name || '').trim();
  // The template (if any) the current name would overwrite — matched by slug,
  // exactly as `buildTemplatePayload` derives it.
  const existing = useMemo(() => {
    const slug = nameToSlug(trimmed);
    return slug ? templates.find(tpl => tpl.slug === slug) : undefined;
  }, [trimmed, templates]);

  // `existing` → overwrite that row in place; otherwise create a new one.
  const save = async (overwriteTarget = null) => {
    if (!trimmed || saving || !apiUpdate) return;
    setSaving(true);
    setError('');
    try {
      const payload = buildTemplatePayload({
        name: trimmed,
        componentType,
        elementType: sectionValue?.element?.['element-type'] || componentType,
        state: dwState,
        value: sectionValue,
        includeSource,
        includeLayout,
        user,
        existing: overwriteTarget,
      });
      await apiUpdate({
        data: payload,
        config: { format: { app: format.app, type: templateType } },
      });
      setName('');
      setPendingOverwrite(false);
      await loadTemplates();
    } catch (e) {
      console.error('<TemplateManager:save>', e);
      setError('Could not save template.');
    } finally {
      setSaving(false);
    }
  };

  const del = async (tpl) => {
    if (!apiUpdate || deletingId) return;
    setDeletingId(tpl.id);
    setError('');
    try {
      await apiUpdate({
        data: { id: tpl.id },
        config: { format: { app: format.app, type: templateType } },
        requestType: 'delete',
      });
      setConfirmDeleteId(null);
      // Optimistic: drop it locally now (delete only invalidates `length`, so
      // the byIndex/byId cache can briefly still resolve the row), then reload.
      setTemplates(prev => prev.filter(x => x.id !== tpl.id));
      await loadTemplates();
    } catch (e) {
      console.error('<TemplateManager:delete>', e);
      setError('Could not delete template.');
    } finally {
      setDeletingId(null);
    }
  };

  const apply = (tpl) => {
    if (!onChange) return;
    try {
      const parsedState = tpl.stateJson ? JSON.parse(tpl.stateJson) : {};
      const layout = tpl.includesLayout && tpl.layoutJson ? JSON.parse(tpl.layoutJson) : {};
      const elementType = tpl.elementType || componentType;

      // The template carries the whole data config (source + columns / filters /
      // customBuckets / pivot) only when `includesSource`, and `display` only when
      // `includesLayout`. For a bucket it excluded, fall back to the section's
      // CURRENT live state — so we keep the user's existing data config / display
      // instead of wiping them. The `externalSource` fallback is also load-bearing:
      // `migrateToV2` discards a state that lacks `externalSource` back to defaults
      // (losing columns), so it must always be present.
      const appliedState = { ...parsedState };
      if (!tpl.includesLayout) {
        appliedState.display = dwState?.display;
      }
      if (!tpl.includesSource) {
        appliedState.externalSource = dwState?.externalSource || { columns: [] };
        appliedState.columns = dwState?.columns || [];
        appliedState.filters = dwState?.filters || { op: 'AND', groups: [] };
        if (dwState?.join) appliedState.join = dwState.join;
        if (dwState?.pivot) appliedState.pivot = dwState.pivot;
      }

      // Provenance reflects only what the TEMPLATE actually owns (`parsedState`),
      // not the current-state fallbacks we merged in above.
      const fields = affectedFieldPaths({ layout, state: parsedState });
      const merged = mergeAppliedProvenance(sectionValue?._appliedTemplate, {
        fields,
        templateId: tpl.id,
        templateName: tpl.name,
        templateUpdatedAt: tpl.updatedAt || tpl.createdAt,
        appliedAt: new Date().toISOString(),
      });

      // Persist applied element-data + layout + per-field provenance onto the section.
      onChange({
        ...sectionValue,
        ...layout,
        element: {
          'element-type': elementType,
          'element-data': JSON.stringify(appliedState),
        },
        _appliedTemplate: merged,
      });

      // Unique key → remounts the dataWrapper so it re-initialises from the new
      // element-data (same mechanism as paste, but guaranteed to change).
      setKey?.(`tmpl_${tpl.id}_${Date.now()}`);
    } catch (e) {
      console.error('<TemplateManager:apply>', e);
      setError('Could not apply template.');
    }
  };

  // Changing the name retargets/aborts a pending overwrite confirm.
  const onNameChange = (e) => { setName(e?.target?.value ?? e); setPendingOverwrite(false); };

  return (
    <div className={t.wrapper}>
      {/* ── Save current config ── */}
      <div className={t.saveForm}>
        <div className={t.formTitle}>Save as template</div>
        <Input type="text" value={name} placeholder="Template name…" onChange={onNameChange} />

        <div className={t.toggleRow}>
          <span className={t.toggleLabel}>Include data source</span>
          <Switch size="small" enabled={includeSource} setEnabled={setIncludeSource} />
        </div>
        <div className={t.toggleRow}>
          <span className={t.toggleLabel}>Include layout</span>
          <Switch size="small" enabled={includeLayout} setEnabled={setIncludeLayout} />
        </div>

        <div className={t.saveRow}>
          {existing
            ? <span className={t.hint}>{pendingOverwrite ? `Replace “${existing.name}”?` : `“${existing.name}” exists`}</span>
            : <span />}
          <div className={t.saveActions}>
            {!existing && (
              <Button disabled={!trimmed || saving} onClick={() => save(null)}>
                {saving ? 'Saving…' : 'Save'}
              </Button>
            )}
            {existing && !pendingOverwrite && (
              <Button disabled={!trimmed || saving} onClick={() => setPendingOverwrite(true)}>
                Overwrite…
              </Button>
            )}
            {existing && pendingOverwrite && (
              <>
                <span className={t.confirmNo} onClick={() => setPendingOverwrite(false)}>Cancel</span>
                <Button disabled={saving} onClick={() => save(existing)}>
                  {saving ? 'Saving…' : 'Overwrite'}
                </Button>
              </>
            )}
          </div>
        </div>
        {error ? <span className={t.error}>{error}</span> : null}
      </div>

      {/* ── Load existing ── */}
      <div className={t.listTitle}>Templates</div>
      {loading ? <div className={t.loading}>Loading…</div> : null}
      {!loading && !templates.length ? <div className={t.empty}>No templates yet.</div> : null}
      <div className={t.list}>
        {templates.map(tpl => (
          <div key={tpl.id} className={t.row}>
            <div className={t.rowMain}>
              <span className={t.rowName}>{tpl.name}</span>
              <span className={t.rowMeta}>
                {[
                  tpl.includesSource ? 'source' : null,
                  tpl.includesLayout ? 'layout' : null,
                  tpl.createdBy || null,
                ].filter(Boolean).join(' · ')}
              </span>
            </div>
            {confirmDeleteId === tpl.id ? (
              <div className={t.rowActions}>
                <span className={t.confirmLabel}>Delete?</span>
                <span className={t.confirmYes} onClick={() => del(tpl)}>
                  {deletingId === tpl.id ? '…' : 'Yes'}
                </span>
                <span className={t.confirmNo} onClick={() => setConfirmDeleteId(null)}>No</span>
              </div>
            ) : (
              <div className={t.rowActions}>
                <span className={t.applyBtn} onClick={() => apply(tpl)}>Apply</span>
                <Icon icon="TrashCan" className={t.trashIcon}
                      onClick={() => { setConfirmDeleteId(tpl.id); setError(''); }} />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
