export const sectionArrayTheme = {
  "options": {
    "activeStyle": 0
  },
  "styles": [
    {
      name: '',
      wrapper: 'relative',
      gridOverlay: 'absolute inset-0 pointer-events-none',
      container: 'w-full grid grid-cols-12 ', //gap-1 md:gap-[12px]
      gridSize: 12,
      layouts: {
          centered: 'max-w-[1020px] mx-auto',
          fullwidth: ''
      },
      sectionEditWrapper: 'relative group',
      sectionEditHover: 'absolute inset-0 group-hover:border border-blue-300 border-dashed pointer-events-none z-10',
      sectionViewWrapper: 'relative group',
      sectionPadding: 'p-4',
      gridviewGrid: 'z-0 bg-slate-50 h-full',
      gridviewItem: 'border-x bg-white border-slate-100/75 border-dashed h-full p-[6px]',
      defaultOffset: 16,
      addSectionButton: 'cursor-pointer py-0.5 text-sm text-blue-200 hover:text-blue-400 truncate w-full hover:bg-blue-50/75 -ml-4 hidden group-hover:flex absolute -top-5',
      spacer: 'flex-1',
      addSectionIconWrapper: 'flex items-center',
      addSectionIcon: 'size-6',
      sizes: {
          "1/3": { className: 'col-span-12 md:col-span-4', iconSize: 33 },
          "1/2": { className: 'col-span-12 md:col-span-6', iconSize: 50 },
          "2/3": { className: 'col-span-12 md:col-span-9', iconSize: 66 },
          "1":   { className: 'col-span-12 md:col-span-12', iconSize: 100 },
      },
      rowspans: {
          "1" : { className: '' },
          "2" : { className: 'md:row-span-2'},
          "3" : { className: 'md:row-span-3'},
          "4" : { className: 'md:row-span-4'},
          "5" : { className: 'md:row-span-5'},
          "6" : { className: 'md:row-span-6'},
          "7" : { className: 'md:row-span-7'},
          "8" : { className: 'md:row-span-8'},
      },
      border: {
          none: '',
          full: 'border border-[#E0EBF0] rounded-lg',
          openLeft: 'border border-[#E0EBF0] border-l-transparent rounded-r-lg',
          openRight: 'border border-[#E0EBF0] border-r-transparent rounded-l-lg',
          openTop: 'border border-[#E0EBF0] border-t-transparent rounded-b-lg',
          openBottom: 'border border-[#E0EBF0] border-b-transparent rounded-t-lg',
          borderX: 'border border-[#E0EBF0] border-y-transparent'
      }
    }
  ]
}

export default sectionArrayTheme
