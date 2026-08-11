import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const cle = import.meta.env.VITE_SUPABASE_CLE

if (!url || !cle) {
  throw new Error(
    "Configuration manquante : VITE_SUPABASE_URL et VITE_SUPABASE_CLE doivent être définies (voir .env.example)."
  )
}

export const supabase = createClient(url, cle, {
  auth: { persistSession: true, autoRefreshToken: true },
})
