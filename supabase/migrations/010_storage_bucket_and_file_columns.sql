-- ============================================================================
-- 010_storage_bucket_and_file_columns.sql — Phase B: Supabase Storage + إكمال
-- أعمدة metadata جدول files.
--
-- الجدول files نفسه لا يُعاد هيكلته (قرار موثَّق في SUPABASE_MIGRATION_AUDIT.md
-- §4.1 — الإبقاء على جدول واحد عديم الشكل بدل lecture_files/summary_files/
-- assignment_files منفصلة). هذه الهجرة فقط:
--   1) تضيف عمودين ناقصين فعلياً (file_name، external_url) لم يكونا موجودين.
--   2) تمنع تعارض storage_path/external_url معاً على نفس الصفّ.
--   3) تُنشئ Bucket واحداً (course-files) وسياساته.
-- ============================================================================

-- file_name: اسم الملف الفعلي (مثال: "Ai-week1-week2.pdf") — منفصل عمداً عن
-- label (نص وصفي عربي يُعرَض للطالب، مثل "ملف المحاضرة (PDF)"). العمودان كانا
-- مُدمَجين خطأً في name (البذرة الحالية تكرّر نص label بالضبط في name — ليس
-- خللاً في هذه الهجرة، بل حالة قائمة فعلاً في 45 صفاً مبذولة، تبقى كما هي).
alter table files add column if not exists file_name text;

-- external_url: رابط خارجي صريح (YouTube/Google Drive/أي رابط خارجي) —
-- منفصل عن public_url المستخدَم اليوم فعلياً لحمل مسارات ثابتة نسبية
-- (`files/<subject>/...`) للبيانات المبذورة من data/subjects/*.js؛ لا نُعيد
-- تسمية public_url ولا نُهاجر الـ45 صفاً الحالية لتفادي مخاطرة غير ضرورية على
-- بيانات حية تعمل بشكل صحيح فعلاً (mapFile في api.js تقرأ public_url أولاً
-- للتوافق العكسي، ثم external_url، ثم storage_path المُحلَّل — انظر تحديث
-- api.js المرافق لهذه الهجرة).
alter table files add column if not exists external_url text;

-- لا يجوز أن يحمل صفّ واحد storage_path وexternal_url معاً (كل ملف إمّا مرفوع
-- فعلياً إلى Storage، أو رابط خارجي/ثابت — لا الاثنان). لا يُلزم أياً منهما
-- بالوجود (public_url القديم يبقى كافياً وحده للصفوف المبذورة الحالية).
alter table files drop constraint if exists files_storage_xor_external;
alter table files add constraint files_storage_xor_external
  check (storage_path is null or external_url is null);

-- ============================================================================
-- Storage bucket: course-files
-- ============================================================================
-- حدود مقصودة: 20MB لكل ملف، وأنواع MIME محدودة صراحةً لمستندات/عروض/صور
-- شائعة فقط — بلا فيديو إطلاقاً. فيديو (محاضرات مسجَّلة مثلاً) يجب أن يُستضاف
-- خارجياً (YouTube/Vimeo/Google Drive) عبر external_url، لا رفعاً هنا — يمنع
-- تخزين ملفات ضخمة في Storage بلا داعٍ (قاعدة "الملفات الكبيرة" في الطلب).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'course-files', 'course-files', true, 20971520,
  array[
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'image/png', 'image/jpeg', 'image/webp', 'image/gif'
  ]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- ----------------------------------------------------------------------------
-- سياسات storage.objects
--
-- قرار أمني موثَّق صراحةً (بديل عن الطلب الحرفي "قراءة محكومة بحالة النشر على
-- مستوى Storage"): الـbucket عام (public=true) عمداً. السبب تقني لا تفضيلي:
-- روابط الملفات في الواجهة عناصر <a href> عادية (نفس نمط data/subjects/*.js
-- الثابت تماماً) بلا أي رأس Authorization/apikey يرفقه المتصفح عند نقرة
-- مستخدم عادية؛ Bucket خاص (private) يتطلّب naming روابط مُوقَّعة
-- (createSignedUrl، صالحة لمدة محدودة) تُولَّد بطلب غير متزامن إضافي لكل ملف
-- عند كل عرض صفحة — تعقيد ووقت استجابة إضافيان غير مبرَّرين لنطاق Phase B،
-- ويتطلبان Edge Function منفصلة (خارج نطاق هذه المرحلة). الحماية الفعلية
-- لإخفاء ملفات المحتوى غير المنشور (draft) تبقى على مستوى جدول files نفسه:
-- content_read_published (002_rls.sql) يمنع عرض صفّ الملف أصلاً لغير
-- admin/instructor، فرابطه في Storage لا يُكشَف لأي مستخدم غير مصرَّح به عبر
-- أي مسار شرعي في الواجهة — تماماً كما تعمل الملفات الثابتة اليوم (لا حماية
-- على مستوى الملف نفسه، فقط على مستوى إظهار رابطه). توثيق كامل في
-- SUPABASE_SECURITY.md.
--
-- الكتابة (رفع/تعديل/حذف) هي القيد الفعلي القابل للتطبيق فعلياً هنا، ومُطبَّق:
-- admin/instructor فقط، عبر public.is_admin_or_instructor() نفسها المستخدَمة
-- في كل سياسات RLS الأخرى للمشروع.
-- ----------------------------------------------------------------------------

drop policy if exists course_files_read on storage.objects;
create policy course_files_read on storage.objects
  for select using (bucket_id = 'course-files');

drop policy if exists course_files_write_admin on storage.objects;
create policy course_files_write_admin on storage.objects
  for insert with check (bucket_id = 'course-files' and public.is_admin_or_instructor());

drop policy if exists course_files_update_admin on storage.objects;
create policy course_files_update_admin on storage.objects
  for update using (bucket_id = 'course-files' and public.is_admin_or_instructor())
  with check (bucket_id = 'course-files' and public.is_admin_or_instructor());

drop policy if exists course_files_delete_admin on storage.objects;
create policy course_files_delete_admin on storage.objects
  for delete using (bucket_id = 'course-files' and public.is_admin_or_instructor());
