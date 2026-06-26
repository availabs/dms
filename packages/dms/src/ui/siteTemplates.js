export const defaultSiteTemplates = [
  {
    id: 'blank',
    name: 'Blank',
    description: 'Auth only — add patterns and pages yourself',
    patterns: []
  },
  {
    id: 'simple_site',
    name: 'Simple Site',
    description: 'One page pattern with a blank page — the minimum working content site',
    patterns: [
      {
        pattern_type: 'page',
        name: 'Pages',
        base_url: 'pages',
        pages: [{ template: 'blank', title: 'Page 1' }]
      }
    ]
  },
  {
    id: 'report',
    name: 'Report',
    description: 'A page pattern pre-configured with a narrative report page',
    patterns: [
      {
        pattern_type: 'page',
        name: 'Report',
        base_url: 'report',
        pages: [{ template: 'narrative', title: 'Report' }]
      }
    ]
  },
  {
    id: 'dashboard',
    name: 'Dashboard',
    description: 'A datasets pattern with an internal source and a dashboard page ready to be wired up',
    patterns: [
      {
        pattern_type: 'datasets',
        name: 'Data',
        base_url: 'data',
        sources: [{ name: 'dataset', source_type: 'internal_table' }]
      },
      {
        pattern_type: 'page',
        name: 'Dashboard',
        base_url: 'dashboard',
        pages: [{ template: 'dashboard', title: 'Dashboard' }]
      }
    ]
  }
]
