/**
 * Small notification points the UI calls after local changes; the sync engine
 * subscribes to them (wired in group 8).
 */
type Listener = (reason: SyncReason) => void;
export type SyncReason = 'change' | 'event-closed' | 'manual' | 'online' | 'foreground';

const listeners = new Set<Listener>();

export function onSyncRequest(l: Listener): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

function emit(reason: SyncReason) {
  for (const l of listeners) l(reason);
}

export const onLocalChange = () => emit('change');
export const onEventClosed = () => emit('event-closed');
