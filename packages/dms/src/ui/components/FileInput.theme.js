// UI.FileInput (2026-10-13, ui-raw-html-to-ui-components.md step 0; spec: src/themes/tessera/design_system_v6/
// pages/ui-controls.html "File input"). Two shapes: a trigger button (the look is a UI.Button named style, picked
// by `buttonStyle`) with the chosen file's name beside it, and a dashed drop zone. Pick a whole look with
// activeStyle; there is no className override.
const FOCUS = 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--t-ink)]';

export const fileInputTheme = {
  options: { activeStyle: 0 },
  styles: [{
    name: 'default',
    nativeInput: 'hidden',         // the real <input type="file">, opened by the trigger / drop zone
    // button shape
    wrapper: 'inline-flex items-center gap-2 min-w-0',
    buttonStyle: 'action',          // UI.Button activeStyle for the trigger
    icon: 'Upload',                 // '' → no icon on the trigger
    iconClass: 'size-3.5',
    fileName: 't-proseXS text-[var(--t-graphite)] truncate',
    fileNameEmpty: 't-proseXS text-[var(--t-pencil)]',
    // drop zone shape
    dropzone: `flex flex-col items-center justify-center text-center w-full border-2 border-dashed border-[var(--t-rule-strong)] rounded-lg px-6 py-12 bg-[var(--t-panel)] hover:border-[var(--t-graphite)] cursor-pointer transition-colors ${FOCUS}`,
    dropzoneDragging: 'border-[var(--t-ink)] bg-[var(--t-well)]',
    dropzoneDisabled: 'opacity-40 cursor-not-allowed pointer-events-none',
    dropzoneIcon: 'Upload',
    dropzoneIconClass: 'size-7 text-[var(--t-pencil)]',
    dropzoneTitle: 't-proseSM text-[var(--t-ink)] mt-2',
    dropzoneTitleBold: 'font-medium',
    dropzoneHint: 't-proseXS text-[var(--t-pencil)] mt-0.5',
    loadingText: 't-proseSM text-[var(--t-graphite)] mt-2',
  }],
};

export const docs = [
  { doc_name: 'button', label: 'Select a file' },
  { doc_name: 'button · chosen', label: 'Select a file', defaultFileName: 'parcels_2026.csv' },
  { doc_name: 'button · disabled', label: 'Select a file', disabled: true },
  { doc_name: 'drop zone', dropzone: true, hint: 'a zipped CSV or Excel' },
  { doc_name: 'drop zone · loading', dropzone: true, loading: true },
];
