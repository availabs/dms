import { nameToSlug } from './type-utils.js';

const CHART_COLORS = ['#2D3E4C','#EAAD43','#AA2E26','#6D96AE','#F1CA87','#DD524C','#C5D7E0','#EA8954','#54B99B','#FCF6EC'];

// Rewrites Graph and Spreadsheet sections to point at a provisioned source/view.
// Lexical sections are returned unchanged.
export function wireSection(section, sourceId, viewId, attrs, env, app, sourceSlug, srcEnv) {
  const elementType = section?.element?.['element-type'];
  if (!elementType || elementType === 'lexical') return section;

  const attrCols = (attrs || []).map(a => ({
    name: a.name,
    display_name: a.display_name,
    type: a.type || 'text',
    required: a.required ?? false,
    options: a.options ?? null,
  }));
  const externalSource = {
    source_id: sourceId, view_id: viewId, isDms: true, columns: attrCols,
    ...(env        ? { env }              : {}),
    ...(app        ? { app }              : {}),
    ...(sourceSlug ? { type: sourceSlug } : {}),
    ...(srcEnv     ? { srcEnv }           : {}),
  };

  if (elementType === 'Spreadsheet') {
    return {
      ...section,
      element: {
        ...section.element,
        'element-data': JSON.stringify({
          externalSource,
          columns: attrCols.map(c => ({ ...c, show: true })),
          filters: { op: 'AND', groups: [] },
          display: { usePagination: false, pageSize: 10, hideExternalToggle: false, readyToLoad: true },
          data: [],
          join: { sources: {} },
        }),
      },
    };
  }

  if (elementType === 'Graph') {
    const xCol   = attrCols.find(c => c.type !== 'number') ?? attrCols[0];
    const yCol   = attrCols.find(c => c.type === 'number')  ?? attrCols[1];
    const catCol = attrCols.find(c => c !== xCol && c.type !== 'number') ?? null;
    // Full column objects required: getColumnsToFetch filters on column.show, and
    // group/fn are needed for a valid GROUP-BY + COUNT query on the split table.
    const columns = attrCols.map(c => {
      const isX   = c === xCol;
      const isY   = c === yCol;
      const isCat = c === catCol;
      return {
        ...c,
        show: true,
        xAxis: isX,
        group: isX || isCat,
        categorize: isCat,
        ...(isY ? { yAxis: true, fn: 'count' } : {}),
      };
    });
    return {
      ...section,
      element: {
        ...section.element,
        'element-data': JSON.stringify({
          externalSource,
          columns,
          filters: { op: 'AND', groups: [] },
          display: {
            hideExternalToggle: false, readyToLoad: true,
            graphType: 'BarGraph', groupMode: 'stacked', orientation: 'vertical',
            showAttribution: false,
            title: { title: '', position: 'start', fontSize: 32, fontWeight: 'bold' },
            description: '', bgColor: '#ffffff', textColor: '#000000',
            colors: { type: 'palette', value: CHART_COLORS },
            height: 260,
            margins: { marginTop: 20, marginRight: 20, marginBottom: 50, marginLeft: 60 },
            xAxis: { label: '', rotateLabels: false, showGridLines: false, tickSpacing: 1 },
            yAxis: { label: '', showGridLines: true, tickFormat: 'Integer' },
            legend: { show: true, label: '' },
            tooltip: { show: true, fontSize: 12 },
          },
          data: [],
          join: { sources: {} },
        }),
      },
    };
  }

  return section;
}

/**
 * Creates all non-auth patterns specified by a site template.
 *
 * @param {object} falcor  - Falcor instance from useFalcor()
 * @param {object} opts
 * @param {string} opts.app              - Target app (tenant slug or site app)
 * @param {string} opts.siteInstance     - Site instance prefix (e.g. "main")
 * @param {string} opts.selectedTemplateId
 * @param {Array}  opts.siteTemplates    - theme.site_templates
 * @param {Array}  opts.pageTemplates    - theme.page_templates
 * @param {string} opts.adminGroupName   - Used for authPermissions group key (e.g. "acme")
 *
 * @returns {{ allPatternRefs: Array, allEnvRefs: Array }}
 *   allPatternRefs — refs for created patterns (auth pattern NOT included; caller prepends it)
 *   allEnvRefs     — refs for created dmsEnv rows
 */
export async function provisionTemplatePatterns(falcor, { app, siteInstance, selectedTemplateId, siteTemplates, pageTemplates, adminGroupName, subdomain }) {
  const selectedTemplate = (siteTemplates || []).find(t => t.id === selectedTemplateId) ?? { patterns: [] };
  let allPatternRefs = [];
  let allEnvRefs = [];
  let wiredContext = null;

  for (const patternSpec of selectedTemplate.patterns) {
    const patternSlug = nameToSlug(patternSpec.name);
    const patternType = `${siteInstance}|${patternSlug}:pattern`;
    const templatePatternRes = await falcor.call(['dms', 'data', 'create'], [app, patternType, {
      pattern_type: patternSpec.pattern_type,
      name: patternSpec.name,
      base_url: patternSpec.base_url,
      authPermissions: JSON.stringify({ groups: { [`${adminGroupName} Admin`]: ['*'], public: [] }, users: {} }),
      ...(subdomain ? { subdomain } : {}),
    }]);
    const templatePatternId = Object.keys(templatePatternRes?.json?.dms?.data?.byId || {})
      .find(k => k !== '$__path');
    if (!templatePatternId) continue;

    allPatternRefs = [...allPatternRefs, { ref: `${app}+${siteInstance}|pattern`, id: +templatePatternId }];

    if (patternSpec.pattern_type === 'page' && patternSpec.pages?.length) {
      for (const pageSpec of patternSpec.pages) {
        const tmpl = (pageTemplates || []).find(pt => pt.id === pageSpec.template);
        const baseSections = tmpl?.draft_sections ?? [];
        const draft_sections = (pageSpec.wireSource && wiredContext)
          ? baseSections.map(s => wireSection(s, wiredContext.sourceId, wiredContext.viewId, wiredContext.attrs, wiredContext.env, wiredContext.app, wiredContext.sourceSlug, wiredContext.srcEnv))
          : baseSections;
        await falcor.call(['dms', 'data', 'create'], [app, `${patternSlug}|page`, {
          title: pageSpec.title,
          index: 0,
          published: 'draft',
          draft_sections,
          draft_section_groups: tmpl?.draft_section_groups ?? [],
        }]);
      }
    }

    if (patternSpec.pattern_type === 'datasets' && patternSpec.sources?.length) {
      const envSlug = nameToSlug('default');
      const envType = `${siteInstance}|${envSlug}:dmsenv`;
      const envRes = await falcor.call(['dms', 'data', 'create'], [app, envType, { name: 'default', sources: [] }]);
      const envId = Object.keys(envRes?.json?.dms?.data?.byId || {}).find(k => k !== '$__path');

      if (envId) {
        allEnvRefs = [...allEnvRefs, { ref: `${app}+${siteInstance}|dmsenv`, id: +envId }];
        await falcor.call(['dms', 'data', 'edit'], [app, +templatePatternId, { dmsEnvId: +envId }]);

        let sourceRefs = [];
        for (const sourceSpec of patternSpec.sources) {
          const sourceSlug = nameToSlug(sourceSpec.name);
          const sourceRes = await falcor.call(['dms', 'data', 'create'], [app, `${envSlug}|${sourceSlug}:source`, {
            name: sourceSpec.name,
            type: sourceSpec.source_type,
            ...(sourceSpec.config ? { config: JSON.stringify(sourceSpec.config) } : {}),
          }]);
          const sourceId = Object.keys(sourceRes?.json?.dms?.data?.byId || {}).find(k => k !== '$__path');
          if (!sourceId) continue;

          sourceRefs = [...sourceRefs, { ref: `${app}+${envSlug}|source`, id: +sourceId }];

          if (sourceSpec.views?.length) {
            let viewRefs = [];
            for (let vi = 0; vi < sourceSpec.views.length; vi++) {
              const viewSpec = sourceSpec.views[vi];
              const viewType = `${sourceSlug}|v${vi + 1}:view`;
              const viewRes = await falcor.call(['dms', 'data', 'create'], [app, viewType, { name: viewSpec.name }]);
              const viewId = Object.keys(viewRes?.json?.dms?.data?.byId || {}).find(k => k !== '$__path');
              if (viewId) {
                viewRefs = [...viewRefs, { ref: `${app}+${sourceSlug}|view`, id: +viewId }];

                if (!wiredContext) {
                  wiredContext = {
                    sourceId: +sourceId, viewId: +viewId,
                    attrs: sourceSpec.config?.attributes ?? [],
                    env: `${app}+${sourceSlug}`,
                    app, sourceSlug,
                    srcEnv: `${app}+${envSlug}`,
                  };
                }

                if (viewSpec.rows?.length) {
                  const dataType = `${sourceSlug}|${viewId}:data`;
                  for (const row of viewSpec.rows) {
                    await falcor.call(['dms', 'data', 'create'], [app, dataType, row]);
                  }
                }
              }
            }
            if (viewRefs.length) {
              await falcor.call(['dms', 'data', 'edit'], [app, +sourceId, { views: viewRefs }]);
            }
          }
        }

        if (sourceRefs.length) {
          await falcor.call(['dms', 'data', 'edit'], [app, +envId, { sources: sourceRefs }]);
        }
      }
    }
  }

  return { allPatternRefs, allEnvRefs };
}
