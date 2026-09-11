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

  function mapLecture(row) {
    return {
      id: row.id, number: row.number, title: row.title, date: row.date,
      status: row.status, demo: row.demo, description: row.description,
      objectives: row.objectives || [], files: []
    };
  }

  function mapSummary(row) {
    return {
      id: row.id, lectureId: row.lecture_id, title: row.title, date: row.date,
      status: row.status, demo: row.demo,
      keyPoints: row.key_points || [], concepts: row.concepts || [], terms: row.terms || [],
      files: []
    };
  }

  function mapAssignment(row) {
    return {
      id: row.id, title: row.title, difficulty: row.difficulty, date: row.date,
      due: row.due, status: row.status, demo: row.demo, description: row.description, files: []
    };
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
      c.from('updates').select('*').eq('subject_id', subjectId).order('date', { ascending: false })
    ]).then(function (results) {
      var lectures = unwrap(results[0]) || [];
      var summaries = unwrap(results[1]) || [];
      var assignments = unwrap(results[2]) || [];
      var quizzes = unwrap(results[3]) || [];
      var references = unwrap(results[4]) || [];
      var resources = unwrap(results[5]) || [];
      var updates = unwrap(results[6]) || [];

      var quizIds = quizzes.map(function (q) { return q.id; });
      if (!quizIds.length) {
        return assembleSubject(subjectRow, lectures, summaries, assignments,
          quizzes, [], {}, {}, {}, references, resources, updates);
      }

      // أعمدة questions محدَّدة صراحةً (لا select('*')): answer/rubric/explanation
      // محجوبة عن anon/authenticated على مستوى العمود (002_rls.sql) — select('*')
      // يفشل بـ 42501 لأنه يطلب أعمدة غير ممنوحة، لا يُرجع صفوفاً ناقصة بهدوء.
      return c.from('questions').select('id, quiz_id, lecture_id, type, difficulty, prompt, kind, status')
        .in('quiz_id', quizIds).then(function (qResult) {
        var questions = unwrap(qResult) || [];
        var questionIds = questions.map(function (q) { return q.id; });
        if (!questionIds.length) {
          return assembleSubject(subjectRow, lectures, summaries, assignments,
            quizzes, questions, {}, {}, {}, references, resources, updates);
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
            pairsByQuestion, references, resources, updates);
        });
      });
    });
  }

  function assembleSubject(subjectRow, lectures, summaries, assignments, quizzes,
    questions, optionsByQuestion, itemsByQuestion, pairsByQuestion, references, resources, updates) {
    var questionsByQuiz = groupBy(questions, 'quiz_id');

    return {
      id: subjectRow.id, order: subjectRow.order, title: subjectRow.title,
      shortTitle: subjectRow.short_title, icon: subjectRow.icon, accent: subjectRow.accent,
      status: subjectRow.status, description: subjectRow.description,
      lectures: lectures.map(mapLecture),
      summaries: summaries.map(mapSummary),
      assignments: assignments.map(mapAssignment),
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
  /* سقالة الإدارة (Stage 4) — قراءة فقط. الكتابة تبقى عبر RLS مباشرة        */
  /* (content_write_admin/questions_write_admin/... في 002_rls.sql) في مرحلة */
  /* لاحقة؛ لا نماذج تحرير/حذف هنا بعد.                                     */
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
    fetchQuizQuestionsAdmin: fetchQuizQuestionsAdmin
  };

  if (typeof module !== 'undefined' && module.exports) { module.exports = DLP.api; }
})(typeof window !== 'undefined' ? window : globalThis);
