export type SyncBus = {
  isSyncing: boolean;
  a?: HTMLDivElement | null;
  b?: HTMLDivElement | null;
};

const syncBus: Record<string, SyncBus> = {};

export function bindSyncScroll(id: string, el: HTMLDivElement | null, side: "a" | "b") {
  if (!syncBus[id]) syncBus[id] = { isSyncing: false };
  syncBus[id][side] = el;
}

export function syncScroll(id: string, source: "a" | "b") {
  const bus = syncBus[id];
  if (!bus || bus.isSyncing) return;

  const from = source === "a" ? bus.a : bus.b;
  const to = source === "a" ? bus.b : bus.a;
  if (!from || !to) return;

  bus.isSyncing = true;
  to.scrollTop = from.scrollTop;

  requestAnimationFrame(() => {
    bus.isSyncing = false;
  });
}
