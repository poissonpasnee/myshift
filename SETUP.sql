-- ═══════════════════════════════════════════════════════════
-- MyShift AI — Supabase SQL Setup
-- Coller dans : Supabase > SQL Editor > New Query
-- ═══════════════════════════════════════════════════════════

-- 1. Créer la table
CREATE TABLE IF NOT EXISTS shifts (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  date        date NOT NULL,
  status      text,
  note        text,
  imported    boolean DEFAULT false,
  created_at  timestamptz DEFAULT now(),
  UNIQUE(user_id, date)
);

-- 2. Activer RLS
ALTER TABLE shifts ENABLE ROW LEVEL SECURITY;

-- 3. Politique : chaque utilisateur gère uniquement ses données
CREATE POLICY "Users manage own shifts"
  ON shifts FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 4. Index de performance
CREATE INDEX IF NOT EXISTS idx_shifts_user_date ON shifts(user_id, date);
