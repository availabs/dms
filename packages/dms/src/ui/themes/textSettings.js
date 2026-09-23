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
    textXS: 'font-sans text-xs font-medium',
    textXSReg: 'font-sans text-xs font-normal',
    textXSBold: 'font-sans text-xs font-bold',
    textSM: 'font-sans text-sm font-medium',
    textSMReg: 'font-sans text-sm font-normal',
    textSMBold: 'font-sans text-sm font-semibold',
    textSMSemiBold: 'font-sans text-sm font-semibold',
    textBase: 'font-sans text-base font-normal',
    textBaseMedium: 'font-sans text-base font-medium',
    textBaseBold: 'font-sans text-base font-semibold',
    textLG: 'font-sans text-lg font-medium',
    textLGReg: 'font-sans text-lg font-normal',
    textLGBold: 'font-sans text-lg font-semibold',
    textXL: 'font-sans text-xl font-medium tracking-[-0.01em]',
    textXLReg: 'font-sans text-xl font-normal tracking-[-0.01em]',
    textXLSemiBold: 'font-sans text-xl font-semibold tracking-[-0.01em]',
    textXLBold: 'font-sans text-xl font-semibold tracking-[-0.01em]',
    text2XL: 'font-sans text-2xl font-semibold leading-tight tracking-[-0.015em]',
    text2XLReg: 'font-sans text-2xl font-normal leading-tight tracking-[-0.015em]',
    text2XLSemiBold: 'font-sans text-2xl font-semibold leading-tight tracking-[-0.015em]',
    text2XLBold: 'font-sans text-2xl font-semibold leading-tight tracking-[-0.015em]',
    text3XL: 'font-sans text-3xl font-semibold leading-tight tracking-[-0.02em]',
    text3XLReg: 'font-sans text-3xl font-normal leading-tight tracking-[-0.02em]',
    text3XLSemiBold: 'font-sans text-3xl font-semibold leading-tight tracking-[-0.02em]',
    text3XLBold: 'font-sans text-3xl font-semibold leading-tight tracking-[-0.02em]',
    text4XL: 'font-sans text-4xl font-semibold leading-tight tracking-[-0.025em]',
    text4XLBold: 'font-sans text-4xl font-bold leading-tight tracking-[-0.025em]',
    text5XL: 'font-sans text-5xl font-semibold leading-none tracking-[-0.025em]',
    text5XLBold: 'font-sans text-5xl font-bold leading-none tracking-[-0.025em]',
    text6XL: 'font-sans text-6xl font-semibold leading-none tracking-[-0.03em]',
    text7XL: 'font-sans text-7xl font-semibold leading-none tracking-[-0.03em]',
    text8XL: 'font-sans text-8xl font-semibold leading-none tracking-[-0.03em]',

    // Semantic Heading Aliases (used by Lexical)
    h1: 't-displayHero text-[var(--t-ink)] scroll-mt-36',
    h2: 't-displayXL text-[var(--t-ink)] scroll-mt-36',
    h3: 't-displayLG text-[var(--t-ink)] scroll-mt-36',
    h4: 't-displayMD text-[var(--t-ink)] scroll-mt-36',
    h5: 't-displaySM text-[var(--t-ink)] scroll-mt-36',
    h6: 't-displaySM text-[var(--t-ink)] scroll-mt-36',

    // Body text aliases
    body: 'font-sans text-base font-normal leading-relaxed text-[var(--t-ink)]',
    bodySmall: 'font-sans text-sm font-normal leading-relaxed text-[var(--t-ink)]',
    caption: 'font-sans text-xs font-normal text-[var(--t-graphite)]',
    label: 'font-sans text-sm font-medium text-[var(--t-ink)]',

    button: '',
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
          type: 'MultiSelect',
          singleSelectOnly: true,
          searchable: false,
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
