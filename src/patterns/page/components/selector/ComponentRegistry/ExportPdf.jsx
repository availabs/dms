import React, { useMemo, useState, useEffect, useRef } from 'react';

//import { Select } from "~/modules/avl-components/src"
import { PageContext, CMSContext } from '../../../context';
import { selectablePDF2 } from '../../saveAsPDF/PrintWell/selectablePDF';

function pdfExport({ }) {
  const [pages, setPages] = useState([]);
  const [patterns, setPatterns] = useState([]);
  const [selectedPattern, setSelectedPattern] = useState(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [selectedPageIds, setSelectedPageIds] = useState(new Set());
  const [expandedNodeIds, setExpandedNodeIds] = useState(new Set());
  const [loadedpg, setLoadedPG] = useState([]);
  const { UI, app, /*type,*/ API_HOST, siteType } = React.useContext(CMSContext) || {};
  const { apiLoad, format } = React.useContext(PageContext) || {};

  const { Icon, Button, Select } = UI || {};

  useEffect(() => {
    const fetchPatterns = async () => {
      const res = await apiLoad({
        format: {
          app,
          type: `${siteType}`,
          attributes: ["id", "app", "type", "data"]
        },
        children: [{
          type: () => { },
          action: 'list',
          path: '/',
        }]
      });
      const [appData] = res;

      if (appData && appData?.patterns) {
        let data = await apiLoad({
          format: {
            app,
            type: `pattern`,
            attributes: [
              "id", "app", "type", "doc_type"
            ]
          },
          children: [{
            action: "list",
            path: "/*",
            filter: {
              options: JSON.stringify({ filter: { "data->>'id'": appData?.patterns?.map(p => p.id) } }),
            }
          }],
        })
        data = data?.map(d => ({ app: d.app, doc_type: d.doc_type, name: d.name }));
        setPatterns(data);
      }
    };

    fetchPatterns();
  }, [app, siteType]);

  const type = useMemo(() => selectedPattern?.doc_type, [selectedPattern]); 

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
      if (node?.subMenus) {
        const found = findNodeById(node.subMenus, id);
        if (found) return found;
      }
    }
    return null;
  };

  const getOrderedSelectedPages = (pages) => {
    let orderedPages = [];

    const traverse = (pageList) => {
      pageList?.sort((a, b) => a.index - b.index)?.forEach((node) => {
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
      const children = node?.subMenus || [];
      return children?.reduce(
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
    setIsGenerating(true);
    const results = [];
    const orderedSelected = getOrderedSelectedPages(pageTree);

    try {
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
          console.error(`Failed to load page ID ${page.id}`, err);
        }
        // No setIsGenerating(false) here!
      }

      setLoadedPG(results);
      const origin = window.location.origin;
      await selectablePDF2(results.map((r) => `${origin}${r.path}`), API_HOST);
    } catch (error) {
      console.error('Error during PDF generation', error);
    } finally {
      setIsGenerating(false); // <-- only here
    }
  };

  const renderTree = (nodes) => (
    <ul className="">
      {nodes?.map((node) => {
        const isExpanded = expandedNodeIds.has(node.id);
        const hasChildren = node.subMenus?.length > 0;
        const isSelected = selectedPageIds.has(node.id);

        return (
          <li key={node.id}>
            <div
              onClick={() => toggleSelect(node.id)}
              className={`flex items-center justify-between px-2 py-1 rounded-md cursor-pointer transition-colors duration-150 
              ${isSelected ? "bg-blue-300 hover:bg-blue-400 text-blue-800" : "hover:bg-blue-200"}`}
            >
              <span>{node.name}</span>
              {hasChildren && (
                <Icon
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleExpand(node.id);
                  }}
                  className={`${isSelected ? `text-blue-800` : ``} focus:outline-none`}
                  title={isExpanded ? "Collapse" : "Expand"}
                  icon={isExpanded ? 'ArrowDown' : 'ArrowRight'}
                />
              )}
            </div>

            {hasChildren && isExpanded && (
              <div className="ml-4 mt-1">{renderTree(node.subMenus)}</div>
            )}
          </li>
        );
      })}
    </ul>
  );

  return (
    <div>
      <div className="flex space-x-2 mb-4">
        <Button
          onClick={() => {
            const getAllIds = (nodes) =>
              nodes?.reduce(
                (acc, node) => [
                  ...acc,
                  node.id,
                  ...(node.subMenus ? getAllIds(node.subMenus) : []),
                ],
                []
              );

            setSelectedPageIds(new Set(getAllIds(pageTree)));
          }}
        >
          Select All
        </Button>

        <Button
          onClick={() => setSelectedPageIds(new Set())}
          className={!selectedPageIds.size ? `cursor-not-allowed` : ``}
          disabled={!selectedPageIds.size}
        >
          Clear Selection
        </Button>

        <Button
          onClick={handleFetchSelected}
          className={isGenerating ? `cursor-progress` : selectedPageIds.size === 0 ? 'cursor-not-allowed' : ``}
          disabled={isGenerating || !selectedPageIds.size}
        >
          {isGenerating ? (
            'Generating PDF'
          ) : (
            'Generate PDF'
          )}
        </Button>
      </div>

      <div className="mb-4">
        {/* <label className="block mb-1 font-medium">Select Pattern</label> */}
          <Select
            options={patterns}  
            accessor={o => `${o.name ?? ''} (${o.doc_type ?? ''})`} 
            value={selectedPattern}
            onChange={(val) => {
              setSelectedPageIds(new Set());
              setExpandedNodeIds(new Set());
              setSelectedPattern(val)}}
            placeholder="Select a pattern..."
          />
      </div>
      <div className="max-w-xl overflow-auto max-h-[500px] scrollbar-sm">
        {selectedPattern ?
          <>
            {renderTree(pageTree)}
          </> : null}
      </div>
    </div>
  );
}


export default {
  "name": 'PDF Generator',
  "type": 'PDF Generator',
  defaultState: {
  },
  "EditComp": pdfExport,
  "ViewComp": pdfExport
}