/**
 * Text Settings Theme
 *
 * Provides semantic text styles that can be used across the DMS system,
 * including Lexical editor headings. These styles follow the options/styles
 * pattern used by other component themes.
 */

export const textSettingsTheme = {
  options: { activeStyle: 0 },
  styles: [{
    name: "default",

    // Size + Weight Scale
    textXS: 'text-xs font-medium',
    textXSReg: 'text-xs font-normal',
    textXSBold: 'text-xs font-bold',
    textSM: 'text-sm font-medium',
    textSMReg: 'text-sm font-normal',
    textSMBold: 'text-sm font-bold',
    textSMSemiBold: 'text-sm font-semibold',
    textBase: 'text-base font-normal',
    textBaseMedium: 'text-base font-medium',
    textBaseBold: 'text-base font-bold',
    textLG: 'text-lg font-medium',
    textLGReg: 'text-lg font-normal',
    textLGBold: 'text-lg font-bold',
    textXL: 'text-xl font-medium',
    textXLReg: 'text-xl font-normal',
    textXLSemiBold: 'text-xl font-semibold',
    textXLBold: 'text-xl font-bold',
    text2XL: 'text-2xl font-medium',
    text2XLReg: 'text-2xl font-normal',
    text2XLSemiBold: 'text-2xl font-semibold',
    text2XLBold: 'text-2xl font-bold',
    text3XL: 'text-3xl font-medium',
    text3XLReg: 'text-3xl font-normal',
    text3XLSemiBold: 'text-3xl font-semibold',
    text3XLBold: 'text-3xl font-bold',
    text4XL: 'text-4xl font-medium',
    text4XLBold: 'text-4xl font-bold',
    text5XL: 'text-5xl font-medium',
    text5XLBold: 'text-5xl font-bold',
    text6XL: 'text-6xl font-medium',
    text7XL: 'text-7xl font-medium',
    text8XL: 'text-8xl font-medium',

    // Semantic Heading Aliases (used by Lexical)
    h1: 'font-semibold text-3xl scroll-mt-36 font-display',
    h2: 'font-medium text-xl scroll-mt-36 font-display',
    h3: 'font-medium text-lg scroll-mt-36 font-display',
    h4: 'font-medium scroll-mt-36 font-display',
    h5: 'scroll-mt-36 font-display',
    h6: 'scroll-mt-36 font-display',

    // Body text aliases
    body: 'text-base font-normal',
    bodySmall: 'text-sm font-normal',
    caption: 'text-xs font-normal text-gray-500',
    label: 'text-sm font-medium',
  }]
};

export const textSettingsSettings = (theme) => {
  const activeStyle = theme?.textSettings?.options?.activeStyle || 0;
  const styles = theme?.textSettings?.styles?.[activeStyle] || {};

  return [
    {
      label: "Text Settings Styles",
      type: 'inline',
      controls: [
        {
          label: 'Style',
          type: 'Select',
          options: (theme?.textSettings?.styles || [{}])
            .map((k, i) => ({ label: k?.name || i, value: i })),
          path: `textSettings.options.activeStyle`,
        },
        {
          label: 'Add Style',
          type: 'Button',
          children: 'Add Style',
          onClick: (e, setState) => {
            setState(draft => {
              if (!draft.textSettings) draft.textSettings = { ...textSettingsTheme };
              draft.textSettings.styles.push({ ...draft.textSettings.styles[0], name: 'new style' });
            });
          }
        },
        {
          label: 'Remove Style',
          type: 'Button',
          children: 'Remove Style',
          onClick: (e, setState) => {
            setState(draft => {
              if (draft.textSettings?.styles?.length > 1) {
                draft.textSettings.styles.splice(activeStyle, 1);
                draft.textSettings.options.activeStyle = 0;
              }
            });
          }
        },
      ]
    },
    {
      label: "Headings",
      type: 'inline',
      controls: ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'].map(key => ({
        label: key.toUpperCase(),
        type: 'Textarea',
        path: `textSettings.styles[${activeStyle}].${key}`
      }))
    },
    {
      label: "Text Sizes",
      type: 'inline',
      controls: Object.keys(styles)
        .filter(k => k.startsWith('text'))
        .map(k => ({
          label: k,
          type: 'Textarea',
          path: `textSettings.styles[${activeStyle}].${k}`
        }))
    },
    {
      label: "Semantic Aliases",
      type: 'inline',
      controls: ['body', 'bodySmall', 'caption', 'label'].map(key => ({
        label: key,
        type: 'Textarea',
        path: `textSettings.styles[${activeStyle}].${key}`
      }))
    }
  ];
};

export default textSettingsTheme;
