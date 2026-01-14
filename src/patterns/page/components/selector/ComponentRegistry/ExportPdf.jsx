import React, { useMemo, useState, useEffect } from 'react';
import { PageContext, CMSContext } from '../../../context';
import { selectablePDF2 } from '../../saveAsPDF/PrintWell/selectablePDF';
import { ThemeContext } from "../../../../../ui/useTheme";

function pdfExport({ }) {
  const [pdfPages, setPdfPages] = useState([]);
  const [coverPages, setCoverPages] = useState([]);
  const [patterns, setPatterns] = useState([]);
  const [selectedPattern, setSelectedPattern] = useState(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [selectedPageIds, setSelectedPageIds] = useState(new Set());
  const [expandedNodeIds, setExpandedNodeIds] = useState(new Set());
  const [isTocMode, setIsTocMode] = useState(false);
  const [includeInTOC, setIncludeInTOC] = useState(false);
  const [selectedCoverPage, setSelectCoverPage] = useState(null);

  const { UI } = React.useContext(ThemeContext)
  const { app, API_HOST, siteType } = React.useContext(CMSContext) || {};
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
            attributes: ["id", "app", "type", "doc_type"]
          },
          children: [{
            action: "list",
            path: "/*",
            filter: {
              options: JSON.stringify({
                filter: { "data->>'id'": appData?.patterns?.map(p => p.id) },
              }),
            },
          }],
        });
        data = data?.map(d => ({
          app: d.app,
          doc_type: d.doc_type,
          name: d.name,
        }));
        setPatterns(data);
        if (data?.length > 0) setSelectedPattern(data[0]);
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
            'index',
            'is_cover_page'
          ]
        },
        children: [{
          type: () => { },
          action: 'list',
          path: '/',
        }]
      });

      const allPages = res || [];
      const cover = allPages.filter(p => p.is_cover_page === "yes");
      const pdf = allPages.filter(p => p.is_cover_page !== "yes" || !p.is_cover_page);

      setCoverPages(cover);
      setPdfPages(pdf);
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
        if (d?.icon && d?.icon !== 'none') item.icon = d.icon;

        const children = getChildNav(d, dataItems, baseUrl, edit).filter(c => c.name);
        if (children.length) item.subMenus = children;

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
        if (d?.icon && d?.icon !== 'none') item.icon = d.icon;

        const children = getChildNav(d, dataItems, baseUrl, edit).filter(c => c.name);
        if (children.length) item.subMenus = children;

        return item;
      });
  };

  const pageTree = useMemo(() => dataItemsNav(pdfPages), [pdfPages]);

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
    let ordered = [];
    const traverse = (list) => {
      list?.sort((a, b) => a.index - b.index)?.forEach((n) => {
        if (selectedPageIds.has(n.id)) ordered.push(n);
        if (n.subMenus?.length) traverse(n.subMenus);
      });
    };
    traverse(pages);
    return ordered;
  };

  const toggleSelect = (id) => {
    const getAllDescendants = (node) => {
      const children = node?.subMenus || [];
      return children.reduce((acc, child) => acc.concat(child.id, getAllDescendants(child)), []);
    };

    const node = findNodeById(pageTree, id);
    if (!node) return;
    const allIds = [id, ...getAllDescendants(node)];

    setSelectedPageIds((prev) => {
      const newSet = new Set(prev);
      const add = !newSet.has(id);
      allIds.forEach((childId) => (add ? newSet.add(childId) : newSet.delete(childId)));
      return newSet;
    });
  };

  const toggleExpand = (id) => {
    setExpandedNodeIds(prev => {
      const newSet = new Set(prev);
      newSet.has(id) ? newSet.delete(id) : newSet.add(id);
      return newSet;
    });
  };

  const buildSelectedTOC = (nodes, selectedIds, origin = window.location.origin) => {
    let toc = {};
    nodes.forEach(node => {
      if (!node?.name) return;
      const isSelected = selectedIds.has(node.id);
      let children = {};
      if (node.subMenus?.length) children = buildSelectedTOC(node.subMenus, selectedIds, origin);

      if (isSelected) {
        const item = { url: `${origin}${node.path}` };
        if (Object.keys(children).length > 0) item.children = children;
        toc[node.name.trim()] = item;
      } else if (Object.keys(children).length > 0) {
        toc[node.name.trim()] = { children };
      }
    });
    return toc;
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
      }

      const origin = window.location.origin;
      const toc = buildSelectedTOC(dataItemsNav(pdfPages), selectedPageIds, origin);

      let coverUrl = null;
      if (selectedCoverPage) {
        const coverPage = coverPages.find(p => p.id === selectedCoverPage);
        coverUrl = coverPage ? `${origin}/${coverPage?.url_slug || coverPage?.path || ''}` : null;
      }

      await selectablePDF2(results.map(r => `${origin}${r.path}`), toc, includeInTOC , coverUrl, API_HOST);
    } catch (error) {
      console.error('Error during PDF generation', error);
    } finally {
      setIsGenerating(false);
    }
  };

  useEffect(() => {
    if (includeInTOC && coverPages.length > 0 && !selectedCoverPage) {
      setSelectCoverPage(coverPages[0].id);
    }
  }, [includeInTOC, coverPages, selectedCoverPage]);

  const renderTree = (nodes) => (
    <ul>
      {nodes?.map(node => {
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
                  className={`${isSelected ? `text-blue-800` : ``}`}
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
      <div className="flex items-center space-x-4 mb-3">
        <div className="flex space-x-2">
          <Button onClick={() => {
            const getAllIds = (nodes) =>
              nodes.reduce((acc, n) => [...acc, n.id, ...(n.subMenus ? getAllIds(n.subMenus) : [])], []);
            setSelectedPageIds(new Set(getAllIds(pageTree)));
          }}>Select All</Button>

          <Button onClick={() => setSelectedPageIds(new Set())} disabled={!selectedPageIds.size}>
            Clear Selection
          </Button>

          <Button onClick={handleFetchSelected} disabled={isGenerating || !selectedPageIds.size}>
            {isGenerating ? 'Generating PDF' : 'Generate PDF'}
          </Button>
        </div>

        <div className="flex items-center space-x-2 ml-4">
          <input
            type="checkbox"
            id="includeInTOC"
            checked={includeInTOC}
            onChange={(e) => setIncludeInTOC(e.target.checked)}
            className="cursor-pointer"
          />
          <label htmlFor="includeInTOC" className="cursor-pointer">
            Add Table of Content page
          </label>
        </div>
      </div>

      <div className="mb-3">
        <Select
          options={patterns.map(o => ({
            label: `${o?.name ?? ''} (${o?.doc_type ?? ''})`,
            value: JSON.stringify(o),
          }))}
          value={selectedPattern ? JSON.stringify(selectedPattern) : ""}
          onChange={(e) => {
            const obj = JSON.parse(e.target.value);
            setSelectedPattern(obj);
            setSelectedPageIds(new Set());
            setExpandedNodeIds(new Set());
          }}
          placeholder="Select a pattern..."
        />
      </div>

      <div className="flex items-center space-x-2 mb-4">
        <Button
          className={!isTocMode ? 'bg-blue-500 text-white' : 'bg-gray-200 text-gray-800'}
          onClick={() => setIsTocMode(false)}
        >
          PDF Pages
        </Button>
        <Button
          className={isTocMode ? 'bg-blue-500 text-white' : 'bg-gray-200 text-gray-800'}
          onClick={() => setIsTocMode(true)}
        >
          Cover pages
        </Button>
      </div>

      <div className="overflow-auto max-h-[500px] scrollbar-sm">
        {!isTocMode && renderTree(pageTree)}

        {isTocMode &&  (
            coverPages.length > 0 ? (
              <Select
                options={coverPages.map(p => ({
                  label: p.title,
                  value: p.id,
                }))}
                value={selectedCoverPage}
                onChange={(e) => setSelectCoverPage(e.target.value)}
                placeholder="Select cover page..."
              />
            ) : (
              <div className="text-gray-600 italic">No cover pages available.</div>
            )
        )}
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
};
