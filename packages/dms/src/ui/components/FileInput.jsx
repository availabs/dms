import React from 'react'
import { ThemeContext, getComponentTheme } from '../useTheme'
import { fileInputTheme } from './FileInput.theme'
import DefaultButton from './Button'
import DefaultIcon from './Icon'

// UI.FileInput — the one way to pick a file. The native <input type="file"> stays hidden; the visible part is
// either a UI.Button (its look is the theme's `buttonStyle` named style) or a drop zone that also takes a
// dragged file. onChange gets an array of File objects (empty when nothing was picked).
//
//   <FileInput accept=".csv,.xlsx" onChange={files => setFile(files[0])} label="Select a file" />
//   <FileInput dropzone hint="a zipped CSV or Excel" loading={loading} onChange={files => upload(files[0])} />
export default function FileInput ({
  onChange = () => {}, accept, multiple = false, disabled = false,
  label = 'Select a file', title, hint, loading = false, loadingLabel = 'Uploading…',
  dropzone = false, showFileName = true, defaultFileName, id, activeStyle, ...props
}) {
  const { theme: themeFromContext = {}, UI = {} } = React.useContext(ThemeContext) || {};
  const t = { ...fileInputTheme.styles[0], ...getComponentTheme(themeFromContext, 'fileInput', activeStyle) };
  const Button = UI.Button || DefaultButton;
  const Icon = UI.Icon || DefaultIcon;
  const inputRef = React.useRef(null);
  const [fileName, setFileName] = React.useState(defaultFileName);
  const [dragging, setDragging] = React.useState(false);
  const off = disabled || loading;

  const pick = React.useCallback(fileList => {
    const files = Array.from(fileList || []);
    setFileName(files.map(f => f.name).join(', ') || undefined);
    onChange(files);
  }, [onChange]);

  const open = () => !off && inputRef.current?.click();
  const input = (
    <input ref={inputRef} id={id} type="file" className={t.nativeInput} tabIndex={-1} accept={accept} multiple={multiple}
           disabled={off} onChange={e => { pick(e.target.files); e.target.value = ''; }} {...props} />
  );

  if (dropzone) {
    const stop = e => { e.preventDefault(); e.stopPropagation(); };
    return (
      <div role="button" tabIndex={off ? -1 : 0} aria-disabled={off || undefined}
           className={`${t.dropzone} ${dragging ? t.dropzoneDragging : ''} ${off ? t.dropzoneDisabled : ''}`}
           onClick={open}
           onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { stop(e); open(); } }}
           onDragOver={stop}
           onDragEnter={e => { stop(e); !off && setDragging(true); }}
           onDragLeave={e => { stop(e); setDragging(false); }}
           onDrop={e => { stop(e); setDragging(false); if (!off && e.dataTransfer?.files?.length) pick(e.dataTransfer.files); }}>
        {t.dropzoneIcon ? <Icon icon={t.dropzoneIcon} className={t.dropzoneIconClass} /> : null}
        {loading
          ? <p className={t.loadingText}>{loadingLabel}</p>
          : <>
              <p className={t.dropzoneTitle}>{title || <><span className={t.dropzoneTitleBold}>Click to upload</span> or drag and drop</>}</p>
              {hint ? <p className={t.dropzoneHint}>{hint}</p> : null}
            </>}
        {input}
      </div>
    );
  }

  return (
    <span className={t.wrapper}>
      <Button activeStyle={t.buttonStyle} disabled={off} onClick={open}>
        {t.icon ? <Icon icon={t.icon} className={t.iconClass} /> : null}
        {loading ? loadingLabel : label}
      </Button>
      {showFileName
        ? <span className={fileName ? t.fileName : t.fileNameEmpty}>{fileName || hint || 'no file chosen'}</span>
        : null}
      {input}
    </span>
  );
}
