import React, { useMemo, useState, useEffect, useRef } from 'react';

import { PageContext, CMSContext } from '../../../context';
import PageView from '../../../pages/view';
import { selectablePDF } from '../../saveAsPDF/PrintWell/selectablePDF';

import { ChevronDownIcon, ChevronRightIcon } from '@heroicons/react/20/solid';

function pdfExport({ }) {
  const [pages, setPages] = useState([]);
  const [selectedPageIds, setSelectedPageIds] = useState(new Set());
  const [expandedNodeIds, setExpandedNodeIds] = useState(new Set());
  const [loadedpg, setLoadedPG] = useState([]);
  const { UI, app, type, API_HOST } = React.useContext(CMSContext) || {};
  const { apiLoad, apiUpdate, format, attributes } = React.useContext(PageContext) || {};
  const ref = useRef();

  const { Icon } = UI || {};

  useEffect(() => {
    if (!app || !type) return;

    const fetchPages = async () => {
      const res = await apiLoad({
        format: {
          app,
          type: `${type}`,
          attributes: [
            'title',
            'url_slug',
            'id',
            'parent',
            'description',
            'hide_in_nav',
            'published',
            'icon',
            'index'
          ]
        },
        children: [{
          type: () => { },
          action: 'list',
          path: '/',
          filter: {
            filter: {
              [`data->>'template_id'`]: [null]
            }
          }
        }]
      });

      setPages(res || []);
    };

    fetchPages();
  }, [app, type, apiLoad]);

  const dataItemsNav = (dataItems, baseUrl = '', edit = false) => {
    return dataItems
      .sort((a, b) => a.index - b.index)
      .filter(d => !d.parent)
      .filter(d => (edit || d.published !== 'draft'))
      .map((d) => {
        const url = `${d.url_slug || d.path || d.id}`;
        let item = {
          id: d.id,
          path: `${edit ? `${baseUrl}/edit` : baseUrl}${url?.startsWith('/') ? `` : `/`}${url}`,
          name: `${d.title || d.name} ${d.published === 'draft' ? '*' : ''}`,
          description: d.description,
          hideInNav: d.hide_in_nav
        };
        if (d?.icon && d?.icon !== 'none') {
          item.icon = d.icon;
        }

        const children = getChildNav(d, dataItems, baseUrl, edit).filter(c => c.name);
        if (children.length) {
          item.subMenus = children;
        }

        return item;
      });
  };

  const getChildNav = (parent, dataItems, baseUrl = '', edit = false) => {
    return dataItems
      .filter(d => d.parent === parent.id)
      .filter(d => (edit || d.published !== 'draft'))
      .sort((a, b) => a.index - b.index)
      .map((d) => {
        const url = `${d.url_slug || d.path || d.id}`;
        let item = {
          id: d.id,
          path: `${edit ? `${baseUrl}/edit` : baseUrl}${url?.startsWith('/') ? `` : `/`}${url}`,
          name: `${d.title || d.name} ${d.published === 'draft' ? '*' : ''}`,
          description: d.description,
          hideInNav: d.hide_in_nav
        };
        if (d?.icon && d?.icon !== 'none') {
          item.icon = d.icon;
        }

        const children = getChildNav(d, dataItems, baseUrl, edit).filter(c => c.name);
        if (children.length) {
          item.subMenus = children;
        }

        return item;
      });
  };

  const pageTree = useMemo(() => dataItemsNav(pages), [pages]);

  const findNodeById = (nodes, id) => {
    for (const node of nodes) {
      if (node.id === id) return node;
      if (node.subMenus) {
        const found = findNodeById(node.subMenus, id);
        if (found) return found;
      }
    }
    return null;
  };

  const getOrderedSelectedPages = (pages) => {
    let orderedPages = [];

    const traverse = (pageList) => {
      pageList
        .sort((a, b) => a.index - b.index)
        .forEach((node) => {
          if (selectedPageIds.has(node.id)) {
            orderedPages.push(node);
          }
          if (node.subMenus?.length) {
            traverse(node.subMenus);
          }
        });
    };

    traverse(pages);
    return orderedPages;
  };

  const toggleSelect = (id) => {
    const getAllDescendants = (node) => {
      const children = node.subMenus || [];
      return children.reduce(
        (acc, child) => acc.concat(child.id, getAllDescendants(child)),
        []
      );
    };

    const updateSelection = (id, add) => {
      const node = findNodeById(pageTree, id);
      if (!node) return;

      const allIds = [id, ...getAllDescendants(node)];

      setSelectedPageIds((prev) => {
        const newSet = new Set(prev);
        allIds.forEach((childId) => {
          add ? newSet.add(childId) : newSet.delete(childId);
        });
        return newSet;
      });
    };

    const isSelected = selectedPageIds.has(id);
    updateSelection(id, !isSelected);
  };

  const toggleExpand = (id) => {
    setExpandedNodeIds(prev => {
      const newSet = new Set(prev);
      newSet.has(id) ? newSet.delete(id) : newSet.add(id);
      return newSet;
    });
  };

  const handleFetchSelected = async () => {
    const results = [];
    const orderedSelected = getOrderedSelectedPages(pageTree);

    for (const page of orderedSelected) {
      const config = {
        format,
        children: [
          {
            type: () => { },
            action: 'view',
            filter: {
              stopFullDataLoad: true,
              options: JSON.stringify({ filter: { id: [page.id] } }),
            },
            path: `view/:id`,
            params: { id: page.id },
          },
        ],
      };

      try {
        const res = await apiLoad(config, `/view/${page.id}`);
        const fullPage = res?.[0] || {};
        results.push({
          ...page,
          ...fullPage,
          navOptions: { sideNav: { size: null }, topNav: { size: 'none' } },
          header: false,
          footer: null,
        });
      } catch (err) {
        console.error(`Failed to load page ID ${page.id}:`, err);
      }
    }

    setLoadedPG(results);

    await new Promise((resolve) => setTimeout(resolve, 5000));

    if (ref.current) {
      console.log('Generating PDF...');
      await selectablePDF(ref, API_HOST);
      console.log('PDF downloaded.');
    }
  };



  const renderTree = (nodes) => (
    <ul className="ml-4 space-y-1">
      {nodes.map((node) => {
        const isExpanded = expandedNodeIds.has(node.id);
        const hasChildren = node.subMenus?.length > 0;

        return (
          <li key={node.id}>
            <div className="flex items-start space-x-2">
              {hasChildren ? (
                <button
                  onClick={() => toggleExpand(node.id)}
                  className="text-gray-600 hover:text-black focus:outline-none"
                  title={isExpanded ? 'Collapse' : 'Expand'}
                >
                  {isExpanded ? (
                    <ChevronDownIcon className="h-4 w-4" />
                  ) : (
                    <ChevronRightIcon className="h-4 w-4" />
                  )}
                </button>
              ) : (
                <span className="w-4 inline-block" />
              )}

              <label className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  checked={selectedPageIds.has(node.id)}
                  onChange={() => toggleSelect(node.id)}
                />
                <span>{node.name}</span>
              </label>
            </div>

            {hasChildren && isExpanded && (
              <div className="ml-6">
                {renderTree(node.subMenus)}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );

  return (
    <>
      <div className="p-4 max-w-2xl mx-auto">
        <h2 className="text-xl font-semibold mb-4">Select Pages for Export</h2>
        {renderTree(pageTree)}

        <button
          onClick={handleFetchSelected}
          className="mt-4 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
        >
          Generate PDF
        </button>
      </div>
      <div className="hidden">
        <div ref={ref}>
          {loadedpg.map((pg, ind) => (
            <div
              key={pg.url_slug || ind}
              className={
                ind === loadedpg.length - 1
                  ? "pdf-page-break-before pdf-page-break-after"
                  : "pdf-page-break-before"
              }
            >
              <PageView
                item={pg}
                dataItems={[]}
                attributes={attributes}
                apiLoad={apiLoad}
                apiUpdate={apiUpdate}
                hideBottom={true}
              />
            </div>
          ))}
        </div>
      </div>
    </>
  );
}


export default {
  "name": 'Export: MNY',
  "type": 'Export',
  defaultState: {
  },
  "EditComp": pdfExport,
  "ViewComp": pdfExport
}