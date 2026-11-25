import nlp from './vendor/compromise.mjs';
import lexicon from './vendor/lexicon.mjs';

export const demoText = [
  'revise | повторять материал | We can revise the vocabulary before class. | verb',
  'fluent | свободно говорящий | After a year abroad, she became fluent in English.',
  'submit | сдавать, подавать | We can submit the application online. | verb',
  'feedback | обратная связь | The tutor gave us detailed feedback on our essays.',
  'choose | выбирать | We can choose a topic for our presentation. | verb',
  'broaden | расширять | We can broaden our vocabulary by reading regularly. | verb',
  'consistent | последовательный | The study found a consistent pattern across all groups.',
  'make progress | добиваться прогресса | We can make progress with regular practice. | verb'
].join('\n');

const normaliseTerm = (value) => value.trim().replace(/^[\s*•▪]+|[\s*;:]+$/g, '');
const english = /^[A-Za-z][A-Za-z'’\-]*(?: [A-Za-z][A-Za-z'’\-]*){0,7}$/;
const russian = /[А-Яа-яЁё]/;
const verbLabel = /^(?:v\.?|verb|глагол)$/i;
const labelPattern = /\s*\((?:v\.|verb|n\.|noun|adj\.|adjective|adv\.|adverb|phrasal verb|глагол)\)\s*$/i;
const headings = /^(?:word|term|expression|phrase|vocabulary|word list|translation|english|example|synonym|meaning|definitions?|part of speech|page \d+|vocabulary bank|ielts vocabulary)$/i;
const alternative = (value) => value.replace(/[^A-Za-z'’ /-]/g, '').trim();
export const normalize = (value) => value.toLowerCase().replaceAll('’', "'").trim().replace(/\s+/g, ' ');
const escape = (s) => s.replace(/[^A-Za-z0-9 ]/g, '\\$&');

function clozeFrom(example, forms) {
  if (!example) return null;
  if (/_{3,}/.test(example)) return { sentence: example.replace(/_{3,}/g, '___'), answer: forms[0] };
  const alternatives = [...new Set(forms.flatMap(word => word.split('/')))].filter(Boolean).sort((a,b) => b.length - a.length);
  const pattern = new RegExp('(^|[^A-Za-z’\'])(' + alternatives.map(escape).join('|') + ')(?=$|[^A-Za-z’\'])','i');
  const match = example.match(pattern);
  return match ? { sentence: example.replace(pattern, (_, lead) => lead + '___'), answer: match[2] } : null;
}

function parseRow(line) {
  const clean = line.replace(/^\s*(?:\d+[.)]\s*|[-•▪]\s+|\*\s+)/, '').trim();
  if (!clean || clean.startsWith('#')) return null;
  const columns = clean.split(/\s*[|\t]\s*|\s*\u2014\s*|\s+[–-]\s+/).map(normaliseTerm).filter(Boolean);
  if (columns.length === 1) {
    const inline = clean.match(/^(.+?)\s*(?:[:=]\s*|\s+)([А-Яа-яЁё].+)$/);
    if (inline) columns.splice(0, 1, inline[1].trim(), inline[2]);
  }
  const first = columns.shift();
  if (!first) return null;
  const label = first.match(labelPattern)?.[0] || '';
  const bare = first.replace(labelPattern, '').trim();
  const infinitive = /^to /i.test(bare);
  const term = bare.replace(/^to /i, '').replace(/\s+/g,' ').trim();
  if (!english.test(term) || headings.test(term) || (!columns.length && /\b(?:a|the|of|is|are|was|were)\b/i.test(term) && term.split(' ').length > 5)) return null;
  const taggedVerb = infinitive || /verb|v\.|глагол/i.test(label.replace(/adverb/ig,'')) || columns.some(value => verbLabel.test(value));
  const [head, ...rest] = normalize(term).split(' ');
  const key = normalize(term);
  const [definition = '', standardExample = '', mainPos = '', frames = [], verbExample = ''] =
    Object.hasOwn(lexicon, key) ? lexicon[key] : [];
  const headInfo = nlp(head);
  const inferred = !label && headInfo.has('#Infinitive') && !headInfo.has('#Noun');
  const restText = rest.join(' ');
  const meaning = columns.find(value => russian.test(value) && !verbLabel.test(value)) || '';
  const root = escape(key);
  const sourceExample = columns.find(value => !russian.test(value) && /_{3,}|[.!?]$/.test(value) && !verbLabel.test(value)) ||
    columns.slice(1).find(value => !russian.test(value) && !verbLabel.test(value) && value.split(' ').length > 4) || '';
  const verb = taggedVerb || (!label && (inferred || mainPos === 'v' ||
    new RegExp('\\b(?:can|will|should|to) ' + root + '(?=\\W|$)','i').test(sourceExample) ||
    (frames.length > 0 && /(?:ть|ться|ти|чь)(?:,|\s|$)/i.test(meaning))));
  const gloss = columns.find(value => value !== sourceExample && value !== meaning && !verbLabel.test(value) && /\b(?:someone|something|when|that|which|with)\b/i.test(value)) || definition;
  const formIndex = columns.findIndex(value => verbLabel.test(value));
  const formColumns = formIndex >= 0 ? columns.slice(formIndex + 1) : [];
  const variants = verb ? nlp(head).verbs().conjugate()[0] : null;
  const conventional = {
    be: { PastTense:'were', Participle:'been', Gerund:'being' },
    submit: { PastTense:'submitted', Participle:'submitted', Gerund:'submitting' },
    travel: { PastTense:'travelled/traveled', Participle:'travelled/traveled', Gerund:'travelling/traveling' },
    learn: { PastTense:'learnt/learned', Participle:'learnt/learned', Gerund:'learning' }
  };
  const form = verb ? (Object.hasOwn(conventional,head) ? conventional[head] : null) ||
    variants || nlp('we will ' + head).verbs().conjugate()[0] : undefined;
  function addRest(value) {
    return alternative(value || '').split('/').map(part => {
      const word = part.trim();
      return word && restText && !word.endsWith(' ' + restText) ? word + ' ' + restText : word;
    }).join('/');
  }
  const past = addRest(formColumns[0] || form?.PastTense);
  const participle = addRest(formColumns[1] || form?.Participle || form?.PastTense);
  const gerund = addRest(form?.Gerund);
  const present = addRest(form?.PresentTense);
  const forms = [term, past, participle, gerund, present];
  const dictionaryExample = verbExample || standardExample;
  const finishedExample = dictionaryExample
    ? dictionaryExample[0].toUpperCase() + dictionaryExample.slice(1) + (/[.!?]$/.test(dictionaryExample) ? '' : '.')
    : '';
  const cloze = clozeFrom(sourceExample, forms) || clozeFrom(finishedExample, forms);
  const tailPattern = new RegExp('(?:^(?:I|We|They|You) (?:can |will |should )?|\\b(?:can|will|should|to) )' +
    root + '(?=\\s|[.!?]|$)(.*)$', 'i');
  const contextualTail = [sourceExample,verbExample,standardExample].map(example =>
    example.match(tailPattern)?.[1]?.trim().replace(/[.!?]+$/, '')).find(Boolean) || '';
  return {term, meaning, gloss, cloze, past, participle, gerund, verb, contextualTail, frames};
}

export function parseList(text) {
  const records = new Map();
  const lines = text.replace(/\r/g,'').replace(/\n\s*(?:пример|example(?: sentence)?|translation|перевод|meaning|definition|synonyms?|синонимы?)\s*:\s*/gi,' | ').split('\n');
  for (const line of lines.slice(0,2000)) {
    const row = parseRow(line);
    if (!row) continue;
    const key = normalize(row.term);
    const existing = records.get(key);
    if (!existing || (!existing.cloze && row.cloze) || (!existing.meaning && row.meaning)) records.set(key,row);
    if (records.size === 400) break;
  }
  return [...records.values()];
}

export function shuffle(values) {
  const list = [...values];
  for (let index = list.length - 1; index > 0; index -= 1) {
    const other = Math.floor(Math.random() * (index + 1));
    [list[index], list[other]] = [list[other], list[index]];
  }
  return list;
}

function vocabularyQuestion(row, rows) {
  const fallbackClue = row.meaning || row.gloss;
  const letterHint = row.term.slice(0, 1) + '… · ' + row.term.split(' ').length + ' сл.';
  const question = row.cloze || {
    sentence: fallbackClue ? 'The English expression for “' + fallbackClue + '” is ___.'
      : 'The next entry in your vocabulary list is ___.',
    answer: row.term
  };
  const others = shuffle([...new Set(rows.filter(item => item !== row).map(item => item.cloze?.answer || item.term))]
    .filter(answer => normalize(answer) !== normalize(question.answer)));
  const options = shuffle([question.answer, ...others.slice(0,3)]);
  return { ...question, options, clue: row.cloze ? row.meaning || row.gloss : fallbackClue ? '' : letterHint,
    reveal: !row.cloze && !fallbackClue };
}

function grammarQuestions(row) {
  if (!row.verb || !row.past) return [];
  const clue = 'Начальная форма · ' + row.term;
  let tail = row.contextualTail;
  if (!tail && !row.term.includes(' ') && row.frames.length && !row.frames.some(frame => [1,2,4].includes(frame))) {
    if (row.frames.some(frame => [8,11,22,26].includes(frame))) tail = 'it';
    else if (row.frames.includes(9)) tail = 'them';
    else if (row.frames.includes(28)) tail = 'to help';
  }
  if (tail) tail = ' ' + tail;
  const questions = [
    { sentence: 'Yesterday, we ___' + tail + '.', answer: row.past, tense:'Past Simple' }
  ];
  if (row.participle && normalize(row.term) !== 'be') {
    questions.push({ sentence: 'We have already ___' + tail + '.', answer: row.participle, tense:'Present Perfect' });
  }
  if (row.gerund && tail && !/^(?:know|own|believe|prefer|understand|seem|belong|like|love|hate|need|want)\b/i.test(row.term)) {
    questions.push({ sentence: 'Right now, we are ___' + tail + '.', answer: row.gerund, tense:'Present Continuous' });
  }
  return questions.map(question => ({...question, clue}));
}

export function makeDeck(mode, rows) {
  if (mode === 'choice') return shuffle(rows.map(row => vocabularyQuestion(row,rows)));
  return shuffle(rows.flatMap(grammarQuestions));
}
