/* الطبقة الوحيدة المسموح لها بمخاطبة Supabase مباشرة (queries + RPC).
 * المكوّنات (assets/js/components/*.js) يجب ألا تستورد core/supabase.js مباشرة أبداً —
 * فقط عبر الدوال هنا. كل دالة هنا تُعيد Promise وتفشل بهدوء (تُرجع null/[] أو ترفض)
 * حين لا يوجد اتصال، حتى تستطيع core/store.js السقوط تلقائياً على البيانات الثابتة. */
(function (global) {
  'use strict';

  var DLP = global.DLP = global.DLP || {};

  function client() { return DLP.supabaseClient || null; }

  function isReady() { return !!client(); }

  /** يعيد Promise تُنفَّذ بالعميل الجاهز أو تُرفض بهدوء — لا ترمي أبداً بشكل متزامن،
   * حتى لا تكسر أي كود يستدعي دوال هذا الملف قبل أن تتحقق من isReady() أولاً. */
  function requireClient() {
    var c = client();
    if (!c) { return Promise.reject(new Error('Supabase غير متاح — لا يوجد اتصال مهيّأ')); }
    return Promise.resolve(c);
  }

  function unwrap(result) {
    if (result.error) { throw result.error; }
    return result.data;
  }

  /* -------------------------------------------------------------------- */
  /* قراءة المحتوى العام (بلا تسجيل دخول) — تعيد نفس أشكال data/subjects/*.js */
  /* -------------------------------------------------------------------- */

  /** يبني كائن ملف بنفس شكل {type,label,url} الذي يستهلكه fileChip() في
   * components/subject.js — مطابق تماماً لشكل data/subjects/*.js الثابت.
   * ملاحظة: لا Supabase Storage bucket فعلي بعد (انظر SUPABASE_MIGRATION_AUDIT.md) —
   * كل الملفات المبذورة اليوم تحمل مساراً ثابتاً نسبياً داخل public_url (نفس قيمة
   * url في البيانات الثابتة)؛ storage_path محجوز لمرحلة رفع فعلية لاحقة ولا يُستخدَم
   * هنا بعد لبناء رابط (لا توجد دالة تحويله إلى رابط عام دون bucket حقيقي).
   */
  function mapFile(row) {
    return { type: row.type, label: row.label, url: row.public_url || null };
  }

  function mapLecture(row, filesByLecture) {
    return {
      id: row.id, number: row.number, title: row.title, date: row.date,
      status: row.status, demo: row.demo, description: row.description,
      objectives: row.objectives || [], files: (filesByLecture[row.id] || []).map(mapFile)
    };
  }

  function mapSummary(row, filesBySummary) {
    return {
      id: row.id, lectureId: row.lecture_id, title: row.title, date: row.date,
      status: row.status, demo: row.demo,
      keyPoints: row.key_points || [], concepts: row.concepts || [], terms: row.terms || [],
      files: (filesBySummary[row.id] || []).map(mapFile)
    };
  }

  function mapAssignment(row, filesByAssignment) {
    return {
      id: row.id, title: row.title, difficulty: row.difficulty, date: row.date,
      due: row.due, status: row.status, demo: row.demo, description: row.description,
      files: (filesByAssignment[row.id] || []).map(mapFile)
    };
  }

  /** يستخرج رقم تسلسل السؤال من نهاية معرّفه ("rm-q1-13" → 13) لترتيب الأسئلة
   * بنفس تسلسل تأليفها الأصلي في data/subjects/*.js — كل معرّف سؤال في البذرة
   * ينتهي برقم صريح لهذا الغرض (مُتحقَّق: 164/164 معرّفاً يطابق النمط `\d+$` على
   * القاعدة الحية). معرّف بلا رقم في النهاية (لا يُفترض حدوثه) يُعامَل كـ0. */
  function questionSeq(id) {
    var m = /-(\d+)$/.exec(id || '');
    return m ? parseInt(m[1], 10) : 0;
  }

  /** خلط بسيط لمصفوفة (Fisher-Yates) — تُستخدم لتقديم عناصر order بترتيب لا يطابق
   * بالضرورة ترتيب التخزين الفعلي، حتى لا يكشف ترتيب الصفوف الفعلي (position مخفي
   * عن anon/authenticated لكن ترتيب إرجاع الصفوف نفسه قد يطابقه صدفة بلا هذا الخلط). */
  function shuffle(arr) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var tmp = a[i]; a[i] = a[j]; a[j] = tmp;
    }
    return a;
  }

  /** بناء سؤال واحد من صفّه + جداوله الفرعية (options/items/pairs) إن وُجدت.
   * ملاحظة أمنية: answer/rubric/explanation لا تصل هنا أبداً لمستخدم anon/authenticated
   * عادي — الأعمدة نفسها محجوبة على مستوى القاعدة (002_rls.sql). هذه الدالة تبني
   * تمثيلاً "للعرض قبل الإجابة" فقط؛ التصحيح الفعلي والشرح يأتيان لاحقاً عبر
   * reveal_question_answer/save_quiz_answer/check_answer بعد إجابة الطالب.
   * ملاحظة على match: pairsLeft/pairsRight (لا pairs) عمداً — لا ترابط بينهما في
   * هذا الشكل (get_match_pairs يعيدهما كمصفوفتين منفصلتين تماماً، انظر
   * supabase/migrations/007_safe_match_pairs_and_public_check.sql)، على عكس شكل
   * data/subjects/*.js الثابت الذي يحمل pairs:[{left,right}] مترابطة لأنه غير متصل
   * بقاعدة البيانات أصلاً. quiz-view.js يميّز بين الشكلين صراحة.
   */
  function mapQuestion(row, optionsByQuestion, itemsByQuestion, pairsByQuestion) {
    var q = {
      id: row.id, lectureId: row.lecture_id, type: row.type,
      difficulty: row.difficulty, prompt: row.prompt, kind: row.kind
    };
    if (row.type === 'mcq') {
      q.options = (optionsByQuestion[row.id] || []).map(function (o) { return o.label; });
    } else if (row.type === 'order') {
      // position (الترتيب الصحيح) محجوب عن anon/authenticated — لا نعتمد على ترتيب
      // إرجاع الصفوف (غير مضمون، وقد يطابق الترتيب الصحيح صدفة)؛ نخلطها صراحةً.
      q.items = shuffle((itemsByQuestion[row.id] || []).map(function (i) { return i.item_text; }));
    } else if (row.type === 'match') {
      var pairs = (pairsByQuestion && pairsByQuestion[row.id]) || { left: [], right: [] };
      q.pairsLeft = pairs.left || [];
      q.pairsRight = pairs.right || [];
    }
    return q;
  }

  function mapReference(row) {
    return {
      id: row.id, type: row.type, status: row.status, demo: row.demo,
      title: row.title, author: row.author, year: row.year,
      publisher: row.publisher, url: row.url, note: row.note
    };
  }

  function mapResource(row) {
    return {
      id: row.id, type: row.type, title: row.title, date: row.date,
      url: row.url, status: row.status, demo: row.demo
    };
  }

  function mapUpdate(row) {
    return {
      id: row.id, date: row.date, type: row.type, title: row.title,
      body: row.body, status: row.status, demo: row.demo
    };
  }

  function groupBy(rows, key) {
    var map = {};
    (rows || []).forEach(function (row) {
      var k = row[key];
      if (!map[k]) { map[k] = []; }
      map[k].push(row);
    });
    return map;
  }

  /** يجلب مادة واحدة كاملة (كل الأقسام السبعة) بشكل مطابق لكائن data/subjects/*.js. */
  function fetchSubjectContent(subjectRow) {
    var subjectId = subjectRow.id;

    return requireClient().then(function (c) { return fetchSubjectContentWith(c, subjectRow, subjectId); });
  }

  function fetchSubjectContentWith(c, subjectRow, subjectId) {
    return Promise.all([
      c.from('lectures').select('*').eq('subject_id', subjectId).order('number'),
      c.from('summaries').select('*').eq('subject_id', subjectId),
      c.from('assignments').select('*').eq('subject_id', subjectId),
      c.from('quizzes').select('*').eq('subject_id', subjectId),
      c.from('references').select('*').eq('subject_id', subjectId),
      c.from('resources').select('*').eq('subject_id', subjectId),
      c.from('updates').select('*').eq('subject_id', subjectId).order('date', { ascending: false }),
      // جدول files عديم الشكل (لا قيود أعمدة عليه، بخلاف questions) — يُجلَب مرة واحدة
      // لكل مادة ثم يُوزَّع محلياً على المحاضرات/الملخصات/الواجبات بمعرّفها، بدل استعلام
      // منفصل لكل صفّ (أداء).
      c.from('files').select('*').eq('subject_id', subjectId)
    ]).then(function (results) {
      var lectures = unwrap(results[0]) || [];
      var summaries = unwrap(results[1]) || [];
      var assignments = unwrap(results[2]) || [];
      var quizzes = unwrap(results[3]) || [];
      var references = unwrap(results[4]) || [];
      var resources = unwrap(results[5]) || [];
      var updates = unwrap(results[6]) || [];
      var files = unwrap(results[7]) || [];
      var filesByLecture = groupBy(files, 'lecture_id');
      var filesBySummary = groupBy(files, 'summary_id');
      var filesByAssignment = groupBy(files, 'assignment_id');

      var quizIds = quizzes.map(function (q) { return q.id; });
      if (!quizIds.length) {
        return assembleSubject(subjectRow, lectures, summaries, assignments,
          quizzes, [], {}, {}, {}, references, resources, updates,
          filesByLecture, filesBySummary, filesByAssignment);
      }

      // أعمدة questions محدَّدة صراحةً (لا select('*')): answer/rubric/explanation
      // محجوبة عن anon/authenticated على مستوى العمود (002_rls.sql) — select('*')
      // يفشل بـ 42501 لأنه يطلب أعمدة غير ممنوحة، لا يُرجع صفوفاً ناقصة بهدوء.
      return c.from('questions').select('id, quiz_id, lecture_id, type, difficulty, prompt, kind, status')
        .in('quiz_id', quizIds).then(function (qResult) {
        // لا عمود ترتيب صريح في questions، والاستعلام بلا order() لا يضمن أي ترتيب
        // معيَّن لصفوفه (لاحظنا فعلياً عبر CI حقيقي أن الترتيب لا يطابق تسلسل
        // data/subjects/*.js الأصلي) — معرّف كل سؤال ينتهي دائماً برقم تسلسله
        // الأصلي ("rm-q1-13")، فنرتّب به صراحةً في العميل بدل الاعتماد على ترتيب
        // القاعدة الافتراضي (غير المضمون، وغير الرقمي مقارنةً بمعرّفات نصية).
        var questions = (unwrap(qResult) || []).slice().sort(function (a, b) {
          return questionSeq(a.id) - questionSeq(b.id);
        });
        var questionIds = questions.map(function (q) { return q.id; });
        if (!questionIds.length) {
          return assembleSubject(subjectRow, lectures, summaries, assignments,
            quizzes, questions, {}, {}, {}, references, resources, updates,
            filesByLecture, filesBySummary, filesByAssignment);
        }
        var matchIds = questions.filter(function (q) { return q.type === 'match'; }).map(function (q) { return q.id; });
        return Promise.all([
          // is_correct محجوب عن anon/authenticated — لا نطلبه؛ position ممنوح هنا (خلافاً
          // لـquestion_items) فالترتيب بالـ.order('position') آمن وصحيح.
          c.from('question_options').select('id, question_id, position, label').in('question_id', questionIds).order('position'),
          // position محجوب عن anon/authenticated في question_items تحديداً (يحمل الترتيب
          // الصحيح لسؤال order) — لا يمكن حتى طلبه ضمن select ولا الترتيب به؛ سيفشل الاستعلام
          // بـ 42501 لو حاولنا. نجلب بلا ترتيب ونخلط العناصر لاحقاً في mapQuestion.
          c.from('question_items').select('id, question_id, item_text').in('question_id', questionIds),
          // question_pairs مقصور بالكامل على admin/instructor؛ العرض الآمن غير المترابط
          // يأتي فقط عبر get_match_pairs (RPC)، سؤالاً سؤالاً.
          Promise.all(matchIds.map(function (id) {
            return c.rpc('get_match_pairs', { p_question_id: id }).then(unwrap).then(function (pairs) {
              return { id: id, pairs: pairs || { left: [], right: [] } };
            });
          }))
        ]).then(function (subResults) {
          var options = unwrap(subResults[0]) || [];
          var items = unwrap(subResults[1]) || [];
          var pairsByQuestion = {};
          subResults[2].forEach(function (entry) { pairsByQuestion[entry.id] = entry.pairs; });
          return assembleSubject(subjectRow, lectures, summaries, assignments,
            quizzes, questions, groupBy(options, 'question_id'), groupBy(items, 'question_id'),
            pairsByQuestion, references, resources, updates,
            filesByLecture, filesBySummary, filesByAssignment);
        });
      });
    });
  }

  function assembleSubject(subjectRow, lectures, summaries, assignments, quizzes,
    questions, optionsByQuestion, itemsByQuestion, pairsByQuestion, references, resources, updates,
    filesByLecture, filesBySummary, filesByAssignment) {
    var questionsByQuiz = groupBy(questions, 'quiz_id');
    filesByLecture = filesByLecture || {};
    filesBySummary = filesBySummary || {};
    filesByAssignment = filesByAssignment || {};

    return {
      id: subjectRow.id, order: subjectRow.order, title: subjectRow.title,
      shortTitle: subjectRow.short_title, icon: subjectRow.icon, accent: subjectRow.accent,
      status: subjectRow.status, description: subjectRow.description,
      lectures: lectures.map(function (row) { return mapLecture(row, filesByLecture); }),
      summaries: summaries.map(function (row) { return mapSummary(row, filesBySummary); }),
      assignments: assignments.map(function (row) { return mapAssignment(row, filesByAssignment); }),
      quizzes: quizzes.map(function (quiz) {
        return {
          id: quiz.id, title: quiz.title, status: quiz.status, demo: quiz.demo,
          description: quiz.description,
          questions: (questionsByQuiz[quiz.id] || []).map(function (q) {
            return mapQuestion(q, optionsByQuestion, itemsByQuestion, pairsByQuestion);
          })
        };
      }),
      references: references.map(mapReference),
      resources: resources.map(mapResource),
      updates: updates.map(mapUpdate)
    };
  }

  /** يجلب كل المواد المنشورة، بترتيبها، بلا محتواها الداخلي (استعلام خفيف). */
  function fetchSubjectRows() {
    return requireClient().then(function (c) {
      return c.from('subjects').select('*').order('order').then(unwrap);
    });
  }

  /** يجلب المنصّة كاملة: { data: {subjectId: subject}, order: [subjectId, ...] }
   * بنفس الشكل الذي تبنيه <script> tags الثابتة في DLP.data/DLP.subjectOrder،
   * ليستهلكها core/store.js عبر hydrate() دون تعديل أي دالة عامة أخرى فيه. */
  function fetchAllContent() {
    return fetchSubjectRows().then(function (subjectRows) {
      return Promise.all(subjectRows.map(fetchSubjectContent)).then(function (subjects) {
        var data = {};
        var order = [];
        subjects.forEach(function (subject) { data[subject.id] = subject; order.push(subject.id); });
        return { data: data, order: order };
      });
    });
  }

  /* -------------------------------------------------------------------- */
  /* الاختبارات: دوال RPC آمنة — التصحيح يتم داخل قاعدة البيانات فقط         */
  /* (انظر supabase/migrations/003_functions.sql). تتطلب كلها مستخدماً مسجَّلاً. */
  /* -------------------------------------------------------------------- */

  function startQuizAttempt(quizId) {
    return requireClient().then(function (c) {
      return c.rpc('start_quiz_attempt', { p_quiz_id: quizId }).then(unwrap);
    });
  }

  function saveQuizAnswer(attemptId, questionId, response) {
    return requireClient().then(function (c) {
      return c.rpc('save_quiz_answer', {
        p_attempt_id: attemptId, p_question_id: questionId, p_response: response
      }).then(unwrap);
    });
  }

  function finishQuizAttempt(attemptId) {
    return requireClient().then(function (c) {
      return c.rpc('finish_quiz_attempt', { p_attempt_id: attemptId }).then(unwrap);
    });
  }

  /** تصحيح فوري بلا حفظ وبلا تسجيل دخول مطلوب (anon أو authenticated على حدٍّ سواء) —
   * لسؤال واحد بإجابة مرسلة صراحةً؛ لا تكشف بنك الإجابات (انظر
   * supabase/migrations/007_safe_match_pairs_and_public_check.sql). تُستخدم في
   * quiz-view.js لتصحيح الأسئلة القادمة من القاعدة حين لا يوجد مستخدم مسجَّل. */
  function checkAnswer(questionId, response) {
    return requireClient().then(function (c) {
      return c.rpc('check_answer', { p_question_id: questionId, p_response: response }).then(unwrap);
    });
  }

  /** يكشف الإجابة الصحيحة والشرح لسؤال واحد — لا يُستدعى إلا بعد أن يجيب الطالب عليه. */
  function revealQuestionAnswer(questionId) {
    return requireClient().then(function (c) {
      return c.rpc('reveal_question_answer', { p_question_id: questionId }).then(unwrap);
    });
  }

  function fetchStudentProgress(userId, subjectId) {
    return requireClient().then(function (c) {
      var query = c.from('student_progress').select('*').eq('user_id', userId);
      if (subjectId) { query = query.eq('subject_id', subjectId); }
      return query.then(unwrap);
    });
  }

  function fetchMyAttempts(userId) {
    return requireClient().then(function (c) {
      return c.from('quiz_attempts').select('*').eq('user_id', userId)
        .order('started_at', { ascending: false }).then(unwrap);
    });
  }

  /* -------------------------------------------------------------------- */
  /* سقالة الإدارة — قراءة + كتابة كاملة الآن (Phase D). كل دوال الكتابة       */
  /* أدناه لا تحمل أي حماية خاصة بها — الحماية الفعلية الوحيدة هي سياسات      */
  /* RLS *_write_admin الموجودة فعلاً (002_rls.sql): is_admin_or_instructor() */
  /* تُقيَّم على القاعدة لكل عملية INSERT/UPDATE/DELETE بصرف النظر عمّا يرسله  */
  /* العميل. أي مستخدم غير admin/instructor سيتلقّى 42501 من القاعدة نفسها    */
  /* لو حاول استدعاء أياً من هذه الدوال مباشرة (مثلاً من console المتصفح) —   */
  /* isAdminOrInstructor() في الواجهة تحسين تجربة استخدام فقط، لا حدّ أمان.   */
  /* -------------------------------------------------------------------- */

  /** فحص دور واجهي بحت (تحسين تجربة استخدام) — الحماية الفعلية دائماً في RLS
   * وGRANT/REVOKE على مستوى القاعدة، لا في هذا الفحص. مصدره has_role/
   * is_admin_or_instructor نفسهما المستخدَمان داخل كل سياسات RLS. */
  function isAdminOrInstructor() {
    return requireClient().then(function (c) {
      return c.rpc('is_admin_or_instructor').then(unwrap);
    }).catch(function () { return false; });
  }

  /** يعيد كل أسئلة اختبار واحد بكامل أعمدتها (بما فيها الإجابات) — يرفض
   * الخادم الطلب صراحةً (42501) لغير admin/instructor؛ انظر
   * supabase/migrations/005_admin_read_functions.sql. */
  function fetchQuizQuestionsAdmin(quizId) {
    return requireClient().then(function (c) {
      return c.rpc('admin_get_quiz_questions', { p_quiz_id: quizId }).then(unwrap);
    });
  }

  /** الجداول التي تحمل سياسة *_write_admin فعلاً (002_rls.sql) — أي طلب كتابة
   * لجدول خارج هذه القائمة يُرفَض هنا فوراً بلا استدعاء شبكة، بدل الاعتماد على
   * رفض القاعدة وحده (خطأ برمجي محلي أوضح من 42501 بعيد). */
  var ADMIN_WRITABLE_TABLES = ['subjects', 'lectures', 'summaries', 'assignments', 'quizzes',
    'references', 'resources', 'updates', 'files', 'questions',
    'question_options', 'question_items', 'question_pairs'];

  function assertWritable(table) {
    if (ADMIN_WRITABLE_TABLES.indexOf(table) === -1) {
      throw new Error('جدول غير مسموح بالكتابة عبر طبقة الإدارة: ' + table);
    }
  }

  /** يجلب صفوف جدول إداري مباشرةً (بمعزل عن DLP.data/hydrate) — تُستخدَم من
   * صفحات لوحة الإدارة لعرض أحدث نسخة من القاعدة فور كل عملية كتابة، بدل
   * الاعتماد على hydrate() (تُنعِش كل المنصة مرة واحدة عند التحميل فقط، لا
   * تصلح كآلية تحديث فوري بعد كل تعديل إداري صغير). filters كائن {عمود: قيمة}. */
  function adminList(table, filters, orderColumn) {
    return requireClient().then(function (c) {
      var query = c.from(table).select('*');
      Object.keys(filters || {}).forEach(function (key) { query = query.eq(key, filters[key]); });
      if (orderColumn) { query = query.order(orderColumn); }
      return query.then(unwrap);
    });
  }

  /** إدراج صفّ جديد، يعيد الصفّ كما خُزِّن فعلياً (بما فيه القيم الافتراضية
   * مثل id/created_at التي تولّدها القاعدة). */
  function adminInsert(table, data) {
    assertWritable(table);
    return requireClient().then(function (c) {
      return c.from(table).insert(data).select().then(unwrap).then(function (rows) {
        return (rows && rows[0]) || null;
      });
    });
  }

  /** تحديث جزئي لصفّ موجود بمعرّفه، يعيد الصفّ بعد التحديث. */
  function adminUpdate(table, id, patch) {
    assertWritable(table);
    return requireClient().then(function (c) {
      return c.from(table).update(patch).eq('id', id).select().then(unwrap).then(function (rows) {
        return (rows && rows[0]) || null;
      });
    });
  }

  function adminDelete(table, id) {
    assertWritable(table);
    return requireClient().then(function (c) {
      return c.from(table).delete().eq('id', id).then(unwrap);
    });
  }

  /** تغيير الحالة فقط (draft|published|archived) — غلاف رقيق فوق adminUpdate
   * لتوضيح القصد في نداءات الواجهة. */
  function adminSetStatus(table, id, status) {
    return adminUpdate(table, id, { status: status });
  }

  /** يتحقق هل توجد صفوف في childTable تشير إلى id عبر fkColumn — يُستخدم قبل
   * حذف مادة/محاضرة/اختبار لعرض تحذير واضح بدل حذف صامت يكسر علاقات (قاعدة
   * الحذف: "لا تسمح بحذف مادة مرتبطة بمحتوى دون تحذير واضح"). لا يمنع الحذف
   * بنفسه — يعيد فقط العدد ليقرّر المستدعي (الواجهة) كيف يُحذِّر المستخدم. */
  function adminCountReferences(childTable, fkColumn, id) {
    return requireClient().then(function (c) {
      return c.from(childTable).select('id', { count: 'exact', head: true }).eq(fkColumn, id)
        .then(function (result) {
          if (result.error) { throw result.error; }
          return result.count || 0;
        });
    });
  }

  /** يكتب حقل order لكل معرّف بترتيب المصفوفة (1-based) — لإعادة ترتيب
   * المواد/الأسئلة عبر أزرار "تحريك للأعلى/الأسفل" في لوحة الإدارة. */
  function adminReorder(table, orderColumn, orderedIds) {
    assertWritable(table);
    return requireClient().then(function (c) {
      return Promise.all(orderedIds.map(function (id, index) {
        var patch = {};
        patch[orderColumn] = index + 1;
        return c.from(table).update(patch).eq('id', id).then(unwrap);
      }));
    });
  }

  /** استبدال كامل لصفوف فرعية لسؤال واحد (question_options/items/pairs):
   * حذف كل الصفوف الحالية لهذا السؤال ثم إدراج القائمة الجديدة بأكملها.
   * ملاحظة صريحة: هذا حذف+إدراج منفصلان لا معاملة SQL واحدة (طبقة REST من
   * العميل لا تدعم معاملات متعددة الاستعلامات) — مقبول لاستخدام إداري
   * تسلسلي (مشرف واحد يحرر سؤالاً واحداً في كل مرة)، وغير آمن ضد تعديلين
   * متزامنين لنفس السؤال بالضبط؛ هذا خطر مقبول لنطاق الاستخدام الحالي (لوحة
   * إدارة داخلية بعدد مشرفين محدود)، لا افتراضاً يُخفى. */
  function adminReplaceQuestionChildren(childTable, questionId, rows) {
    assertWritable(childTable);
    return requireClient().then(function (c) {
      return c.from(childTable).delete().eq('question_id', questionId).then(unwrap).then(function () {
        if (!rows || !rows.length) { return []; }
        var withQid = rows.map(function (row) {
          var copy = {};
          for (var key in row) { if (row.hasOwnProperty(key)) { copy[key] = row[key]; } }
          copy.question_id = questionId;
          return copy;
        });
        return c.from(childTable).insert(withQid).select().then(unwrap);
      });
    });
  }

  DLP.api = {
    isReady: isReady,
    fetchAllContent: fetchAllContent,
    fetchSubjectRows: fetchSubjectRows,
    fetchSubjectContent: fetchSubjectContent,
    startQuizAttempt: startQuizAttempt,
    saveQuizAnswer: saveQuizAnswer,
    finishQuizAttempt: finishQuizAttempt,
    checkAnswer: checkAnswer,
    revealQuestionAnswer: revealQuestionAnswer,
    fetchStudentProgress: fetchStudentProgress,
    fetchMyAttempts: fetchMyAttempts,
    isAdminOrInstructor: isAdminOrInstructor,
    fetchQuizQuestionsAdmin: fetchQuizQuestionsAdmin,
    adminList: adminList,
    adminInsert: adminInsert,
    adminUpdate: adminUpdate,
    adminDelete: adminDelete,
    adminSetStatus: adminSetStatus,
    adminCountReferences: adminCountReferences,
    adminReorder: adminReorder,
    adminReplaceQuestionChildren: adminReplaceQuestionChildren
  };

  if (typeof module !== 'undefined' && module.exports) { module.exports = DLP.api; }
})(typeof window !== 'undefined' ? window : globalThis);
