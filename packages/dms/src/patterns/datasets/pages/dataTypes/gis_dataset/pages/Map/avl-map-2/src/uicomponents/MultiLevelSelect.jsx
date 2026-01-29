import React from "react"

import get from "lodash/get"
import isEqual from "lodash/isEqual"

import {
  Input,
  FuseWrapper,
  useClickOutside,
  useTheme
} from "./index"

import { hasValue } from "../utils"

const EmptyArray = [];
const NoOp = () => {};
const Identity = v => v;

const DefaultValueComparator = (a, b) => isEqual(a, b);

const stopPropagation = e => {
  e.stopPropagation();
};

export const MultiLevelSelect = props => {
  const {
    options = EmptyArray,
    value = null,
    onChange = NoOp,
    isMulti = false,
    displayAccessor = Identity,
    valueAccessor = Identity,
    valueComparator = DefaultValueComparator,
    xDirection = 0,
    zIndex = 5,
    placeholder = "Select a value...",
    disabled = false,
    DisplayItem = DefaultDisplayItem,
    isDropdown = false,
    searchable = false,
    removable = true,
    InputContainer = DefaultInputContainer,
    maxOptions = Infinity,
    children
  } = props;

  const Value = React.useMemo(() => {
    return !hasValue(value) ? [] : Array.isArray(value) ? value : [value];
  }, [value]);

  const [outter, setOutter] = React.useState(null);

  const [show, setShow] = React.useState(false);
  const toggleDropdown = React.useCallback(e => {
    e.stopPropagation();
    setShow(show => !show);
  }, []);
  const showDropdown = React.useCallback(e => {
    e.stopPropagation();
    setShow(true);
  }, []);
  const hideDropdown = React.useCallback(e => {
    e.stopPropagation();
    setShow(false);
  }, []);

  useClickOutside(outter, hideDropdown);

  const [inner, setInner] = React.useState();
  const [xDir, setXDirection] = React.useState(xDirection);
  const [topOffset, setTopOffset] = React.useState(0);
  React.useEffect(() => {
    if (!inner || !show) {
      setTopOffset(0);
      return;
    }
    const rect = inner.getBoundingClientRect();
    const height = window.innerHeight;
    const width = window.innerWidth;
    if ((rect.x + rect.width) > width) {
      setXDirection(xDir => -xDir);
    }
    if ((rect.y + rect.height) > height) {
      setTopOffset(height - (rect.y + rect.height))
    }
  }, [inner, show]);

  const [search, setSearch] = React.useState("");

  const includes = React.useCallback(value => {
    return Value.reduce((a, c) => {
      return a || valueComparator(c, value);
    }, false);
  }, [Value, valueComparator]);

  const getDisplayValues = React.useCallback((options, dAccess, vAccess, result = []) => {
    return options.reduce((a, c, i) => {
      if (includes(vAccess(c))) {
        a.push({ display: dAccess(c), value: vAccess(c), key: i });
      }
      return getDisplayValues(get(c, "children", []), dAccess, vAccess, a);
    }, result);
  }, [includes]);

  const select = React.useCallback(option => {
    const value = valueAccessor(option);
    setSearch("");
    if (isMulti) {
      if (removable && includes(value)) {
        const newValue = Value.filter(v => !valueComparator(v, value));
        onChange(newValue);
      }
      else {
        onChange([...Value, value]);
      }
    }
    else {
      if (removable && includes(value)) {
        onChange(null);
      }
      else {
        onChange(value);
      }
      if (hasValue(value)) {
        setShow(false);
      }
    }
  }, [Value, includes, onChange, isMulti, removable, displayAccessor, valueAccessor, valueComparator]);

  const remove = React.useCallback(value => {
    if (isMulti && includes(value)) {
      onChange(Value.filter(v => !isEqual(v, value)));
    }
    else if (!isMulti && includes(value)){
      onChange(null);
    }
  }, [Value, includes, onChange, isMulti]);

  const displayValues = React.useMemo(() => {
    return getDisplayValues(options, displayAccessor, valueAccessor);
  }, [options, displayAccessor, valueAccessor, getDisplayValues]);

  const hasChildren = React.useMemo(() => {
    return options.reduce((a, c) => a || Boolean(get(c, ["children", "length"], 0)), false)
  }, [options]);

  const fuse = React.useMemo(() => {
    return FuseWrapper(
      options,
      { keys: [{ name: "label", getFn: displayAccessor }],
        threshold: 0.25
      }
    );
  }, [options, displayAccessor]);

  const fused = React.useMemo(() => {
    return fuse(search).slice(0, maxOptions);
  }, [fuse, search, maxOptions]);

  const getItem = React.useCallback(opt => {
    return get(opt, "DisplayItem", DisplayItem);
  }, [DisplayItem]);

  const renderedOptions = React.useMemo(() => {
    return fused.map((opt, i) => {
        const Item = getItem(opt);
        const value = valueAccessor(opt);
        return (
          <Dropdown key={ i }
            { ...props }
            options={ get(opt, "children", []) }
            xDirection={ 1 }
            zIndex={ zIndex + 5 }
            select={ select }
            Value={ Value }
            includes={ includes }
          >
            <Clickable disabled={ !hasValue(value) }
              select={ select }
              option={ opt }
            >
              <Item value={ value }
                active={ includes(value) }
                hasChildren={ Boolean(get(opt, ["children", "length"], 0)) }
              >
                { displayAccessor(opt) }
              </Item>
            </Clickable>
          </Dropdown>
        )
      })
  }, [fused, getItem, displayAccessor, valueAccessor, includes]);

  return (
    <div ref={ setOutter }
      className={ `relative cursor-pointer` }
      onClick={ toggleDropdown }
    >
      { isDropdown ? children :
        <ValueContainer placeholder={ placeholder }
          disabled={ disabled }
          removable={ removable }
          remove={ remove }
          displayValues={ displayValues }/>
      }
      <div ref={ setInner }
        className={ `absolute w-full max-w-full ${ show ? "h-fit" : "hidden h-0" }` }
        style={ {
          zIndex,
          top: `calc(100% + ${ topOffset }px)`,
          left: xDir === 1 ? "100%" : xDir == 0 ? "0%" : null,
          right: xDir === -1 ? "100%" : null,
          paddingTop: "0.25rem"
        } }
      >
        { options.length ? null :
          <DisplayItem>
            No options available...
          </DisplayItem>
        }
        <div className="w-full min-w-fit relative">
          { !searchable || hasChildren || (options.length < 10) ? null :
            <div className="w-full" onClick={ stopPropagation }>
              <InputContainer>
                <Input value={ search } onChange={ setSearch }
                  placeholder="search options..."/>
              </InputContainer>
            </div>
          }
          <div className="scrollbar-xs"
            style={ {
              maxHeight: hasChildren ? null : "20rem",
              overflow: hasChildren ? null : "auto"
            } }
          >
            { renderedOptions }
          </div>
        </div>
      </div>
    </div>
  )
}

const Dropdown = props => {
  const {
    options = EmptyArray,
    Value = null,
    select = NoOp,
    displayAccessor = Identity,
    valueAccessor = Identity,
    xDirection,
    zIndex,
    DisplayItem = DefaultDisplayItem,
    searchable = false,
    InputContainer = DefaultInputContainer,
    maxOptions = Infinity,
    includes,
    children
  } = props;

  const [show, setShow] = React.useState(false);
  const showDropdown = React.useCallback(e => {
    setShow(true);
  }, []);
  const hideDropdown = React.useCallback(e => {
    setShow(false);
  }, []);

  const [inner, setInner] = React.useState();
  const [xDir, setXDirection] = React.useState(xDirection);
  const [topOffset, setTopOffset] = React.useState(0);
  React.useEffect(() => {
    if (!inner || !show) {
      setTopOffset(0);
      return;
    }
    const rect = inner.getBoundingClientRect();
    const height = window.innerHeight;
    const width = window.innerWidth;
    if ((rect.x + rect.width) > width) {
      setXDirection(xDir => -xDir);
    }
    if ((rect.y + rect.height) > height) {
      setTopOffset(height - (rect.y + rect.height))
    }
  }, [inner, show]);

  const hasChildren = React.useMemo(() => {
    return options.reduce((a, c) => a || Boolean(get(c, ["children", "length"], 0)), false)
  }, [options]);

  const [search, setSearch] = React.useState("");

  const doSelect = React.useCallback(opt => {
    select(opt);
    setSearch("");
  }, [select]);

  const fuse = React.useMemo(() => {
    return FuseWrapper(
      options,
      { keys: [{ name: "label", getFn: displayAccessor }],
        threshold: 0.25
      }
    );
  }, [options, displayAccessor]);

  const fused = React.useMemo(() => {
    return fuse(search).slice(0, maxOptions);
  }, [fuse, search, maxOptions]);

  const getItem = React.useCallback(opt => {
    return get(opt, "Item", DisplayItem);
  }, [DisplayItem]);

  const theme = useTheme();

  const renderedOptions = React.useMemo(() => {
    return fused.map((opt, i) => {
        const Item = getItem(opt);
        const value = valueAccessor(opt);
        return (
          <Dropdown key={ i }
            { ...props }
            options={ get(opt, "children", []) }
            xDirection={ xDir }
            zIndex={ zIndex + 5 }
          >
            <Clickable select={ doSelect } option={ opt }>
              <Item value={ value }
                active={ includes(value) }
                hasChildren={ Boolean(get(opt, ["children", "length"], 0)) }
              >
                { displayAccessor(opt) }
              </Item>
            </Clickable>
          </Dropdown>
        )
      })
  }, [fused, getItem, displayAccessor, valueAccessor, includes]);

  return (
    <div className="relative cursor-pointer"
      onMouseEnter={ options.length ? showDropdown : null }
      onMouseLeave={ options.length ? hideDropdown : null }
    >

      { children }

      <div ref={ setInner }
        className={ `absolute w-full ${ show ? "h-fit" : "hidden h-0" }` }
        style={ {
          zIndex,
          top: `${ topOffset }px`,
          left: xDir === 1 ? "100%" : xDir == 0 ? "0%" : null,
          right: xDir === -1 ? "100%" : null
        } }
      >
        <div className="w-full min-w-fit relative">
          { !searchable || hasChildren || (options.length < 10) ? null :
            <div className="w-full"
              style={ {
                bottom: xDir ? "100%" : null,
                position: xDir ? "absolute" : "block"
              } }
              onClick={ stopPropagation }
            >
              <InputContainer className="rounded-t">
                <Input value={ search } onChange={ setSearch }
                  placeholder="search options..."/>
              </InputContainer>
            </div>
          }
          <div className="scrollbar-xs"
            style={ {
              maxHeight: hasChildren ? null : "20rem",
              overflow: hasChildren ? null : "auto"
            } }
          >
            { renderedOptions }
          </div>
        </div>
      </div>
    </div>
  )
}

const DefaultInputContainer = ({ className = "", children }) => {
  const theme = useTheme();
  return (
    <div className={ `${ theme.bgAccent1 } p-1 border-b ${ className }`}>
      { children }
    </div>
  )
}

const ValueItem = ({ display, value, remove, removable }) => {
  const doRemove = React.useCallback(e => {
    e.stopPropagation();
    remove(value);
  }, [remove, value]);
  const theme = useTheme();
  return (
    <div className={ `
        px-1 flex items-center rounded mt-1 ml-1
        ${ removable ? theme.bgAccent1 : "" }
      ` }
    >
      { display }
      { !removable ? null :
        <span onClick={ doRemove }
          className={ `
            fa fa-remove text-xs ml-2 px-1 rounded
            ${ theme.bgAccent3Hover }
          ` }/>
      }
    </div>
  )
}
const PlaceHolder = ({ children }) => {
  const theme = useTheme();
  return (
    <div className={ `px-1 mt-1 ml-1 ${ theme.textDisabled }` }>
      { children }
    </div>
  )
}
const ValueContainer = props => {
  const {
    displayValues,
    placeholder,
    disabled,
    remove,
    removable
  } = props;
  const theme = useTheme();
  return (
    <div tabIndex={ -1 }
      className={ `
        ${ theme.bgInput } rounded pl-1 pb-1 pr-2 flex flex-wrap
        focus:outline-1 focus:outline focus:outline-current
        hover:outline-1 hover:outline hover:outline-gray-300
      ` }
    >
      { !displayValues.length ?
        <PlaceHolder>
          { placeholder }
        </PlaceHolder> :
        displayValues.map((v, i) => (
          <ValueItem key={ v.key } { ...v }
            removable={ removable }
            remove={ remove }/>
        ))
      }
    </div>
  )
}
const DefaultDisplayItem = ({ children, active, hasChildren }) => {
  const theme = useTheme();
  return (
    <div
      className={ `
        py-1 px-2 flex items-center text-left min-w-fit w-full whitespace-nowrap
        ${ active ? theme.bgAccent3 : `${ theme.bgAccent2Hover } ${ theme.bgAccent1 }` }
      ` }
    >
      <div className="flex-1">{ children }</div>
      { !hasChildren ? null :
        <span className="fa fa-caret-right ml-2"/>
      }
    </div>
  )
}
const Clickable = ({ select, option, disabled, children }) => {
  const onClick = React.useCallback(e => {
    e.stopPropagation();
    select(option);
  }, [select, option]);
  return (
    <div onClick={ disabled ? null : onClick }>
      { children }
    </div>
  )
}
