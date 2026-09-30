"use client";

import dynamic from "next/dynamic";
import { updateDocumentContent } from "@/lib/actions/managers";
import type { DocumentRecord, InternalLinkTarget, Profile } from "@/types";

const RichEditor = dynamic(() => import("@/components/editor/rich-editor").then((m) => m.RichEditor), { ssr: false });

export function DocumentEditorClient({
  document,
  users,
  profile,
  internalLinkTargets
}: {
  document: DocumentRecord;
  users: Profile[];
  profile: Profile;
  internalLinkTargets: InternalLinkTarget[];
}) {
  const readOnly = profile.role === "reader";

  return (
    <RichEditor
      value={document.content}
      readOnly={readOnly}
      internalLinkTargets={internalLinkTargets}
      currentTarget={{ type: "document", id: document.id }}
      enableQuickCheckbox
      users={users}
      onSave={(content, options) => updateDocumentContent(document.id, content, options)}
      collaboration={{
        id: document.id,
        table: "documents",
        profile
      }}
    />
  );
}
