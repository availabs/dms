import { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { ThemeContext } from '../../../../ui/useTheme';
import { getInstance } from '../../../../utils/type-utils';
import { pageTemplateManagerTheme } from './pageTemplateManagerPane.theme';

export default function PageTemplateManagerPane({ app, type, apiLoad, apiUpdate }) {
  const { UI, theme: themeFromContext = {} } = useContext(ThemeContext) || {};
  const { Table } = UI;
  const t = pageTemplateManagerTheme;
  const themeTemplates = themeFromContext?.page_templates || [];
  const patternSlug = getInstance(type);
  const templateType = `${patternSlug}|page_template`;

  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [deletingId, setDeletingId] = useState(null);

  const builtinGridRef = useRef(null);
  const userGridRef = useRef(null);

  const loadTemplates = useCallback(async () => {
    if (!apiLoad || !app) return;
    setLoading(true);
    try {
      const rows = await apiLoad({
        format: { app, type: templateType, attributes: ['id', 'app', 'type', 'data'] },
        children: [{ type: () => {}, action: 'list', path: '/' }],
      });
      setTemplates((rows || []).filter(r => r?.id && r?.name));
    } catch (e) {
      console.error('<PageTemplateManagerPane:load>', e);
      setError('Could not load templates.');
    } finally {
      setLoading(false);
    }
  }, [apiLoad, app, templateType]);

  useEffect(() => { loadTemplates(); }, [loadTemplates]);

  const del = useCallback(async (tpl) => {
    if (!apiUpdate || deletingId) return;
    setDeletingId(tpl.id);
    setError('');
    try {
      await apiUpdate({
        data: { id: tpl.id },
        config: { format: { app, type: templateType } },
        requestType: 'delete',
      });
      setConfirmDeleteId(null);
      setTemplates(prev => prev.filter(x => x.id !== tpl.id));
      await loadTemplates();
    } catch (e) {
      console.error('<PageTemplateManagerPane:delete>', e);
      setError('Could not delete template.');
    } finally {
      setDeletingId(null);
    }
  }, [apiUpdate, deletingId, app, templateType, loadTemplates]);

  const builtinColumns = useMemo(() => [
    { name: 'name',        display_name: 'Name',        show: true, type: 'text' },
    { name: 'description', display_name: 'Description', show: true, type: 'text' },
  ], []);

  const userColumns = useMemo(() => [
    { name: 'name',        display_name: 'Name',        show: true, type: 'text' },
    { name: 'description', display_name: 'Description', show: true, type: 'text' },
    { name: 'createdBy',   display_name: 'Saved By',    show: true, type: 'text', size: 180 },
    {
      name: 'updatedAt', display_name: 'Updated', show: true, type: 'ui', size: 140,
      Comp: ({ value }) => value ? new Date(value).toLocaleDateString() : '—',
    },
    {
      name: 'actions', display_name: '', show: true, type: 'ui', size: 120,
      Comp: ({ row }) => confirmDeleteId === row.id ? (
        <span className={t.confirmRow}>
          <span className={t.confirmLabel}>Delete?</span>
          <span className={t.confirmYes} onClick={() => del(row)}>
            {deletingId === row.id ? '…' : 'Yes'}
          </span>
          <span className={t.confirmNo} onClick={() => setConfirmDeleteId(null)}>No</span>
        </span>
      ) : (
        <span className={t.deleteBtn} onClick={() => { setConfirmDeleteId(row.id); setError(''); }}>
          Delete
        </span>
      ),
    },
  ], [confirmDeleteId, deletingId, del]);

  return (
    <div className={t.wrapper}>
      {error && <div className={t.error}>{error}</div>}

      <div className={t.sectionTitle}>Built-in Templates</div>
      <Table
        columns={builtinColumns}
        data={themeTemplates}
        isEdit={false}
        allowEdit={false}
        gridRef={builtinGridRef}
      />

      <div className={t.sectionTitleSpaced}>
        Your Templates
        {templates.length > 0 && <span className={t.sectionCount}>({templates.length})</span>}
      </div>

      {!loading && templates.length === 0 ? (
        <div className={t.empty}>
          No user templates yet. Save a page as a template from the Settings pane.
        </div>
      ) : (
        <Table
          columns={userColumns}
          data={templates}
          isEdit={false}
          allowEdit={false}
          gridRef={userGridRef}
        />
      )}
    </div>
  );
}
