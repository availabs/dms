
export const layoutSettings = [
  {
    label: "Layout",
    type: 'inline',
    controls: [
      {
        label: 'OuterWrapper',
        type: 'Textarea',
        path: `layout.outerWrapper`,
      },
      {
        label: 'Wrapper',
        type: 'Textarea',
        path: `layout.wrapper`,
      },
      {
        label: 'Wrapper2',
        type: 'Textarea',
        path: `layout.wrapper2`,
      },
      {
        label: 'Wrapper3',
        type: 'Textarea',
        path: `layout.wrapper3`,
      },
      {
        label: 'ChildWrapper',
        type: 'Textarea',
        path: `layout.childWrapper`,
      },
      {
        label: 'TopNavContainer',
        type: 'Textarea',
        path: `layout.topnavContainer1`,
      },
      {
        label: 'TopNavContainer2',
        type: 'Textarea',
        path: `layout.topnavContainer2`,
      },
      {
        label: 'sidenavContainer1',
        type: 'Textarea',
        path: `layout.sidenavContainer1`,
      },
      {
        label: 'sidenavContainer2',
        type: 'Textarea',
        path: `layout.sidenavContainer2`,
      }
    ]
  }
];



export default {
    outerWrapper: 'bg-slate-100',
    wrapper: 'relative isolate flex min-h-svh w-full max-lg:flex-col bg-white lg:bg-zinc-100 dark:bg-zinc-900 dark:lg:bg-zinc-950 overflow-hidden',
    wrapper2: 'flex-1 flex items-start flex-col items-stretch max-w-full',
    wrapper3: 'flex flex-1',

    // wrapper2: 'w-full h-full flex-1 flex flex-row lg:px-3', // inside page header, wraps sidebar
    // wrapper3: 'grow p-6 lg:rounded-lg lg:bg-white lg:p-10 lg:shadow-sm lg:ring-1 lg:ring-zinc-950/5 dark:lg:bg-zinc-900 dark:lg:ring-white/10 relative ' ,

    childWrapper: 'flex-1 h-full',
    topnavContainer1:`h-[50px] -mb-1`,
    topnavContainer2:`fixed w-full z-20 `,
    sidenavContainer1: 'border-r -mr-3',
    sidenavContainer2: 'fixed inset-y-0 left-0 w-64 max-lg:hidden',
    navTitle: `flex-1 text-[24px] font-['Oswald'] font-[500] leading-[24px] text-[#2D3E4C] py-3 px-4 uppercase`
}
