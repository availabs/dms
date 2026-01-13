import { sectionGroupTheme } from './components/sections/sectionGroup'
import { sectionArrayTheme } from './components/sections/sectionArray.theme'
import { sectionTheme } from './components/sections/section.theme'

export default {
    sectionGroup: sectionGroupTheme,
    sectionArray: sectionArrayTheme,
    section: sectionTheme
}

export const pagesThemeSettings = (theme) => {
  return {
    // sectionGroup: [
    //   {
    //     label: "Pages - SectionGroup",
    //     type: 'inline',
    //     controls: [
    //       {
    //         label: 'Size',
    //         type: 'Select',
    //         options: Object.keys(theme?.pages?.sectionGroup?.group || { "default": {} })
    //           .map(k => ({ label: k, value: k })),
    //         path: `pages.sectionGroup.edit`,
    //       },
    //       {
    //         label: `${theme?.pages?.sectionGroup?.edit} wrapper1`,
    //         type: "Textarea",
    //         path: `pages.sectionGroup.group.${theme?.pages?.sectionGroup?.edit}.wrapper1`
    //       },
    //       {
    //         label: `${theme?.pages?.sectionGroup?.edit} wrapper2`,
    //         type: "Textarea",
    //         path: `pages.sectionGroup.group.${theme?.pages?.sectionGroup?.edit}.wrapper2`
    //       },
    //       {
    //         label: `${theme?.pages?.sectionGroup?.edit} iconWrapper`,
    //         type: "Textarea",
    //         path: `pages.sectionGroup.group.${theme?.pages?.sectionGroup?.edit}.iconWrapper`
    //       },
    //       {
    //         label: `${theme?.pages?.sectionGroup?.edit} icon`,
    //         type: "Textarea",
    //         path: `pages.sectionGroup.group.${theme?.pages?.sectionGroup?.edit}.icon`
    //       },


    //     ],
    //   }
    // ]
  }
}
