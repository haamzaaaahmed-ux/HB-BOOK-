const DB_NAME = 'book-guide-v4';
const STORE   = 'books';

const DEMO = [
  { id:'d1', title:'اسرق مثل فنان',       author:'أوستن كليون',        location:'H8' },
  { id:'d2', title:'الفوائد',             author:'ابن قيم الجوزية',    location:'K3' },
  { id:'d3', title:'رسائل من الصحابة',    author:'أدهم الشرقاوي',     location:'B6' },
  { id:'d4', title:'رسائل إلى الشباب',    author:'أدهم الشرقاوي',     location:'C2' },
  { id:'d5', title:'روضة المحبين',        author:'ابن القيم',          location:'A7' },
];

const LETTERS = ['ا','ب','ت','ث','ج','ح','خ','د','ذ','ر','ز','س','ش','ص','ض','ط','ظ','ع','غ','ف','ق','ك','ل','م','ن','ه','و','ي'];

const $ = s => document.querySelector(s);
const view = $('#appView');

let books = [];
let db;

/* ─── text normalisation ─── */
function norm(v = '') {
  return String(v)
    .toLocaleLowerCase('ar')
    .normalize('NFKC')
    .replace(/[\u064B-\u065F\u0670\u06D6-\u06ED]/g, '')
    .replace(/[إأآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/ـ/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function firstWord(title) {
  let words = norm(title).split(' ').filter(Boolean);
  if (words[0] === 'ال' && words[1]) words.shift();
  if (words[0]?.startsWith('ال') && words[0].length > 2) words[0] = words[0].slice(2);
  return words[0] || 'غير مصنف';
}

function firstLetter(title) {
  const w = firstWord(title);
  return LETTERS.includes(w[0]) ? w[0] : '#';
}

function esc(v = '') {
  return String(v).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
}

/* ─── IndexedDB ─── */
function openDb() {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB_NAME, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE, { keyPath: 'id' });
    r.onsuccess  = () => { db = r.result; res(); };
    r.onerror    = () => rej(r.error);
  });
}
function allBooks() {
  return new Promise((res, rej) => {
    const r = db.transaction(STORE).objectStore(STORE).getAll();
    r.onsuccess = () => res(r.result);
    r.onerror   = () => rej(r.error);
  });
}
function putBooks(values) {
  return new Promise((res, rej) => {
    const t = db.transaction(STORE, 'readwrite'), s = t.objectStore(STORE);
    s.clear();
    values.forEach(b => s.put(b));
    t.oncomplete = res;
    t.onerror    = () => rej(t.error);
  });
}

/* ─── import ─── */
function field(row, names) {
  const entries = Object.entries(row || {});
  const found   = entries.find(([k]) => names.some(n => norm(k) === norm(n) || norm(k).includes(norm(n))));
  return found?.[1] ?? '';
}
function mapRows(rows) {
  return rows.map((r, i) => ({
    id:       `book-${i}-${crypto.randomUUID()}`,
    title:    String(field(r, ['اسم الكتاب','الكتاب','العنوان','title','book','name'])).trim(),
    author:   String(field(r, ['اسم المؤلف','المؤلف','author','writer'])).trim(),
    location: String(field(r, ['المكان','مكان الكتاب','الرف','shelf','location','place'])).trim(),
  })).filter(b => b.title);
}

/* ─── UI helpers ─── */
function setCount() {
  $('#bookCount').textContent     = `${books.length} كتاب`;
  $('#libraryStats').textContent  = `${books.length} كتاب محمل`;
}

function header(title, back) {
  return `<div class="section-head">
    ${back ? '<button class="back-button" id="back">‹</button>' : ''}
    <h2>${esc(title)}</h2>
  </div>`;
}

/* ─── VIEWS ─── */

function home() {
  view.innerHTML = `
    <div class="home-view">
      <div>
        <h2>الوصول لمكان الكتاب</h2>
        <p>اختار الحرف الأول، بدون كتابة وبدون زحمة.</p>
      </div>
      <button class="main-button" id="startBooks">
        <span>اسم الكتاب</span>
        <small>اختار الحرف ← المحتوى مباشرة</small>
      </button>
    </div>`;
  $('#startBooks').onclick = letters;
}

function letters() {
  /* عدّ الكتب لكل حرف */
  const groups = {};
  books.forEach(b => {
    const l = firstLetter(b.title);
    groups[l] = (groups[l] || 0) + 1;
  });

  const sorted = Object.entries(groups)
    .filter(([l]) => l !== '#')
    .sort((a, b) => LETTERS.indexOf(a[0]) - LETTERS.indexOf(b[0]));

  let html = sorted
    .map(([l, n]) => `
      <button class="letter-button" data-letter="${l}">
        <span class="letter-char">${l}</span>
        <small>${n} كتاب</small>
      </button>`)
    .join('');

  if (groups['#']) {
    html += `<button class="letter-button" data-letter="#">
               <span class="letter-char">#</span>
               <small>${groups['#']} كتاب</small>
             </button>`;
  }

  view.innerHTML = `
    ${header('اختر الحرف الأول')}
    <p class="path">اسم الكتاب</p>
    <div class="letter-grid">
      ${html || '<div class="empty-state">ارفع ملف الكتب من الإعدادات أولًا.</div>'}
    </div>`;

  view.querySelectorAll('[data-letter]')
      .forEach(b => b.onclick = () => letterContent(b.dataset.letter));
}

/*
  letterContent:
  - تجمع الكتب لهذا الحرف
  - تبني Map: كلمة → [كتب]
  - الكلمات اللي ليها أكتر من كتاب → تظهر كـ word-button
  - الكتب اللي كلمتها unique → تظهر كـ book-button مباشرة
  - الاتنين جنب بعض (flex-wrap)
*/
function letterContent(letter) {
  const group = books.filter(b => firstLetter(b.title) === letter);

  /* wordMap: word → Book[] */
  const wordMap = new Map();
  group.forEach(b => {
    const w = firstWord(b.title);
    if (!wordMap.has(w)) wordMap.set(w, []);
    wordMap.get(w).push(b);
  });

  /* فصل الكلمات المشتركة من الفريدة */
  const sharedWords  = []; /* كلمة → أكتر من كتاب */
  const uniqueBooks  = []; /* كتاب واحد لكل كلمة */

  [...wordMap.entries()].sort((a, b) => a[0].localeCompare(b[0], 'ar'))
    .forEach(([word, bks]) => {
      if (bks.length > 1) sharedWords.push({ word, books: bks });
      else                 uniqueBooks.push(bks[0]);
    });

  /* بناء الـ HTML */
  let html = '';

  /* ── كلمات مشتركة ── */
  if (sharedWords.length) {
    const btns = sharedWords.map(({ word, books: bks }) => `
      <button class="word-button" data-word="${esc(word)}">
        <span class="word-text">${esc(word)}</span>
        <small>${bks.length} كتب ›</small>
      </button>`).join('');

    html += `<div class="group-section">
               <p class="group-label">كلمات مشتركة</p>
               <div class="word-list">${btns}</div>
             </div>`;
  }

  /* ── كتب مباشرة ── */
  if (uniqueBooks.length) {
    const btns = uniqueBooks.map(b => `
      <button class="book-button" data-id="${esc(b.id)}">
        <strong>${esc(b.title)}</strong>
        <small>${esc(b.author || 'المؤلف غير مسجل')}</small>
      </button>`).join('');

    html += `<div class="group-section">
               <p class="group-label">كتب</p>
               <div class="book-list">${btns}</div>
             </div>`;
  }

  if (!html) html = '<div class="empty-state">لا توجد كتب بهذا الحرف.</div>';

  view.innerHTML = `
    ${header(`حرف «${letter}»`, true)}
    <p class="path">اسم الكتاب ← ${letter}</p>
    ${html}`;

  /* أزرار الكلمات المشتركة */
  view.querySelectorAll('[data-word]')
      .forEach(b => b.onclick = () => bookList(letter, b.dataset.word));

  /* أزرار الكتب المباشرة */
  view.querySelectorAll('[data-id]')
      .forEach(b => b.onclick = () => showBook(b.dataset.id));

  $('#back').onclick = letters;
}

/* عرض كتب كلمة مشتركة */
function bookList(letter, word) {
  const group = books
    .filter(b => firstLetter(b.title) === letter && firstWord(b.title) === word)
    .sort((a, b) => norm(a.title).localeCompare(norm(b.title), 'ar'));

  const btns = group.map(b => `
    <button class="book-button" data-id="${esc(b.id)}">
      <strong>${esc(b.title)}</strong>
      <small>${esc(b.author || 'المؤلف غير مسجل')}</small>
    </button>`).join('');

  view.innerHTML = `
    ${header(`كتب تبدأ بـ «${word}»`, true)}
    <p class="path">اسم الكتاب ← ${letter} ← ${word}</p>
    <div class="book-list">${btns}</div>`;

  $('#back').onclick = () => letterContent(letter);
  view.querySelectorAll('[data-id]')
      .forEach(b => b.onclick = () => showBook(b.dataset.id));
}

/* بطاقة الكتاب */
function showBook(id) {
  const b = books.find(x => x.id === id);
  if (!b) return;

  view.innerHTML = `
    ${header('بيانات الكتاب', true)}
    <p class="path">اسم الكتاب ← ${firstLetter(b.title)} ← ${firstWord(b.title)}</p>
    <div class="result-card">
      <div class="label">اسم الكتاب</div>
      <h2>${esc(b.title)}</h2>
      <div class="author">${esc(b.author || 'المؤلف غير مسجل')}</div>
      <div class="location-label">مكان الكتاب</div>
      <div class="location">${esc(b.location || '—')}</div>
      <div class="result-note">تم الوصول من بيانات المكتبة المحلية</div>
    </div>
    <button class="again-button" id="again">العودة إلى الحروف</button>`;

  $('#back').onclick  = () => letterContent(firstLetter(b.title));
  $('#again').onclick = letters;
}

/* ─── wiring ─── */
async function importSheet(file) {
  const buffer = await file.arrayBuffer();
  const wb     = XLSX.read(buffer, { type: 'array' });
  const rows   = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' });
  const next   = mapRows(rows);
  if (!next.length) throw Error('لم أجد عمود اسم الكتاب');
  books = next;
  await putBooks(books);
  setCount();
  $('#sheetInfo').textContent = `تم تحميل ${books.length} كتاب من ${file.name}`;
  letters();
}

function wire() {
  home();
  $('#settingsButton').onclick = () => $('#settingsDialog').showModal();
  $('#closeSettings').onclick  = () => $('#settingsDialog').close();
  $('#settingsDialog').onclick = e => { if (e.target === $('#settingsDialog')) $('#settingsDialog').close(); };
  $('#sheetFile').onchange     = async e => {
    try { await importSheet(e.target.files[0]); }
    catch (err) { $('#sheetInfo').textContent = `تعذر التحميل: ${err.message}`; }
    e.target.value = '';
  };
  $('#resetDemo').onclick = async () => {
    books = DEMO.map(b => ({ ...b }));
    await putBooks(books);
    setCount();
    $('#sheetInfo').textContent = 'تمت استعادة نماذج التجربة';
    home();
  };
}

async function init() {
  await openDb();
  books = await allBooks();
  if (!books.length) {
    books = DEMO.map(b => ({ ...b }));
    await putBooks(books);
  }
  setCount();
  wire();
}

init();
