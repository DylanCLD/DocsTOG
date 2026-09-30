"use client";

import dynamic from "next/dynamic";
import { updatePageContent } from "@/lib/actions/pages";
import type { InternalLinkTarget, PageRecord, Profile } from "@/types";

const RichEditor = dynamic(() => import("@/components/editor/rich-editor").then((m) => m.RichEditor), { ssr: false });

export function PageEditorClient({
  page,
  profile,
  internalLinkTargets,
  users = []
}: {
  page: PageRecord;
  profile: Profile;
  internalLinkTargets: InternalLinkTarget[];
  users?: Pick<Profile, "id" | "email" | "full_name">[];
}) {
  const readOnly = profile.role === "reader";

  return (
    <RichEditor
      value={page.content}
      readOnly={readOnly}
      internalLinkTargets={internalLinkTargets}
      currentTarget={{ type: "page", id: page.id }}
      users={users}
      onSave={(content, options) => updatePageContent(page.id, content, options)}
      collaboration={{
        id: page.id,
        table: "pages",
        profile
      }}
    />
  );
}
