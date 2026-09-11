import React, { useState, useRef, useEffect, useCallback } from 'react';
import { apiUrl } from './lib/api';
import {
  Search,
  Play,
  Sparkles,
  ZoomIn,
  ZoomOut,
  Spline,
  Download,
  Upload,
  Maximize2,
  ChevronDown,
  Check,
  LayoutGrid,
  GitFork,
  AlignJustify,
  Sparkle,
  ArrowLeft,
  ArrowRight,
  RotateCcw,
  Sliders,
  Filter
} from 'lucide-react';
import { GridNodeData } from './types';
import { NodeCard } from './components/NodeCard';
import { ConnectingLines } from './components/ConnectingLines';
import { Minimap } from './components/Minimap';
import {
  applyTreeLayout,
  applyGridLayout,
  applyHorizontalLayout,
  applyTidyLayout,
  calculateFitAllTransform
} from './utils/layout';

const NODE_WIDTH = 400;

export default function App() {
  const [nodes, setNodes] = useState<GridNodeData[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [showLines, setShowLines] = useState(true);
  const [showNodeJump, setShowNodeJump] = useState(false);
  const [showLayoutMenu, setShowLayoutMenu] = useState(false);
  const [showZoomMenu, setShowZoomMenu] = useState(false);
  const [filterQuery, setFilterQuery] = useState('');
  const [showSearchFilter, setShowSearchFilter] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Canvas Transform State with wide zoom limits (0.05x to 4.0x)
  const [transform, setTransform] = useState({
    x: 0,
    y: 0,
    scale: typeof window !== 'undefined' && window.innerWidth < 768 ? 0.6 : 0.85
  });
  const [isDragging, setIsDragging] = useState(false);
  const dragStartInfo = useRef({ x: 0, y: 0, transformX: 0, transformY: 0 });
  const containerRef = useRef<HTMLDivElement>(null);

  // Node dragging state
  const [draggingNodeId, setDraggingNodeId] = useState<string | null>(null);
  const nodeDragStartInfo = useRef({ x: 0, y: 0, nodeX: 0, nodeY: 0 });

  // Focus tracking
  const [activeNodeId, setActiveNodeId] = useState<string | null>(null);

  // Keyboard shortcut to toggle connecting lines (L) & shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }
      if (e.key === 'l' || e.key === 'L') {
        setShowLines(prev => !prev);
      }
      if (e.key === 'f' || e.key === 'F') {
        handleFitAll();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [nodes]);

  // Close menus on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('#node-jump-menu') && !target.closest('#quick-zoom-nodes-button')) {
        setShowNodeJump(false);
      }
      if (!target.closest('#layout-menu') && !target.closest('#layout-menu-button')) {
        setShowLayoutMenu(false);
      }
      if (!target.closest('#zoom-menu') && !target.closest('#zoom-menu-button')) {
        setShowZoomMenu(false);
      }
    };
    window.addEventListener('mousedown', handleClickOutside);
    return () => window.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Panning Support
  const handlePointerDown = (e: React.PointerEvent) => {
    if (e.target === containerRef.current || (e.target as HTMLElement).classList.contains('canvas-bg')) {
      e.currentTarget.setPointerCapture(e.pointerId);
      setIsDragging(true);
      dragStartInfo.current = {
        x: e.clientX,
        y: e.clientY,
        transformX: transform.x,
        transformY: transform.y,
      };
      e.preventDefault();
    }
  };

  const handleNodePointerDown = (e: React.PointerEvent, nodeId: string) => {
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    const node = nodes.find(n => n.id === nodeId);
    if (!node) return;
    setDraggingNodeId(nodeId);
    setActiveNodeId(nodeId);
    nodeDragStartInfo.current = {
      x: e.clientX,
      y: e.clientY,
      nodeX: node.x,
      nodeY: node.y,
    };
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (isDragging) {
      const dx = e.clientX - dragStartInfo.current.x;
      const dy = e.clientY - dragStartInfo.current.y;
      setTransform(prev => ({
        ...prev,
        x: dragStartInfo.current.transformX + dx,
        y: dragStartInfo.current.transformY + dy,
      }));
    } else if (draggingNodeId) {
      const dx = (e.clientX - nodeDragStartInfo.current.x) / transform.scale;
      const dy = (e.clientY - nodeDragStartInfo.current.y) / transform.scale;
      setNodes(prev => prev.map(n =>
        n.id === draggingNodeId ? { ...n, x: nodeDragStartInfo.current.nodeX + dx, y: nodeDragStartInfo.current.nodeY + dy } : n
      ));
    }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    setIsDragging(false);
    setDraggingNodeId(null);
    if ((e.target as HTMLElement).hasPointerCapture && (e.target as HTMLElement).hasPointerCapture(e.pointerId)) {
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    }
  };

  const handleWheel = (e: React.WheelEvent) => {
    // Enable seamless zooming with pinch or ctrl/cmd or direct wheel option
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const zoomFactor = -e.deltaY * 0.003;
      handleZoom(zoomFactor, e.clientX, e.clientY);
    } else {
      setTransform(prev => ({
        ...prev,
        x: prev.x - e.deltaX,
        y: prev.y - e.deltaY,
      }));
    }
  };

  // Increased Zoom Out Range: 0.05 (5%) to 4.0 (400%)
  const handleZoom = (delta: number, originX?: number, originY?: number) => {
    setTransform(prev => {
      const newScale = Math.min(Math.max(0.05, prev.scale + delta), 4.0);

      if (originX === undefined || originY === undefined) {
        originX = window.innerWidth / 2;
        originY = window.innerHeight / 2;
      }

      const scaleRatio = newScale / prev.scale;
      const newX = originX - (originX - prev.x) * scaleRatio;
      const newY = originY - (originY - prev.y) * scaleRatio;

      return { x: newX, y: newY, scale: Math.round(newScale * 100) / 100 };
    });
  };

  const setDirectZoom = (targetScale: number) => {
    const originX = window.innerWidth / 2;
    const originY = window.innerHeight / 2;
    setTransform(prev => {
      const scaleRatio = targetScale / prev.scale;
      const newX = originX - (originX - prev.x) * scaleRatio;
      const newY = originY - (originY - prev.y) * scaleRatio;
      return { x: newX, y: newY, scale: targetScale };
    });
    setShowZoomMenu(false);
  };

  const handleFitAll = useCallback(() => {
    if (nodes.length === 0) return;
    const fitted = calculateFitAllTransform(nodes, window.innerWidth, window.innerHeight);
    setTransform(fitted);
    setShowZoomMenu(false);
  }, [nodes]);

  const centerOnPosition = useCallback((x: number, y: number) => {
    const hw = window.innerWidth / 2;
    const hh = window.innerHeight / 2;
    setTransform(prev => ({
      ...prev,
      x: hw - x * prev.scale - (NODE_WIDTH / 2) * prev.scale,
      y: hh - y * prev.scale - 200 * prev.scale
    }));
  }, []);

  const handleCenterViewport = useCallback((x: number, y: number) => {
    const hw = window.innerWidth / 2;
    const hh = window.innerHeight / 2;
    setTransform(prev => ({
      ...prev,
      x: hw - x * prev.scale,
      y: hh - y * prev.scale
    }));
  }, []);

  const zoomToNode = useCallback((nodeId: string) => {
    const node = nodes.find(n => n.id === nodeId);
    if (!node) return;
    const targetScale = typeof window !== 'undefined' && window.innerWidth < 768 ? 0.75 : 1.0;
    const hw = window.innerWidth / 2;
    const hh = window.innerHeight / 2;
    setTransform({
      x: hw - (node.x + (node.width || NODE_WIDTH) / 2) * targetScale,
      y: hh - (node.y + 180) * targetScale,
      scale: targetScale
    });
    setActiveNodeId(nodeId);
    setShowNodeJump(false);
  }, [nodes]);

  // Step to previous or next node in creation order
  const handleStepNode = (direction: 'prev' | 'next') => {
    if (nodes.length === 0) return;
    const currentIndex = nodes.findIndex(n => n.id === activeNodeId);
    let nextIndex = 0;
    if (currentIndex === -1) {
      nextIndex = direction === 'next' ? 0 : nodes.length - 1;
    } else {
      nextIndex = direction === 'next'
        ? (currentIndex + 1) % nodes.length
        : (currentIndex - 1 + nodes.length) % nodes.length;
    }
    zoomToNode(nodes[nextIndex].id);
  };

  // Layout arrangement actions
  const handleApplyLayout = (type: 'tree' | 'grid' | 'horizontal' | 'tidy') => {
    if (nodes.length === 0) return;
    let rearranged: GridNodeData[] = [];
    if (type === 'tree') {
      rearranged = applyTreeLayout(nodes);
    } else if (type === 'grid') {
      rearranged = applyGridLayout(nodes);
    } else if (type === 'horizontal') {
      rearranged = applyHorizontalLayout(nodes);
    } else if (type === 'tidy') {
      rearranged = applyTidyLayout(nodes);
    }
    setNodes(rearranged);
    setShowLayoutMenu(false);
    // Smoothly frame the rearranged layout
    setTimeout(() => {
      const fitted = calculateFitAllTransform(rearranged, window.innerWidth, window.innerHeight);
      setTransform(fitted);
    }, 50);
  };

  // Download Canvas Backup
  const handleDownloadCanvas = useCallback(() => {
    if (nodes.length === 0) return;

    const rootPrompt = nodes[0]?.prompt
      ? nodes[0].prompt.slice(0, 30).replace(/[^a-zA-Z0-9_-]/g, '_').toLowerCase()
      : 'research-map';

    const exportData = {
      app: "Gridscape",
      version: "1.0",
      exportedAt: new Date().toISOString(),
      nodeCount: nodes.length,
      viewport: transform,
      nodes: nodes.map(n => ({
        id: n.id,
        prompt: n.prompt,
        x: Math.round(n.x),
        y: Math.round(n.y),
        width: n.width,
        status: n.status,
        parentId: n.parentId,
        versionIndex: n.versionIndex,
        text: n.text,
        asciiArt: n.asciiArt,
        imageUrl: n.imageUrl,
        prompts: n.prompts,
        versions: n.versions
      }))
    };

    const jsonString = `data:text/json;charset=utf-8,${encodeURIComponent(JSON.stringify(exportData, null, 2))}`;
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', jsonString);
    downloadAnchor.setAttribute('download', `gridscape-${rootPrompt}-${new Date().toISOString().slice(0, 10)}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  }, [nodes, transform]);

  // Import Canvas JSON
  const handleImportCanvas = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const parsed = JSON.parse(event.target?.result as string);
        if (parsed.nodes && Array.isArray(parsed.nodes)) {
          setNodes(parsed.nodes);
          if (parsed.viewport && typeof parsed.viewport.scale === 'number') {
            setTransform(parsed.viewport);
          } else {
            const fitted = calculateFitAllTransform(parsed.nodes, window.innerWidth, window.innerHeight);
            setTransform(fitted);
          }
        }
      } catch (err) {
        console.error("Failed to parse imported canvas JSON", err);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const generateNode = async (prompt: string, x: number, y: number, parentId?: string, isRegenerationOf?: string) => {
    const id = isRegenerationOf || `node-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

    // Create new node or update existing to 'generating'
    if (isRegenerationOf) {
      setNodes(prev => prev.map(n => n.id === id ? { ...n, status: 'generating' } : n));
    } else {
      const newNode: GridNodeData = {
        id, x, y,
        width: NODE_WIDTH,
        prompt,
        asciiArt: '',
        imageUrl: '',
        text: '',
        prompts: [],
        status: 'generating',
        versionIndex: 0,
        versions: [],
        parentId
      };
      setNodes(prev => [...prev, newNode]);
    }

    setTimeout(() => centerOnPosition(x, y), 50);

    try {
      // 1. Fetch text
      const res = await fetch(apiUrl('/api/generate'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt }),
      });
      const data = await res.json();

      if (data.error) throw new Error(data.error);

      let insertIndex = 0;

      setNodes(prev => prev.map(node => {
        if (node.id === id) {
          insertIndex = isRegenerationOf ? node.versions.length : 0;
          const newVersion = {
            prompt,
            asciiArt: data.asciiArt || '',
            imageUrl: '',
            imageLoading: true,
            text: data.text || 'No text',
            prompts: data.prompts || [],
          };

          return {
            ...node,
            status: 'ready',
            versions: isRegenerationOf ? [...node.versions, newVersion] : [newVersion],
            versionIndex: insertIndex,
            text: newVersion.text,
            asciiArt: newVersion.asciiArt,
            imageUrl: newVersion.imageUrl,
            prompts: newVersion.prompts,
          };
        }
        return node;
      }));

      // 2. Fetch image gracefully
      fetch(apiUrl('/api/generate-image'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt }),
      }).then(r => r.json()).then(imgData => {
        if (imgData?.imageUrl) {
          setNodes(prev => prev.map(node => {
            if (node.id === id) {
              const versions = [...node.versions];
              if (versions[insertIndex]) {
                versions[insertIndex] = { ...versions[insertIndex], imageUrl: imgData.imageUrl, imageLoading: false };
              }
              const isCurrentVersion = node.versionIndex === insertIndex;
              return {
                ...node,
                versions,
                ...(isCurrentVersion ? { imageUrl: imgData.imageUrl } : {})
              };
            }
            return node;
          }));
        } else {
          setNodes(prev => prev.map(node => {
            if (node.id === id) {
              const versions = [...node.versions];
              if (versions[insertIndex]) {
                versions[insertIndex] = { ...versions[insertIndex], imageLoading: false };
              }
              return { ...node, versions };
            }
            return node;
          }));
        }
      }).catch(() => {
        setNodes(prev => prev.map(node => {
          if (node.id === id) {
            const versions = [...node.versions];
            if (versions[insertIndex]) {
              versions[insertIndex] = { ...versions[insertIndex], imageLoading: false };
            }
            return { ...node, versions };
          }
          return node;
        }));
      });

    } catch (error) {
      console.error(error);
      setNodes(prev => prev.map(node => node.id === id ? { ...node, status: 'error' } : node));
    }
  };

  const handleSearchSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;

    const startX = 0;
    const startY = 0;
    generateNode(searchQuery, startX, startY);
    setSearchQuery('');
  };

  const handleMagicWand = async () => {
    const ideas = ["Evolution of Video Games", "Quantum Entanglement", "Rise of the Roman Empire", "History of Artificial Intelligence", "Deep Sea Ecosystems"];
    const text = ideas[Math.floor(Math.random() * ideas.length)];
    generateNode(text, 0, 0);
  };

  const handleExpand = (prompt: string, parentId: string) => {
    const parent = nodes.find(n => n.id === parentId);
    if (!parent) return;

    const newX = parent.x + (parent.width || NODE_WIDTH) + 380;
    const initialOffset = Math.random() > 0.5 ? 180 : -180;
    let newY = parent.y + initialOffset;
    const estimatedHeight = 700;

    let isOccupied = true;
    let offsetMultiplier = 1;
    let direction = Math.random() > 0.5 ? 1 : -1;

    while (isOccupied) {
      isOccupied = nodes.some(n =>
        Math.abs(n.x - newX) < 220 &&
        Math.abs(n.y - newY) < estimatedHeight
      );

      if (isOccupied) {
        newY = parent.y + initialOffset + (estimatedHeight * offsetMultiplier * direction);
        direction *= -1;
        if (direction === 1) {
          offsetMultiplier++;
        }
      }
    }

    generateNode(prompt, newX, newY, parentId);
  };

  const handleRegenerate = (nodeId: string) => {
    const node = nodes.find(n => n.id === nodeId);
    if (node) {
      generateNode(node.prompt, node.x, node.y, node.parentId, nodeId);
    }
  };

  const handleDelete = (nodeId: string) => {
    const getDescendants = (id: string, allNodes: GridNodeData[]): string[] => {
      const children = allNodes.filter(n => n.parentId === id).map(n => n.id);
      let desc = [...children];
      for (const childId of children) {
        desc = [...desc, ...getDescendants(childId, allNodes)];
      }
      return desc;
    };

    const toDelete = [nodeId, ...getDescendants(nodeId, nodes)];
    setNodes(prev => prev.filter(n => !toDelete.includes(n.id)));
  };

  const setVersion = (nodeId: string, versionIndex: number) => {
    setNodes(prev => prev.map(n => {
      if (n.id === nodeId) {
        const v = n.versions[versionIndex];
        return {
          ...n,
          versionIndex,
          ...(v ? {
            text: v.text,
            asciiArt: v.asciiArt,
            imageUrl: v.imageUrl,
            prompts: v.prompts
          } : {})
        };
      }
      return n;
    }));
  };

  const totalChars = nodes.reduce((acc, node) => acc + ((node.versions[node.versionIndex]?.text?.length) || 0), 0);

  // Filtered nodes for search
  const filteredNodes = filterQuery.trim()
    ? nodes.filter(n =>
      n.prompt.toLowerCase().includes(filterQuery.toLowerCase()) ||
      n.text.toLowerCase().includes(filterQuery.toLowerCase())
    )
    : nodes;

  return (
    <div
      className="relative w-screen h-screen overflow-hidden dot-grid canvas-bg"
      ref={containerRef}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerUp}
      onWheel={handleWheel}
      onDoubleClick={(e) => {
        // Double clicking empty canvas triggers Fit All
        if (e.target === containerRef.current || (e.target as HTMLElement).classList.contains('canvas-bg')) {
          handleFitAll();
        }
      }}
      style={{ cursor: isDragging ? 'grabbing' : 'grab' }}
    >
      {/* Hidden file input for importing canvas */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleImportCanvas}
        accept=".json"
        className="hidden"
      />

      {/* Draggable/Zoomable Canvas */}
      <div
        className="absolute top-0 left-0 origin-top-left canvas-bg"
        style={{
          transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})`,
          width: '100%',
          height: '100%'
        }}
      >
        <ConnectingLines nodes={nodes} visible={showLines} />
        {nodes.map((node, index) => (
          <NodeCard
            key={node.id}
            index={index}
            node={node}
            allNodes={nodes}
            onExpand={handleExpand}
            onRegenerate={handleRegenerate}
            onClose={handleDelete}
            setVersion={setVersion}
            onPointerDown={(e) => handleNodePointerDown(e, node.id)}
            onZoomToNode={zoomToNode}
          />
        ))}
      </div>

      {/* Initial Search UI */}
      {nodes.length === 0 && (
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none p-4">
          <h1
            className="font-tomorrow font-bold text-4xl md:text-[60px] tracking-[-0.02em] mb-4 md:mb-2 text-black pointer-events-auto"
          >
            GRIDSCAPE
          </h1>
          <div className="pointer-events-auto w-full max-w-2xl bg-white border-2 border-black p-2 md:p-2 shadow-[4px_4px_0px_#000] md:shadow-[8px_8px_0px_#000] flex flex-col sm:flex-row gap-2 sm:gap-0">
            <form onSubmit={handleSearchSubmit} className="flex-1 flex px-2 sm:px-4 items-center">
              <Search className="text-gray-400 mr-2 sm:mr-3 shrink-0" size={20} />
              <input
                autoFocus
                className="flex-1 outline-none font-sans text-base sm:text-lg lg:text-xl py-2 sm:py-3 w-full"
                placeholder="What do you want to explore?"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </form>
            <div className="flex gap-2 w-full sm:w-auto justify-end">
              <button
                onClick={handleSearchSubmit}
                className="flex-1 sm:flex-none sm:w-12 h-12 bg-black text-white flex items-center justify-center hover:bg-gray-800 transition-colors cursor-pointer"
                title="Start Exploration"
              >
                <Play fill="currentColor" size={20} />
              </button>
              <button
                onClick={handleMagicWand}
                className="flex-1 sm:flex-none sm:w-12 h-12 border-2 border-black text-black bg-yellow-100 flex items-center justify-center hover:bg-yellow-200 transition-colors cursor-pointer"
                title="Random Topic Idea"
              >
                <Sparkles size={20} />
              </button>
              <button
                onClick={() => fileInputRef.current?.click()}
                className="flex-1 sm:flex-none sm:w-12 h-12 border-2 border-black text-black bg-white flex items-center justify-center hover:bg-gray-100 transition-colors cursor-pointer"
                title="Import Existing Canvas JSON"
              >
                <Upload size={20} />
              </button>
            </div>
          </div>
          <div className="mt-6 md:mt-8 text-center text-[10px] md:text-xs font-mono text-gray-500 max-w-lg leading-relaxed uppercase tracking-widest px-4 md:px-0">
            GRIDSCAPE IS AN INFINITE SPATIAL-KNOWLEDGE-ENGINE FOR MAPPING COMPLEX IDEAS... START WITH ANY TOPIC AND GENERATE NON-LINEAR RESEARCH NODES...
          </div>
        </div>
      )}

      {/* Floating UI Elements */}
      {nodes.length > 0 && (
        <>
          {/* Top Left Canvas Actions */}
          <div className="absolute top-4 left-4 md:top-6 md:left-6 flex flex-wrap items-center gap-2 z-30 pointer-events-auto">
            {/* Auto Arrange Dropdown */}
            <div className="relative">
              <button
                id="layout-menu-button"
                onClick={() => setShowLayoutMenu(prev => !prev)}
                title="Auto arrange nodes on canvas"
                className="bg-white border-2 border-black text-[10px] md:text-xs font-mono font-bold px-3 py-2 md:px-4 md:py-2 hover:bg-yellow-100 hover:text-black transition-colors shadow-[2px_2px_0px_#000] md:shadow-[4px_4px_0px_#000] cursor-pointer flex items-center gap-1.5"
              >
                <LayoutGrid size={14} className="shrink-0" />
                <span>[ ARRANGE NODES ]</span>
                <ChevronDown size={12} className={`transition-transform duration-150 ${showLayoutMenu ? 'rotate-180' : ''}`} />
              </button>

              {showLayoutMenu && (
                <div
                  id="layout-menu"
                  className="absolute top-full left-0 mt-1 bg-white border-2 border-black shadow-[4px_4px_0px_#000] p-1.5 rounded-lg w-56 flex flex-col gap-1 z-40"
                >
                  <button
                    onClick={() => handleApplyLayout('tree')}
                    className="flex items-center gap-2 px-2.5 py-2 hover:bg-yellow-100 rounded text-xs font-mono text-left font-bold cursor-pointer"
                  >
                    <GitFork size={14} className="text-black shrink-0" />
                    <div>
                      <div>Tree Hierarchy</div>
                      <div className="text-[10px] text-gray-500 font-normal">Branch parent & children</div>
                    </div>
                  </button>

                  <button
                    onClick={() => handleApplyLayout('grid')}
                    className="flex items-center gap-2 px-2.5 py-2 hover:bg-yellow-100 rounded text-xs font-mono text-left font-bold cursor-pointer"
                  >
                    <LayoutGrid size={14} className="text-black shrink-0" />
                    <div>
                      <div>Grid Matrix</div>
                      <div className="text-[10px] text-gray-500 font-normal">Clean rows & columns</div>
                    </div>
                  </button>

                  <button
                    onClick={() => handleApplyLayout('horizontal')}
                    className="flex items-center gap-2 px-2.5 py-2 hover:bg-yellow-100 rounded text-xs font-mono text-left font-bold cursor-pointer"
                  >
                    <AlignJustify size={14} className="text-black shrink-0" />
                    <div>
                      <div>Horizontal Flow</div>
                      <div className="text-[10px] text-gray-500 font-normal">Sequential timeline order</div>
                    </div>
                  </button>

                  <div className="h-px bg-gray-200 my-0.5" />

                  <button
                    onClick={() => handleApplyLayout('tidy')}
                    className="flex items-center gap-2 px-2.5 py-2 hover:bg-yellow-100 rounded text-xs font-mono text-left font-bold cursor-pointer text-blue-600"
                  >
                    <Sparkle size={14} className="shrink-0" />
                    <div>
                      <div>Tidy Overlaps</div>
                      <div className="text-[10px] text-gray-500 font-normal">Separate touching cards</div>
                    </div>
                  </button>
                </div>
              )}
            </div>

            {/* Fit All Button */}
            <button
              id="fit-all-canvas-button"
              onClick={handleFitAll}
              title="Fit all nodes on screen (Press F)"
              className="bg-white border-2 border-black text-[10px] md:text-xs font-mono font-bold px-3 py-2 md:px-4 md:py-2 hover:bg-yellow-100 hover:text-black transition-colors shadow-[2px_2px_0px_#000] md:shadow-[4px_4px_0px_#000] cursor-pointer flex items-center gap-1.5"
            >
              <Maximize2 size={14} className="shrink-0" />
              <span>[ FIT ALL ]</span>
            </button>

            {/* Download Backup */}
            <button
              id="download-canvas-button"
              onClick={handleDownloadCanvas}
              title="Download canvas as JSON backup file"
              className="bg-white border-2 border-black text-[10px] md:text-xs font-mono font-bold px-3 py-2 md:px-4 md:py-2 hover:bg-yellow-100 hover:text-black transition-colors shadow-[2px_2px_0px_#000] md:shadow-[4px_4px_0px_#000] cursor-pointer flex items-center gap-1.5"
            >
              <Download size={14} className="shrink-0" />
              <span className="hidden sm:inline">[ DOWNLOAD ]</span>
            </button>

            {/* Import Backup */}
            <button
              id="import-canvas-button"
              onClick={() => fileInputRef.current?.click()}
              title="Import canvas JSON file"
              className="bg-white border-2 border-black text-[10px] md:text-xs font-mono font-bold px-3 py-2 md:px-4 md:py-2 hover:bg-yellow-100 hover:text-black transition-colors shadow-[2px_2px_0px_#000] md:shadow-[4px_4px_0px_#000] cursor-pointer flex items-center gap-1.5"
            >
              <Upload size={14} className="shrink-0" />
              <span className="hidden sm:inline">[ IMPORT ]</span>
            </button>

            {/* Search Filter Toggle */}
            <button
              id="toggle-filter-button"
              onClick={() => setShowSearchFilter(prev => !prev)}
              title="Search and highlight nodes"
              className={`border-2 border-black text-[10px] md:text-xs font-mono font-bold px-3 py-2 md:px-4 md:py-2 transition-colors shadow-[2px_2px_0px_#000] md:shadow-[4px_4px_0px_#000] cursor-pointer flex items-center gap-1.5 ${showSearchFilter ? 'bg-yellow-300 text-black' : 'bg-white hover:bg-yellow-100'
                }`}
            >
              <Search size={14} className="shrink-0" />
              <span className="hidden md:inline">[ FIND NODE ]</span>
            </button>

            {/* Reset Canvas */}
            <button
              id="reset-canvas-button"
              onClick={() => {
                setNodes([]);
                setTransform({
                  x: 0,
                  y: 0,
                  scale: typeof window !== 'undefined' && window.innerWidth < 768 ? 0.6 : 0.85
                });
              }}
              title="Clear all nodes and reset canvas"
              className="bg-white border-2 border-black text-[10px] md:text-xs font-mono font-bold px-3 py-2 md:px-4 md:py-2 hover:bg-red-50 hover:text-red-600 transition-colors shadow-[2px_2px_0px_#000] md:shadow-[4px_4px_0px_#000] cursor-pointer"
            >
              [ RESET ]
            </button>
          </div>

          {/* Quick Node Search Bar Overlay */}
          {showSearchFilter && (
            <div className="absolute top-20 left-4 md:left-6 z-30 bg-white border-2 border-black p-2 shadow-[4px_4px_0px_#000] rounded-lg w-80 flex flex-col gap-2 pointer-events-auto">
              <div className="flex items-center gap-2 border-b border-gray-200 pb-1.5">
                <Search size={16} className="text-gray-400" />
                <input
                  autoFocus
                  placeholder="Filter nodes by keyword..."
                  value={filterQuery}
                  onChange={(e) => setFilterQuery(e.target.value)}
                  className="w-full text-xs font-mono outline-none"
                />
                {filterQuery && (
                  <button onClick={() => setFilterQuery('')} className="text-gray-400 hover:text-black text-xs font-bold font-mono">×</button>
                )}
              </div>
              <div className="max-h-48 overflow-y-auto flex flex-col gap-1">
                {filteredNodes.length === 0 ? (
                  <div className="text-[11px] font-mono text-gray-400 p-2 text-center">No matching nodes</div>
                ) : (
                  filteredNodes.map((n, i) => (
                    <button
                      key={n.id}
                      onClick={() => zoomToNode(n.id)}
                      className="text-left px-2 py-1.5 hover:bg-yellow-100 rounded text-xs font-mono flex items-center justify-between group cursor-pointer"
                    >
                      <span className="truncate font-bold text-black">{n.prompt}</span>
                      <Maximize2 size={12} className="text-gray-400 group-hover:text-black shrink-0 ml-1" />
                    </button>
                  ))
                )}
              </div>
            </div>
          )}

          {/* Capacity & Node Step Floating Bar */}
          <div className="absolute bottom-6 left-4 md:bottom-6 md:left-6 pointer-events-auto hidden sm:flex items-center gap-2 z-30">
            <div className="bg-black text-white px-3 py-1.5 md:px-4 md:py-2 rounded-full font-mono text-[9px] md:text-[11px] uppercase tracking-wider shadow-lg flex items-center gap-3">
              <span>{nodes.length} NODES</span>
              <div className="h-3 w-px bg-gray-700" />
              <div className="flex items-center gap-1">
                <button
                  onClick={() => handleStepNode('prev')}
                  className="hover:text-yellow-300 transition-colors cursor-pointer flex items-center gap-0.5"
                  title="Go to previous node in sequence"
                >
                  <ArrowLeft size={12} />
                  <span>PREV</span>
                </button>
                <span className="text-gray-500">/</span>
                <button
                  onClick={() => handleStepNode('next')}
                  className="hover:text-yellow-300 transition-colors cursor-pointer flex items-center gap-0.5"
                  title="Go to next node in sequence"
                >
                  <span>NEXT</span>
                  <ArrowRight size={12} />
                </button>
              </div>
            </div>
          </div>

          {/* Tools Menu & Minimap */}
          <div className="absolute bottom-4 right-4 md:bottom-6 md:right-6 pointer-events-auto flex flex-col items-end gap-2 md:gap-4 z-30">
            <div className="hidden md:block">
              <Minimap
                nodes={nodes}
                transform={transform}
                onCenterViewport={handleCenterViewport}
                showLines={showLines}
                onZoomToNode={zoomToNode}
              />
            </div>

            {/* Quick Zoom Jump Popover */}
            {showNodeJump && (
              <div
                id="node-jump-menu"
                className="bg-white border-2 border-black shadow-[4px_4px_0px_#000] p-2 rounded-lg w-72 max-h-64 overflow-y-auto flex flex-col gap-1 z-40 mb-1"
              >
                <div className="px-2 py-1 border-b border-gray-200 flex items-center justify-between text-[10px] font-mono uppercase text-gray-500 font-bold">
                  <span>Direct Zoom Node</span>
                  <span>{nodes.length} total</span>
                </div>
                <div className="flex flex-col gap-0.5 mt-1">
                  {nodes.map((node, i) => (
                    <button
                      key={node.id}
                      onClick={() => zoomToNode(node.id)}
                      className="text-left px-2 py-1.5 hover:bg-yellow-100 rounded text-xs font-mono flex items-center justify-between group transition-colors cursor-pointer"
                    >
                      <span className="font-bold text-black truncate mr-2">
                        {i + 1}. {node.prompt}
                      </span>
                      <Maximize2 size={12} className="text-gray-400 group-hover:text-black shrink-0" />
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Direct Zoom Level Presets Popover */}
            {showZoomMenu && (
              <div
                id="zoom-menu"
                className="bg-white border-2 border-black shadow-[4px_4px_0px_#000] p-2 rounded-lg w-52 flex flex-col gap-1 z-40 mb-1 font-mono text-xs"
              >
                <div className="px-2 py-1 border-b border-gray-200 flex items-center justify-between text-[10px] uppercase text-gray-500 font-bold">
                  <span>Direct Zoom Presets</span>
                  <span>{Math.round(transform.scale * 100)}%</span>
                </div>
                <div className="flex flex-col gap-0.5 mt-1">
                  {[
                    { label: "25% (Bird's Eye)", scale: 0.25 },
                    { label: "50% (Overview)", scale: 0.50 },
                    { label: "75% (Comfortable)", scale: 0.75 },
                    { label: "100% (Actual Size)", scale: 1.00 },
                    { label: "150% (Zoomed In)", scale: 1.50 },
                    { label: "200% (High Detail)", scale: 2.00 },
                    { label: "300% (Max Detail)", scale: 3.00 },
                  ].map((preset) => (
                    <button
                      key={preset.scale}
                      onClick={() => setDirectZoom(preset.scale)}
                      className={`text-left px-2 py-1.5 hover:bg-yellow-100 rounded flex items-center justify-between cursor-pointer ${Math.abs(transform.scale - preset.scale) < 0.05 ? 'bg-yellow-200 font-bold' : ''
                        }`}
                    >
                      <span>{preset.label}</span>
                      {Math.abs(transform.scale - preset.scale) < 0.05 && <Check size={12} />}
                    </button>
                  ))}
                  <div className="h-px bg-gray-200 my-0.5" />
                  <button
                    onClick={handleFitAll}
                    className="text-left px-2 py-1.5 hover:bg-yellow-100 rounded flex items-center justify-between font-bold text-blue-600 cursor-pointer"
                  >
                    <span>[ Fit All Nodes ]</span>
                    <Maximize2 size={12} />
                  </button>
                </div>
              </div>
            )}

            {/* Bottom Control Dock */}
            <div className="bg-black text-white p-1 rounded-xl flex items-center shadow-2xl flex-wrap">
              <div className="hidden sm:block px-3 font-mono text-[10px] min-w-[90px] text-center border-r border-gray-700">
                {totalChars} CHARS
              </div>

              {/* Toggle Connecting Lines Button */}
              <button
                id="toggle-lines-button"
                onClick={() => setShowLines(prev => !prev)}
                title={showLines ? "Hide connecting lines (Press L)" : "Show connecting lines (Press L)"}
                aria-label={showLines ? "Hide connecting lines" : "Show connecting lines"}
                className={`h-8 px-2.5 md:h-10 md:px-3 flex items-center gap-1.5 rounded-lg transition-colors mx-0.5 cursor-pointer font-mono text-[10px] md:text-xs ${showLines
                    ? 'bg-gray-800 text-yellow-300 hover:bg-gray-700 hover:text-yellow-200'
                    : 'text-gray-400 hover:text-white hover:bg-gray-800'
                  }`}
              >
                <Spline size={16} className="md:w-[18px] md:h-[18px]" />
                <span className="font-bold hidden sm:inline">
                  LINES: {showLines ? 'ON' : 'OFF'}
                </span>
              </button>

              <div className="h-4 w-[1px] bg-gray-700 mx-0.5" />

              {/* Direct Zoom to Node Selector Button */}
              <button
                id="quick-zoom-nodes-button"
                onClick={() => setShowNodeJump(prev => !prev)}
                title="Direct Zoom to any Node"
                aria-label="Direct Zoom to any Node"
                className={`h-8 px-2 md:h-10 md:px-2.5 flex items-center gap-1 rounded-lg transition-colors mx-0.5 cursor-pointer font-mono text-[10px] md:text-xs ${showNodeJump
                    ? 'bg-gray-800 text-yellow-300 hover:bg-gray-700'
                    : 'text-gray-300 hover:text-white hover:bg-gray-800'
                  }`}
              >
                <Maximize2 size={14} className="md:w-[16px] md:h-[16px]" />
                <span className="font-bold hidden md:inline">NODES</span>
                <ChevronDown size={11} className={`transition-transform duration-150 ${showNodeJump ? 'rotate-180' : ''}`} />
              </button>

              <div className="h-4 w-[1px] bg-gray-700 mx-0.5" />

              {/* Direct Zoom Percentage Preset Button */}
              <button
                id="zoom-menu-button"
                onClick={() => setShowZoomMenu(prev => !prev)}
                title="Choose direct zoom level or presets"
                aria-label="Direct Zoom Level"
                className={`h-8 px-2 md:h-10 md:px-2.5 flex items-center gap-1 rounded-lg transition-colors mx-0.5 cursor-pointer font-mono text-[10px] md:text-xs ${showZoomMenu
                    ? 'bg-gray-800 text-yellow-300 hover:bg-gray-700'
                    : 'text-gray-300 hover:text-white hover:bg-gray-800'
                  }`}
              >
                <span className="font-bold">{Math.round(transform.scale * 100)}%</span>
                <ChevronDown size={11} className={`transition-transform duration-150 ${showZoomMenu ? 'rotate-180' : ''}`} />
              </button>

              <div className="h-4 w-[1px] bg-gray-700 mx-0.5" />

              {/* Zoom Out */}
              <button
                id="zoom-out-button"
                onClick={() => handleZoom(-0.15)}
                title="Zoom Out (Wide range down to 5%)"
                aria-label="Zoom Out"
                className="w-8 h-8 md:w-10 md:h-10 flex items-center justify-center hover:bg-gray-800 rounded-lg transition-colors mx-0.5 cursor-pointer"
              >
                <ZoomOut size={16} className="md:w-[18px] md:h-[18px]" />
              </button>

              {/* Zoom In */}
              <button
                id="zoom-in-button"
                onClick={() => handleZoom(0.15)}
                title="Zoom In (Up to 400%)"
                aria-label="Zoom In"
                className="w-8 h-8 md:w-10 md:h-10 flex items-center justify-center hover:bg-gray-800 rounded-lg transition-colors mr-1 cursor-pointer"
              >
                <ZoomIn size={16} className="md:w-[18px] md:h-[18px]" />
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

