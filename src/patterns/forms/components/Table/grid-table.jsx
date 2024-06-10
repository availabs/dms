import React from 'react'
import {
  useFilters,
  useGlobalFilter,
  useSortBy,
  useTable,
  usePagination,
  useExpanded
} from 'react-table'

import get from "lodash/get"

import { Button } from "../Button"

import { matchSorter } from 'match-sorter'

import { useTheme } from "../../wrappers/with-theme"

const DefaultColumnFilter = ({ column }) => {
  const {
      filterValue = "",
      // preFilteredRows,
      setFilter
    } = column;
    // count = preFilteredRows.length;
  const theme = useTheme();
  return (
    <div className="w-3/4">
      <input className={ theme.inputSmall }
        value={ filterValue } onChange={ e => setFilter(e.target.value) }
        onClick= { e => e.stopPropagation() }
        placeholder={ `Search...` }/>
    </div>
  )
}

function fuzzyTextFilterFn(rows, id, filterValue) {
  return matchSorter(rows, filterValue, { keys: [row => row.values[id]] });
}

const getPageSpread = (page, maxPage) => {
	let low = page - 2,
		high = page + 2;

	if (low < 0) {
		high += -low;
		low = 0;
	}
	if (high > maxPage) {
		low -= (high - maxPage);
		high = maxPage;
	}
  const spread = [];
  for (let i = Math.max(0, low); i <= Math.min(maxPage, high); ++i) {
    spread.push(i);
  }
  return spread;
}

const DefaultExpandedRow = ({ values }) =>
  <div className="flex">
    { values.map(({ key, value }, i) =>
        <div key={ key || `key-${ i }` } className="flex-1">
          { key ? <b>{ key }:</b> : null }
          <span className="ml-1">{ value }</span>
        </div>
      )
    }
  </div>

const EMPTY_ARRAY = [];

const RowElement = ({ children, ...props }) =>
  <div { ...props }>
    { children }
  </div>

const GridTable = ({ columns = EMPTY_ARRAY, data = EMPTY_ARRAY,
                  sortBy, sortOrder = "",
                  initialPageSize = 10,
                  pageSize = null,
                  onRowClick,
                  ExpandRow = DefaultExpandedRow,
                  disableFilters = false,
                  disableSortBy = false,
                  Row = RowElement,
                  ...props }) => {

    const theme = useTheme();
    const filterTypes = React.useMemo(() => {
      return (
        () => ({
          fuzzyText: fuzzyTextFilterFn
        })
      )
    }, []);

    const defaultColumn = React.useMemo(
      () => ({ Filter: DefaultColumnFilter }), []
    );

    const {
      getTableProps,
      getTableBodyProps,
      headerGroups,
      page,
      rows,
      preFilteredRows,
      prepareRow,
      canPreviousPage,
      canNextPage,
      gotoPage,
      previousPage,
      nextPage,
      pageCount,
      visibleColumns,
      toggleRowExpanded,
      setPageSize,
      state: {
        pageSize: statePageSize,
        pageIndex,
        expanded
      }
    } = useTable(
      { columns,
        data,
        defaultColumn,
        filterTypes,
        disableFilters,
        disableSortBy,
        initialState: {
          pageSize: pageSize || initialPageSize,
          sortBy: [{ id: sortBy, desc: sortOrder.toLowerCase() === "desc" }]
        }
      },
      useFilters,
      useGlobalFilter,
      useSortBy,
      useExpanded,
      usePagination
    );

    React.useEffect(() => {
      if ((pageSize !== null) && (pageSize !== statePageSize)) {
        setPageSize(pageSize);
      }
    }, [pageSize, statePageSize, setPageSize]);

    if (!(columns.length && data.length)) return null;

    if (!preFilteredRows.length) return null;

    const colSpans = visibleColumns.map(col => get(col, "colSpan", 1)),
      gridCols = colSpans.reduce((a, c) => a + c, 0);

    return (
      <div className="overflow-auto scrollbar-sm">
        <div { ...getTableProps() }>
          { headerGroups.map(headerGroup =>
              <div { ...headerGroup.getHeaderGroupProps() }
                className="grid"
                style={ {
                  gridTemplateColumns: `repeat(${ gridCols }, minmax(0, 1fr))`
                } }>
                { headerGroup.headers
                    .map((column, i) =>
                      <div { ...column.getHeaderProps(column.getSortByToggleProps()) }
                        className={ `${ theme.tableHeader } col-span-${ colSpans[i] }` }>
                        <div className="flex">
                          <div className="flex-1">{ column.render("Header") }</div>
                          { !column.isSorted ? null :
                            <div className="flex-0 mr-8">
                              { column.isSortedDesc ?
                                  <i className="ml-2 pt-1 fas fa-chevron-down"/> :
                                  <i className="ml-2 pt-1 fas fa-chevron-up"/>
                              }
                            </div>
                          }
                        </div>
                        { !column.canFilter ? null : <div>{ column.render('Filter') }</div> }
                      </div>
                    )
                }
              </div>
            )
          }
          { pageCount <= 1 ? null :
            <div className={ `${ theme.tableInfoBar } w-full` }>
              <div className={ `px-4 flex items-center ${ theme.textInfo }` }>
                <div className="flex-0">
                  Page { pageIndex + 1 } of { pageCount }
                  <span className="font-extrabold">&nbsp; | &nbsp;</span>
                  Rows { pageIndex * statePageSize + 1 }-
                  { Math.min(rows.length, pageIndex * statePageSize + statePageSize) } of { rows.length }
                </div>
                <div className={ `flex-1 flex justify-end items-center` }>
                  <Button disabled={ pageIndex === 0 }
                    buttonTheme="textbuttonInfoSmall"
                    onClick={ e => gotoPage(0) }>
                    { "<<" }
                  </Button>
                  <Button disabled={ !canPreviousPage }
                    buttonTheme="textbuttonInfoSmall"
                    onClick={ e => previousPage() }>
                    { "<" }
                  </Button>
                  { getPageSpread(pageIndex, pageCount - 1)
                      .map(p => {
                        const active = (p === pageIndex);
                        return (
                          <Button key={ p } buttonTheme="textbuttonInfo"
                            active={ active } large={ active } small={ !active }
                            onClick={ active ? null : e => gotoPage(p) }>
                            { p + 1 }
                          </Button>
                        )
                      })
                  }
                  <Button disabled={ !canNextPage }
                    buttonTheme="textbuttonInfoSmall"
                    onClick={ e => nextPage(0) }>
                    { ">" }
                  </Button>
                  <Button disabled={ pageIndex === (pageCount - 1) }
                    buttonTheme="textbuttonInfoSmall"
                    onClick={ e => gotoPage(pageCount - 1) }>
                    { ">>" }
                  </Button>
                </div>
              </div>
            </div>
          }
          <div { ...getTableBodyProps() }>
            { page.map(row => {
                const { onClick, expand = [] } = row.original;
                prepareRow(row);
                return (
                  <React.Fragment key={ row.getRowProps().key }>
                    <Row { ...row.getRowProps() }
                      className={ `
                        ${ props.striped ? theme.tableRowStriped : theme.tableRow }
                        ${ (onClick || onRowClick) ? "cursor-pointer" : "" } grid
                      ` }
                      style={ {
                        gridTemplateColumns: `repeat(${ gridCols }, minmax(0, 1fr))`
                      } }
                      onClick={ e => {
                        (typeof onRowClick === "function") && onRowClick(e, row);
                        (typeof onClick === "function") && onClick(e, row);
                      } }>
                      { row.cells.map((cell, ii) =>
                          <div { ...cell.getCellProps() }
                            className={ `
                              ${ theme.tableCell } col-span-${ colSpans[ii] }
                            ` }>
                            { (ii > 0) || ((row.subRows.length === 0) && (expand.length === 0)) ?
                                cell.render('Cell')
                              :
                                <div className="flex items-center">
                                  <div className="flex-1">{ cell.render('Cell') }</div>
                                  <div onClick={ e => {
                                      e.stopPropagation();
                                      e.preventDefault();
                                      Object.keys(expanded).filter(k => k !== row.id)
                                        .forEach(toggleRowExpanded);
                                      row.toggleRowExpanded(!row.isExpanded);
                                    } }
                                    className={ `
                                      flex item-center justify-center
                                      rounded cursor-pointer py-1 px-2
                                      hover:${ theme.accent3 } ${ theme.transition }
                                    ` }>
                                    { row.isExpanded ?
                                      <i className="fas fa-chevron-up"/> :
                                      <i className="fas fa-chevron-down"/>
                                    }
                                  </div>
                                </div>
                            }
                          </div>
                        )
                      }
                    </Row>
                    { !(row.isExpanded && expand.length) ? null :
                      <div className={ `${ theme.tableRow }` }>
                        <div className={ `${ theme.tableCell }` }>
                          <ExpandRow values={ expand }/>
                        </div>
                      </div>
                    }
                  </React.Fragment>
                )
              })
            }
          </div>
        </div>
      </div>
    )
}
export default GridTable
