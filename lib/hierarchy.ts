export type HierarchyNode<T> = {
  item: T;
  children: Array<HierarchyNode<T>>;
  depth: number;
};

export function buildHierarchy<T extends { id: string }>(
  items: T[],
  getParentId: (item: T) => string | null | undefined
) {
  const nodes = new Map<string, HierarchyNode<T>>();
  const roots: Array<HierarchyNode<T>> = [];

  items.forEach((item) => {
    nodes.set(item.id, { item, children: [], depth: 0 });
  });

  items.forEach((item) => {
    const node = nodes.get(item.id);
    if (!node) {
      return;
    }

    const parentId = getParentId(item);
    const parent = parentId && parentId !== item.id ? nodes.get(parentId) : null;

    if (parent) {
      parent.children.push(node);
      return;
    }

    roots.push(node);
  });

  const applyDepth = (node: HierarchyNode<T>, depth: number, seen: Set<string>) => {
    if (seen.has(node.item.id)) {
      node.children = [];
      return;
    }

    node.depth = depth;
    const nextSeen = new Set(seen);
    nextSeen.add(node.item.id);
    node.children.forEach((child) => applyDepth(child, depth + 1, nextSeen));
  };

  roots.forEach((node) => applyDepth(node, 0, new Set()));
  return roots;
}

export function flattenHierarchy<T>(nodes: Array<HierarchyNode<T>>) {
  const flattened: Array<HierarchyNode<T>> = [];

  const visit = (node: HierarchyNode<T>) => {
    flattened.push(node);
    node.children.forEach(visit);
  };

  nodes.forEach(visit);
  return flattened;
}

export function collectAncestorIds<T extends { id: string }>(
  items: T[],
  activeId: string,
  getParentId: (item: T) => string | null | undefined
) {
  const byId = new Map(items.map((item) => [item.id, item]));
  const ancestors = new Set<string>();
  let current = byId.get(activeId);

  while (current) {
    const parentId = getParentId(current);
    if (!parentId || ancestors.has(parentId)) {
      break;
    }

    ancestors.add(parentId);
    current = byId.get(parentId);
  }

  return ancestors;
}
