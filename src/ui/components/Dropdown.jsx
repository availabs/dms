import React from "react";

const useClickOutside = handleClick => {
  const [node, setNode] = React.useState(null);

  React.useEffect(() => {
    const checkOutside = e => {
      if (node.contains(e.target)) {
        return;
      }
      (typeof handleClick === "function") && handleClick(e);
    }
    node && document.addEventListener("mousedown", checkOutside);
    return () => document.removeEventListener("mousedown", checkOutside);
  }, [node, handleClick])

  return [setNode, node];
}

export const docs = [{
    doc_name: 'hover',
    control: <div>hover me!</div>,
    children: <div>content</div>
}, {
    doc_name: 'click',
    control: <div>hover me!</div>,
    children: <div>content</div>,
    openType: 'click'
}]
export default function ({ control, children,className, width='w-full min-w-[200px] max-w-[200px]', openType='hover' }) {
    const [open, setOpen] = React.useState(false),
        clickedOutside = React.useCallback(() => setOpen(false), []),
        [setRef] = useClickOutside(clickedOutside);
    // console.log('openType', openType)
    return (
        <div ref={ setRef }
             className={`relative cursor-pointer ${className}` }
             onMouseEnter={ e => {
                 if(openType === 'hover') {
                     setOpen(true)
                 }
             }}
             onMouseLeave={ e => setOpen(false) }
             onClick={ e => {
                 //e.preventDefault();
                 setOpen(!open)
             } }
        >
            {control}
            {open ?
                <div className={ `shadow absolute ${width} rounded-b-lg ${open ? `block` : `hidden`} z-10 right-0` }>
                    { children }
                </div> : ''

            }
        </div>
    )
}
