import React, { PureComponent } from 'react';
import {ArrowDown, ArrowUp, ArrowRight, ArrowLeft, DraftPage} from '../../../icons';
import { CMSContext } from '../../../../siteConfig';


class Icon extends PureComponent {
  render() {
    const { children, className, isCollapsed, ...props } = this.props;

    return (
      <>
        ++ {isCollapsed ? <ArrowRight /> : <ArrowDown />}
      </>
    );
  }
}


const NestableItem = (props) => {
    const { theme } = React.useContext(CMSContext) || {}
    const { item, isCopy, options, index, depth=0 } = props;

    const renderCollapseIconDef = ({ isCollapsed }) => (
      <Icon
        className="nestable-item-icon"
        isCollapsed={isCollapsed}
      />
    );

    const onMouseEnter = (e: MouseEvent) => {
     return options.onMouseEnter(e, item);
    };

    const onDragStart = (e: MouseEvent) => {
      return options.onDragStart(e, item);
    };
  
    const {
      dragItem,
      renderItem,
      handler,
      disableCollapse,
      disableDrag,
      idProp,
      childrenProp,
      checkIfCollapsed,
      renderCollapseIcon = renderCollapseIconDef,
    } = options;



    

    const isCollapsed = checkIfCollapsed(item);
    const isDragging = !isCopy && dragItem && dragItem[idProp] === item[idProp];
    const hasChildren = item[childrenProp] && item[childrenProp].length > 0;
    let isDraggable = true;

    let rowProps = {};
    let handlerProps = {};
    let wrappedHandler;

    if (!isCopy) {
      if (dragItem) {
        rowProps = {
          ...rowProps,
          onMouseEnter,
        };
      } else {
        if (typeof disableDrag === 'function') {
          isDraggable = disableDrag({ item, index, depth });
        } else if (typeof disableDrag !== 'undefined') {
          isDraggable = !disableDrag;
        }

        if (isDraggable) {
          handlerProps = {
            ...handlerProps,
            draggable: true,
            onDragStart
          };
        }
      }
    }

    if (handler) {
      wrappedHandler = <span className="nestable-item-handler" {...handlerProps}>{handler}</span>;
      // wrappedHandler = React.cloneElement(handler, handlerProps);
    } else {
      rowProps = {
        ...rowProps,
        ...handlerProps,
      };
    }

    const handleCollapseIconClick = disableCollapse
      ? undefined :
      () => options.onToggleCollapse(item);

    const collapseIcon = hasChildren
      ? (
        <span onClick={handleCollapseIconClick}>
          {renderCollapseIcon({ isCollapsed, item })}
        </span>
      )
      : null;

    

    const content = renderItem({
      handleCollapseIconClick,
      isCollapsed,
      collapseIcon,
      depth,
      handler: wrappedHandler,
      index,
      isDraggable,
      item,
    });

    if (!content) return null;

    return (
      <li className={`nestable-item${isCopy ? '-copy' : ''} relative ${isDragging && theme?.nestable?.dragBefore}`} >
        <div className="nestable-item-name" {...rowProps}>
          {content}
        </div>

        {hasChildren && !isCollapsed && (
          <ol className={`nestable-list ${theme?.nestable?.subList}`}>
            {(item[childrenProp] as Item[]).map((item, i) => {
              return (
                <NestableItem
                  key={i}
                  index={i}
                  depth={depth + 1}
                  item={item}
                  options={options}
                  isCopy={isCopy}
                  isChild={true}
                />
              );
            })}
          </ol>
        )}
      </li>
    );
}


export default NestableItem;
