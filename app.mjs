import {demoText, makeDeck, normalize, parseList} from './words.mjs';
import {extractFile} from './import.mjs';

const byId = id => document.getElementById(id);
const element = (tag, className, content) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (content) node.textContent = content;
  return node;
};
const button = (label, className, handler) => {
  const node = element('button', className, label);
  node.type = 'button';
  if (handler) node.addEventListener('click', handler);
  return node;
};

const routes = [
  ['Listening','≈ 30 мин','Аудио, вопросы и ключи.','listening','M3 14v-2a9 9 0 0 1 18 0v2M3 13h2a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2H3zm18 0h-2a2 2 0 0 0-2 2v3a2 2 0 0 0 2 2h2z'],
  ['Reading','60 мин','Тексты, вопросы и ключи.','reading','M12 6v15M12 6C9 4 6 4 3 4v15c3 0 6 0 9 2 3-2 6-2 9-2V4c-3 0-6 0-9 2z'],
  ['Writing','60 мин','Task 1 и Task 2 с образцами ответов.','writing','M12 20h9M4 20l4-1L20 7l-3-3L5 16zm10-13 3 3'],
  ['Speaking','11–14 мин','Вопросы и примеры для Parts 1–3.','speaking','M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3zm-7 9v1a7 7 0 0 0 14 0v-1m-7 8v3']
];
for (const [name,duration,description,slug,path] of routes) {
  const card = element('article','exam-card');
  const metadata = element('div','exam-meta');
  const icon = element('span','exam-icon');
  icon.setAttribute('aria-hidden','true');
  icon.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round"><path d="' + path + '"/></svg>';
  metadata.append(icon,element('span','duration',duration));
  const link = element('a','button secondary','Открыть пробник');
  link.href = 'https://takeielts.britishcouncil.org/prepare/ielts-free-practice-mock-tests/academic/' + slug;
  link.target = '_blank';
  link.rel = 'noopener';
  link.setAttribute('aria-label','Открыть пробник ' + name + ' на сайте British Council');
  card.append(metadata,element('h3','',name),element('p','',description),link);
  byId('exam-grid').append(card);
}

const stage = byId('stage');
const raw = byId('raw');
const file = byId('file');
const pickFile = byId('pick-file');
const tasks = [...document.querySelectorAll('[data-mode]')];
const storageKey = 'ielts-practice:words:v1';
let rows = [];
let mode = 'choice';
let deck = [];
let index = 0;
let correct = 0;
let version = 0;

function feedback(message, error = false) {
  const node = byId('file-status');
  node.textContent = message;
  node.hidden = !message;
  node.classList.toggle('error', error);
}

function restart(focus = false) {
  deck = makeDeck(mode,rows);
  index = 0;
  correct = 0;
  render(focus);
}

function useText(text, status, persist = true) {
  const next = parseList(text);
  if (!next.length) {
    byId('editor').open = true;
    feedback('Не удалось найти слова. Проверь, что английское слово или выражение стоит в начале каждой строки.', true);
    return false;
  }
  raw.value = text;
  rows = next;
  feedback(status + ' · слов и выражений: ' + rows.length + '.');
  if (persist) {
    const save = byId('save-status');
    try {
      localStorage.setItem(storageKey, JSON.stringify({text,status}));
      save.hidden = true;
    } catch {
      save.textContent = 'Словарь доступен до закрытия этой страницы.';
      save.hidden = false;
    }
  }
  restart();
  return true;
}

async function importFile(selected) {
  if (!selected) return;
  const current = ++version;
  feedback('Читаю ' + selected.name + '…');
  try {
    const text = await extractFile(selected);
    if (current !== version) return;
    if (!useText(text, selected.name)) raw.value = text;
  } catch (error) {
    if (current !== version) return;
    feedback(error.message && /[А-Яа-яЁё]/.test(error.message)
      ? error.message : 'Файл не удалось прочитать. Проверь, открывается ли он, или вставь слова вручную.', true);
  }
}

function title(text) {
  const node = element('h3','',text);
  node.tabIndex = -1;
  return node;
}

function highlightBlank(sentence) {
  const node = element('p','prompt');
  node.lang = 'en';
  const parts = sentence.split('___');
  parts.forEach((text, i) => {
    if (i) {
      const mark = element('span','blank','______');
      mark.setAttribute('aria-label','blank');
      node.append(mark);
    }
    node.append(document.createTextNode(text));
  });
  return node;
}

function render(focus = false) {
  stage.replaceChildren();
  if (!deck.length) {
    const heading = title(rows.length ? 'Нужен глагол' : 'Добавь слова, чтобы начать');
    stage.append(heading,element('p','muted',rows.length
      ? 'В словаре пока нет глаголов, для которых удалось определить формы. В редакторе добавь «to» перед глаголом или «| verb» после примера.'
      : 'Загрузи свой словарь или попробуй демо, чтобы увидеть оба режима.'));
    if (focus) heading.focus();
    return;
  }
  if (index === deck.length) {
    const heading = title('Тренировка завершена');
    stage.append(heading,element('p','muted','Верно с первой попытки · ' + correct + ' из ' + deck.length),
      button('Пройти ещё раз','button primary',() => restart(true)));
    if (focus) heading.focus();
    return;
  }

  const task = deck[index];
  const meta = element('div','exercise-meta');
  const marker = element('span','',task.tense || (task.reveal ? 'Повторение' : 'Выбери подходящий вариант'));
  marker.tabIndex = -1;
  meta.append(marker,element('span','','Задание ' + (index+1) + ' / ' + deck.length));
  const progress = element('progress','progress');
  progress.max = deck.length;
  progress.value = index;
  progress.setAttribute('aria-label','Выполнено заданий');
  stage.append(meta,progress,highlightBlank(task.sentence));
  if (task.clue) stage.append(element('p','clue',task.clue));

  const message = element('p','feedback');
  message.setAttribute('role','status');
  const controls = element('div','exercise-actions');
  const next = button(index + 1 === deck.length ? 'Посмотреть итог' : 'Дальше','button primary',() => {
    index += 1;
    render(true);
  });
  next.hidden = true;

  let answered = false;
  let attempt = false;
  const answerControls = [];
  function finish(won, messageText) {
    answered = true;
    answerControls.forEach(control => { control.disabled = true; });
    show.hidden = true;
    next.hidden = false;
    progress.value = index + 1;
    message.classList.toggle('error',false);
    message.textContent = messageText;
    if (won) {
      if (!attempt) correct += 1;
      confetti();
    }
    next.focus();
  }
  function check(value, control) {
    if (answered || !value.trim()) return;
    if (task.answer.split('/').some(answer => normalize(answer) === normalize(value))) {
      if (control) control.classList.add('right');
      finish(true,'Верно! · ' + value);
      return;
    }
    attempt = true;
    if (control) control.classList.add('wrong');
    message.classList.add('error');
    message.textContent = 'Пока неверно. Попробуй ещё раз.';
  }

  const show = button('Показать ответ','button secondary',() =>
    finish(false,'Ответ · ' + task.answer));
  if (task.tense || (!task.reveal && task.options.length === 1)) {
    const form = element('form','answer-form');
    const answer = element('input','answer-input');
    answer.type = 'text';
    answer.lang = 'en';
    answer.required = true;
    answer.spellcheck = false;
    answer.setAttribute('autocapitalize','none');
    answer.setAttribute('autocomplete','off');
    answer.setAttribute('aria-label','Твой ответ на английском');
    answer.placeholder = 'Твой ответ';
    const submit = button('Проверить','button secondary');
    submit.type = 'submit';
    answerControls.push(answer,submit);
    form.append(answer,submit);
    form.addEventListener('submit',event => { event.preventDefault(); check(answer.value); });
    stage.append(form);
  } else if (!task.reveal) {
    const options = element('div','options');
    for (const option of task.options) {
      const control = button(option,'button secondary option',() => check(option,control));
      control.lang = 'en';
      answerControls.push(control);
      options.append(control);
    }
    stage.append(options);
  }
  controls.append(show,next);
  stage.append(message,controls);
  if (focus) marker.focus();
}

function confetti() {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const layer = byId('celebration');
  const colors = ['#bff8a0','#fdd688','#95ebea','#edabd6','#f4f9ec'];
  for (const side of ['left','right']) {
    for (let i = 0; i < 23; i += 1) {
      const item = element('i','confetti');
      const sign = side === 'left' ? 1 : -1;
      const x = sign * (25 + Math.random() * Math.min(340, innerWidth * .46));
      const y = -100 - Math.random() * 150;
      const spin = (Math.random() - .5) * 900;
      item.style[side] = '0';
      item.style.top = (52 + Math.random() * 23) + '%';
      item.style.background = colors[i % colors.length];
      item.style.borderRadius = i % 3 === 0 ? '50%' : '2px';
      item.style.setProperty('--mx', x * .55 + 'px');
      item.style.setProperty('--my', y + 'px');
      item.style.setProperty('--x', x + 'px');
      item.style.setProperty('--y', y * .18 + 'px');
      item.style.setProperty('--spin', spin + 'deg');
      item.style.setProperty('--halfspin', spin * .5 + 'deg');
      layer.append(item);
      item.addEventListener('animationend',() => item.remove(),{once:true});
      setTimeout(() => item.remove(),1300);
    }
  }
}

pickFile.addEventListener('click',() => file.click());
file.addEventListener('change',() => { importFile(file.files[0]); file.value = ''; });
pickFile.addEventListener('dragover',event => { event.preventDefault(); pickFile.classList.add('drag'); });
pickFile.addEventListener('dragleave',() => pickFile.classList.remove('drag'));
pickFile.addEventListener('drop',event => {
  event.preventDefault();
  pickFile.classList.remove('drag');
  importFile(event.dataTransfer.files[0]);
});
byId('demo').addEventListener('click',() => { version += 1; useText(demoText,'Демо-словарь'); });
byId('use-words').addEventListener('click',() => { version += 1; useText(raw.value,'Свой словарь'); });
for (const toggle of tasks) {
  toggle.addEventListener('click',() => {
    if (mode === toggle.dataset.mode) return;
    mode = toggle.dataset.mode;
    tasks.forEach(node => node.setAttribute('aria-pressed',String(node === toggle)));
    restart();
  });
}

try {
  const stored = JSON.parse(localStorage.getItem(storageKey) || 'null');
  if (typeof stored?.text === 'string') useText(stored.text,stored.status || 'Сохранённый словарь',false);
} catch { /* Browser storage may be unavailable. */ }
render();
