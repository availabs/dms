import React, { useContext, useRef, useState } from "react";
import { ThemeContext, getComponentTheme } from "../useTheme";
import { CMSContext } from "../../patterns/page/context";

// Pulls the size class (max-w-* max-h-*) for a given size key from the
// active dataCard theme. Falls back to imgDefault, then to a sensible
// inline default if a theme is missing those keys entirely.
const getImgClass = (dataCardTheme, size) =>
    dataCardTheme?.[size] || dataCardTheme?.imgDefault || 'max-w-[50px] max-h-[50px]';

const useDataCardTheme = () => {
    const { theme: themeFromContext } = useContext(ThemeContext) || {};
    return getComponentTheme(themeFromContext, 'dataCard', 0) || {};
};

// Mirrors the upload protocol used by the lexical InlineImage path
// (`ui/components/lexical/editor/nodes/InlineImageComponent.tsx`).
// Returns the persistent download URL on success, null on failure.
const uploadImageFile = async (file, fileUploadInfo) => {
    if (!fileUploadInfo) return null;
    const { DAMA_HOST, pgEnv, id, directory } = fileUploadInfo;
    if (!DAMA_HOST || !pgEnv) return null;

    const formData = new FormData();
    formData.append("source_name", id || '');
    formData.append("type", "file_upload");
    formData.append("file_name", file.name);
    formData.append("file_type", file.type || "application/octet-stream");
    formData.append("description", "Card image upload");
    formData.append("directory", directory || '');
    formData.append("categories", JSON.stringify([["Uploaded File"]]));
    formData.append("file", file);

    try {
        const res = await fetch(
            `${DAMA_HOST}/dama-admin/${pgEnv}/file_upload`,
            { method: "POST", body: formData }
        );
        const json = await res.json();
        return json?.ok ? json.dl_url : null;
    } catch (err) {
        console.error('Image column upload failed:', err);
        return null;
    }
};

// `imageMargin` is intentionally not applied here — Card's CardColumnField
// already sets `marginTop` on the cell wrapper from `attr.imageMargin`, and
// `imageTopMargin` reserves matching top padding on the cards-grid wrapper
// so negative margins can overflow upward. Applying it here too would
// double the offset.
const RenderImg = ({ src, imgClass }) => (
    <img className={imgClass} src={src} alt="" draggable="false" />
);

export const ImageView = ({ value, defaultImage, imageSize }) => {
    const dataCardTheme = useDataCardTheme();
    const src = (typeof value === 'string' && value) || defaultImage;
    if (!src) return null;
    return <RenderImg src={src} imgClass={getImgClass(dataCardTheme, imageSize)} />;
};

export const ImageEdit = ({ value, onChange, defaultImage, imageSize }) => {
    const dataCardTheme = useDataCardTheme();
    const cmsCtx = useContext(CMSContext) || {};
    const { fileUploadInfo } = cmsCtx;
    const inputRef = useRef(null);
    const [uploading, setUploading] = useState(false);
    const [error, setError] = useState(null);

    const src = (typeof value === 'string' && value) || defaultImage;
    const imgClass = getImgClass(dataCardTheme, imageSize);

    // When a URL is already set, edit mode just shows the image — the user
    // edits by clearing the value (column header → Set Value) or via row-
    // level controls. The upload widget only appears for empty cells.
    if (src) {
        return <RenderImg src={src} imgClass={imgClass} />;
    }

    const onSelectFile = async (e) => {
        const file = e?.target?.files?.[0];
        if (!file) return;
        setError(null);
        setUploading(true);
        try {
            const dl_url = await uploadImageFile(file, fileUploadInfo);
            if (dl_url) onChange(dl_url);
            else setError('Upload failed');
        } finally {
            setUploading(false);
            if (inputRef.current) inputRef.current.value = '';
        }
    };

    const uploadDisabled = uploading || !fileUploadInfo;

    return (
        <div className="w-full flex flex-col items-center justify-center gap-1 p-3 border border-dashed border-slate-300 rounded-md text-sm">
            <input
                ref={inputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={onSelectFile}
            />
            <button
                type="button"
                className="px-3 py-1.5 border rounded-md bg-white hover:bg-slate-50 disabled:opacity-50"
                disabled={uploadDisabled}
                onClick={() => inputRef.current?.click()}
            >
                {uploading ? 'Uploading…' : 'Upload Image'}
            </button>
            {!fileUploadInfo && (
                <span className="text-xs text-slate-500">File upload not configured</span>
            )}
            {error && <span className="text-xs text-red-500">{error}</span>}
        </div>
    );
};
