/** Where a document can be saved: a server's workspaces, or the storage bucket. */
export type CloudSaveDestination =
  | {
      kind: 'cloud'
      serverId: string
      host: string
      workspaces: { id: string; name: string; role: 'viewer' | 'editor' | 'admin' }[]
    }
  | { kind: 'storage'; providerId: string; label: string }

export type CloudSaveState =
  | { kind: 'ready' }
  | { kind: 'saving'; sentBytes: number; totalBytes: number }
  | { kind: 'error'; reason: 'too-large'; limitBytes: number }
  | { kind: 'error'; reason: 'quota' | 'offline' | 'unavailable' }
