import { useCallback, useContext, useEffect, useState } from 'react';
import { ThemeContext } from '../../../../ui/useTheme';
import { getInstance } from '../../../../utils/type-utils';
import { pageTemplateManagerTheme } from './pageTemplateManagerPane.theme';
import {buildPageTemplatePayload} from "../../../utils";

export default function PageTemplateManagerPane({ app, type, apiLoad, apiUpdate }) {
  const { UI, theme: themeFromContext = {} } = useContext(ThemeContext) || {};
  const { Button, Input } = UI;
  const t = pageTemplateManagerTheme;
  const themeTemplates = themeFromContext?.page_templates || [];
  const patternSlug = getInstance(type);
  const templateType = `${patternSlug}|page_template`;

  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [deletingId, setDeletingId] = useState(null);

  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [baseId, setBaseId] = useState(() => themeTemplates[0]?.id || '');
  const [saving, setSaving] = useState(false);

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

  const saveTemplate = async ({ name, description, sections, sectionGroups }) => {
    setSaving(true);
    setError('');
    try {
      const payload = buildPageTemplatePayload({
        name,
        description: description || '',
        sections: sections || [],
        sectionGroups: sectionGroups || [],
        user: null,
        existing: null,
      });
      await apiUpdate({
        data: payload,
        config: { format: { app, type: templateType } },
      });
      await loadTemplates();
    } catch (e) {
      console.error('<PageTemplateManagerPane:save>', e);
      setError('Could not save template.');
    } finally {
      setSaving(false);
    }
  };

  const createNew = async () => {
    const trimmed = newName.trim();
    if (!trimmed || saving) return;
    const base = themeTemplates.find(tpl => tpl.id === baseId) || themeTemplates[0];
    await saveTemplate({
      name: trimmed,
      description: newDesc.trim(),
      sections: base?.draft_sections || [],
      sectionGroups: base?.draft_section_groups || [],
    });
    setNewName('');
    setNewDesc('');
  };

  const copyThemeTemplate = (tpl) => saveTemplate({
    name: tpl.name,
    description: tpl.description || '',
    sections: tpl.draft_sections || [],
    sectionGroups: tpl.draft_section_groups || [],
  });

  const del = async (tpl) => {
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
  };

  return (
    <div className={t.wrapper}>
      {error && <div className={t.error}>{error}</div>}

      {/* Built-in theme templates (read-only) */}
      <div className={t.sectionTitle}>Built-in Templates</div>
      <table className={t.table}>
        <thead className={t.thead}>
          <tr>
            <th className={t.th}>Name</th>
            <th className={t.th}>Description</th>
            <th className={t.thLast}></th>
          </tr>
        </thead>
        <tbody>
          {themeTemplates.map(tpl => (
            <tr key={tpl.id} className={t.tr}>
              <td className={t.tdName}>{tpl.name}</td>
              <td className={t.tdDesc}>{tpl.description}</td>
              <td className={t.tdActions}>
                <span
                  className={t.copyBtn}
                  onClick={() => !saving && copyThemeTemplate(tpl)}
                >
                  Save as user template
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* User templates */}
      <div className={t.sectionTitleSpaced}>
        Your Templates
        {templates.length > 0 && <span className={t.sectionCount}>({templates.length})</span>}
      </div>

      <div className={t.newForm}>
        <div className={t.newFormFields}>
          <Input
            placeholder='Template name…'
            value={newName}
            onChange={e => setNewName(e.target.value)}
          />
          <Input
            placeholder='Description (optional)'
            value={newDesc}
            onChange={e => setNewDesc(e.target.value)}
          />
          <select
            value={baseId}
            onChange={e => setBaseId(e.target.value)}
            className={t.baseSelect}
          >
            {themeTemplates.map(tpl => (
              <option key={tpl.id} value={tpl.id}>{tpl.name}</option>
            ))}
          </select>
          <Button disabled={!newName.trim() || saving} onClick={createNew}>
            {saving ? 'Saving…' : 'Create'}
          </Button>
        </div>
        <div className={t.newFormHint}>Starting layout — the template will use its sections as the initial page content.</div>
      </div>

      {!loading && templates.length === 0 && (
        <div className={t.empty}>
          No user templates yet. Create one above or save a page as a template from the Settings pane.
        </div>
      )}
      {templates.length > 0 && (
        <table className={t.table}>
          <thead className={t.thead}>
            <tr>
              <th className={t.th}>Name</th>
              <th className={t.th}>Description</th>
              <th className={t.th}>Saved By</th>
              <th className={t.th}>Updated</th>
              <th className={t.thLast}></th>
            </tr>
          </thead>
          <tbody>
            {templates.map(tpl => (
              <tr key={tpl.id} className={t.tr}>
                <td className={t.tdName}>{tpl.name}</td>
                <td className={t.tdDesc}>{tpl.description || '—'}</td>
                <td className={t.tdMeta}>{tpl.createdBy || '—'}</td>
                <td className={t.tdMeta}>
                  {tpl.updatedAt ? new Date(tpl.updatedAt).toLocaleDateString() : '—'}
                </td>
                <td className={t.tdActions}>
                  {confirmDeleteId === tpl.id ? (
                    <span className={t.confirmRow}>
                      <span className={t.confirmLabel}>Delete?</span>
                      <span className={t.confirmYes} onClick={() => del(tpl)}>
                        {deletingId === tpl.id ? '…' : 'Yes'}
                      </span>
                      <span className={t.confirmNo} onClick={() => setConfirmDeleteId(null)}>No</span>
                    </span>
                  ) : (
                    <span
                      className={t.deleteBtn}
                      onClick={() => { setConfirmDeleteId(tpl.id); setError(''); }}
                    >
                      Delete
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
