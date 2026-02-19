import React, {useRef, useEffect, useLayoutEffect, useState, useCallback} from "react";
import ReactDOM from "react-dom";

export const useHandleClickOutside = (menuRef, buttonRef, preventCloseOnClickOutside, onClose) => {
    const handleClickOutside = useCallback(
        (e) => {
            if (
                menuRef.current &&
                !menuRef.current.contains(e.target) &&
                !buttonRef?.current?.contains(e.target)
            ) {
                onClose();
            }
        },
        [menuRef, onClose]
    );

    useEffect(() => {
        if(preventCloseOnClickOutside) return;
        document.addEventListener('mousedown', handleClickOutside);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [handleClickOutside]);
};

export default function Popup({
    button,
    children,
    offset = 8,
    padding = 8,
    portalContainer = document.body,
    btnVisibleOnGroupHover, // adds a hide class if not open. assumes the button to have group-hover
    preventCloseOnClickOutside=false,
    defaultOpen = false, preferredPosition="bottom"
}) {
    const [open, setOpen] = useState(defaultOpen);
    const buttonRef = useRef(null);
    const popupRef = useRef(null);
    const [pos, setPos] = useState({ top: 0, left: 0 });
    useHandleClickOutside(popupRef, buttonRef, preventCloseOnClickOutside, () => setOpen(false))
    // toggle internal open state
    const toggle = () => setOpen(o => !o);

    /** Compute popup placement */
    const computePosition = () => {
        const btn = buttonRef.current;
        const popup = popupRef.current;
        if (!btn || !popup) return;

        const rect = btn.getBoundingClientRect();

        // remove contents from screen if btn is out of viewport
        if(!(
            rect.top >= 0 &&
            rect.left >= 0 &&
            rect.bottom <= (window.innerHeight || document.documentElement.clientHeight) &&
            rect.right <= (window.innerWidth || document.documentElement.clientWidth)
        )) {
            setOpen(false);
            return;
        }

        const vw = window.innerWidth;
        const vh = window.innerHeight;
        const pw = popup.offsetWidth;
        const ph = popup.offsetHeight;

        // available space around button
        const space = {
            top: rect.top - padding,
            bottom: vh - rect.bottom - padding,
            left: rect.left - padding,
            right: vw - rect.right - padding,
        };
        // which sides can fully fit popup
        const canFit = {
            top: space.top >= ph + offset,
            bottom: space.bottom >= ph + offset,
            left: space.left >= pw + offset,
            right: space.right >= pw + offset,
        };

        // pick best side
        let placement = null;

        // try to find a side that fully fits
        const order = [preferredPosition, "bottom", "top", "right", "left"];
        placement = order.find(side => canFit[side]);

        // if none fits -> pick side with maximum space
        if (!placement) {
            placement = Object.entries(space).sort((a, b) => b[1] - a[1])[0][0];
        }

        let top = 0;
        let left = 0;

        switch (placement) {
            case "top":
                top = rect.top - ph - offset;
                left = rect.left; //+ rect.width - (pw / 4);
                break;

            case "top-left":
              top = rect.top - ph - offset;
              left = rect.left ;
              break;

            case "bottom":
                top = rect.bottom + offset;
                left = rect.left; // rect.left + rect.width - (pw / 4);
                break;

            case "left":
                top = rect.top;
                left = rect.left - pw - offset;
                break;

            case "right":
                top = rect.top;
                left = rect.right + offset;
                break;
        }

        // clamp inside viewport
        left = Math.min(Math.max(left, padding), vw - pw - padding);
        top = Math.min(Math.max(top, padding), vh - ph - padding);

        setPos({
            top: top + window.scrollY,
            left: left + window.scrollX,
        });
    };

    // measure when open
    useLayoutEffect(() => {
        if (open) computePosition();
    }, [open]);

    // reposition on scroll & resize
    useEffect(() => {
        if (!open) return;

        const handle = () => computePosition();
        window.addEventListener("scroll", handle, true);
        window.addEventListener("resize", handle);

        return () => {
            window.removeEventListener("scroll", handle, true);
            window.removeEventListener("resize", handle);
        };
    }, [open]);

    return (
        <>
            {React.cloneElement(button, {
                ref: buttonRef,
                className: btnVisibleOnGroupHover ? [
                    button.props.className.replace('hidden', ''),     // keep existing classes
                    open ? "" : "hidden"        // hide only when NOT open
                ].join(" ").trim() : button.props.className,
                onClick: (e) => {
                    button.props.onClick?.(e);
                    toggle();
                }
            })}

            {open ?
                ReactDOM.createPortal(
                        <div
                            ref={popupRef}
                            style={{
                                position: "absolute",
                                top: pos.top,
                                left: pos.left,
                                zIndex: 9999
                            }}
                        >
                            {typeof children === "function"
                                ? children({ open, setOpen }) :
                                React.Children.map(children, child =>
                                    React.isValidElement(child)
                                        ? React.cloneElement(child, { open, setOpen })
                                        : child
                                )}
                        </div>,
                    portalContainer
                ) : null
            }
        </>
    );
}
