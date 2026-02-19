
const typeConfigs = {
  'fill': [
     {
      label: 'Type',
      type: 'inline',
      controls: [
        {
          type: 'selectType',
          params: {
            options: [
              {name:'Simple', value: 'simple'},
              {name:'Categories', value: 'categories'},
              {name:'Color Range', value: 'choropleth'},
              {name:'Interactive', value: 'interactive'}
            ]
          },
          path: `['layer-type']`,
          datapath: `layers[1].paint['fill-color']`
        }
      ]
    },
    {
      label: 'Color By',
      type: 'inline',
      conditional: [
        {
          path: `['layer-type']`,
          conditions: ['categories', 'choropleth']
        },
        {
          path: `['filterGroupEnabled']`,
          conditions: [false]
        }
      ],
      controls: [
        {
          type: 'selectViewColumn',
          params: {
            options: [
              {name:'Column Select', value: 'simple'},
              
            ]
          },
          path: `['data-column']`
        }
      ]
    },
    {
      label: 'Filter Group',
      type: 'inline',
      conditional: {
        path: `['layer-type']`,
        conditions: ['categories', 'choropleth']
      },
      controls: [
        {
          type: 'toggleControl',
          path: `['filterGroupEnabled']`,
          title: 'filter group'
        }
      ]
    },
    {
      label: '',
      type: 'popover',
      conditional: [
        {
          path: `['filterGroupEnabled']`,
          conditions: [true]
        },
        {
          path: `['layer-type']`,
          conditions: ['categories', 'choropleth']
        }
      ],
      controls: [
        {
          type: 'filterGroupControl',
          path: `['filter-group']`,
          params: {
            format: (v) => `${v?.length} columns`
          }
        }
      ]
    },
    {
      label: 'View Group',
      type: 'inline',
      conditional: {
        path: `['layer-type']`,
        conditions: ['categories', 'choropleth']
      },
      controls: [
        {
          type: 'toggleControl',
          path: `['viewGroupEnabled']`,
          title: 'View Group'
        }
      ]
    },
    {
      label: '',
      type: 'popover',
      conditional: [
        {
          path: `['viewGroupEnabled']`,
          conditions: [true]
        },
        {
          path: `['layer-type']`,
          conditions: ['categories', 'choropleth']
        }
      ],
      controls: [
        {
          type: 'viewGroupControl',
          path: `['filter-source-views']`,
          params: {
            format: (v) => `${v?.length} views`
          }
        }
      ]
    },
    {
      label: 'Categories',
      type: 'popover',
      conditional: {
        path: `['layer-type']`,
        conditions: ['categories']
      },
      controls: [
        {
          type: 'categoryControl',
          params: {
            options: [
              {name:'Column Select', value: 'simple'},
            ],
            format: (v) => `${((v?.length-3 || 0)/2) || '10'} Categories`
          },
          path: `layers[1].paint['fill-color']`
        }
      ]
    },
    {
      label: 'Fill',
      type: 'inline',
      conditional: {
        path: `['layer-type']`,
        conditions: ['categories']
      },
      controls: [
        {
          type: 'categoricalColor',
          path: `['color-set']`
        }
      ],
    },
    {
      label: 'Scale',
      type: 'popover',
      conditional: {
        path: `['layer-type']`,
        conditions: ['choropleth']
      },
      controls: [
        {
          type: 'choroplethControl',
          params: {
            format: (v) => `${((v?.[3]?.length-3 || 0)/2) || '10'} Categories`
          },
          path: `layers[1].paint['fill-color']`
        }
      ]
    },
    {
      label: 'Fill',
      type: 'inline',
      conditional: {
        path: `['layer-type']`,
        conditions: ['choropleth']
      },
      controls: [
        {
          type: 'rangeColor',
          path: `['color-range']`
        }
      ],
    },
    {
      label: 'Fill',
      type: 'popover',
      conditional: {
        path: `['layer-type']`,
        conditions: ['simple']
      },
      controls: [
        {
          type: 'color',
          path: `layers[1].paint['fill-color']`
        },
        {
          type: 'hexColor',
          path: `layers[1].paint['fill-color']`,
          params: {
            format: (v) => null
          },
        }
      ]
    },
    {
      label: 'Stroke',
      type: 'popover',
      conditional: {
        path: `['layer-type']`,
        conditions: ['categories', 'choropleth', 'simple']
      },
      controls: [
        {
          type: 'color',
          path: `layers[0].paint['line-color']`
        },
        {
          type: 'hexColor',
          path: `layers[0].paint['line-color']`,
          params: {
            format: (v) => null
          },
        },
        {
          type: 'range',
          unit: 'px',
          path: `layers[0].paint['line-width']`,
          params: {
            min: "0",
            max: "10",
            step: "0.5",
            default: "3",
            units: "px"
          }
        },
      ],
    },
    {
      label: 'Interactive Filters',
      type: 'full-width',
      conditional: {
        path: `['layer-type']`,
        conditions: ['interactive']
      },
      controls: [
        {
          type: 'interactiveFilterControl',
          path: `['interactive-filters']`,
        }
      ]
    },
    {
      label: 'Opacity',
      type: 'inline',
      conditional: {
        path: `['layer-type']`,
        conditions: ['categories', 'choropleth', 'simple']
      },
      controls: [
        {
          type: 'range',
          unit: '%',
          path: `layers[1].paint['fill-opacity']`,
          params: {
            min: "0",
            max: "1",
            step: "0.01",
            default: "0.75",
            units: "%",
            format: (v) => Math.round(v * 100)
          }
        },
      ],
    }
  ],
  'circle': [
    {
      label: 'Type',
      type: 'inline',
      controls: [
        {
          type: 'selectType',
          params: {
            options: [
              {name:'Simple', value: 'simple'},
              {name:'Categories', value: 'categories'},
              {name:'Color Range', value: 'choropleth'},
              {name:'Circles', value:'circles'},
              {name:'Interactive', value: 'interactive'}
            ]
          },
          path: `['layer-type']`,
          datapath: `layers[0].paint['circle-color']`
        }
      ]
    },
    {
      label: 'Color By',
      type: 'inline',
      conditional: [
        {
          path: `['layer-type']`,
          conditions: ['categories', 'choropleth'] //label is misleading for circles
        },
        {
          path: `['filterGroupEnabled']`,
          conditions: [false]
        }
      ],
      controls: [
        {
          type: 'selectViewColumn',
          params: {
            options: [
              {name:'Column Select', value: 'simple'},
              
            ]
          },
          path: `['data-column']`,
          datapath: `['category-data']`
        }
      ]
    },
    {
      label: 'Radius By',
      type: 'inline',
      conditional: [
        {
          path: `['layer-type']`,
          conditions: ['circles'] //label is misleading for circles
        },
        {
          path: `['filterGroupEnabled']`,
          conditions: [false]
        }
      ],
      controls: [
        {
          type: 'selectViewColumn',
          params: {
            options: [
              {name:'Column Select', value: 'simple'},
              
            ]
          },
          path: `['data-column']`,
          datapath: `['category-data']`
        }
      ]
    },
    {
      label: 'Filter Group',
      type: 'inline',
      conditional: {
        path: `['layer-type']`,
        conditions: ['categories', 'choropleth', 'circles']
      },
      controls: [
        {
          type: 'toggleControl',
          path: `['filterGroupEnabled']`,
          title: 'filter group',
        }
      ]
    },
    {
      label: '',
      type: 'popover',
      conditional: [
        {
          path: `['filterGroupEnabled']`,
          conditions: [true]
        },
        {
          path: `['layer-type']`,
          conditions: ['categories', 'choropleth', 'circles']
        }
      ],
      controls: [
        {
          type: 'filterGroupControl',
          path: `['filter-group']`,
          params: {
            format: (v) => `${v?.length} columns`
          }
        }
      ]
    },
    {
      label: 'View Group',
      type: 'inline',
      conditional: {
        path: `['layer-type']`,
        conditions: ['categories', 'choropleth', 'circles']
      },
      controls: [
        {
          type: 'toggleControl',
          path: `['viewGroupEnabled']`,
          title: 'View Group'
        }
      ]
    },
    {
      label: '',
      type: 'popover',
      conditional: [
        {
          path: `['viewGroupEnabled']`,
          conditions: [true]
        },
        {
          path: `['layer-type']`,
          conditions: ['categories', 'choropleth', 'circles']
        }
      ],
      controls: [
        {
          type: 'viewGroupControl',
          path: `['filter-source-views']`,
          params: {
            format: (v) => `${v?.length} views`
          }
        }
      ]
    },
    {
      label: 'Categories',
      type: 'popover',
      conditional: {
        path: `['layer-type']`,
        conditions: ['categories']
      },
      controls: [
        {
          type: 'categoryControl',
          params: {
            options: [
              {name:'Column Select', value: 'simple'},
              
            ],
            format: (v) => `${((v?.length-3 || 0)/2) || '10'} Categories`
          },
          path: `layers[0].paint['circle-color']`
        }
      ]
    },
    {
      label: 'Fill',
      type: 'inline',
      conditional: {
        path: `['layer-type']`,
        conditions: ['categories']
      },
      controls: [
        {
          type: 'categoricalColor',
          path: `['color-set']`
        }
      ],
    },
    {
      label: 'Scale',
      type: 'popover',
      conditional: {
        path: `['layer-type']`,
        conditions: ['choropleth']
      },
      controls: [
        {
          type: 'choroplethControl',
          params: {
            format: (v) => `${((v?.[3]?.length-3 || 0)/2) || '10'} Categories`
          },
          path: `layers[0].paint['circle-color']`
        }
      ]
    },
    {
      label: 'Scale',
      type: 'popover',
      conditional: {
        path: `['layer-type']`,
        conditions: ['circles']
      },
      controls: [
        {
          type: 'circleControl',
          params: {
            format: (v) => `${v[4]}px - ${v[6]}px`
          },
          path: `layers[0].paint['circle-radius']`
        }
      ]
    },
    {
      label: 'Fill',
      type: 'inline',
      conditional: {
        path: `['layer-type']`,
        conditions: ['circles']
      },
      controls: [
        {
          type: 'color',
          path: `layers[0].paint['circle-color']`
        },
        {
          type: 'hexColor',
          path: `layers[0].paint['circle-color']`,
          params: {
            format: (v) => null
          },
        }
        
      ],
    },
    {
      label: 'Fill',
      type: 'inline',
      conditional: {
        path: `['layer-type']`,
        conditions: ['choropleth']
      },
      controls: [
        {
          type: 'rangeColor',
          path: `['color-range']`
        }
      ],
    },
    {
      label: 'Fill',
      type: 'popover',
      conditional: {
        path: `['layer-type']`,
        conditions: ['simple']
      },
      controls: [
        {
          type: 'color',
          path: `layers[0].paint['circle-color']`
        },
        {
          type: 'hexColor',
          path: `layers[0].paint['circle-color']`,
          params: {
            format: (v) => null
          },
        }
      ],
    },
    {
      label: 'Size',
      type: 'inline',
      conditional: {
        path: `['layer-type']`,
        conditions: ['categories', 'choropleth', 'simple']
      },
      controls: [
        {
          type: 'range',
          unit: '%',
          path: `layers[0].paint['circle-radius']`,
          params: {
            min: "0",
            max: "20",
            step: "0.5",
            default: "3",
            units: "px"
          }
        },
      ],
    },
    {
      label: 'Stroke',
      type: 'popover',
      conditional: {
        path: `['layer-type']`,
        conditions: ['categories', 'choropleth', 'simple', 'circles']
      },
      controls: [
        {
          type: 'color',
          path: `layers[0].paint['circle-stroke-color']`
        },
        {
          type: 'hexColor',
          path: `layers[0].paint['circle-stroke-color']`,
          params: {
            format: (v) => null
          },
        },
        {
          type: 'range',
          unit: 'px',
          path: `layers[0].paint['circle-stroke-width']`,
          params: {
            min: "0",
            max: "20",
            step: "0.5",
            default: "3",
            units: "px"
          }
        },
      ],
    },
    {
      label: 'Interactive Filters',
      type: 'full-width',
      conditional: {
        path: `['layer-type']`,
        conditions: ['interactive']
      },
      controls: [
        {
          type: 'interactiveFilterControl',
          path: `['interactive-filters']`,
        }
      ]
    },
    {
      label: 'Opacity',
      type: 'inline',
      conditional: {
        path: `['layer-type']`,
        conditions: ['categories', 'choropleth', 'simple', 'circles']
      },
      controls: [
        {
          type: 'range',
          unit: '%',
          path: `layers[0].paint['circle-opacity']`,
          params: {
            min: "0",
            max: "1",
            step: "0.01",
            default: "0.75",
            units: "%",
            format: (v) => Math.round(v * 100)
          }
        },
      ],
    }
  ],
  'line': [
    {
      label: 'Type',
      type: 'inline',
      controls: [
        {
          type: 'selectType',
          params: {
            options: [
              {name:'Simple', value: 'simple'},
              {name:'Categories', value: 'categories'},
              {name:'Color Range', value: 'choropleth'},
              {name:'Interactive', value: 'interactive'}
            ]
          },
          path: `['layer-type']`,
          datapath: `layers[1].paint['line-color']`
        }
      ]
    },
    {
      label: 'Color By',
      type: 'inline',
      conditional: [
        {
          path: `['layer-type']`,
          conditions: ['categories', 'choropleth']
        },
        {
          path: `['filterGroupEnabled']`,
          conditions: [false]
        }
      ],
      controls: [
        {
          type: 'selectViewColumn',
          params: {
            options: [
              {name:'Column Select', value: 'simple'},
              
            ]
          },
          path: `['data-column']`,
          datapath: `['category-data']`
        }
      ]
    },
    {
      label: '',
      type: 'popover',
      conditional: [
        {
          path: `['filterGroupEnabled']`,
          conditions: [true]
        },
        {
          path: `['layer-type']`,
          conditions: ['categories', 'choropleth']
        }
      ],
      controls: [
        {
          type: 'filterGroupControl',
          path: `['filter-group']`,
          params: {
            format: (v) => `${v?.length} columns`
          }
        }
      ]
    },
    {
      label: 'Filter Group',
      type: 'inline',
      conditional: {
        path: `['layer-type']`,
        conditions: ['categories', 'choropleth']
      },
      controls: [
        {
          type: 'toggleControl',
          path: `['filterGroupEnabled']`,
          title: 'filter group'
        }
      ]
    },
    {
      label: 'View Group',
      type: 'inline',
      conditional: {
        path: `['layer-type']`,
        conditions: ['categories', 'choropleth']
      },
      controls: [
        {
          type: 'toggleControl',
          path: `['viewGroupEnabled']`,
          title: 'View Group'
        }
      ]
    },
    {
      label: '',
      type: 'popover',
      conditional: [
        {
          path: `['viewGroupEnabled']`,
          conditions: [true]
        },
        {
          path: `['layer-type']`,
          conditions: ['categories', 'choropleth']
        }
      ],
      controls: [
        {
          type: 'viewGroupControl',
          path: `['filter-source-views']`,
          params: {
            format: (v) => `${v?.length} views`
          }
        }
      ]
    },
    {
      label: 'Categories',
      type: 'popover',
      conditional: {
        path: `['layer-type']`,
        conditions: ['categories']
      },
      controls: [
        {
          type: 'categoryControl',
          params: {
            options: [
              {name:'Column Select', value: 'simple'},
              
            ],
            format: (v) => `${((v?.length-3 || 0)/2) || '10'} Categories`
          },
          path: `layers[1].paint['line-color']`
          // vars: {

          // }
        }
      ]
    },
    {
      label: 'Fill',
      type: 'inline',
      conditional: {
        path: `['layer-type']`,
        conditions: ['categories']
      },
      controls: [
        {
          type: 'categoricalColor',
          path: `['color-set']`
        }
      ],
    },
    {
      label: 'Scale',
      type: 'popover',
      conditional: {
        path: `['layer-type']`,
        conditions: ['choropleth']
      },
      controls: [
        {
          type: 'choroplethControl',
          params: {
            format: (v) => `${((v?.[3]?.length-3 || 0)/2) || '10'} Categories`
          },
          path: `layers[1].paint['line-color']`
        }
      ]
    },
    {
      label: 'Fill',
      type: 'inline',
      conditional: {
        path: `['layer-type']`,
        conditions: ['choropleth']
      },
      controls: [
        {
          type: 'rangeColor',
          path: `['color-range']`
        }
      ],
    },
    {
      label: 'Fill',
      type: 'popover',
      conditional: {
        path: `['layer-type']`,
        conditions: ['simple']
      },
      controls: [
        {
          type: 'color',
          path: `layers[1].paint['line-color']`
        },
        {
          type: 'hexColor',
          path: `layers[1].paint['line-color']`,
          params: {
            format: (v) => null
          },
        },
      ],
    },
    {
      label: 'Size',
      type: 'inline',
      controls: [
        {
          type: 'range',
          unit: '%',
          path: `layers[1].paint['line-width']`,
          params: {
            min: "0",
            max: "20",
            step: "0.5",
            default: "3",
            units: "px"
          }
        },
      ],
    },
    {
      label: 'Offset',
      type: 'inline',
      controls: [
        {
          type: 'range',
          unit: '%',
          path: `layers[1].paint['line-offset']`,
          params: {
            min: "-10",
            max: "10",
            step: "0.5",
            default: "0",
            units: "px"
          }
        },
      ],
    },
    {
      label: 'Hover Casing',
      type:'inline',
      controls: [
        {
          type: "toggleControl",
          path: `['hover-casing']`,
          params: {
            default: false
          }
        }
      ]
    },
    {
      label: 'Casing',
      type: 'popover',
      controls: [
        {
          type: 'color',
          path: `layers[0].paint['line-color']`
        },
        {
          type: 'hexColor',
          path: `layers[0].paint['line-color']`,
          params: {
            format: (v) => null
          },
        },
        {
          type: 'range',
          unit: 'px',
          path: `layers[0].paint['line-width']`,
          params: {
            min: "0",
            max: "20",
            step: "0.5",
            default: "0",
            units: "px"
          }
        },
        {
          type: 'range',
          unit: 'px',
          path: `layers[0].paint['line-offset']`,
          params: {
            min: "-10",
            max: "10",
            step: "0.5",
            default: "0",
            units: "px"
          }
        },
      ],
    },
    {
      label: 'Opacity',
      type: 'inline',
      conditional: {
        path: `['layer-type']`,
        conditions: ['categories', 'choropleth', 'simple']
      },
      controls: [
        {
          type: 'range',
          unit: '%',
          path: `layers[1].paint['line-opacity']`,
          params: {
            min: "0",
            max: "1",
            step: "0.01",
            default: "0.75",
            units: "%",
            format: (v) => Math.round(v * 100)
          }
        },
      ],
    },
    {
      label: 'Interactive Filters',
      type: 'full-width',
      conditional: {
        path: `['layer-type']`,
        conditions: ['interactive']
      },
      controls: [
        {
          type: 'interactiveFilterControl',
          path: `['interactive-filters']`,
        }
      ]
    }
  ]
}

export default typeConfigs