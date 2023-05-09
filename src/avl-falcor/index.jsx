import React from "react"

import debounce from "lodash/debounce"

export * from "./falcorGraph"

const FalcorContext = React.createContext();

export const useFalcor = () => React.useContext(FalcorContext);

export const FalcorConsumer = FalcorContext.Consumer;

export const FalcorProvider = ({ falcor, children }) => {
  const [falcorCache, setFalcorCache] = React.useState({});

  const updateCache = React.useMemo(() =>
    debounce(() => {
      const cache = falcor.getCache();
      setFalcorCache(cache);
    }, 250)
  , [falcor]);

  React.useEffect(() => {
    falcor.onChange(updateCache);
    return () => {
      falcor.remove(updateCache);
    }
  }, [falcor, updateCache]);

  const falcorValue = React.useMemo(() =>
    ({ falcor, falcorCache })
  , [falcor, falcorCache]);

  return (
    <FalcorContext.Provider value={ falcorValue }>
      { children }
    </FalcorContext.Provider>
  )
}

const noMap = () => ({});
export const avlFalcor = (Component, options = {}) => {
  const {
    mapCacheToProps = noMap
  } = options
  return props => (
    <FalcorContext.Consumer>
      { falcor =>
          <Component { ...props } { ...falcor }
            { ...mapCacheToProps(falcor.falcorCache, props) }/>
      }
    </FalcorContext.Consumer>
  )
}