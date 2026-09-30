// Geometry shared by the page tree and the document tree.
// Each depth level indents by TREE_INDENT_PX. A vertical guide is drawn per ancestor
// level, centred under the chevron of that ancestor (the chevron box is 20px wide).

const TREE_INDENT_PX = 12;
const ROW_BASE_PX = 4;
const GRIP_GUTTER_PX = 16;
const CHEVRON_CENTER_PX = 10;

function rowBase(withGrip: boolean) {
  return withGrip ? GRIP_GUTTER_PX : ROW_BASE_PX;
}

export function treeRowPaddingLeft(depth: number, withGrip: boolean) {
  return rowBase(withGrip) + depth * TREE_INDENT_PX;
}

export function TreeGuides({ depth, withGrip }: { depth: number; withGrip: boolean }) {
  return Array.from({ length: depth }, (_, level) => (
    <span
      key={level}
      aria-hidden="true"
      className="pointer-events-none absolute inset-y-0 w-px bg-[color-mix(in_srgb,var(--muted)_32%,transparent)]"
      style={{ left: rowBase(withGrip) + level * TREE_INDENT_PX + CHEVRON_CENTER_PX }}
    />
  ));
}
