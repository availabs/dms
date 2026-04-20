export const logoTheme = {
  logoWrapper: 'h-12 flex px-4 items-center',
  logoAltImg: 'rounded-full h-8 w-8 bg-blue-500 border-2 border-blue-300 hover:bg-blue-600',
  imgWrapper: '',
  img: '',
  imgClass: 'min-h-12',
  titleWrapper: 'p-2',
  title: 'Admin',
  linkPath: '/'
}

export const logoSettings =  [{
  label: "Logo",
  type: 'inline',
  controls: Object.keys(logoTheme)
      .map(k => {
        return {
          label: k,
          type: 'Textarea',
          path: `logo.${k}`
        }
      })
}]
