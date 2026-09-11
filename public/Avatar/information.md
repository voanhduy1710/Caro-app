# Personal Mascot Supabase Storage

Uploaded on: 2026-06-02

Supabase storage destination:

- Bucket: `personal-mascot`
- Bucket visibility: public
- Object location: bucket root, one GIF per mascot
- Public base URL: `https://liwmfrmbuetrbhqhjzjn.supabase.co/storage/v1/object/public/personal-mascot`
- Example public object URL: `https://liwmfrmbuetrbhqhjzjn.supabase.co/storage/v1/object/public/personal-mascot/Agni.gif`

The local source folder is:

`frontend/public/personal_mascot`

The website should use the Supabase bucket as the mascot source. Personnel choose their mascot from `/profile`; the selected mascot is saved on their profile record and shown inside profile links.
