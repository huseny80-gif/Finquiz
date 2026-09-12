-- ============================================================================
-- 011_private_bucket_signed_urls.sql — PHASE B.1: تصحيح أمني — Bucket
-- course-files كان public=true، وهذا يتجاوز RLS تماماً لعمليات القراءة/التنزيل
-- (موثَّق رسمياً في وثائق Supabase: "When a bucket is designated as 'Public,'
-- it effectively bypasses access controls for both retrieving and serving
-- files within the bucket" — أي أن أي شخص يعرف/يخمّن storage_path يصل إلى
-- الملف مباشرة، حتى لو كان صفّ files المرتبط به status='draft' ومحجوباً في
-- جدول files نفسه عبر content_read_published. سياسة course_files_read لم تكن
-- توفر أي حماية فعلية على الإطلاق لبَكِت عام — كانت زخرفية بحتة.
--
-- الإصلاح: البكِت يصبح private، وتصبح القراءة الفعلية (تنزيل/رابط موقَّع) خاضعة
-- لسياسة RLS تربط storage.objects.name (= files.storage_path حرفياً، بلا بادئة
-- الـBucket) بحالة صفّ files المطابق فعلياً — بالضبط نفس القاعدة المطبَّقة على
-- جدول files نفسه (content_read_published: status='published' أو admin/instructor).
-- core/api.js يتحول من getPublicUrl (متزامن، بلا شبكة) إلى createSignedUrl
-- (غير متزامن، يتطلّب اجتياز RLS SELECT هذه فعلياً وقت الطلب — موثَّق في وثائق
-- Supabase: "all operations are subject to access control via RLS policies.
-- This also applies when downloading assets" لأي bucket خاص).
-- ============================================================================

update storage.buckets set public = false where id = 'course-files';

-- فهرس بحث بسيط: كل رابط موقَّع يبحث عن صفّ files بمطابقة storage_path حرفياً —
-- جدول files صغير حالياً فلا يحتاجه أداءً، لكنه صحيح ورخيص ولا يغيّر أي سلوك.
create index if not exists idx_files_storage_path on files(storage_path) where storage_path is not null;

drop policy if exists course_files_read on storage.objects;
create policy course_files_read on storage.objects
  for select using (
    bucket_id = 'course-files' and (
      public.is_admin_or_instructor()
      or exists (
        select 1 from files f
        where f.storage_path = storage.objects.name
          and f.status = 'published'
      )
    )
  );

-- سياسات الكتابة (INSERT/UPDATE/DELETE) من 010_storage_bucket_and_file_columns.sql
-- لا تتغيّر — كانت أصلاً admin/instructor فقط عبر public.is_admin_or_instructor()،
-- وهذا لم يكن جزءاً من مشكلة public=true (التي تخص القراءة فقط؛ الكتابة كانت
-- محكومة بـRLS فعلياً في كل الأحوال، موثَّق رسمياً: "Access control is still
-- enforced for other types of operations including uploading, deleting, moving,
-- and copying" حتى في bucket عام).
