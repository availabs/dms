import React from "react"
import { ThemeContext } from "../../../../ui/useTheme"
import { categoriesTheme } from "./categories.theme"



const CategoryItem = ({ children, remove, indices, editing, className="" }) => {
    const { theme } = React.useContext(ThemeContext) || {};
    const t = { ...categoriesTheme, ...(theme?.datasets?.categories || {}) };
    const doRemove = React.useCallback(e => {
        remove(...indices);
    }, [remove, indices]);
    return (
        <div className={ `${ t.categoryItem } ${ className }` }>
            <div className={t.categoryItemInner}>
                { children }
            </div>
            { !editing ? null :
                <button onClick={ doRemove } className={t.categoryItemRemoveBtn}>
                    <span className={t.removeIcon}/>
                </button>
            }
        </div>
    )
}
const Spanner = () => {
    const { theme } = React.useContext(ThemeContext) || {};
    const t = { ...categoriesTheme, ...(theme?.datasets?.categories || {}) };
    return (
        <span className={t.spanner}/>
    )
}
const Plus = props => {
    const { theme } = React.useContext(ThemeContext) || {};
    const t = { ...categoriesTheme, ...(theme?.datasets?.categories || {}) };
    return (
        <span { ...props }
              className={t.plus}/>
    )
}

const CategoryList = props => {
    const { theme } = React.useContext(ThemeContext) || {};
    const t = { ...categoriesTheme, ...(theme?.datasets?.categories || {}) };

    const {
        categories,
        parent,
        addNewCategory,
        removeCategory,
        editingCategories: eCats,
        // stopEditing
    } = props;

    const num = categories.length;

    const [editing, setEditing] = React.useState(false);
    const startEditing = React.useCallback(e => {
        e.stopPropagation();
        setEditing(true);
    }, []);
    const stopEditing = React.useCallback(e => {
        e.stopPropagation();
        setEditing(false);
    }, []);

    const doAdd = React.useCallback(cat => {
        addNewCategory(cat, parent);
        setEditing(false);
    }, [addNewCategory, parent, stopEditing]);

    return (
        <div className={ eCats ? t.categoryListWrapperEditing : t.categoryListWrapper }>
            <div className={ eCats ? t.categoryListRowEditing : t.categoryListRow }>
                <CategoryItem className={t.categoryItemBold}
                              remove={ removeCategory }
                              indices={ [parent, 0] }
                              editing={ editing || eCats }
                >
                    { categories[0] }
                </CategoryItem>
                { !eCats || editing ? null :
                    <div className={t.categoryListAddBtn}>
                        <Plus onClick={ startEditing }/>
                    </div>
                }
            </div>
            <div className={t.categoryListSubRow}>
                { categories.slice(1).map((cat, i) => (
                    <CategoryItem key={ cat }
                                  remove={ removeCategory }
                                  indices={ [parent, i + 1] }
                                  editing={ editing || eCats }
                    >
                        <span>{ cat }</span>{ i < num - 2 ? <Spanner /> : null}
                    </CategoryItem>
                ))
                }
            </div>
            { !editing ? null :
                <CategoryAdder isSub
                               stopEditing={ stopEditing }
                               addNewCategory={ doAdd }/>
            }
        </div>
    )
}

const SourceCategories = ({
    value: categories,
    onChange: setCategories,
                              editingCategories,
                              stopEditingCategories: stopAll,
                          }) => {
    const { theme } = React.useContext(ThemeContext) || {};
    const t = { ...categoriesTheme, ...(theme?.datasets?.categories || {}) };
    const addNewCategory = React.useCallback((cat, parent = -1) => {
        if (parent === -1) {
            setCategories([
                ...categories,
                [cat]
            ]);
        }
        else {
            setCategories(
                categories.reduce((a, c, i) => {
                    if (i === parent) {
                        a.push([...c, cat]);
                    }
                    else {
                        a.push(c);
                    }
                    return a;
                }, [])
            );
        }
    }, [categories, setCategories]);

    const removeCategory = React.useCallback((parent, child = 0) => {
        if (child === 0) {
            const newCats = [...categories];
            newCats.splice(parent, 1);
            setCategories(newCats);
        }
        else {
            const cats = categories[parent];
            cats.splice(child, 1);
            setCategories(categories);
        }
    }, [categories, setCategories]);

    return (
        <div>
            { categories?.map((cats, i) => (
                <CategoryList key={ i }
                              categories={ cats }
                              parent={ i }
                              editingCategories={ editingCategories }
                              addNewCategory={ addNewCategory }
                              removeCategory={ removeCategory }/>
            ))
            }
            { !editingCategories ? null :
                <div className={t.sourceCategoriesNewWrapper}>
                    <CategoryAdder
                        addNewCategory={ addNewCategory }/>
                    <button onClick={ stopAll }
                            themeOptions={ { size:'sm', color: 'cancel' } }
                    >
                        Stop editing categories
                    </button>
                </div>
            }
        </div>
    )
}
export default SourceCategories;

const Input = ({ onChange, ...props }) => {
    const { theme } = React.useContext(ThemeContext) || {};
    const t = { ...categoriesTheme, ...(theme?.datasets?.categories || {}) };
    const doOnChange = React.useCallback(e => {
        onChange(e.target.value);
    }, [onChange]);
    const [ref, setRef] = React.useState(null);
    React.useEffect(() => {
        if (ref) {
            ref.focus();
        };
    }, [ref]);
    return (
        <input type="text" ref={ setRef } { ...props }
               className={t.input}
               onChange={ doOnChange }/>
    )
}

const CategoryAdder = ({ addNewCategory, stopEditing, isSub = false }) => {
    const { theme } = React.useContext(ThemeContext) || {};
    const t = { ...categoriesTheme, ...(theme?.datasets?.categories || {}) };
    const [cat, setCat] = React.useState("");
    const doAdd = React.useCallback(e => {
        e.stopPropagation();
        addNewCategory(cat);
        setCat("");
    }, [addNewCategory, cat]);
    const doStop = React.useCallback(e => {
        if (typeof stopEditing === "function") {
            stopEditing(e);
        }
        setCat("");
    }, [stopEditing]);
    const onKeyDown = React.useCallback(e => {
        if ((e.key === "Enter") || (e.keyCode === 13)) {
            doAdd(e);
        }
        else if ((e.key === "Escape") || (e.keyCode === 27)) {
            doStop(e);
        }
    }, [doAdd, doStop]);

    const [ref, setRef] = React.useState(null);

    return (
        <div ref={ setRef } className={t.categoryAdderWrapper}>
            <div className={t.categoryAdderInner}>
                <div className={t.categoryAdderInputRow}>
                    <Input type="text"
                           value={ cat }
                           onChange={ setCat }
                           onKeyDown={ onKeyDown }/>
                </div>
                <div className={t.categoryAdderHint}>
                    { !cat ? `Start typing to add new ${ isSub ? "subcategory" : "category" }` :
                        "Press Enter to save or Esc to cancel"
                    }
                </div>
            </div>
        </div>
    )
}
