-- Update sick-notes bucket file size limit: 5 MB → 1 MB
UPDATE storage.buckets
SET file_size_limit = 1048576
WHERE id = 'sick-notes';
