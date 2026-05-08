import * as Y from "yjs";
import {
  Awareness,
  applyAwarenessUpdate,
  encodeAwarenessUpdate
} from "y-protocols/awareness";
import type { EditorTargetType } from "@/lib/editor-content";
import { createClient } from "@/lib/supabase/browser";

type RealtimeChannel = ReturnType<ReturnType<typeof createClient>["channel"]>;
type SupabaseBrowserClient = ReturnType<typeof createClient>;

function uint8ToBase64(update: Uint8Array) {
  let binary = "";
  const chunkSize = 0x8000;

  for (let index = 0; index < update.length; index += chunkSize) {
    const chunk = update.subarray(index, index + chunkSize);
    binary += String.fromCharCode(...chunk);
  }

  return btoa(binary);
}

function base64ToUint8(value: string) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
}

export class SupabaseYjsProvider {
  awareness: Awareness;
  ready: Promise<void>;
  hasPersistedState = false;
  private channel: RealtimeChannel;
  private doc: Y.Doc;
  private origin = {};
  private persistTimer: ReturnType<typeof setTimeout> | null = null;
  private room: string;
  private supabase: SupabaseBrowserClient;
  private subscribed = false;
  private targetId: string;
  private targetType: EditorTargetType;
  private userId: string;
  private writable: boolean;

  constructor({
    doc,
    room,
    targetId,
    targetType,
    userId,
    writable = true
  }: {
    doc: Y.Doc;
    room: string;
    targetId: string;
    targetType: EditorTargetType;
    userId: string;
    writable?: boolean;
  }) {
    this.doc = doc;
    this.awareness = new Awareness(doc);
    this.room = room;
    this.targetId = targetId;
    this.targetType = targetType;
    this.userId = userId;
    this.writable = writable;
    this.supabase = createClient();
    this.ready = this.loadPersistedState();
    this.channel = this.supabase.channel(room, {
      config: {
        broadcast: {
          ack: false,
          self: false
        }
      }
    });

    this.doc.on("update", this.handleLocalDocumentUpdate);
    this.awareness.on("update", this.handleLocalAwarenessUpdate);

    this.channel
      .on("broadcast", { event: "yjs-update" }, ({ payload }) => {
        if (typeof payload?.update === "string") {
          Y.applyUpdate(this.doc, base64ToUint8(payload.update), this.origin);
        }
      })
      .on("broadcast", { event: "awareness-update" }, ({ payload }) => {
        if (typeof payload?.update === "string") {
          applyAwarenessUpdate(this.awareness, base64ToUint8(payload.update), this.origin);
        }
      })
      .on("broadcast", { event: "sync-request" }, () => {
        void this.ready.then(() => {
          this.sendBroadcast("yjs-update", {
            update: uint8ToBase64(Y.encodeStateAsUpdate(this.doc))
          });
        });
      })
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          this.subscribed = true;
          void this.ready.then(() => {
            this.sendBroadcast("sync-request", {});
          });
          return;
        }

        this.subscribed = false;
      });
  }

  destroy() {
    this.subscribed = false;
    if (this.persistTimer) {
      clearTimeout(this.persistTimer);
      this.persistTimer = null;
    }
    void this.persistState().catch((error) => {
      console.error("[editor-yjs] Failed to persist state on destroy", error);
    });
    this.doc.off("update", this.handleLocalDocumentUpdate);
    this.awareness.off("update", this.handleLocalAwarenessUpdate);
    this.awareness.destroy();
    void this.channel.unsubscribe();
  }

  async persistState() {
    if (!this.writable) {
      return;
    }

    const { error } = await this.supabase.from("editor_collaboration_states").upsert(
      {
        room: this.room,
        target_type: this.targetType,
        target_id: this.targetId,
        state_update_base64: uint8ToBase64(Y.encodeStateAsUpdate(this.doc)),
        updated_by: this.userId
      },
      {
        onConflict: "room"
      }
    );

    if (error) {
      throw new Error(error.message);
    }
  }

  private handleLocalDocumentUpdate = (update: Uint8Array, origin: unknown) => {
    if (origin === this.origin) {
      return;
    }

    this.sendBroadcast("yjs-update", {
      update: uint8ToBase64(update)
    });
    this.scheduleStatePersist();
  };

  private handleLocalAwarenessUpdate = (
    changes: { added: number[]; updated: number[]; removed: number[] },
    origin: unknown
  ) => {
    if (origin === this.origin) {
      return;
    }

    const changedClients = [...changes.added, ...changes.updated, ...changes.removed];

    if (changedClients.length === 0) {
      return;
    }

    this.sendBroadcast("awareness-update", {
      update: uint8ToBase64(encodeAwarenessUpdate(this.awareness, changedClients))
    });
  };

  private sendBroadcast(event: string, payload: Record<string, unknown>) {
    if (this.subscribed) {
      void this.channel.send({
        type: "broadcast",
        event,
        payload
      });
      return;
    }

    void this.channel.httpSend(event, payload);
  }

  private async loadPersistedState() {
    const { data, error } = await this.supabase
      .from("editor_collaboration_states")
      .select("state_update_base64")
      .eq("room", this.room)
      .maybeSingle();

    if (error) {
      console.error("[editor-yjs] Failed to load persisted state", error);
      return;
    }

    if (typeof data?.state_update_base64 === "string" && data.state_update_base64.length > 0) {
      Y.applyUpdate(this.doc, base64ToUint8(data.state_update_base64), this.origin);
      this.hasPersistedState = true;
    }
  }

  private scheduleStatePersist() {
    if (!this.writable) {
      return;
    }

    if (this.persistTimer) {
      clearTimeout(this.persistTimer);
    }

    this.persistTimer = setTimeout(() => {
      this.persistTimer = null;
      void this.persistState().catch((error) => {
        console.error("[editor-yjs] Failed to persist state", error);
      });
    }, 900);
  }
}
