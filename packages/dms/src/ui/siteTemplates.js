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
        sources: [{
          name: 'dataset',
          source_type: 'internal_table',
          config: {
            attributes: [
              { name: 'label',    display_name: 'Label',    type: 'text',   required: true,  options: null },
              { name: 'value',    display_name: 'Value',    type: 'number', required: false, options: null },
              { name: 'category', display_name: 'Category', type: 'text',   required: false, options: null },
            ]
          },
          views: [{
            name: 'version 1',
            rows: [
              { label: 'Category A', value: 120, category: 'Group 1' },
              { label: 'Category B', value: 85,  category: 'Group 1' },
              { label: 'Category C', value: 200, category: 'Group 2' },
              { label: 'Category D', value: 60,  category: 'Group 2' },
              { label: 'Category E', value: 145, category: 'Group 3' },
            ]
          }]
        }]
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
