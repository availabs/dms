export default {
  navOptions: [
    {
      label: "Top Nav",
      type:  'inline',
      controls : [
        {
          label: 'Size',
          type: 'Select',

          options: [
            {label:'None', value: 'none'},
            {label:'Compact', value: 'compact'}
          ],

          path: `navOptions.topNav.size`,
          //datapath: `layers[1].paint['fill-color']`
        },
        {
          label: 'Search',
          type: 'Select',

          options: [
            {label:'None', value: 'none'},
            {label:'Left', value: 'left'},
            {label:'Right', value: 'right'}
          ],

          path: `navOptions.topNav.search`,
          //datapath: `layers[1].paint['fill-color']`
        },
        {
          label: 'Logo',
          type: 'Select',

          options: [
            {label:'None', value: 'none'},
            {label:'Left', value: 'left'},
            {label:'Right', value: 'right'}
          ],

          path: `navOptions.topNav.logo`,
          //datapath: `layers[1].paint['fill-color']`
        },
        {
          label: 'User Menu',
          type: 'Select',

          options: [
            {label:'None', value: 'none'},
            {label:'Left', value: 'left'},
            {label:'Right', value: 'right'}
          ],

          path: `navOptions.topNav.dropdown`,
          //datapath: `layers[1].paint['fill-color']`
        },

      ]
    },
    {
      label: "Side Nav",
      type:  'inline',
      controls : [
        {
          label: 'Size',
          type: 'Select',

          options: [
            {label:'None', value: 'none'},
            {label:'Compact', value: 'compact'}
          ],

          path: `navOptions.sideNav.size`,
          //datapath: `layers[1].paint['fill-color']`
        }
      ]
    }
  ],
  layout: [
    {
      label: "Layout",
      type:  'inline',
      controls : [
        {
          label: 'Wrapper',
          type: 'Textarea',
          path: `layout.wrapper`,
          //datapath: `layers[1].paint['fill-color']`
        },
        {
          label: 'Wrapper2',
          type: 'Textarea',
          path: `layout.wrapper2`,
          //datapath: `layers[1].paint['fill-color']`
        },
        {
          label: 'Wrapper3',
          type: 'Textarea',
          path: `layout.wrapper3`,
          //datapath: `layers[1].paint['fill-color']`
        },
        {
          label: 'ChildWrapper',
          type: 'Textarea',
          path: `layout.childWrapper`,
          //datapath: `layers[1].paint['fill-color']`
        },
        {
          label: 'TopNavContainer',
          type: 'Textarea',
          path: `layout.topnavContainer1`,
          //datapath: `layers[1].paint['fill-color']`
        },
        {
          label: 'TopNavContainer2',
          type: 'Textarea',
          path: `layout.topnavContainer2`,
          //datapath: `layers[1].paint['fill-color']`
        },
        {
          label: 'sidenavContainer1',
          type: 'Textarea',
          path: `layout.sidenavContainer1`,
          //datapath: `layers[1].paint['fill-color']`
        },
        {
          label: 'sidenavContainer2',
          type: 'Textarea',
          path: `layout.sidenavContainer2`,
          //datapath: `layers[1].paint['fill-color']`
        }
      ]
    }
  ],
  page: [
    {
      label: "Page - page",
      type:  'inline',
      controls : [
        {
          label: "container",
          type: "Textarea",
          path: 'page.container'
        },
        {
          label: "wrapper1",
          type: "Textarea",
          path: 'page.wrapper1'
        },
        {
          label: "wrapper2",
          type: "Textarea",
          path: 'page.wrapper2'
        },
        {
          label: "wrapper3",
          type: "Textarea",
          path: 'page.wrapper3'
        },
        {
          label: "iconWrapper",
          type: "Textarea",
          path: 'page.iconWrapper'
        },
        {
          label: "icon",
          type: "Textarea",
          path: 'page.icon'
        }
      ]
    }
  ],
}
