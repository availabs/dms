import { useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { PageContext } from '../context';
import { ThemeContext, getComponentTheme } from '../../../ui/useTheme';
import { pageTemplatePickerTheme } from './PageTemplatePicker.theme';
import {buildPageTemplateType} from "../../utils";

function BlankPreview({ t }) {
  return <div className={t.cardPreview} />;
}

function ArticlePreview({ t }) {
  return (
    <div className={t.cardPreview}>
      <div className={t.cardPreviewBlock} style={{ height: '8px', width: '100%' }} />
      <div className={t.cardPreviewBlock} style={{ height: '5px', width: '80%', marginTop: '4px' }} />
      <div className={t.cardPreviewBlock} style={{ height: '5px', width: '90%', marginTop: '3px' }} />
    </div>
  );
}

function TwoColumnPreview({ t }) {
  return (
    <div className={t.cardPreview} style={{ flexDirection: 'row', gap: '4px' }}>
      <div className={t.cardPreviewBlock} style={{ flex: 1, height: '100%' }} />
      <div className={t.cardPreviewBlock} style={{ flex: 1, height: '100%' }} />
    </div>
  );
}

function CardGridPreview({ t }) {
  return (
    <div className={t.cardPreview} style={{ flexDirection: 'row', flexWrap: 'wrap', gap: '4px' }}>
      {[1, 2, 3, 4].map(i => (
        <div key={i} className={t.cardPreviewBlock} style={{ width: 'calc(50% - 2px)', height: '44%' }} />
      ))}
    </div>
  );
}

function DataTablePreview({ t }) {
  return (
    <div className={t.cardPreview} style={{ gap: '3px' }}>
      <div className={t.cardPreviewBlock} style={{ height: '16%', width: '100%', opacity: 0.5 }} />
      {[1, 2, 3, 4, 5].map(i => (
        <div key={i} className={t.cardPreviewBlock} style={{ height: '13%', width: '100%' }} />
      ))}
    </div>
  );
}

const BAR_HEIGHTS = [38, 55, 42, 70, 50, 82, 63, 76, 58, 90, 72, 85];
function BarChartPreview({ t }) {
  return (
    <div className={t.cardPreview} style={{ alignItems: 'flex-end', gap: '3px', paddingBottom: '4px' }}>
      {BAR_HEIGHTS.map((h, i) => (
        <div key={i} className={t.cardPreviewBlock} style={{ flex: 1, height: `${h}%` }} />
      ))}
    </div>
  );
}

function StatsChartPreview({ t }) {
  const bars = [45, 70, 55, 85];
  return (
    <div className={t.cardPreview} style={{ flexDirection: 'row', gap: '5px' }}>
      <div style={{ flex: '0 0 38%', display: 'flex', flexDirection: 'column', gap: '4px', justifyContent: 'center' }}>
        {[1, 2, 3, 4].map(i => (
          <div key={i} className={t.cardPreviewBlock} style={{ height: '18%', width: '100%' }} />
        ))}
      </div>
      <div style={{ flex: 1, display: 'flex', alignItems: 'flex-end', gap: '3px', paddingBottom: '4px' }}>
        {bars.map((h, i) => (
          <div key={i} className={t.cardPreviewBlock} style={{ flex: 1, height: `${h}%` }} />
        ))}
      </div>
    </div>
  );
}

function DashboardPreview({ t }) {
  const bars = [45, 65, 55, 80];
  return (
    <div className={t.cardPreview} style={{ gap: '4px' }}>
      <div className={t.cardPreviewBlock} style={{ height: '18%', width: '100%' }} />
      <div style={{ display: 'flex', flex: 1, gap: '4px' }}>
        <div style={{ flex: 1, display: 'flex', alignItems: 'flex-end', gap: '2px', paddingBottom: '2px' }}>
          {bars.map((h, i) => (
            <div key={i} className={t.cardPreviewBlock} style={{ flex: 1, height: `${h}%` }} />
          ))}
        </div>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '3px', justifyContent: 'center' }}>
          {[1, 2, 3, 4].map(i => (
            <div key={i} className={t.cardPreviewBlock} style={{ height: '16%', width: '100%' }} />
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Narrative: 4 vertical stripes of alternating block types ─────────────────
function NarrativePreview({ t }) {
  const bars = [40, 62, 52, 78, 58, 84, 66, 80, 62, 92, 72, 88];
  return (
    <div className={t.cardPreview} style={{ gap: '3px' }}>
      {/* intro text */}
      <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '2px' }}>
        <div className={t.cardPreviewBlock} style={{ height: '7px', width: '70%' }} />
        <div className={t.cardPreviewBlock} style={{ height: '4px', width: '90%', opacity: 0.5 }} />
        <div className={t.cardPreviewBlock} style={{ height: '4px', width: '80%', opacity: 0.5 }} />
      </div>
      {/* chart */}
      <div style={{ width: '100%', flex: 1, display: 'flex', alignItems: 'flex-end', gap: '1px', paddingBottom: '1px', paddingTop: '2px' }}>
        {bars.map((h, i) => (
          <div key={i} className={t.cardPreviewBlock} style={{ flex: 1, height: `${h}%` }} />
        ))}
      </div>
      {/* analysis text */}
      <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '2px' }}>
        <div className={t.cardPreviewBlock} style={{ height: '4px', width: '95%', opacity: 0.5 }} />
        <div className={t.cardPreviewBlock} style={{ height: '4px', width: '75%', opacity: 0.5 }} />
      </div>
      {/* table rows */}
      {[1, 2].map(i => (
        <div key={i} className={t.cardPreviewBlock} style={{ height: '8%', width: '100%', opacity: 0.6 }} />
      ))}
    </div>
  );
}

// ── Overview: header strip + half KPIs + half bars + full table ───────────────
function OverviewPreview({ t }) {
  const bars = [45, 70, 55, 85, 62, 78];
  return (
    <div className={t.cardPreview} style={{ gap: '3px' }}>
      {/* header band */}
      <div className={t.cardPreviewBlock} style={{ height: '18%', width: '100%' }} />
      {/* half+half row */}
      <div style={{ display: 'flex', flex: 1, gap: '3px' }}>
        {/* KPI cards */}
        <div style={{ flex: '0 0 40%', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2px' }}>
          {[1, 2, 3, 4].map(i => (
            <div key={i} className={t.cardPreviewBlock} style={{ height: '100%' }} />
          ))}
        </div>
        {/* chart bars */}
        <div style={{ flex: 1, display: 'flex', alignItems: 'flex-end', gap: '1px', paddingBottom: '1px' }}>
          {bars.map((h, i) => (
            <div key={i} className={t.cardPreviewBlock} style={{ flex: 1, height: `${h}%` }} />
          ))}
        </div>
      </div>
      {/* full table */}
      <div className={t.cardPreviewBlock} style={{ height: '12%', width: '100%', opacity: 0.6 }} />
    </div>
  );
}

// ── Profile: header strip + text half + attribute card half ───────────────────
function ProfilePreview({ t }) {
  return (
    <div className={t.cardPreview} style={{ gap: '3px' }}>
      {/* header band */}
      <div className={t.cardPreviewBlock} style={{ height: '22%', width: '100%' }} />
      {/* half + half */}
      <div style={{ display: 'flex', flex: 1, gap: '3px' }}>
        {/* narrative text lines */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '3px', paddingTop: '2px' }}>
          <div className={t.cardPreviewBlock} style={{ height: '7px', width: '60%' }} />
          {[1, 2, 3, 4, 5].map(i => (
            <div key={i} className={t.cardPreviewBlock} style={{ height: '4px', width: i % 2 ? '90%' : '75%', opacity: 0.5 }} />
          ))}
        </div>
        {/* attribute rows */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '2px', paddingTop: '2px' }}>
          {[1, 2, 3, 4, 5, 6].map(i => (
            <div key={i} className={t.cardPreviewBlock} style={{ height: '12%', width: '100%', opacity: 0.7 }} />
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Actions Dashboard: dark header + bar chart + table rows ──────────────────
function ActionsDashboardPreview({ t }) {
  const bars = [65, 88, 52, 22, 38];
  return (
    <div className={t.cardPreview} style={{ gap: '3px' }}>
      <div className={t.cardPreviewBlock} style={{ height: '20%', width: '100%', opacity: 0.85 }} />
      <div style={{ flex: '0 0 42%', width: '100%', display: 'flex', alignItems: 'flex-end', gap: '4px', paddingBottom: '2px', paddingTop: '2px' }}>
        {bars.map((h, i) => (
          <div key={i} className={t.cardPreviewBlock} style={{ flex: 1, height: `${h}%` }} />
        ))}
      </div>
      <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '2px' }}>
        {[1, 2, 3, 4].map(i => (
          <div key={i} className={t.cardPreviewBlock} style={{ height: '9%', width: '100%', opacity: 0.6 }} />
        ))}
      </div>
    </div>
  );
}

// ── Hazard Event Analysis: text + half/half row + full table ─────────────────
function HazardEventPreview({ t }) {
  const hbars = [88, 72, 52, 42, 30, 22];
  return (
    <div className={t.cardPreview} style={{ gap: '3px' }}>
      <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '2px' }}>
        <div className={t.cardPreviewBlock} style={{ height: '7px', width: '60%' }} />
        <div className={t.cardPreviewBlock} style={{ height: '4px', width: '85%', opacity: 0.5 }} />
      </div>
      <div style={{ display: 'flex', flex: 1, gap: '3px' }}>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '2px', justifyContent: 'center' }}>
          {[1, 2, 3, 4].map(i => (
            <div key={i} className={t.cardPreviewBlock} style={{ height: '14%', width: '100%', opacity: 0.65 }} />
          ))}
        </div>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '3px', justifyContent: 'center' }}>
          {hbars.map((w, i) => (
            <div key={i} className={t.cardPreviewBlock} style={{ height: '8px', width: `${w}%` }} />
          ))}
        </div>
      </div>
      <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '2px' }}>
        {[1, 2, 3].map(i => (
          <div key={i} className={t.cardPreviewBlock} style={{ height: '8%', width: '100%', opacity: 0.6 }} />
        ))}
      </div>
    </div>
  );
}

const PREVIEW_COMPONENTS = {
  blank: BlankPreview,
  article: ArticlePreview,
  two_column: TwoColumnPreview,
  card_grid: CardGridPreview,
  data_table: DataTablePreview,
  bar_chart: BarChartPreview,
  stats_chart: StatsChartPreview,
  narrative: NarrativePreview,
  overview: OverviewPreview,
  profile: ProfilePreview,
  dashboard: DashboardPreview,
  actions_dashboard: ActionsDashboardPreview,
  hazard_event_analysis: HazardEventPreview,
};

function TemplateCard({ template, selected, onSelect, t }) {
  const Preview = PREVIEW_COMPONENTS[template.id] || BlankPreview;
  return (
    <div className={selected ? t.cardSelected : t.card} onClick={() => onSelect(template)}>
      <Preview t={t} />
      <div className={t.cardName}>{template.name}</div>
      <div className={t.cardDescription}>{template.description}</div>
    </div>
  );
}

export default function PageTemplatePicker({ open, onClose, onSelect }) {
  const { apiLoad, format } = useContext(PageContext) || {};
  const { theme: themeFromContext = {} } = useContext(ThemeContext) || {};
  const t = {
    ...pageTemplatePickerTheme,
    ...getComponentTheme(themeFromContext, 'pages.pageTemplatePicker'),
  };

  const themeTemplates = useMemo(
    () => themeFromContext?.page_templates || [],
    [themeFromContext?.page_templates]
  );
  const [tab, setTab] = useState('theme');
  const [dbTemplates, setDbTemplates] = useState([]);
  const [loadingDb, setLoadingDb] = useState(false);
  const [selected, setSelected] = useState(null);

  const templateType = useMemo(() => buildPageTemplateType(format), [format]);

  const loadDbTemplates = useCallback(async () => {
    if (!apiLoad || !templateType || !format?.app) return;
    setLoadingDb(true);
    try {
      const rows = await apiLoad({
        format: { app: format.app, type: templateType, attributes: ['id', 'app', 'type', 'data'] },
        children: [{ type: () => {}, action: 'list', path: '/' }],
      });
      setDbTemplates((rows || []).filter(r => r?.id && r?.name));
    } catch (e) {
      console.error('<PageTemplatePicker:load>', e);
    } finally {
      setLoadingDb(false);
    }
  }, [apiLoad, templateType, format?.app]);

  useEffect(() => {
    if (open && tab === 'yours') loadDbTemplates();
  }, [open, tab, loadDbTemplates]);

  useEffect(() => {
    if (open) setSelected(themeTemplates[0] ?? null);
  }, [open, themeTemplates]);

  if (!open) return null;

  const handleCreate = () => {
    if (!selected) return;
    onSelect(selected);
    onClose();
  };

  return (
    <div className={t.backdrop} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className={t.modal}>
        <div className={t.header}>
          <span className={t.headerTitle}>Choose a template</span>
        </div>
        <div className={t.tabs}>
          <span
            className={tab === 'theme' ? t.tabActive : t.tab}
            onClick={() => setTab('theme')}
          >
            Theme Templates
          </span>
          <span
            className={tab === 'yours' ? t.tabActive : t.tab}
            onClick={() => { setTab('yours'); loadDbTemplates(); }}
          >
            Your Templates
          </span>
        </div>
        <div className={t.grid}>
          {tab === 'theme' && themeTemplates.map(tpl => (
            <TemplateCard
              key={tpl.id}
              template={tpl}
              selected={selected?.id === tpl.id}
              onSelect={setSelected}
              t={t}
            />
          ))}
          {tab === 'yours' && loadingDb && (
            <div className={t.loadingState}>Loading templates…</div>
          )}
          {tab === 'yours' && !loadingDb && dbTemplates.length === 0 && (
            <div className={t.emptyState}>
              No saved templates yet. Save a page as a template from the Settings pane.
            </div>
          )}
          {tab === 'yours' && !loadingDb && dbTemplates.map(tpl => (
            <TemplateCard
              key={tpl.id}
              template={tpl}
              selected={selected?.id === tpl.id}
              onSelect={setSelected}
              t={t}
            />
          ))}
        </div>
        <div className={t.footer}>
          <span className={t.footerInfo}>
            {selected ? selected.name : 'Select a template'}
          </span>
          <div className={t.footerActions}>
            <span className={t.cancelBtn} onClick={onClose}>Cancel</span>
            <span
              className={selected ? t.createBtn : t.createBtnDisabled}
              onClick={handleCreate}
            >
              Create Page
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
