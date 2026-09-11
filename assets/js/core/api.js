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

  /** بناء سؤال واحد من صفّه + جداوله الفرعية (options/pairs/items) إن وُجدت.
   * ملاحظة أمنية: answer/rubric/explanation لا تصل هنا أبداً لمستخدم anon/authenticated
   * عادي — الأعمدة نفسها محجوبة على مستوى القاعدة (002_rls.sql). هذه الدالة تبني
   * تمثيلاً "للعرض قبل الإجابة" فقط؛ التصحيح الفعلي والشرح يأتيان لاحقاً عبر
   * reveal_question_answer/save_quiz_answer بعد إجابة الطالب (Stage 2).
   */
  function mapQuestion(row, optionsByQuestion, itemsByQuestion) {
    var q = {
      id: row.id, lectureId: row.lecture_id, type: row.type,
      difficulty: row.difficulty, prompt: row.prompt, kind: row.kind
    };
    if (row.type === 'mcq') {
      q.options = (optionsByQuestion[row.id] || []).map(function (o) { return o.label; });
    } else if (row.type === 'order') {
      q.items = (itemsByQuestion[row.id] || []).map(function (i) { return i.item_text; });
    } else if (row.type === 'match') {
      // question_pairs مقصور على admin/instructor حالياً (TODO موثّق في
      // supabase/migrations/002_rls.sql وDATABASE_SCHEMA.md) — لا يمكن لطالب
      // عادي قراءته بعد؛ نُبقي pairs فارغة بدل رمي خطأ يكسر بقية المادة.
      q.pairs = [];
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
          quizzes, [], {}, {}, references, resources, updates);
      }

      return c.from('questions').select('*').in('quiz_id', quizIds).then(function (qResult) {
        var questions = unwrap(qResult) || [];
        var questionIds = questions.map(function (q) { return q.id; });
        if (!questionIds.length) {
          return assembleSubject(subjectRow, lectures, summaries, assignments,
            quizzes, questions, {}, {}, references, resources, updates);
        }
        return Promise.all([
          c.from('question_options').select('*').in('question_id', questionIds).order('position'),
          c.from('question_items').select('*').in('question_id', questionIds).order('position')
        ]).then(function (subResults) {
          var options = unwrap(subResults[0]) || [];
          var items = unwrap(subResults[1]) || [];
          return assembleSubject(subjectRow, lectures, summaries, assignments,
            quizzes, questions, groupBy(options, 'question_id'), groupBy(items, 'question_id'),
            references, resources, updates);
        });
      });
    });
  }

  function assembleSubject(subjectRow, lectures, summaries, assignments, quizzes,
    questions, optionsByQuestion, itemsByQuestion, references, resources, updates) {
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
            return mapQuestion(q, optionsByQuestion, itemsByQuestion);
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

  DLP.api = {
    isReady: isReady,
    fetchAllContent: fetchAllContent,
    fetchSubjectRows: fetchSubjectRows,
    fetchSubjectContent: fetchSubjectContent,
    startQuizAttempt: startQuizAttempt,
    saveQuizAnswer: saveQuizAnswer,
    finishQuizAttempt: finishQuizAttempt,
    revealQuestionAnswer: revealQuestionAnswer,
    fetchStudentProgress: fetchStudentProgress,
    fetchMyAttempts: fetchMyAttempts
  };

  if (typeof module !== 'undefined' && module.exports) { module.exports = DLP.api; }
})(typeof window !== 'undefined' ? window : globalThis);
