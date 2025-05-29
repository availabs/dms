import { produce, freeze } from "immer";
import { useState, useReducer, useCallback, useMemo, Dispatch } from "react";



function useImmer(initialValue: any) {
  const [val, updateValue] = useState(() =>
    freeze(
      typeof initialValue === "function" ? initialValue() : initialValue,
      true
    )
  );
  return [
    val,
    useCallback((updater) => {
      if (typeof updater === "function") updateValue(produce(updater));
      else updateValue(freeze(updater));
    }, []),
  ];
}

// Provides different overloads of `useImmerReducer` similar to `useReducer` from `@types/react`.
export default useImmer