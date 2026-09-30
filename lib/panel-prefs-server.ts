import { cookies } from "next/headers";
import {
  parsePanelWidth,
  SIDEBAR_COLLAPSED_COOKIE,
  SIDEBAR_PANEL,
  TREE_COLLAPSED_COOKIE,
  TREE_PANEL
} from "@/lib/panel-prefs";

export async function getPanelPrefs() {
  const store = await cookies();

  return {
    sidebarWidth: parsePanelWidth(store.get(SIDEBAR_PANEL.cookie)?.value, SIDEBAR_PANEL),
    sidebarCollapsed: store.get(SIDEBAR_COLLAPSED_COOKIE)?.value === "1",
    treeWidth: parsePanelWidth(store.get(TREE_PANEL.cookie)?.value, TREE_PANEL),
    treeCollapsed: store.get(TREE_COLLAPSED_COOKIE)?.value === "1"
  };
}
