import React from "react"

export default function DndList({ onDrop, children }) {
  const dragItem = React.useRef(null)
  const dragOver = React.useRef(null)

  const items = React.Children.toArray(children)

  return (
    <div>
      {items.map((child, i) => (
        <div
          key={child.key || i}
          draggable
          onDragStart={() => { dragItem.current = i }}
          onDragEnter={() => { dragOver.current = i }}
          onDragOver={e => e.preventDefault()}
          onDragEnd={() => {
            if (dragItem.current !== null && dragOver.current !== null && dragItem.current !== dragOver.current) {
              onDrop(dragItem.current, dragOver.current)
            }
            dragItem.current = null
            dragOver.current = null
          }}
        >
          {child}
        </div>
      ))}
    </div>
  )
}
