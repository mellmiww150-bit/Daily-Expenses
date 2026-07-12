
CREATE POLICY "public slip read" ON storage.objects FOR SELECT USING (bucket_id = 'slips');
CREATE POLICY "public slip insert" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'slips');
