import React, { Component } from 'react';
import PropTypes from 'prop-types';
import { cx } from '../utils';

function Icon ({ children, className, ...props }) {
 
  return (
    <i className={`${nestable-icon}  ${className}`} {...props} />
  );
  
}

class NestableItem extends Component {
  static propTypes = {
    item: PropTypes.object,
    isCopy: PropTypes.bool,
    options: PropTypes.object,
    index: PropTypes.number,
    depth: PropTypes.number,
  };
  static defaultProps = {
    depth: 0,
  };

  renderCollapseIcon = ({ isCollapsed }) => (
    <Icon
      className={`cursor-pointer mr-[5px] w-5 h-5 ${isCollapsed ? 'fa fa-plus' : 'fa fa-minus'}`}
      //  cx('nestable-item-icon', {
      //   'icon-plus-gray': isCollapsed,
      //   'icon-minus-gray': !isCollapsed,
      // })}
    />
  );

  render() {
    const { item, isCopy, options, index, depth } = this.props;
    const {
      dragItem,
      renderItem,
      handler,
      idProp,
      childrenProp,
      renderCollapseIcon = this.renderCollapseIcon,
    } = options;

    const isCollapsed = options.isCollapsed(item);
    const isDragging = !isCopy && dragItem && dragItem[idProp] === item[idProp];
    const hasChildren = item[childrenProp] && item[childrenProp].length > 0;

    let rowProps = {};
    let handlerProps = {};
    let wrappedHandler;

    if (!isCopy) {
      if (dragItem) {
        rowProps = {
          ...rowProps,
          onMouseEnter: (e) => options.onMouseEnter(e, item),
        };
      } else {
        handlerProps = {
          ...handlerProps,
          draggable: true,
          onDragStart: (e) => options.onDragStart(e, item),
        };
      }
    }

    if (handler) {
      wrappedHandler = <span className="nestable-item-handler" {...handlerProps}>{handler}</span>;
      // wrappedHandler = React.cloneElement(handler, handlerProps);
    } else {
      rowProps = {
        ...rowProps,
        ...handlerProps
      };
    }

    const collapseIcon = hasChildren
      ? (
        <span onClick={() => options.onToggleCollapse(item)}>
          {renderCollapseIcon({ isCollapsed })}
        </span>
      )
      : null;

    const baseClassName = 'nestable-item ml-2' + (isCopy ? '-copy' : '');
    const itemProps = {
      className: cx(
          baseClassName,
          baseClassName + '-' + item[idProp],
          {
            'is-dragging bg-slate-200 border pl-4' : isDragging,
            [baseClassName + '--with-children']: hasChildren,
            [baseClassName + '--children-open']: hasChildren && !isCollapsed,
            [baseClassName + '--children-collapsed']: hasChildren && isCollapsed,
          }
      )
    };

    const content = renderItem({
      collapseIcon,
      depth,
      handler: wrappedHandler,
      index,
      item,
    });

    if (!content) return null;

    return (
      <li {...itemProps}>
        <div className="nestable-item-name" {...rowProps}>
          {content}
        </div>

        {hasChildren && !isCollapsed && (
          <ol className={`nestable-list border-l ml-4`}>
            {item[childrenProp].map((item, i) => {
              return (
                <NestableItem
                  key={i}
                  index={i}
                  depth={depth + 1}
                  item={item}
                  options={options}
                  isCopy={isCopy}
                />
              );
            })}
          </ol>
        )}
      </li>
    );
  }
}

export default NestableItem;
