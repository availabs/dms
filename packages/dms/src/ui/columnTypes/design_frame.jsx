import React from "react";

// design_frame column type — renders a stored HTML string (a self-contained
// design-system mockup, already processed by the control-room sync: _shared.css
// inlined, ds-nav stripped, Tailwind/Fonts CDN tags kept) inside a SANDBOXED
// iframe via srcDoc. srcDoc fully isolates the mockup's Tailwind build + global
// resets from the host DMS page, so neither side's styles leak into the other.
// sandbox="allow-scripts" (no allow-same-origin) lets the Tailwind CDN script run
// while keeping the frame on an opaque origin that can't touch the parent.
//
// Reads ONLY its own value (rung-3 "look depends on the value"). Height is
// configurable per-column via the column attribute `height` (default 80vh).
export const DesignFrameView = ({ value, height = "80vh" }) => {
    const html = (value ?? "").toString();
    if (!html.trim()) {
        return (
            <div style={{ padding: "2.5rem 1rem", textAlign: "center", color: "#71717a", fontStyle: "italic" }}>
                No design mockup yet
            </div>
        );
    }
    return (
        <iframe
            srcDoc={html}
            sandbox="allow-scripts"
            title="design mockup"
            loading="lazy"
            style={{ width: "100%", height, border: 0, display: "block" }}
        />
    );
};

// Edit renders the same (read-only) frame — design_html is populated by the sync
// ingest, not hand-edited, and the transcription/verify loop screenshots edit mode.
export const DesignFrameEdit = (props) => <DesignFrameView {...props} />;
