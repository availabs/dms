import React from "react"
//import { Button } from "~/modules/avl-components/src"



const CategoryItem = ({ children, remove, indices, editing, className="" }) => {
    const doRemove = React.useCallback(e => {
        remove(...indices);
    }, [remove, indices]);
    return (
        <div className={ `
        overflow-hidden text-ellipsis whitespace-nowrap ${ className }
        flex-1 flex items-center py-1 pl-2 pr-4 bg-blue-200 text-blue-600 font-light hover:bg-blue-50 mr-2 rounded-md my-1
      ` }
        >
            <div className="flex-1">
                { children }
            </div>
            { !editing ? null :
                <button onClick={ doRemove } className="hover:text-red-500 pl-2">
                    <span className="fas fa-remove"/>
                </button>
            }
        </div>
    )
}
const Spanner = () => {
    return (
        <span className="fas fa-caret-right mx-1"/>
    )
}
const Plus = props => {
    return (
        <span { ...props }
              className={ `
        fas fa-plus p-1 rounded cursor-pointer
        text-blue-500 hover:bg-blue-500 hover:text-white
      ` }/>
    )
}

const CategoryList = props => {

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
        <div className={ `flex flex-col border-current ${ eCats ? "border-b" : "" }`}>
            <div className={ `flex ${ eCats ? "border-b" : "" }` }>
                <CategoryItem className="font-bold flex-1"
                              remove={ removeCategory }
                              indices={ [parent, 0] }
                              editing={ editing || eCats }
                >
                    { categories[0] }
                </CategoryItem>
                { !eCats || editing ? null :
                    <div className="flex items-center justify-end">
                        <Plus onClick={ startEditing }/>
                    </div>
                }
            </div>
            <div className="flex ml-4">
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
                <div className="grid grid-cols-1 gap-1">
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
               className="px-2 w-full"
               onChange={ doOnChange }/>
    )
}

const CategoryAdder = ({ addNewCategory, stopEditing, isSub = false }) => {
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
        <div ref={ setRef } className="px-2 py-1 bg-gray-100 whitespace-nowrap">
            <div className="flex flex-col">
                <div className="mb-1">
                    <Input type="text"
                           value={ cat }
                           onChange={ setCat }
                           onKeyDown={ onKeyDown }/>
                </div>
                <div className="px-2 rounded bg-gray-200 text-center">
                    { !cat ? `Start typing to add new ${ isSub ? "subcategory" : "category" }` :
                        "Press Enter to save or Esc to cancel"
                    }
                </div>
            </div>
        </div>
    )
}
