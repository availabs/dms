import React from 'react'
import * as IconDefs from './icon_defs'

// IconSet mapping: maps exported icon names to source icon components
// Format: { icon: "SourceIconName", label: "ExportedName" }
// If label is omitted, the icon name is used as the export name
const iconList = [
  // Core/Required Icons
  { icon: "Default" },
  { icon: "Settings" },
  { icon: "Pages" },
  { icon: "Page" },
  { icon: "History" },
  { icon: "SquarePlus", label: "InsertSection" },
  { icon: "MenuIcon", label: "Menu" },
  { icon: "Blank" },
  { icon: "ViewIcon", label: "ViewPage" },
  { icon: "PencilEditSquare", label: "EditPage" },
  { icon: "Sections" },
  { icon: "CaretDown" },
  { icon: "CaretUp" },

  // Action Icons
  { icon: "PencilEditSquare" },
  { icon: "ViewIcon" },
  { icon: "PencilIcon" },
  { icon: "CirclePlus" },
  { icon: "SquarePlus" },
  { icon: "WrenchIcon" },
  { icon: "SlidersIcon" },
  { icon: "MenuIcon" },
  { icon: "ClockIcon" },
  { icon: "InfoCircle" },
  { icon: "TrashCan" },
  { icon: "CircleCheck" },
  { icon: "CircleX" },
  { icon: "RemoveCircle" },
  { icon: "CancelCircle" },
  { icon: "FloppyDisk" },
  { icon: "CirclePlusDot" },
  { icon: "PencilSquare" },

  // Navigation Icons
  { icon: "ArrowDownSquare" },
  { icon: "ArrowUpSquare" },
  { icon: "ChevronDownSquare" },
  { icon: "ChevronUpSquare" },
  { icon: "ArrowUp" },
  { icon: "ArrowDown" },
  { icon: "ArrowRight" },
  { icon: "ArrowLeft" },

  // UI Icons
  { icon: "InfoSquare" },
  { icon: "MoreSquare" },
  { icon: "UserCircle" },
  { icon: "User" },
  { icon: "Tags" },
  { icon: "Copy" },
  { icon: "PDF" },
  { icon: "Printer" },
  { icon: "Add" },
  { icon: "XMark" },
  { icon: "AdjustmentsHorizontal" },
  { icon: "LinkSquare" },
  { icon: "DraftPage" },
  { icon: "EllipsisVertical" },
  { icon: "Filter" },
  { icon: "LoadingHourGlass" },
  { icon: "Download" },
  { icon: "Search" },

  // Data/Table Icons
  { icon: "TallyMark" },
  { icon: "LeftToRightListBullet" },
  { icon: "Sum" },
  { icon: "Avg" },
  { icon: "Group" },
  { icon: "SortAsc" },
  { icon: "SortDesc" },

  // Math Icons
  { icon: "Brackets" },
  { icon: "Divide" },
  { icon: "Multiplication" },
  { icon: "Minus" },

  // Page/Document Icons
  { icon: "Section" },

  // Special Icons
  { icon: "GlobalEditing" },
  { icon: "Database" },
  { icon: "AccessControl" },
  { icon: "MenuDots" },
  { icon: "CaretDownSolid" },
  { icon: "CaretUpSolid" },
  { icon: "Plus" },
  { icon: "Eye" },
  { icon: "EyeClosed" },

  // Shape Icons
  { icon: "Fill" },
  { icon: "Circle" },
  { icon: "Line" },

  // Hazard/Weather Icons
  { icon: "riverine" },
  { icon: "snowflake" },
  { icon: "tsunami" },
  { icon: "coastal" },
  { icon: "drought" },
  { icon: "hurricane" },
  { icon: "earthquake" },
  { icon: "coldwave" },
  { icon: "heatwave" },
  { icon: "hail" },
  { icon: "snowstorm" },
  { icon: "ice" },
  { icon: "lightning" },
  { icon: "tornado" },
  { icon: "fire" },
  { icon: "wind" },
  { icon: "landslide" },
  { icon: "volcano" },
]

// Build the iconSet by reducing over the iconList
const iconSet = iconList.reduce((icons, curr) => {
  const IconComp = IconDefs?.[curr.icon] || IconDefs.Default
  const exportName = curr.label || curr.icon
  icons[exportName] = (props) => <IconComp {...props} />
  return icons
}, {})

// Export combined Icons object
const Icons = {
  Default: IconDefs.Default,
  ...iconSet
}

export default Icons
