// ── Lexical helpers ──────────────────────────────────────────────────────────
// element-data shape: { text: <lexical-state>, bgColor, isCard, showToolbar }

function lexicalElementData(lexicalState) {
  return JSON.stringify({
    text: lexicalState,
    bgColor: 'rgba(0,0,0,0)',
    isCard: '',
    showToolbar: false
  });
}

function placeholderLexicalState(text) {
  return {
    root: {
      children: [
        {
          children: [
            { detail: 0, format: 0, mode: 'normal', style: '', text, type: 'text', version: 1 }
          ],
          direction: 'ltr', format: '', indent: 0,
          type: 'paragraph', version: 1
        }
      ],
      direction: 'ltr', format: '', indent: 0,
      type: 'root', version: 1
    }
  };
}

function articleLexicalState() {
  return {
    root: {
      children: [
        {
          children: [
            { detail: 0, format: 0, mode: 'normal', style: '', text: 'Page Title', type: 'text', version: 1 }
          ],
          direction: 'ltr', format: '', indent: 0, tag: 'h1',
          type: 'heading', version: 1
        },
        {
          children: [
            { detail: 0, format: 0, mode: 'normal', style: '', text: 'Start writing your content here.', type: 'text', version: 1 }
          ],
          direction: 'ltr', format: '', indent: 0,
          type: 'paragraph', version: 1
        }
      ],
      direction: 'ltr', format: '', indent: 0,
      type: 'root', version: 1
    }
  };
}

// Multi-node Lexical state: heading (h1) + one or more body paragraphs
function headingBodyLexicalState(heading, ...paragraphs) {
  return {
    root: {
      children: [
        {
          children: [{ detail: 0, format: 0, mode: 'normal', style: '', text: heading, type: 'text', version: 1 }],
          direction: 'ltr', format: '', indent: 0, tag: 'h1',
          type: 'heading', version: 1
        },
        ...paragraphs.map(text => ({
          children: [{ detail: 0, format: 0, mode: 'normal', style: '', text, type: 'text', version: 1 }],
          direction: 'ltr', format: '', indent: 0,
          type: 'paragraph', version: 1
        }))
      ],
      direction: 'ltr', format: '', indent: 0,
      type: 'root', version: 1
    }
  };
}

// ── Card / Spreadsheet helpers ───────────────────────────────────────────────
// Columns use `show: true` for Card/Spreadsheet; data loader is gated on
// source_id so pre-populated rows are never overwritten until a source is set.

function tableElementData({ columns, data }) {
  return JSON.stringify({
    filters: { op: 'AND', groups: [] },
    display: { usePagination: false, pageSize: 10, hideExternalToggle: true },
    columns,
    data,
    externalSource: { columns: [] }
  });
}

// ── Graph helpers ─────────────────────────────────────────────────────────────
// Graph columns use xAxis / yAxis / categorize instead of show.
// display must be complete (migrateToV2 returns v2 state as-is, no defaultState merge).
// Colors are from the div7-10 palette used by the default theme.

const CHART_COLORS = [
  '#2D3E4C', '#EAAD43', '#AA2E26', '#6D96AE', '#F1CA87',
  '#DD524C', '#C5D7E0', '#EA8954', '#54B99B', '#FCF6EC'
];

function graphDisplay({ graphType = 'BarGraph', groupMode = 'stacked', height = 320 } = {}) {
  return {
    hideExternalToggle: true,
    graphType,
    groupMode,
    orientation: 'vertical',
    showAttribution: false,
    title: { title: '', position: 'start', fontSize: 32, fontWeight: 'bold' },
    description: '',
    bgColor: '#ffffff',
    textColor: '#000000',
    colors: { type: 'palette', value: CHART_COLORS },
    height,
    margins: { marginTop: 20, marginRight: 20, marginBottom: 50, marginLeft: 60 },
    xAxis: { label: '', rotateLabels: false, showGridLines: false, tickSpacing: 1 },
    yAxis: { label: '', showGridLines: true, tickFormat: 'Integer' },
    legend: { show: true, label: '' },
    tooltip: { show: true, fontSize: 12 }
  };
}

function graphElementData({ columns, data, graphType, groupMode, height }) {
  return JSON.stringify({
    filters: { op: 'AND', groups: [] },
    display: graphDisplay({ graphType, groupMode, height }),
    columns,
    data,
    externalSource: { columns: [] }
  });
}

// ── Dummy data models ─────────────────────────────────────────────────────────
// Model A — item records: suitable for Card grid and Spreadsheet table
// Model B — time-trend: suitable for bar/line charts
// Model C — KPI metrics: suitable for stat-style Card

const MODEL_A = [
  { ID: '001', Name: 'Project Alpha',   Type: 'Infrastructure', Region: 'Northeast', Value: '$1,250',  Year: '2022', Status: 'Active'   },
  { ID: '002', Name: 'Project Beta',    Type: 'Analysis',       Region: 'Southeast', Value: '$3,890',  Year: '2023', Status: 'Complete' },
  { ID: '003', Name: 'Project Gamma',   Type: 'Infrastructure', Region: 'Midwest',   Value: '$750',    Year: '2022', Status: 'Active'   },
  { ID: '004', Name: 'Project Delta',   Type: 'Planning',       Region: 'Northeast', Value: '$5,200',  Year: '2024', Status: 'Pending'  },
  { ID: '005', Name: 'Project Epsilon', Type: 'Analysis',       Region: 'West',      Value: '$2,100',  Year: '2023', Status: 'Active'   },
  { ID: '006', Name: 'Project Zeta',    Type: 'Planning',       Region: 'Southeast', Value: '$4,750',  Year: '2024', Status: 'Complete' },
];

// Model B rows must pair one row per Year×Category for stacked charts
const MODEL_B = [
  { Year: '2021', Category: 'Infrastructure', Count: 45 },
  { Year: '2021', Category: 'Analysis',       Count: 32 },
  { Year: '2021', Category: 'Planning',       Count: 28 },
  { Year: '2022', Category: 'Infrastructure', Count: 58 },
  { Year: '2022', Category: 'Analysis',       Count: 41 },
  { Year: '2022', Category: 'Planning',       Count: 35 },
  { Year: '2023', Category: 'Infrastructure', Count: 63 },
  { Year: '2023', Category: 'Analysis',       Count: 55 },
  { Year: '2023', Category: 'Planning',       Count: 44 },
  { Year: '2024', Category: 'Infrastructure', Count: 71 },
  { Year: '2024', Category: 'Analysis',       Count: 62 },
  { Year: '2024', Category: 'Planning',       Count: 58 },
];

const MODEL_C = [
  { Metric: 'Total Projects',   Value: '1,284', Change: '+8.3%'  },
  { Metric: 'Active Projects',  Value: '947',   Change: '+12.1%' },
  { Metric: 'Avg. Value',       Value: '$2.8M', Change: '+5.4%'  },
  { Metric: 'Completion Rate',  Value: '73%',   Change: '+2.1%'  },
];

// Model D — key-value record attributes: suitable for Profile Card
const MODEL_D = [
  { Field: 'Type',     Value: 'Infrastructure'   },
  { Field: 'Region',   Value: 'Northeast'        },
  { Field: 'Status',   Value: 'Active'           },
  { Field: 'Year',     Value: '2022'             },
  { Field: 'Budget',   Value: '$1,250,000'       },
  { Field: 'Category', Value: 'Flood / Drainage' },
];

// ── Graph column configs ───────────────────────────────────────────────────────
// Model B stacked bar: xAxis=Year, categorize=Category, yAxis=Count
const TREND_COLS_STACKED = [
  { name: 'Year',     xAxis: true },
  { name: 'Category', categorize: true },
  { name: 'Count',    yAxis: true, fn: 'sum' },
];

// Model B grouped bar: same columns, groupMode set in display
const TREND_COLS_GROUPED = TREND_COLS_STACKED;

// ── Default templates ─────────────────────────────────────────────────────────

export const defaultPageTemplates = [
  // ─── Text layouts ───────────────────────────────────────────────────────────
  {
    id: 'blank',
    name: 'Blank',
    description: 'Start with an empty page',
    draft_sections: [],
    draft_section_groups: [
      { name: 'default', position: 'content', index: 0, theme: 'content' }
    ]
  },
  {
    id: 'article',
    name: 'Article',
    description: 'Long-form text page — great for docs, reports, or blog posts',
    draft_sections: [
      {
        title: '', level: '0', group: 'default',
        element: {
          'element-type': 'lexical',
          'element-data': lexicalElementData(articleLexicalState())
        }
      }
    ],
    draft_section_groups: [
      { name: 'default', position: 'content', index: 0, theme: 'content' }
    ]
  },
  {
    id: 'two_column',
    name: 'Two Column',
    description: 'Two equal-width text areas side by side',
    draft_sections: [
      {
        title: '', level: '0', size: '1/2', group: 'default',
        element: {
          'element-type': 'lexical',
          'element-data': lexicalElementData(placeholderLexicalState('Left column content goes here.'))
        }
      },
      {
        title: '', level: '0', size: '1/2', group: 'default',
        element: {
          'element-type': 'lexical',
          'element-data': lexicalElementData(placeholderLexicalState('Right column content goes here.'))
        }
      }
    ],
    draft_section_groups: [
      { name: 'default', position: 'content', index: 0, theme: 'content' }
    ]
  },

  // ─── Single-component data views ─────────────────────────────────────────────
  {
    id: 'card_grid',
    name: 'Card Grid',
    description: 'Record cards from a data source — sample project data pre-loaded',
    draft_sections: [
      {
        title: '', level: '0', group: 'default',
        element: {
          'element-type': 'Card',
          'element-data': tableElementData({
            columns: [
              { name: 'Name',   show: true, type: 'text' },
              { name: 'Type',   show: true, type: 'text' },
              { name: 'Region', show: true, type: 'text' },
              { name: 'Value',  show: true, type: 'text' },
              { name: 'Status', show: true, type: 'text' },
            ],
            data: MODEL_A
          })
        }
      }
    ],
    draft_section_groups: [
      { name: 'default', position: 'content', index: 0, theme: 'content' }
    ]
  },
  // ─── Multi-component layouts ──────────────────────────────────────────────────
  {
    id: 'stats_chart',
    name: 'Stats + Chart',
    description: 'KPI metrics beside a grouped bar chart — two dummy data sets',
    draft_sections: [
      {
        title: '', level: '0', size: '1/2', group: 'default',
        element: {
          'element-type': 'Card',
          'element-data': tableElementData({
            columns: [
              { name: 'Metric', show: true, type: 'text' },
              { name: 'Value',  show: true, type: 'text' },
              { name: 'Change', show: true, type: 'text' },
            ],
            data: MODEL_C
          })
        }
      },
      {
        title: '', level: '0', size: '1/2', group: 'default',
        element: {
          'element-type': 'Graph',
          'element-data': graphElementData({
            columns: TREND_COLS_GROUPED,
            data: MODEL_B,
            graphType: 'BarGraph',
            groupMode: 'grouped',
            height: 280
          })
        }
      }
    ],
    draft_section_groups: [
      { name: 'default', position: 'content', index: 0, theme: 'content' }
    ]
  },
  // ─── New distinctive layouts (designed in page-template-layouts.html) ─────────
  {
    id: 'narrative',
    name: 'Narrative',
    description: 'Report-style flow: intro text → chart → analysis → table, all full-width',
    draft_sections: [
      {
        title: '', level: '0', group: 'default',
        element: {
          'element-type': 'lexical',
          'element-data': lexicalElementData(headingBodyLexicalState(
            'Report Title',
            'Provide an introduction or executive summary here. Describe the subject, the time period covered, and the key findings. Replace this with your own content once a data source is connected.'
          ))
        }
      },
      {
        title: '', level: '0', group: 'default',
        element: {
          'element-type': 'Graph',
          'element-data': graphElementData({
            columns: TREND_COLS_STACKED,
            data: MODEL_B,
            graphType: 'BarGraph',
            groupMode: 'stacked',
            height: 360
          })
        }
      },
      {
        title: '', level: '0', group: 'default',
        element: {
          'element-type': 'lexical',
          'element-data': lexicalElementData(placeholderLexicalState(
            'Add your analysis here. Describe what the chart above shows, note trends, and highlight anything the reader should pay attention to before looking at the detail table.'
          ))
        }
      },
      {
        title: '', level: '0', group: 'default',
        element: {
          'element-type': 'Spreadsheet',
          'element-data': tableElementData({
            columns: [
              { name: 'ID',     show: true, type: 'text' },
              { name: 'Name',   show: true, type: 'text' },
              { name: 'Type',   show: true, type: 'text' },
              { name: 'Region', show: true, type: 'text' },
              { name: 'Value',  show: true, type: 'text' },
              { name: 'Year',   show: true, type: 'text' },
              { name: 'Status', show: true, type: 'text' },
            ],
            data: MODEL_A
          })
        }
      }
    ],
    draft_section_groups: [
      { name: 'default', position: 'content', index: 0, theme: 'content' }
    ]
  },
  {
    id: 'overview',
    name: 'Overview',
    description: 'Dark header band + KPI cards (½) beside a chart (½) + full table below',
    draft_sections: [
      {
        title: '', level: '0', group: 'header',
        element: {
          'element-type': 'lexical',
          'element-data': lexicalElementData(headingBodyLexicalState(
            'Program Overview',
            'Replace this subtitle with a one-line description of the program, region, or topic this page covers.'
          ))
        }
      },
      {
        title: '', level: '0', size: '1/2', group: 'default',
        element: {
          'element-type': 'Card',
          'element-data': tableElementData({
            columns: [
              { name: 'Metric', show: true, type: 'text' },
              { name: 'Value',  show: true, type: 'text' },
              { name: 'Change', show: true, type: 'text' },
            ],
            data: MODEL_C
          })
        }
      },
      {
        title: '', level: '0', size: '1/2', group: 'default',
        element: {
          'element-type': 'Graph',
          'element-data': graphElementData({
            columns: TREND_COLS_GROUPED,
            data: MODEL_B,
            graphType: 'BarGraph',
            groupMode: 'grouped',
            height: 260
          })
        }
      },
      {
        title: '', level: '0', group: 'default',
        element: {
          'element-type': 'Spreadsheet',
          'element-data': tableElementData({
            columns: [
              { name: 'Name',   show: true, type: 'text' },
              { name: 'Type',   show: true, type: 'text' },
              { name: 'Region', show: true, type: 'text' },
              { name: 'Value',  show: true, type: 'text' },
              { name: 'Year',   show: true, type: 'text' },
              { name: 'Status', show: true, type: 'text' },
            ],
            data: MODEL_A
          })
        }
      }
    ],
    draft_section_groups: [
      { name: 'header',  position: 'top',    index: 0, theme: 'header'  },
      { name: 'default', position: 'content', index: 1, theme: 'content' }
    ]
  },
  {
    id: 'profile',
    name: 'Profile',
    description: 'Dark header + narrative text (½) beside a key-attribute card (½)',
    draft_sections: [
      {
        title: '', level: '0', group: 'header',
        element: {
          'element-type': 'lexical',
          'element-data': lexicalElementData(placeholderLexicalState('Record Name'))
        }
      },
      {
        title: '', level: '0', size: '1/2', group: 'default',
        element: {
          'element-type': 'lexical',
          'element-data': lexicalElementData(headingBodyLexicalState(
            'About This Record',
            'Write a narrative description here. Explain what this record represents, its background, context, and any details that a data table alone cannot convey.',
            'Add a second paragraph with additional context, references, or next steps as needed.'
          ))
        }
      },
      {
        title: '', level: '0', size: '1/2', group: 'default',
        element: {
          'element-type': 'Card',
          'element-data': tableElementData({
            columns: [
              { name: 'Field', show: true, type: 'text' },
              { name: 'Value', show: true, type: 'text' },
            ],
            data: MODEL_D
          })
        }
      }
    ],
    draft_section_groups: [
      { name: 'header',  position: 'top',    index: 0, theme: 'header'  },
      { name: 'default', position: 'content', index: 1, theme: 'content' }
    ]
  },
  {
    id: 'dashboard',
    name: 'Dashboard',
    description: 'Header + stacked chart beside a data table — three components',
    draft_sections: [
      {
        title: '', level: '0', group: 'header',
        element: {
          'element-type': 'lexical',
          'element-data': lexicalElementData(placeholderLexicalState('Dashboard Title'))
        }
      },
      {
        title: '', level: '0', size: '1/2', group: 'default',
        element: {
          'element-type': 'Graph',
          'element-data': graphElementData({
            columns: TREND_COLS_STACKED,
            data: MODEL_B,
            graphType: 'BarGraph',
            groupMode: 'stacked',
            height: 260
          })
        }
      },
      {
        title: '', level: '0', size: '1/2', group: 'default',
        element: {
          'element-type': 'Spreadsheet',
          'element-data': tableElementData({
            columns: [
              { name: 'Name',   show: true, type: 'text' },
              { name: 'Type',   show: true, type: 'text' },
              { name: 'Region', show: true, type: 'text' },
              { name: 'Value',  show: true, type: 'text' },
              { name: 'Status', show: true, type: 'text' },
            ],
            data: MODEL_A
          })
        }
      }
    ],
    draft_section_groups: [
      { name: 'header',  position: 'top',     index: 0, theme: 'header'  },
      { name: 'default', position: 'content',  index: 1, theme: 'content' }
    ]
  }
];
