import * as Y from "yjs";
import {
  Awareness,
  applyAwarenessUpdate,
  encodeAwarenessUpdate
} from "y-protocols/awareness";
import { createClient } from "@/lib/supabase/browser";

type RealtimeChannel = ReturnType<ReturnType<typeof createClient>["channel"]>;

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
  private channel: RealtimeChannel;
  private doc: Y.Doc;
  private origin = {};
  private subscribed = false;

  constructor({
    doc,
    room
  }: {
    doc: Y.Doc;
    room: string;
  }) {
    this.doc = doc;
    this.awareness = new Awareness(doc);
    const supabase = createClient();
    this.channel = supabase.channel(room, {
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
        this.sendBroadcast("yjs-update", {
          update: uint8ToBase64(Y.encodeStateAsUpdate(this.doc))
        });
      })
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          this.subscribed = true;
          this.sendBroadcast("sync-request", {});
          return;
        }

        this.subscribed = false;
      });
  }

  destroy() {
    this.subscribed = false;
    this.doc.off("update", this.handleLocalDocumentUpdate);
    this.awareness.off("update", this.handleLocalAwarenessUpdate);
    this.awareness.destroy();
    void this.channel.unsubscribe();
  }

  private handleLocalDocumentUpdate = (update: Uint8Array, origin: unknown) => {
    if (origin === this.origin) {
      return;
    }

    this.sendBroadcast("yjs-update", {
      update: uint8ToBase64(update)
    });
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
}
