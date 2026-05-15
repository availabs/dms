export const modalTheme = {
  options: {
    activeStyle: 0
  },
  styles: [
    {
      name: 'default',
      panel: 'relative transform overflow-hidden rounded-lg bg-white px-4 pb-4 pt-5 text-left shadow-xl sm:my-8 sm:w-full sm:max-w-lg sm:p-6'
    },
    {
      name: 'wide',
      panel: 'relative transform overflow-hidden rounded-lg bg-white px-4 pb-4 pt-5 text-left shadow-xl sm:my-8 sm:w-full sm:max-w-7xl sm:p-6'
    }
  ]
}

export const docs = {
  children: <div>modal content</div>,
  open: true,
  setOpen: () => {}
}
