import React from "react"

import get from "lodash/get"

export const useClickOutside = (ref, callback) => {

  ref = get(ref, "current", ref);

  React.useEffect(() => {
    if (!ref) return;
    const handleClickOutside = e => {
      if (ref && !ref.contains(e.target)) {
        callback(e);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [ref, callback]);
}
