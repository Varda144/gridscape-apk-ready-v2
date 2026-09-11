import { GridNodeData } from '../types';

export const NODE_WIDTH = 480;
export const ESTIMATED_NODE_HEIGHT = 650;
export const HORIZONTAL_GAP = 140;
export const VERTICAL_GAP = 80;

/**
 * Organizes nodes in a clean hierarchical tree layout (Left to Right)
 */
export function applyTreeLayout(nodes: GridNodeData[]): GridNodeData[] {
  if (nodes.length === 0) return [];

  // Build adjacency map
  const childrenMap = new Map<string, string[]>();
  const parentMap = new Map<string, string>();
  const nodeMap = new Map<string, GridNodeData>();

  for (const n of nodes) {
    nodeMap.set(n.id, { ...n });
    if (!childrenMap.has(n.id)) {
      childrenMap.set(n.id, []);
    }
  }

  for (const n of nodes) {
    if (n.parentId && nodeMap.has(n.parentId)) {
      parentMap.set(n.id, n.parentId);
      childrenMap.get(n.parentId)!.push(n.id);
    }
  }

  // Find root nodes (no parent or parent not in nodes)
  const rootIds = nodes.filter(n => !n.parentId || !nodeMap.has(n.parentId)).map(n => n.id);
  if (rootIds.length === 0 && nodes.length > 0) {
    rootIds.push(nodes[0].id);
  }

  // Calculate subtree heights
  const subtreeHeight = new Map<string, number>();

  function calculateSubtreeHeight(id: string): number {
    const children = childrenMap.get(id) || [];
    if (children.length === 0) {
      subtreeHeight.set(id, ESTIMATED_NODE_HEIGHT);
      return ESTIMATED_NODE_HEIGHT;
    }
    let totalH = 0;
    for (const childId of children) {
      totalH += calculateSubtreeHeight(childId);
    }
    totalH += (children.length - 1) * VERTICAL_GAP;
    const finalH = Math.max(ESTIMATED_NODE_HEIGHT, totalH);
    subtreeHeight.set(id, finalH);
    return finalH;
  }

  for (const rootId of rootIds) {
    calculateSubtreeHeight(rootId);
  }

  const positionedNodes = new Map<string, { x: number; y: number }>();

  function positionSubtree(id: string, startX: number, startY: number, allocatedHeight: number) {
    const nodeY = startY + (allocatedHeight - ESTIMATED_NODE_HEIGHT) / 2;
    positionedNodes.set(id, { x: startX, y: nodeY });

    const children = childrenMap.get(id) || [];
    if (children.length === 0) return;

    const nextX = startX + NODE_WIDTH + HORIZONTAL_GAP;
    let currentY = startY;

    for (const childId of children) {
      const childAllocH = subtreeHeight.get(childId) || ESTIMATED_NODE_HEIGHT;
      positionSubtree(childId, nextX, currentY, childAllocH);
      currentY += childAllocH + VERTICAL_GAP;
    }
  }

  let rootYOffset = 0;
  for (const rootId of rootIds) {
    const allocH = subtreeHeight.get(rootId) || ESTIMATED_NODE_HEIGHT;
    positionSubtree(rootId, 0, rootYOffset, allocH);
    rootYOffset += allocH + VERTICAL_GAP * 2;
  }

  return nodes.map(n => {
    const pos = positionedNodes.get(n.id);
    if (pos) {
      return { ...n, x: Math.round(pos.x), y: Math.round(pos.y) };
    }
    return n;
  });
}

/**
 * Organizes nodes in a balanced grid layout
 */
export function applyGridLayout(nodes: GridNodeData[]): GridNodeData[] {
  if (nodes.length === 0) return [];
  const cols = Math.max(1, Math.ceil(Math.sqrt(nodes.length * 1.5)));
  const colWidth = NODE_WIDTH + HORIZONTAL_GAP;
  const rowHeight = ESTIMATED_NODE_HEIGHT + VERTICAL_GAP;

  return nodes.map((n, i) => {
    const row = Math.floor(i / cols);
    const col = i % cols;
    return {
      ...n,
      x: col * colWidth,
      y: row * rowHeight,
    };
  });
}

/**
 * Organizes nodes in a horizontal sequential timeline/flow
 */
export function applyHorizontalLayout(nodes: GridNodeData[]): GridNodeData[] {
  if (nodes.length === 0) return [];
  const colWidth = NODE_WIDTH + HORIZONTAL_GAP;

  return nodes.map((n, i) => ({
    ...n,
    x: i * colWidth,
    y: (i % 2 === 0 ? 0 : 80),
  }));
}

/**
 * Resolves overlapping node collisions by separating them with minimum displacement
 */
export function applyTidyLayout(nodes: GridNodeData[]): GridNodeData[] {
  if (nodes.length <= 1) return nodes;

  const result = nodes.map(n => ({ ...n }));
  const iterations = 30;

  for (let iter = 0; iter < iterations; iter++) {
    let moved = false;
    for (let i = 0; i < result.length; i++) {
      for (let j = i + 1; j < result.length; j++) {
        const a = result[i];
        const b = result[j];

        const aWidth = a.width || NODE_WIDTH;
        const bWidth = b.width || NODE_WIDTH;
        const aHeight = ESTIMATED_NODE_HEIGHT;
        const bHeight = ESTIMATED_NODE_HEIGHT;

        const aCenterX = a.x + aWidth / 2;
        const aCenterY = a.y + aHeight / 2;
        const bCenterX = b.x + bWidth / 2;
        const bCenterY = b.y + bHeight / 2;

        const dx = bCenterX - aCenterX;
        const dy = bCenterY - aCenterY;

        const minDistanceX = (aWidth + bWidth) / 2 + 50;
        const minDistanceY = (aHeight + bHeight) / 2 + 50;

        const overlapX = minDistanceX - Math.abs(dx);
        const overlapY = minDistanceY - Math.abs(dy);

        if (overlapX > 0 && overlapY > 0) {
          moved = true;
          if (overlapX < overlapY) {
            const shift = overlapX / 2;
            const sign = dx >= 0 ? 1 : -1;
            b.x += shift * sign;
            a.x -= shift * sign;
          } else {
            const shift = overlapY / 2;
            const sign = dy >= 0 ? 1 : -1;
            b.y += shift * sign;
            a.y -= shift * sign;
          }
        }
      }
    }
    if (!moved) break;
  }

  return result;
}

/**
 * Calculates bounding box and returns optimal scale and offset to fit all nodes on screen
 */
export function calculateFitAllTransform(
  nodes: GridNodeData[],
  screenWidth: number,
  screenHeight: number
): { x: number; y: number; scale: number } {
  if (nodes.length === 0) {
    return { x: 0, y: 0, scale: 0.85 };
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const node of nodes) {
    const width = node.width || NODE_WIDTH;
    const height = ESTIMATED_NODE_HEIGHT;
    if (node.x < minX) minX = node.x;
    if (node.y < minY) minY = node.y;
    if (node.x + width > maxX) maxX = node.x + width;
    if (node.y + height > maxY) maxY = node.y + height;
  }

  const padding = 120;
  const contentWidth = Math.max(100, maxX - minX + padding * 2);
  const contentHeight = Math.max(100, maxY - minY + padding * 2);

  const scaleX = screenWidth / contentWidth;
  const scaleY = screenHeight / contentHeight;
  const targetScale = Math.max(0.05, Math.min(1.2, Math.min(scaleX, scaleY)));

  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;

  const targetX = screenWidth / 2 - centerX * targetScale;
  const targetY = screenHeight / 2 - centerY * targetScale;

  return {
    x: Math.round(targetX),
    y: Math.round(targetY),
    scale: Math.round(targetScale * 100) / 100,
  };
}
