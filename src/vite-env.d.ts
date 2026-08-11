/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string
  readonly VITE_SUPABASE_CLE: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
