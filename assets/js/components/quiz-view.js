/* واجهة الأسئلة التفاعلية: عرض سؤال واحد في كل مرة مع تصحيح وتفسير ونتيجة. */
(function (global) {
  'use strict';

  var DLP = global.DLP = global.DLP || {};
  var t = function (k, f) { return DLP.i18n.t(k, f); };
  var esc = function (v) { return DLP.utils.escapeHtml(v); };
  var LETTERS = ['أ', 'ب', 'ج', 'د', 'هـ', 'و'];

  var states = {};   // quizId -> state

  function createState(quiz) {
    return {
      quiz: quiz,
      difficulty: 'all',
      questions: quiz.questions.slice(),
      index: 0,
      responses: {},
      checked: {},
      finished: false
    };
  }

  function getState(quiz) {
    if (!states[quiz.id]) { states[quiz.id] = createState(quiz); }
    return states[quiz.id];
  }

  function resetStates() { states = {}; }

  function current(state) { return state.questions[state.index]; }

  /* ------------------------- رسم أنواع الأسئلة ------------------------- */

  function renderMcq(state, question) {
    var response = state.responses[question.id];
    var checked = state.checked[question.id];
    var graded = checked ? DLP.quiz.grade(question, response) : null;
    return '<div class="opt-list" role="group" aria-label="خيارات الإجابة">' +
      question.options.map(function (option, i) {
        var classes = ['opt'];
        var mark = '';
        if (checked) {
          if (i === question.answer) { classes.push('is-correct'); mark = '✓'; }
          else if (Number(response) === i && !graded.correct) { classes.push('is-wrong'); mark = '✕'; }
        }
        return '<button type="button" class="' + classes.join(' ') + '" data-answer="mcq" data-value="' + i + '"' +
          ' aria-pressed="' + (Number(response) === i ? 'true' : 'false') + '"' + (checked ? ' disabled' : '') + '>' +
          '<span class="let" aria-hidden="true">' + esc(LETTERS[i] || (i + 1)) + '</span>' +
          '<span>' + esc(option) + '</span>' +
          (mark ? '<span class="mark" aria-hidden="true">' + mark + '</span>' : '') +
        '</button>';
      }).join('') +
    '</div>';
  }

  function renderTf(state, question) {
    var response = state.responses[question.id];
    var checked = state.checked[question.id];
    var options = [{ value: 'true', label: t('quiz.true'), bool: true }, { value: 'false', label: t('quiz.false'), bool: false }];
    return '<div class="opt-list" role="group" aria-label="صح أو خطأ">' +
      options.map(function (option, i) {
        var classes = ['opt'];
        var mark = '';
        if (checked) {
          if (option.bool === Boolean(question.answer)) { classes.push('is-correct'); mark = '✓'; }
          else if (response === option.value) { classes.push('is-wrong'); mark = '✕'; }
        }
        return '<button type="button" class="' + classes.join(' ') + '" data-answer="tf" data-value="' + option.value + '"' +
          ' aria-pressed="' + (response === option.value ? 'true' : 'false') + '"' + (checked ? ' disabled' : '') + '>' +
          '<span class="let" aria-hidden="true">' + esc(LETTERS[i]) + '</span><span>' + esc(option.label) + '</span>' +
          (mark ? '<span class="mark" aria-hidden="true">' + mark + '</span>' : '') +
        '</button>';
      }).join('') +
    '</div>';
  }

  function renderFill(state, question) {
    var response = state.responses[question.id] || '';
    var checked = state.checked[question.id];
    return '<label class="visually-hidden" for="fill-' + esc(question.id) + '">' + esc(t('quiz.fillPlaceholder')) + '</label>' +
      '<input class="fill-input" id="fill-' + esc(question.id) + '" type="text" data-answer="fill" autocomplete="off"' +
      ' placeholder="' + esc(t('quiz.fillPlaceholder')) + '" value="' + esc(response) + '"' + (checked ? ' disabled' : '') + '>';
  }

  function renderMatch(state, question) {
    var response = state.responses[question.id] || [];
    var checked = state.checked[question.id];
    var options = question.pairs.map(function (pair) { return pair.right; }).slice().sort(function (a, b) {
      return a.localeCompare(b, 'ar');
    });
    return '<p class="card-meta">' + esc(t('quiz.matchHint')) + '</p>' +
      question.pairs.map(function (pair, i) {
        var value = response[i] || '';
        var rowClass = 'match-row';
        if (checked) {
          rowClass += DLP.utils.normalizeArabic(value) === DLP.utils.normalizeArabic(pair.right) ? ' is-correct' : ' is-wrong';
        }
        return '<div class="' + rowClass + '">' +
          '<span class="match-left" id="ml-' + esc(question.id) + '-' + i + '">' + esc(pair.left) + '</span>' +
          '<select class="match-select" data-answer="match" data-row="' + i + '"' +
            ' aria-labelledby="ml-' + esc(question.id) + '-' + i + '"' + (checked ? ' disabled' : '') + '>' +
            '<option value="">— اختر —</option>' +
            options.map(function (option) {
              return '<option value="' + esc(option) + '"' + (option === value ? ' selected' : '') + '>' + esc(option) + '</option>';
            }).join('') +
          '</select>' +
        '</div>';
      }).join('');
  }

  function renderOrder(state, question) {
    var response = state.responses[question.id] || question.items.slice();
    var checked = state.checked[question.id];
    return '<p class="card-meta">' + esc(t('quiz.orderHint')) + '</p>' +
      '<ol class="order-list">' +
        response.map(function (item, i) {
          var itemClass = 'order-item';
          if (checked) { itemClass += item === question.items[i] ? ' is-correct' : ' is-wrong'; }
          return '<li class="' + itemClass + '">' +
            '<span class="pos" aria-hidden="true">' + (i + 1) + '</span>' +
            '<span class="txt">' + esc(item) + '</span>' +
            '<span class="order-btns">' +
              '<button class="icon-btn" type="button" data-answer="order" data-move="up" data-index="' + i + '"' +
                ' aria-label="' + esc(t('quiz.moveUp')) + ': ' + esc(item) + '"' + (checked || i === 0 ? ' disabled' : '') + '>▲</button>' +
              '<button class="icon-btn" type="button" data-answer="order" data-move="down" data-index="' + i + '"' +
                ' aria-label="' + esc(t('quiz.moveDown')) + ': ' + esc(item) + '"' +
                (checked || i === response.length - 1 ? ' disabled' : '') + '>▼</button>' +
            '</span>' +
          '</li>';
        }).join('') +
      '</ol>';
  }

  var BODY_RENDERERS = { mcq: renderMcq, tf: renderTf, fill: renderFill, match: renderMatch, order: renderOrder };

  /* ------------------------- رسم الاختبار ------------------------- */

  function renderQuestion(state) {
    var question = current(state);
    if (!question) {
      return '<div class="empty-state"><p>لا توجد أسئلة بهذا المستوى. اختر مستوى آخر.</p></div>';
    }
    var checked = state.checked[question.id];
    var graded = checked ? DLP.quiz.grade(question, state.responses[question.id]) : null;

    return '' +
      '<div class="q-prompt">' +
        '<span class="qnum">' + esc(t('quiz.question')) + ' ' + (state.index + 1) + '/' + state.questions.length + '</span>' +
        '<span class="badge badge-' + esc(question.difficulty || 'medium') + '">' +
          esc(t('difficulty.' + (question.difficulty || 'medium'))) + '</span><br>' +
        esc(question.prompt) +
      '</div>' +
      BODY_RENDERERS[question.type](state, question) +
      '<div class="feedback ' + (checked ? (graded.correct ? 'ok show' : 'bad show') : '') + '" role="status" aria-live="polite">' +
        (checked
          ? '<div class="fb-title">' + (graded.correct ? '✓ ' + esc(t('quiz.correct')) : '✕ ' + esc(t('quiz.wrong'))) + '</div>' +
            (graded.correct ? '' : '<div class="fb-answer">' + esc(t('quiz.correctAnswer')) + ': ' + esc(graded.correctAnswer) + '</div>') +
            '<div><b>' + esc(t('quiz.explanation')) + ':</b> ' + esc(question.explanation) + '</div>'
          : '') +
      '</div>';
  }

  function renderProgress(state) {
    var score = DLP.quiz.score(state.questions, state.responses);
    var percent = state.questions.length ? Math.round((score.answered / state.questions.length) * 100) : 0;
    return '<div class="progress-meta">' +
        '<span>' + esc(t('quiz.progress')) + ': ' + score.answered + '/' + state.questions.length + '</span>' +
        '<span>' + esc(t('quiz.score')) + ': ' + score.correct + '/' + state.questions.length + '</span>' +
      '</div>' +
      '<div class="progress-track" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + percent + '"' +
        ' aria-label="' + esc(t('quiz.progress')) + '">' +
        '<div class="progress-fill" style="width:' + percent + '%"></div>' +
      '</div>';
  }

  function renderResult(state) {
    if (!state.finished) { return ''; }
    var score = DLP.quiz.score(state.questions, state.responses);
    return '<div class="quiz-result">' +
      '<div class="score-big">' + score.correct + ' / ' + score.total + ' (' + score.percent + '٪)</div>' +
      '<div class="score-sub">' + esc(t('quiz.result')) + '</div>' +
      '<div class="bars">' +
        '<span class="badge badge-easy">✓ ' + esc(t('quiz.correct')) + ': ' + score.correct + '</span>' +
        '<span class="badge badge-hard">✕ ' + esc(t('quiz.wrong')) + ': ' + score.wrong + '</span>' +
        '<span class="badge badge-demo">' + esc(t('quiz.questionsCount')) + ': ' + score.total + '</span>' +
      '</div>' +
      '<div style="margin-top:16px"><button class="btn btn-gold" type="button" data-quiz-action="retry">↻ ' +
        esc(t('quiz.retry')) + '</button></div>' +
    '</div>';
  }

  function renderFoot(state) {
    var question = current(state);
    var isLast = state.index === state.questions.length - 1;
    return '' +
      '<button class="btn btn-ghost btn-sm" type="button" data-quiz-action="prev"' +
        (state.index === 0 ? ' disabled' : '') + '>→ ' + esc(t('quiz.prev')) + '</button>' +
      '<button class="btn btn-primary btn-sm" type="button" data-quiz-action="check"' +
        (!question || state.checked[question.id] ? ' disabled' : '') + '>' + esc(t('quiz.check')) + '</button>' +
      '<span class="spacer"></span>' +
      (isLast
        ? '<button class="btn btn-gold btn-sm" type="button" data-quiz-action="finish">' + esc(t('quiz.finish')) + '</button>'
        : '<button class="btn btn-primary btn-sm" type="button" data-quiz-action="next">' + esc(t('quiz.next')) + ' ←</button>') +
      '<button class="btn btn-ghost btn-sm" type="button" data-quiz-action="retry">↻ ' + esc(t('quiz.retry')) + '</button>';
  }

  function renderQuiz(quiz) {
    var state = getState(quiz);
    var levels = [
      { key: 'all', label: t('quiz.all') },
      { key: 'easy', label: t('difficulty.easy') },
      { key: 'medium', label: t('difficulty.medium') },
      { key: 'hard', label: t('difficulty.hard') }
    ];
    return '' +
      '<div class="quiz" id="' + esc(quiz.id) + '" data-quiz="' + esc(quiz.id) + '">' +
        '<div class="quiz-head">' +
          '<h3>' + esc(quiz.title) + '</h3>' +
          (quiz.description ? '<p>' + esc(quiz.description) + '</p>' : '') +
        '</div>' +
        '<div class="quiz-toolbar">' +
          '<span class="label">' + esc(t('quiz.filter')) + ':</span>' +
          levels.map(function (level) {
            return '<button class="filter-btn" type="button" data-quiz-filter="' + esc(level.key) + '"' +
              ' aria-pressed="' + (state.difficulty === level.key ? 'true' : 'false') + '">' + esc(level.label) + '</button>';
          }).join('') +
          '<span class="label" style="margin-inline-start:auto">' + esc(t('quiz.questionsCount')) + ': ' +
            state.questions.length + '</span>' +
        '</div>' +
        '<div class="quiz-progress" data-quiz-progress>' + renderProgress(state) + '</div>' +
        '<div class="quiz-body" data-quiz-body>' + renderQuestion(state) + '</div>' +
        '<div class="quiz-foot" data-quiz-foot>' + renderFoot(state) + '</div>' +
        '<div data-quiz-result>' + renderResult(state) + '</div>' +
      '</div>';
  }

  function renderSection(subject) {
    var quizzes = DLP.store.list(subject, 'quizzes');
    if (!quizzes.length) {
      return '<div class="empty-state"><div class="big" aria-hidden="true">❓</div><p>' +
        esc(t('common.empty')) + '</p></div>';
    }
    return quizzes.map(renderQuiz).join('');
  }

  /* ------------------------- التفاعل ------------------------- */

  function refresh(root, state) {
    root.querySelector('[data-quiz-progress]').innerHTML = renderProgress(state);
    root.querySelector('[data-quiz-body]').innerHTML = renderQuestion(state);
    root.querySelector('[data-quiz-foot]').innerHTML = renderFoot(state);
    root.querySelector('[data-quiz-result]').innerHTML = renderResult(state);
    var counter = root.querySelector('.quiz-toolbar .label:last-of-type');
    if (counter) { counter.textContent = t('quiz.questionsCount') + ': ' + state.questions.length; }
    Array.prototype.forEach.call(root.querySelectorAll('[data-quiz-filter]'), function (button) {
      button.setAttribute('aria-pressed', button.dataset.quizFilter === state.difficulty ? 'true' : 'false');
    });
  }

  function stateFromEvent(subject, element) {
    var root = element.closest('[data-quiz]');
    if (!root) { return null; }
    var quiz = DLP.store.findQuiz(subject, root.dataset.quiz);
    if (!quiz) { return null; }
    return { root: root, state: getState(quiz), quiz: quiz };
  }

  function bind(subject) {
    var panel = document.getElementById('sectionPanel');
    if (!panel) { return; }

    panel.addEventListener('click', function (event) {
      var target = event.target.closest('[data-quiz-action],[data-quiz-filter],[data-answer]');
      if (!target) { return; }
      var context = stateFromEvent(subject, target);
      if (!context) { return; }
      var state = context.state;
      var question = current(state);

      if (target.hasAttribute('data-quiz-filter')) {
        state.difficulty = target.dataset.quizFilter;
        state.questions = DLP.quiz.filterByDifficulty(state.quiz ? state.quiz.questions : context.quiz.questions, state.difficulty);
        state.index = 0;
        state.finished = false;
        refresh(context.root, state);
        return;
      }

      if (target.hasAttribute('data-quiz-action')) {
        var action = target.dataset.quizAction;
        if (action === 'next' && state.index < state.questions.length - 1) { state.index += 1; }
        else if (action === 'prev' && state.index > 0) { state.index -= 1; }
        else if (action === 'check' && question) { state.checked[question.id] = true; }
        else if (action === 'finish') { state.finished = true; }
        else if (action === 'retry') {
          var difficulty = state.difficulty;
          states[context.quiz.id] = createState(context.quiz);
          states[context.quiz.id].difficulty = difficulty;
          states[context.quiz.id].questions = DLP.quiz.filterByDifficulty(context.quiz.questions, difficulty);
          state = states[context.quiz.id];
        }
        refresh(context.root, state);
        if (action === 'finish') { context.root.querySelector('[data-quiz-result]').scrollIntoView({ behavior: 'smooth', block: 'center' }); }
        return;
      }

      // اختيار إجابة
      if (!question || state.checked[question.id]) { return; }
      var kind = target.dataset.answer;
      if (kind === 'mcq') { state.responses[question.id] = Number(target.dataset.value); }
      else if (kind === 'tf') { state.responses[question.id] = target.dataset.value; }
      else if (kind === 'order') {
        var order = (state.responses[question.id] || question.items.slice()).slice();
        var index = Number(target.dataset.index);
        var swapWith = target.dataset.move === 'up' ? index - 1 : index + 1;
        if (swapWith >= 0 && swapWith < order.length) {
          var tmp = order[index]; order[index] = order[swapWith]; order[swapWith] = tmp;
          state.responses[question.id] = order;
        }
      } else { return; }
      refresh(context.root, state);
    });

    panel.addEventListener('input', function (event) {
      var target = event.target;
      if (target.dataset && target.dataset.answer === 'fill') {
        var context = stateFromEvent(subject, target);
        if (!context) { return; }
        var question = current(context.state);
        if (question) { context.state.responses[question.id] = target.value; }
        context.root.querySelector('[data-quiz-progress]').innerHTML = renderProgress(context.state);
      }
    });

    panel.addEventListener('change', function (event) {
      var target = event.target;
      if (target.dataset && target.dataset.answer === 'match') {
        var context = stateFromEvent(subject, target);
        if (!context) { return; }
        var question = current(context.state);
        if (!question) { return; }
        var answers = (context.state.responses[question.id] || []).slice();
        answers[Number(target.dataset.row)] = target.value;
        context.state.responses[question.id] = answers;
        context.root.querySelector('[data-quiz-progress]').innerHTML = renderProgress(context.state);
      }
    });
  }

  DLP.quizView = { renderSection: renderSection, renderQuiz: renderQuiz, bind: bind, resetStates: resetStates };
})(typeof window !== 'undefined' ? window : globalThis);
