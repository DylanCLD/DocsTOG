export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type UserRole = "admin" | "member" | "reader";
export type DocumentStatus = "todo" | "in_progress" | "review" | "done";
export type DocumentPriority = "low" | "medium" | "high" | "critical";
export type SessionStatus = "planned" | "in_progress" | "done" | "cancelled";
export type MediaType = "image" | "youtube" | "video" | "document" | "link";
export type ThemeMode = "dark" | "light";

export type Profile = {
  id: string;
  email: string;
  full_name: string | null;
  avatar_url: string | null;
  role: UserRole;
  created_at: string;
  updated_at: string;
  last_seen_at: string | null;
};

export type AllowedEmail = {
  id: string;
  email: string;
  role: UserRole;
  is_active: boolean;
  invited_by: string | null;
  created_at: string;
  updated_at: string;
};

export type WorkspaceSettings = {
  id: boolean;
  project_name: string;
  logo_url: string | null;
  theme: ThemeMode;
  created_at: string;
  updated_at: string;
  updated_by: string | null;
};

export type PageRecord = {
  id: string;
  parent_page_id: string | null;
  title: string;
  icon: string;
  category: string;
  sort_order: number;
  content: Json;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
};

export type DocumentManager = {
  id: string;
  name: string;
  icon: string;
  description: string | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
};

export type Tag = {
  id: string;
  name: string;
  color: string;
  created_at: string;
};

export type DocumentRecord = {
  id: string;
  manager_id: string;
  parent_document_id: string | null;
  title: string;
  short_description: string | null;
  sort_order: number;
  status: DocumentStatus;
  priority: DocumentPriority;
  responsible_id: string | null;
  content: Json;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
  users?: Pick<Profile, "id" | "email" | "full_name" | "avatar_url"> | null;
  document_tags?: Array<{ tags: Tag | null }>;
};

export type InternalLinkTarget = {
  id: string;
  type: "page" | "document";
  title: string;
  subtitle: string | null;
  href: string;
  parentId: string | null;
};

export type PlanningSession = {
  id: string;
  title: string;
  session_date: string;
  start_time: string;
  end_time: string;
  description: string | null;
  objective: string | null;
  voice_url: string | null;
  status: SessionStatus;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
  planning_session_participants?: PlanningParticipant[];
};

export type PlanningParticipant = {
  id: string;
  session_id: string;
  user_id: string | null;
  participant_email: string | null;
  participant_name: string | null;
  users?: Pick<Profile, "id" | "email" | "full_name" | "avatar_url"> | null;
};

export type MediaItem = {
  id: string;
  title: string;
  type: MediaType;
  url: string;
  description: string | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
  media_item_tags?: Array<{ tags: Tag | null }>;
};

export const ROLE_LABELS: Record<UserRole, string> = {
  admin: "Admin",
  member: "Membre",
  reader: "Lecteur"
};

export const STATUS_LABELS: Record<DocumentStatus, string> = {
  todo: "À faire",
  in_progress: "En cours",
  review: "À revoir",
  done: "Terminé"
};

export const PRIORITY_LABELS: Record<DocumentPriority, string> = {
  low: "Faible",
  medium: "Moyenne",
  high: "Haute",
  critical: "Critique"
};

export const SESSION_STATUS_LABELS: Record<SessionStatus, string> = {
  planned: "Prévue",
  in_progress: "En cours",
  done: "Terminée",
  cancelled: "Annulée"
};

export const MEDIA_TYPE_LABELS: Record<MediaType, string> = {
  image: "Image",
  youtube: "YouTube",
  video: "Vidéo",
  document: "Document externe",
  link: "Lien utile"
};
