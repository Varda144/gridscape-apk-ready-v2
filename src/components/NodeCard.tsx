import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Sparkles, X, ChevronLeft, ChevronRight, Loader2, Maximize2, ArrowLeft, ArrowRight, CornerDownRight, CornerUpLeft } from 'lucide-react';
import { GridNodeData } from '../types';

import ReactMarkdown from 'react-markdown';

const Typewriter = ({ text, onExpand, nodeId }: { text: string, onExpand: (prompt: string, parentId: string) => void, nodeId: string }) => {
  const [displayedText, setDisplayedText] = useState('');
  
  // Pre-process text to fix bad markdown links where href has spaces
  const processedText = (text || '').replace(/\[([^\]]+)\]\s*\(([^)]+)\)/g, (match, p1, p2) => {
    return `[${p1}](${p2.replace(/\s/g, '%20')})`;
  });
  
  useEffect(() => {
    setDisplayedText('');
    let i = 0;
    const charsPerTick = Math.max(1, Math.floor(processedText.length / 100)); // adjust speed
    const interval = setInterval(() => {
      if (i >= processedText.length) {
        clearInterval(interval);
      } else {
        setDisplayedText(processedText.slice(0, i + charsPerTick));
        i += charsPerTick;
      }
    }, 20);
    return () => clearInterval(interval);
  }, [processedText]);

  return (
    <div className="whitespace-pre-wrap">
      <ReactMarkdown
        components={{
          a: ({ node, ...props }) => (
            <button 
              type="button"
              className="font-bold underline decoration-black decoration-2 hover:bg-yellow-200 transition-colors mx-1 inline"
              onClick={(e) => {
                e.stopPropagation();
                // Safely extract string from children if possible, or fallback to href
                let promptText = props.href || "";
                if (promptText.startsWith('#')) promptText = promptText.substring(1);
                promptText = decodeURIComponent(promptText);
                
                // If it's a relative link or something else, prefer to use children text if it's string
                if (Array.isArray(props.children) && typeof props.children[0] === 'string') {
                  promptText = props.children[0];
                } else if (typeof props.children === 'string') {
                  promptText = props.children;
                }
                onExpand(promptText, nodeId);
              }}
            >
              {props.children}
            </button>
          )
        }}
      >
        {displayedText}
      </ReactMarkdown>
    </div>
  );
};

const LOADING_MESSAGES = [
  "Searching the internet...",
  "Looking for connections...",
  "Gathering the cool bits...",
  "Brewing some ideas...",
  "Almost there..."
];

const FunLoader = () => {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setIndex((prevIndex) => (prevIndex + 1) % LOADING_MESSAGES.length);
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="p-8 flex flex-col items-center justify-center text-center gap-6 min-h-[400px]">
      <div className="relative h-6 w-full flex items-center justify-center overflow-hidden">
        <AnimatePresence mode="wait">
          <motion.div
            key={index}
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -20, opacity: 0 }}
            transition={{ duration: 0.5 }}
            className="absolute font-mono text-sm uppercase tracking-wider text-black w-full text-center font-bold"
          >
            {LOADING_MESSAGES[index]}
          </motion.div>
        </AnimatePresence>
      </div>
      <Loader2 className="w-8 h-8 animate-spin text-black" />
      <div className="absolute -inset-2 border-2 border-dashed border-gray-200 pointer-events-none rounded opacity-50"></div>
    </div>
  );
};

interface NodeCardProps {
  index: number;
  node: GridNodeData;
  allNodes?: GridNodeData[];
  onExpand: (prompt: string, parentId: string) => void;
  onRegenerate: (nodeId: string) => void;
  onClose: (nodeId: string) => void;
  setVersion: (nodeId: string, versionIndex: number) => void;
  onPointerDown?: (e: React.PointerEvent) => void;
  onZoomToNode?: (nodeId: string) => void;
}

export const NodeCard: React.FC<NodeCardProps> = ({ 
  index,
  node, 
  allNodes = [],
  onExpand, 
  onRegenerate, 
  onClose,
  setVersion,
  onPointerDown,
  onZoomToNode
}) => {
  const version = node.versions[node.versionIndex] || node;
  const isGenerating = node.status === 'generating';
  
  const versionText = `${index + 1}.${node.versionIndex + 1}`;
  const totalVersions = Math.max(1, node.versions.length || 1);

  // Find connected parent node (backward) and children nodes (forward)
  const parentNode = allNodes.find(n => n.id === node.parentId);
  const childNodes = allNodes.filter(n => n.parentId === node.id);
  const prevSeqNode = index > 0 ? allNodes[index - 1] : null;
  const nextSeqNode = index < allNodes.length - 1 ? allNodes[index + 1] : null;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.2 } }}
      style={{
        position: 'absolute',
        left: node.x,
        top: node.y,
        width: node.width,
        zIndex: 10
      }}
      className="flex flex-col gap-2 origin-top-left"
    >
      {/* Node Toolbar */}
      <div 
        className="flex items-center flex-wrap gap-1.5 text-xs font-mono cursor-grab active:cursor-grabbing w-fit"
        onPointerDown={(e) => onPointerDown?.(e)}
        onDoubleClick={(e) => {
          e.stopPropagation();
          onZoomToNode?.(node.id);
        }}
      >
        <div className="bg-white border border-black rounded-full px-3 py-1.5 shadow-[2px_2px_0px_#000] flex items-center gap-2.5">
          <span className="font-bold text-[11px]">NODE {index + 1}</span>
          
          <div className="h-3 w-px bg-gray-300"></div>
          
          {/* Backward Navigation to Parent / Prev */}
          <div className="flex items-center gap-1">
            <button
              id={`back-node-${node.id}`}
              onClick={(e) => {
                e.stopPropagation();
                if (parentNode) {
                  onZoomToNode?.(parentNode.id);
                } else if (prevSeqNode) {
                  onZoomToNode?.(prevSeqNode.id);
                }
              }}
              onPointerDown={(e) => e.stopPropagation()}
              disabled={!parentNode && !prevSeqNode}
              className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-gray-100 hover:bg-yellow-200 disabled:opacity-30 disabled:bg-transparent disabled:hover:bg-transparent transition-colors cursor-pointer disabled:cursor-not-allowed"
              title={parentNode ? `Jump Backward to Parent: "${parentNode.prompt}"` : prevSeqNode ? `Jump to Previous Node: "${prevSeqNode.prompt}"` : "No backward node"}
              aria-label="Jump to backward node"
            >
              <ArrowLeft size={12} />
              <span className="hidden sm:inline">BACK</span>
            </button>

            {/* Forward Navigation to Child / Next */}
            <button
              id={`forward-node-${node.id}`}
              onClick={(e) => {
                e.stopPropagation();
                if (childNodes.length > 0) {
                  onZoomToNode?.(childNodes[0].id);
                } else if (nextSeqNode) {
                  onZoomToNode?.(nextSeqNode.id);
                }
              }}
              onPointerDown={(e) => e.stopPropagation()}
              disabled={childNodes.length === 0 && !nextSeqNode}
              className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-gray-100 hover:bg-yellow-200 disabled:opacity-30 disabled:bg-transparent disabled:hover:bg-transparent transition-colors cursor-pointer disabled:cursor-not-allowed"
              title={childNodes.length > 0 ? `Jump Forward to Child (${childNodes.length}): "${childNodes[0].prompt}"` : nextSeqNode ? `Jump to Next Node: "${nextSeqNode.prompt}"` : "No forward node"}
              aria-label="Jump to forward node"
            >
              <span className="hidden sm:inline">FWD</span>
              <ArrowRight size={12} />
            </button>
          </div>

          <div className="h-3 w-px bg-gray-300"></div>

          {/* Version Switching Controls */}
          <div className="flex items-center gap-0.5 bg-gray-50 border border-gray-200 px-1 py-0.5 rounded">
            <button 
              id={`prev-version-${node.id}`}
              onClick={(e) => {
                e.stopPropagation();
                setVersion(node.id, Math.max(0, node.versionIndex - 1));
              }}
              onPointerDown={(e) => e.stopPropagation()}
              disabled={node.versionIndex === 0}
              className="hover:bg-gray-200 p-0.5 rounded disabled:opacity-30 cursor-pointer disabled:cursor-not-allowed"
              title="Previous Version"
            >
              <ChevronLeft size={13} />
            </button>
            <span className="text-[10px] font-bold min-w-[28px] text-center" title="Version Number">
              v{node.versionIndex + 1}/{totalVersions}
            </span>
            <button 
              id={`next-version-${node.id}`}
              onClick={(e) => {
                e.stopPropagation();
                setVersion(node.id, Math.min(totalVersions - 1, node.versionIndex + 1));
              }}
              onPointerDown={(e) => e.stopPropagation()}
              disabled={node.versionIndex >= totalVersions - 1}
              className="hover:bg-gray-200 p-0.5 rounded disabled:opacity-30 cursor-pointer disabled:cursor-not-allowed"
              title="Next Version"
            >
              <ChevronRight size={13} />
            </button>
          </div>
          
          <div className="h-3 w-px bg-gray-300"></div>
          
          <span className="w-14 text-[10px] text-gray-600">
            {isGenerating ? '---' : `${version.text?.length || 0} CH`}
          </span>

          <div className="h-3 w-px bg-gray-300"></div>
          
          <button 
            id={`zoom-node-${node.id}`}
            onClick={(e) => {
              e.stopPropagation();
              onZoomToNode?.(node.id);
            }}
            onPointerDown={(e) => e.stopPropagation()}
            className="hover:text-yellow-600 transition-colors cursor-pointer p-0.5"
            title="Direct Zoom to this Node"
            aria-label="Direct Zoom to this Node"
          >
            <Maximize2 size={13} />
          </button>
          
          <div className="h-3 w-px bg-gray-300"></div>
          
          <button 
            id={`regen-node-${node.id}`}
            onClick={(e) => {
              e.stopPropagation();
              onRegenerate(node.id);
            }}
            onPointerDown={(e) => e.stopPropagation()}
            className="hover:text-blue-600 transition-colors cursor-pointer p-0.5"
            title="Regenerate new version"
          >
            <Sparkles size={13} />
          </button>
          
          <button 
            id={`close-node-${node.id}`}
            onClick={(e) => {
              e.stopPropagation();
              onClose(node.id);
            }}
            onPointerDown={(e) => e.stopPropagation()}
            className="hover:text-red-600 transition-colors cursor-pointer p-0.5"
            title="Close node & branch"
          >
            <X size={13} />
          </button>
        </div>
      </div>

      {/* Main Card */}
      <div 
        className="flex flex-col shadow-[4px_4px_0px_#000] bg-white border-2 border-black rounded relative z-10"
        onPointerDown={(e) => onPointerDown?.(e)}
      >
        
        {/* Stacked effect base lines if multiple versions */}
        {node.versions && node.versions.length > 1 && (
          <>
            <div className="absolute top-1 -right-1.5 w-full h-full border-r-2 border-t-2 border-black rounded bg-white -z-10 shadow-[2px_2px_0px_#000]" />
            <div className="absolute top-2 -right-3 w-full h-full border-r-2 border-t-2 border-black rounded bg-white -z-20 shadow-[2px_2px_0px_#000]" />
          </>
        )}

        {node.status === 'error' ? (
          <div className="p-8 flex flex-col items-center justify-center text-center gap-4 min-h-[400px]">
            <div className="text-red-500 mb-2">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>
            </div>
            <div className="font-mono text-sm uppercase tracking-wider text-red-500">
              SYSTEM_FAULT:<br/>NEURAL ENGINE FAILURE
            </div>
            <div className="text-xs text-gray-500 mt-2 font-mono">Unable to process prompt. Please try regenerating.</div>
            <div className="absolute -inset-2 border-2 border-dashed border-red-300 pointer-events-none rounded opacity-50"></div>
          </div>
        ) : isGenerating ? (
          <FunLoader />
        ) : (
          <>
            {/* Visual Header / Image / ASCII */}
            <div className={`bg-[#f8f9fa] border-b-2 border-black overflow-hidden flex items-center justify-center relative ${version.imageUrl ? 'min-h-[240px]' : version.asciiArt ? 'min-h-[140px]' : 'min-h-[100px]'}`}>
              {version.imageUrl ? (
                <img 
                  src={version.imageUrl} 
                  alt={node.prompt} 
                  className="w-full h-[260px] object-cover"
                  referrerPolicy="no-referrer"
                />
              ) : version.asciiArt ? (
                <div className="relative w-full p-4 flex flex-col items-center justify-center bg-gray-50/80">
                  <pre className="text-black font-mono font-bold text-xs sm:text-sm leading-tight text-center select-none overflow-x-auto max-w-full">
                    {version.asciiArt}
                  </pre>
                  {version.imageLoading && (
                    <div className="absolute top-2 right-2 flex items-center gap-1 bg-white/90 border border-black px-1.5 py-0.5 rounded text-[9px] font-mono text-gray-600 shadow-[1px_1px_0px_#000]">
                      <Loader2 className="w-2.5 h-2.5 animate-spin text-black" />
                      <span>HD</span>
                    </div>
                  )}
                </div>
              ) : version.imageLoading ? (
                 <div className="flex flex-col items-center gap-2 py-10">
                    <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
                    <span className="font-mono text-[10px] text-gray-500 uppercase tracking-widest">Generating Visual...</span>
                 </div>
              ) : (
                <span className="font-mono text-[10px] text-gray-400 py-6 uppercase tracking-widest">Concept Node</span>
              )}
            </div>
            
            {/* Text Content */}
            <div 
              className="p-5 min-h-[280px] max-h-[400px] overflow-y-auto custom-scrollbar text-sm leading-relaxed cursor-text selection:bg-yellow-200"
              onPointerDown={(e) => e.stopPropagation()}
            >
              <h3 className="font-bold text-lg mb-3 uppercase tracking-tight">{node.prompt}</h3>
              <Typewriter text={version.text} onExpand={onExpand} nodeId={node.id} />
            </div>

            {/* Quick Connected Nodes Footer Bar */}
            {(parentNode || childNodes.length > 0) && (
              <div className="border-t border-black bg-gray-50 p-2 flex items-center justify-between text-[11px] font-mono">
                {parentNode ? (
                  <button 
                    onClick={(e) => {
                      e.stopPropagation();
                      onZoomToNode?.(parentNode.id);
                    }}
                    className="flex items-center gap-1 hover:text-blue-600 truncate max-w-[45%] text-left font-bold cursor-pointer"
                    title={`Go to parent: ${parentNode.prompt}`}
                  >
                    <CornerUpLeft size={12} className="shrink-0" />
                    <span className="truncate">{parentNode.prompt}</span>
                  </button>
                ) : <span />}

                {childNodes.length > 0 && (
                  <div className="flex items-center gap-1.5 ml-auto">
                    <span className="text-gray-500 font-bold">({childNodes.length})</span>
                    <button 
                      onClick={(e) => {
                        e.stopPropagation();
                        onZoomToNode?.(childNodes[0].id);
                      }}
                      className="flex items-center gap-1 hover:text-blue-600 truncate max-w-[140px] font-bold cursor-pointer"
                      title={`Go to child: ${childNodes[0].prompt}`}
                    >
                      <span className="truncate">{childNodes[0].prompt}</span>
                      <CornerDownRight size={12} className="shrink-0" />
                    </button>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {/* Suggested Prompts (Spawning Side) */}
      <AnimatePresence>
        {!isGenerating && version.prompts && version.prompts.length > 0 && (
          <motion.div 
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0, transition: { delay: 0.3 } }}
            className="absolute left-full bottom-0 ml-[20px] flex flex-col gap-3 w-64"
          >
            {version.prompts.map((prompt: string, idx: number) => (
              <div key={idx} className="relative group">
                {/* Visual solid horizontal line bridging the 20px gap */}
                <div className="absolute top-1/2 right-full w-[20px] h-[2px] bg-black" />
                
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onExpand(prompt, node.id);
                  }}
                  className="w-full relative bg-[#FFFBEA] border border-black p-3 text-left shadow-[2px_2px_0px_rgba(0,0,0,0.2)] hover:shadow-[2px_2px_0px_#000] hover:-translate-y-0.5 hover:-translate-x-0.5 transition-all text-xs font-medium cursor-pointer block"
                >
                  {prompt}
                </button>
              </div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

