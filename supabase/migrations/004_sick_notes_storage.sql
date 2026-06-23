-- ============================================================
-- Sick notes storage bucket + RLS policies
-- Run this in Supabase SQL Editor (as service role)
-- ============================================================

-- Create private bucket for sick note documents
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'sick-notes',
  'sick-notes',
  false,
  5242880,  -- 5 MB
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf']
)
ON CONFLICT (id) DO NOTHING;

-- Employees can upload files under their own user_id folder
CREATE POLICY "sick_notes_insert"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'sick-notes'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- Employees can read their own files (for preview)
CREATE POLICY "sick_notes_select"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'sick-notes'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- Employees can delete their own files
CREATE POLICY "sick_notes_delete"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'sick-notes'
  AND (storage.foldername(name))[1] = auth.uid()::text
);
