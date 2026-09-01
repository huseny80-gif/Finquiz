/* منطق التصحيح للأسئلة التفاعلية — منفصل عن الواجهة ليكون قابلاً للاختبار. */
(function (global) {
  'use strict';

  var DLP = global.DLP = global.DLP || {};

  function normalize(text) {
    return (DLP.utils ? DLP.utils.normalizeArabic(text)
                      : String(text === null || text === undefined ? '' : text).trim().toLowerCase());
  }

  function arraysEqual(a, b) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) { return false; }
    for (var i = 0; i < a.length; i++) { if (String(a[i]) !== String(b[i])) { return false; } }
    return true;
  }

  /**
   * تصحيح إجابة سؤال واحد.
   * @returns {{correct:boolean, answered:boolean, correctAnswer:*}}
   */
  function grade(question, response) {
    var result = { correct: false, answered: false, correctAnswer: correctAnswerOf(question) };
    if (response === null || response === undefined || response === '') { return result; }

    switch (question.type) {
      case 'mcq':
        result.answered = true;
        result.correct = Number(response) === Number(question.answer);
        break;

      case 'tf':
        result.answered = true;
        result.correct = Boolean(response === true || response === 'true') === Boolean(question.answer);
        break;

      case 'fill':
        result.answered = String(response).trim() !== '';
        var accepted = Array.isArray(question.answer) ? question.answer : [question.answer];
        var given = normalize(response);
        result.correct = accepted.some(function (option) { return normalize(option) === given; });
        break;

      case 'match':
        // response: مصفوفة من قيم right بترتيب pairs
        result.answered = Array.isArray(response) && response.filter(function (v) { return v; }).length === question.pairs.length;
        result.correct = result.answered && question.pairs.every(function (pair, i) {
          return normalize(response[i]) === normalize(pair.right);
        });
        break;

      case 'order':
        // response: مصفوفة العناصر بالترتيب الذي اختاره الدارس
        result.answered = Array.isArray(response) && response.length === question.items.length;
        result.correct = result.answered && arraysEqual(response, question.items);
        break;

      case 'open':
        // سؤال مفتوح (سيناريو/مقالي): لا إجابة "صحيحة" آلياً — تقييم ذاتي عبر معايير (rubric).
        result.answered = typeof response === 'string' && response.trim() !== '';
        result.correct = false;   // لا يُحتسب ضمن نسبة الصح/الخطأ في score()
        break;

      default:
        break;
    }
    return result;
  }

  /** الإجابة الصحيحة بصيغة قابلة للعرض. */
  function correctAnswerOf(question) {
    switch (question.type) {
      case 'mcq':   return question.options[question.answer];
      case 'tf':    return question.answer ? 'صح' : 'خطأ';
      case 'fill':  return Array.isArray(question.answer) ? question.answer[0] : question.answer;
      case 'match': return question.pairs.map(function (p) { return p.left + ' ← ' + p.right; }).join(' | ');
      case 'order': return question.items.join(' ← ');
      default:      return '';
    }
  }

  /**
   * حساب النتيجة الكلية من خريطة إجابات {questionId: response}.
   * الأسئلة المفتوحة (type:'open') تُحسب ضمن "answered" لكن تُستثنى من نسبة الصح/الخطأ
   * (لا إجابة صحيحة آلية لها) — عند غياب أسئلة مفتوحة يبقى السلوك مطابقاً تماماً للسابق.
   */
  function score(questions, responses) {
    var correct = 0;
    var answered = 0;
    var gradable = 0;
    var gradableAnswered = 0;
    questions.forEach(function (question) {
      var result = grade(question, responses[question.id]);
      if (result.answered) { answered += 1; }
      if (question.type !== 'open') {
        gradable += 1;
        if (result.answered) { gradableAnswered += 1; }
        if (result.correct) { correct += 1; }
      }
    });
    var total = questions.length;
    return {
      total: gradable,
      allTotal: total,
      answered: answered,
      gradableAnswered: gradableAnswered,
      correct: correct,
      wrong: gradableAnswered - correct,
      percent: gradable ? Math.round((correct / gradable) * 100) : 0
    };
  }

  /** تصفية الأسئلة حسب مستوى الصعوبة ('all' لكل المستويات). */
  function filterByDifficulty(questions, difficulty) {
    if (!difficulty || difficulty === 'all') { return questions.slice(); }
    return questions.filter(function (q) { return q.difficulty === difficulty; });
  }

  DLP.quiz = {
    grade: grade,
    score: score,
    correctAnswerOf: correctAnswerOf,
    filterByDifficulty: filterByDifficulty
  };

  if (typeof module !== 'undefined' && module.exports) { module.exports = DLP.quiz; }
})(typeof window !== 'undefined' ? window : globalThis);
