export interface ChangeTreeItem {
  id: string;
  treeParentId: string | null;
}

export interface ChangeTreeRow<T extends ChangeTreeItem> {
  change: T;
  child: boolean;
}

export function arrangeChangeTree<T extends ChangeTreeItem>(changes: readonly T[]): Array<ChangeTreeRow<T>> {
  const visibleIds = new Set(changes.map((change) => change.id));
  const children = new Map<string, T[]>();
  const roots: T[] = [];

  for (const change of changes) {
    if (change.treeParentId && visibleIds.has(change.treeParentId)) {
      const siblings = children.get(change.treeParentId) ?? [];
      siblings.push(change);
      children.set(change.treeParentId, siblings);
    } else {
      roots.push(change);
    }
  }

  const rows: Array<ChangeTreeRow<T>> = [];
  for (const root of roots) {
    rows.push({ change: root, child: false });
    for (const child of children.get(root.id) ?? []) rows.push({ change: child, child: true });
  }
  return rows;
}
