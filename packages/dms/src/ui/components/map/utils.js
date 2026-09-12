import React from "react"

// Every consumer of the raw maplibre-gl `Marker` API needs this: the app doesn't load
// maplibre-gl's own stylesheet (no `.maplibregl-marker` rule anywhere - confirmed live,
// 2026-09-03), so a marker's wrapper div has no `position` rule and renders as a static,
// full-width block instead of a small pin anchored at the click point - effectively
// invisible. Originally written for avl-map.jsx's own pin-on-click marker; reused by
// routecreation's useMapMarkerHandler, which hit the same bug independently.
export const normalizeMarkerElement = (marker) => {
  const markerEl = marker?.getElement?.();
  if (!markerEl) return marker;
  const markerChild = markerEl.firstElementChild;
  const fallbackWidth = markerChild?.getAttribute?.("width") || "27px";
  const fallbackHeight = markerChild?.getAttribute?.("height") || "41px";

  // Keep the marker wrapper sized to the pin itself so MapLibre's
  // translate(-50%, -50%) centers the actual pin instead of a stretched box.
  markerEl.style.position = "absolute";
  markerEl.style.left = "0";
  markerEl.style.top = "0";
  markerEl.style.width = fallbackWidth;
  markerEl.style.maxWidth = "none";
  markerEl.style.minWidth = fallbackWidth;
  markerEl.style.height = fallbackHeight;
  markerEl.style.minHeight = fallbackHeight;
  markerEl.style.display = "block";
  markerEl.style.padding = "0";
  markerEl.style.margin = "0";

  return marker;
};

export const hasValue = value => {
  if ((value === null) || (value === undefined)) return false;
  if ((typeof value === "string") && !value.length) return false;
  if (Array.isArray(value)) return value.reduce((a, c) => a || hasValue(c), false);
  if ((typeof value === "number") && isNaN(value)) return false;
  if ((typeof value === "object")) return Object.values(value).reduce((a, c) => a || hasValue(c), false);
  return true;
}

const getRect = ref => {
  const node = ref?.current ?? ref;
  if (!node) return { width: 0, height: 0, x: 0, y: 0 };
  return node.getBoundingClientRect();
}

export const useSetSize = (ref, callback = null) => {
  const [size, setSize] = React.useState({ width: 0, height: 0, x: 0, y: 0 });

  const doSetSize = React.useCallback(() => {
    const { width, height, x, y } = getRect(ref);
    if ((width !== size.width) || (height !== size.height)) {
      if (typeof callback === "function") {
        callback({ width, height, x, y });
      }
      setSize({ width, height, x, y });
    }
  }, [ref, size, callback]);

  React.useEffect(() => {
    window.addEventListener("resize", doSetSize);
    return () => {
      window.removeEventListener("resize", doSetSize);
    }
  }, [doSetSize]);

  React.useEffect(() => {
    doSetSize();
  }, [doSetSize]);

  return size;
}
