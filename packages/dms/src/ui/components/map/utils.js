import React from "react"

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
