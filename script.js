'use strict';

/* ---------- Setup & storage ---------- */
const FINE_RATE = 5; // ₹ per overdue day
const K = {
  books: 'lms_books', members: 'lms_members', txns: 'lms_txns', theme: 'lms_theme',
  users: 'lms_users', session: 'lms_session'
};
const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const today = () => fmt(new Date());
const addDays = n => { const d = new Date(); d.setDate(d.getDate() + n); return fmt(d); };
const daysBetween = (a, b) => Math.round((Date.parse(a) - Date.parse(b)) / 864e5);

function load(key, fallback) {
  const raw = localStorage.getItem(key);
  if (raw === null) return fallback;
  try { return JSON.parse(raw); } catch { return fallback; }
}

const seedBooks = [
  ['B001', 'Clean Code', 'Robert C. Martin', 'Programming', '9780132350884', 5],
  ['B002', '1984', 'George Orwell', 'Dystopian', '9780451524935', 4],
  ['B003', 'The Great Gatsby', 'F. Scott Fitzgerald', 'Classic', '9780743273565', 3],
  ['B004', 'To Kill a Mockingbird', 'Harper Lee', 'Classic', '9780061120084', 3],
  ['B005', 'The Hobbit', 'J.R.R. Tolkien', 'Fantasy', '9780547928227', 4],
  ['B006', 'Introduction to Algorithms', 'Thomas H. Cormen', 'Computer Science', '9780262033848', 2]
].map(([id, title, author, category, isbn, qty]) => ({ id, title, author, category, isbn, qty, avail: qty }));

const seedMembers = [
  ['M001', 'Aarav Sharma', 'aarav@example.com', '9876543210', 'Computer Science'],
  ['M002', 'Priya Reddy', 'priya@example.com', '9123456780', 'Electronics'],
  ['M003', 'Rahul Verma', 'rahul@example.com', '9988776655', 'Mechanical']
].map(([id, name, email, phone, dept]) => ({ id, name, email, phone, dept }));

let books = load(K.books, seedBooks);
let members = load(K.members, seedMembers);
let txns = load(K.txns, []);
let users = load(K.users, []);

function saveAll() {
  localStorage.setItem(K.books, JSON.stringify(books));
  localStorage.setItem(K.members, JSON.stringify(members));
  localStorage.setItem(K.txns, JSON.stringify(txns));
}
const saveUsers = () => localStorage.setItem(K.users, JSON.stringify(users));

/* ---------- Helpers: messages, modal, validation ---------- */
function toast(msg, type = 'success') {
  const t = document.createElement('div');
  t.className = 'toast ' + (type === 'error' ? 'error' : '');
  t.textContent = msg;
  $('toasts').appendChild(t);
  setTimeout(() => t.remove(), 3000);
}
function showErr(id, msg) {
  const el = $(id);
  el.textContent = msg || '';
  el.style.display = msg ? 'block' : 'none';
}
const openModal = id => $(id).classList.add('show');
const closeModal = id => $(id).classList.remove('show');

function isValidISBN(raw) {
  const s = raw.replace(/[-\s]/g, '');
  if (/^\d{13}$/.test(s)) {
    const sum = [...s].reduce((a, c, i) => a + Number(c) * (i % 2 ? 3 : 1), 0);
    return sum % 10 === 0;
  }
  if (/^\d{9}[\dXx]$/.test(s)) {
    const sum = [...s].reduce((a, c, i) => a + (/x/i.test(c) ? 10 : Number(c)) * (10 - i), 0);
    return sum % 11 === 0;
  }
  return false;
}
const isValidEmail = e => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e);
const isValidPhone = p => /^[0-9+\-\s]+$/.test(p) && p.replace(/\D/g, '').length >= 10 && p.replace(/\D/g, '').length <= 13;

const mName = t => (members.find(m => m.id === t.memberId) || {}).name || t.memberName;
const bTitle = t => (books.find(b => b.id === t.bookId) || {}).title || t.bookTitle;
const isOverdue = t => t.status === 'Issued' && t.due < today();

/* ---------- Authentication ---------- */
// NOTE: this is a browser-only demo. Real security needs a server-side backend.
async function hashPwd(p) {
  const salted = 'lms|' + p;
  try {
    if (window.crypto && crypto.subtle) {
      const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(salted));
      return 'h1:' + [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
    }
  } catch (err) { /* fall through to simple hash */ }
  let h = 5381;
  for (const c of salted) h = ((h << 5) + h + c.charCodeAt(0)) >>> 0;
  return 'h0:' + h;
}

function switchTab(tab) {
  document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tab));
  $('loginForm').hidden = tab !== 'login';
  $('signupForm').hidden = tab !== 'signup';
  showErr('loginErr'); showErr('signupErr');
  $('loginOk').style.display = 'none';
}

function enterApp(user) {
  document.body.classList.add('authed');
  $('userName').textContent = '👤 ' + user.name.split(' ')[0];
  $('userName').title = user.name + ' (@' + user.username + ')';
  show('dashboard');
}

function currentUser() {
  const name = localStorage.getItem(K.session);
  return users.find(u => u.username === name) || null;
}

async function handleSignup(e) {
  e.preventDefault();
  const name = $('suName').value.trim();
  const username = $('suUser').value.trim();
  const email = $('suEmail').value.trim();
  const pass = $('suPass').value;
  const pass2 = $('suPass2').value;

  if (!name || !username || !email || !pass || !pass2) return showErr('signupErr', 'All fields are required.');
  if (name.length < 2) return showErr('signupErr', 'Please enter your full name.');
  if (!/^[A-Za-z0-9_]{3,20}$/.test(username))
    return showErr('signupErr', 'Username must be 3-20 characters: letters, numbers or underscore.');
  if (!isValidEmail(email)) return showErr('signupErr', 'Please enter a valid email address.');
  if (users.some(u => u.username.toLowerCase() === username.toLowerCase()))
    return showErr('signupErr', 'This username is already taken.');
  if (users.some(u => u.email.toLowerCase() === email.toLowerCase()))
    return showErr('signupErr', 'This email is already registered. Please login instead.');
  if (pass.length < 6) return showErr('signupErr', 'Password must be at least 6 characters.');
  if (pass !== pass2) return showErr('signupErr', 'Passwords do not match.');

  users.push({ name, username, email, password: await hashPwd(pass) });
  saveUsers();
  $('signupForm').reset();
  switchTab('login');
  $('lgUser').value = username;
  $('lgPass').value = '';
  $('loginOk').textContent = 'Account created successfully! Please login.';
  $('loginOk').style.display = 'block';
  toast('Registration successful.');
}

async function handleLogin(e) {
  e.preventDefault();
  const id = $('lgUser').value.trim().toLowerCase();
  const pass = $('lgPass').value;
  $('loginOk').style.display = 'none';
  if (!id || !pass) return showErr('loginErr', 'Enter your username/email and password.');

  const user = users.find(u => u.username.toLowerCase() === id || u.email.toLowerCase() === id);
  if (!user) return showErr('loginErr', 'No account found. Please sign up first.');
  if (user.password !== await hashPwd(pass)) return showErr('loginErr', 'Incorrect password. Please try again.');

  showErr('loginErr');
  localStorage.setItem(K.session, user.username);
  $('loginForm').reset();
  enterApp(user);
  toast('Welcome, ' + user.name + '!');
}

function logout() {
  if (!confirm('Are you sure you want to logout?')) return;
  localStorage.removeItem(K.session);
  document.body.classList.remove('authed');
  document.querySelectorAll('.modal-overlay').forEach(o => o.classList.remove('show'));
  $('sidebar').classList.remove('open');
  switchTab('login');
  toast('You have been logged out.');
}

/* ---------- Navigation, theme ---------- */
function show(section) {
  document.querySelectorAll('.section').forEach(s => s.classList.toggle('active', s.id === section));
  document.querySelectorAll('.nav-btn[data-section]').forEach(b => b.classList.toggle('active', b.dataset.section === section));
  $('sidebar').classList.remove('open');
  renderAll();
}
function applyTheme(t) {
  document.documentElement.dataset.theme = t;
  $('themeBtn').textContent = t === 'dark' ? '☀️' : '🌙';
  localStorage.setItem(K.theme, t);
}

/* ---------- Books ---------- */
function refreshCategories() {
  const cats = [...new Set(books.map(b => b.category))].sort();
  const cur = $('bookCat').value;
  $('bookCat').innerHTML = '<option value="">All Categories</option>' + cats.map(c => `<option>${esc(c)}</option>`).join('');
  if (cats.includes(cur)) $('bookCat').value = cur;
  $('catList').innerHTML = cats.map(c => `<option value="${esc(c)}">`).join('');
}

function renderBooks() {
  const q = $('bookSearch').value.trim().toLowerCase();
  const cat = $('bookCat').value;
  const sort = $('bookSort').value;
  const list = books.filter(b =>
    (!cat || b.category === cat) &&
    (!q || [b.title, b.author, b.category, b.isbn].some(v => v.toLowerCase().includes(q))));
  if (sort) list.sort((a, b) => a[sort].localeCompare(b[sort]));
  $('booksBody').innerHTML = list.map(b => `
    <tr>
      <td>${esc(b.id)}</td><td>${esc(b.title)}</td><td>${esc(b.author)}</td><td>${esc(b.category)}</td>
      <td>${esc(b.isbn)}</td><td>${b.qty}</td><td>${b.avail}</td>
      <td><button class="btn-sm edit" data-edit="${esc(b.id)}">Edit</button>
          <button class="btn-sm del" data-del="${esc(b.id)}">Delete</button></td>
    </tr>`).join('');
  $('booksEmpty').style.display = list.length ? 'none' : 'block';
}

function openBookModal(id) {
  $('bookForm').reset();
  showErr('bookErr');
  const b = books.find(x => x.id === id);
  $('bookModalTitle').textContent = b ? 'Edit Book' : 'Add Book';
  $('bId').readOnly = !!b;
  $('bookForm').dataset.editing = b ? b.id : '';
  if (b) {
    $('bId').value = b.id; $('bTitle').value = b.title; $('bAuthor').value = b.author;
    $('bCategory').value = b.category; $('bIsbn').value = b.isbn; $('bQty').value = b.qty;
  }
  openModal('bookModal');
}

function saveBook(e) {
  e.preventDefault();
  const editing = e.target.dataset.editing;
  const v = {
    id: $('bId').value.trim(), title: $('bTitle').value.trim(), author: $('bAuthor').value.trim(),
    category: $('bCategory').value.trim(), isbn: $('bIsbn').value.trim()
  };
  const qty = Number($('bQty').value);
  if (!v.id || !v.title || !v.author || !v.category || !v.isbn || !$('bQty').value.trim())
    return showErr('bookErr', 'All fields are required.');
  if (!editing && books.some(b => b.id.toLowerCase() === v.id.toLowerCase()))
    return showErr('bookErr', 'Book ID already exists. Please use a unique ID.');
  if (!isValidISBN(v.isbn))
    return showErr('bookErr', 'Invalid ISBN. Enter a valid 10 or 13 digit ISBN.');
  if (!Number.isInteger(qty) || qty <= 0)
    return showErr('bookErr', 'Quantity must be a positive whole number.');

  if (editing) {
    const b = books.find(x => x.id === editing);
    const issuedCount = b.qty - b.avail;
    if (qty < issuedCount)
      return showErr('bookErr', `Quantity cannot be less than currently issued copies (${issuedCount}).`);
    Object.assign(b, v, { id: b.id, qty, avail: qty - issuedCount });
    toast('Book updated successfully.');
  } else {
    books.push({ ...v, qty, avail: qty });
    toast('Book added successfully.');
  }
  saveAll(); closeModal('bookModal'); renderAll();
}

function deleteBook(id) {
  if (txns.some(t => t.bookId === id && t.status === 'Issued'))
    return toast('Cannot delete: this book has copies currently issued.', 'error');
  if (!confirm('Are you sure you want to delete this book?')) return;
  books = books.filter(b => b.id !== id);
  saveAll(); renderAll(); toast('Book deleted.');
}

/* ---------- Members ---------- */
function renderMembers() {
  const q = $('memberSearch').value.trim().toLowerCase();
  const list = members.filter(m => !q || [m.id, m.name, m.email, m.phone, m.dept].some(v => v.toLowerCase().includes(q)));
  $('membersBody').innerHTML = list.map(m => `
    <tr>
      <td>${esc(m.id)}</td><td>${esc(m.name)}</td><td>${esc(m.email)}</td><td>${esc(m.phone)}</td><td>${esc(m.dept)}</td>
      <td><button class="btn-sm edit" data-edit="${esc(m.id)}">Edit</button>
          <button class="btn-sm del" data-del="${esc(m.id)}">Delete</button></td>
    </tr>`).join('');
  $('membersEmpty').style.display = list.length ? 'none' : 'block';
}

function openMemberModal(id) {
  $('memberForm').reset();
  showErr('memberErr');
  const m = members.find(x => x.id === id);
  $('memberModalTitle').textContent = m ? 'Edit Member' : 'Add Member';
  $('mId').readOnly = !!m;
  $('memberForm').dataset.editing = m ? m.id : '';
  if (m) {
    $('mId').value = m.id; $('mName').value = m.name; $('mEmail').value = m.email;
    $('mPhone').value = m.phone; $('mDept').value = m.dept;
  }
  openModal('memberModal');
}

function saveMember(e) {
  e.preventDefault();
  const editing = e.target.dataset.editing;
  const v = {
    id: $('mId').value.trim(), name: $('mName').value.trim(), email: $('mEmail').value.trim(),
    phone: $('mPhone').value.trim(), dept: $('mDept').value.trim()
  };
  if (Object.values(v).some(x => !x)) return showErr('memberErr', 'All fields are required.');
  if (!editing && members.some(m => m.id.toLowerCase() === v.id.toLowerCase()))
    return showErr('memberErr', 'Member ID already exists. Please use a unique ID.');
  if (!isValidEmail(v.email)) return showErr('memberErr', 'Please enter a valid email address.');
  if (!isValidPhone(v.phone)) return showErr('memberErr', 'Please enter a valid phone number (10 digits).');

  if (editing) {
    Object.assign(members.find(m => m.id === editing), v, { id: editing });
    toast('Member updated successfully.');
  } else {
    members.push(v);
    toast('Member added successfully.');
  }
  saveAll(); closeModal('memberModal'); renderAll();
}

function deleteMember(id) {
  if (txns.some(t => t.memberId === id && t.status === 'Issued'))
    return toast('Cannot delete: this member has books currently issued.', 'error');
  if (!confirm('Are you sure you want to delete this member?')) return;
  members = members.filter(m => m.id !== id);
  saveAll(); renderAll(); toast('Member deleted.');
}

/* ---------- Issue / Return ---------- */
function fillSelects() {
  const mv = $('issMember').value, bv = $('issBook').value;
  $('issMember').innerHTML = '<option value="">-- Select Member --</option>' +
    members.map(m => `<option value="${esc(m.id)}">${esc(m.id)} - ${esc(m.name)}</option>`).join('');
  $('issBook').innerHTML = '<option value="">-- Select Book --</option>' +
    books.map(b => `<option value="${esc(b.id)}">${esc(b.id)} - ${esc(b.title)} (${b.avail ? b.avail + ' available' : 'Not available'})</option>`).join('');
  $('issMember').value = mv; $('issBook').value = bv;
}

function issueBook(e) {
  e.preventDefault();
  const mid = $('issMember').value, bid = $('issBook').value;
  const issue = $('issDate').value, due = $('dueDate').value;
  if (!mid || !bid || !issue || !due) return showErr('issueErr', 'Please select a member, a book, and both dates.');
  if (due < issue) return showErr('issueErr', 'Due date cannot be earlier than the issue date.');
  const book = books.find(b => b.id === bid), member = members.find(m => m.id === mid);
  if (!book || !member) return showErr('issueErr', 'Invalid member or book selected.');
  if (book.avail <= 0) return showErr('issueErr', 'No copies of this book are available right now.');

  book.avail--;
  txns.push({
    id: 'T' + Date.now().toString().slice(-8), memberId: mid, memberName: member.name,
    bookId: bid, bookTitle: book.title, issue, due, status: 'Issued', returnDate: '', overdue: 0, fine: 0
  });
  saveAll(); showErr('issueErr');
  $('issMember').value = ''; $('issBook').value = '';
  renderAll();
  toast(`"${book.title}" issued to ${member.name}.`);
}

function returnBook(id) {
  const t = txns.find(x => x.id === id);
  if (!t) return toast('Transaction not found.', 'error');
  if (t.status === 'Returned') return toast('This book has already been returned.', 'error');
  const rd = today();
  t.overdue = Math.max(0, daysBetween(rd, t.due));
  t.fine = t.overdue * FINE_RATE;
  t.returnDate = rd;
  t.status = 'Returned';
  const book = books.find(b => b.id === t.bookId);
  if (book && book.avail < book.qty) book.avail++;
  saveAll(); renderAll();
  toast(t.fine ? `Book returned. ${t.overdue} day(s) overdue. Fine: ₹${t.fine}` : 'Book returned on time. No fine.');
}

function renderIssued() {
  const list = txns.filter(t => t.status === 'Issued');
  $('issuedBody').innerHTML = list.map(t => `
    <tr>
      <td>${t.id}</td><td>${esc(mName(t))}</td><td>${esc(bTitle(t))}</td><td>${t.issue}</td><td>${t.due}</td>
      <td><span class="badge ${isOverdue(t) ? 'b-overdue' : 'b-issued'}">${isOverdue(t) ? 'Overdue' : 'Issued'}</span></td>
      <td><button class="btn-sm ret" data-return="${t.id}">Return</button></td>
    </tr>`).join('');
  $('issuedEmpty').style.display = list.length ? 'none' : 'block';
}

/* ---------- Dashboard & Reports ---------- */
function renderStats() {
  const total = books.reduce((s, b) => s + b.qty, 0);
  const avail = books.reduce((s, b) => s + b.avail, 0);
  const issued = txns.filter(t => t.status === 'Issued').length;
  const returned = txns.filter(t => t.status === 'Returned').length;
  const overdue = txns.filter(isOverdue).length;
  const fine = txns.reduce((s, t) => s + (t.fine || 0), 0);
  $('stTotal').textContent = total; $('stAvail').textContent = avail;
  $('stIssued').textContent = issued; $('stMembers').textContent = members.length;
  $('rpBooks').textContent = total; $('rpMembers').textContent = members.length;
  $('rpIssued').textContent = issued; $('rpReturned').textContent = returned;
  $('rpOverdue').textContent = overdue; $('rpFine').textContent = '₹' + fine;
}

function renderHistory() {
  const list = [...txns].reverse();
  $('historyBody').innerHTML = list.map(t => {
    const od = t.status === 'Returned' ? t.overdue : Math.max(0, daysBetween(today(), t.due));
    const cls = t.status === 'Returned' ? 'b-returned' : (isOverdue(t) ? 'b-overdue' : 'b-issued');
    return `<tr>
      <td>${t.id}</td><td>${esc(mName(t))}</td><td>${esc(bTitle(t))}</td><td>${t.issue}</td><td>${t.due}</td>
      <td>${t.returnDate || '-'}</td><td>${od}</td><td>${t.status === 'Returned' ? '₹' + t.fine : '-'}</td>
      <td><span class="badge ${cls}">${isOverdue(t) ? 'Overdue' : t.status}</span></td></tr>`;
  }).join('');
  $('historyEmpty').style.display = list.length ? 'none' : 'block';
}

function renderAll() {
  refreshCategories(); renderStats(); renderBooks(); renderMembers();
  fillSelects(); renderIssued(); renderHistory();
}

/* ---------- Event wiring ---------- */
// Auth
document.querySelectorAll('[data-tab]').forEach(el => el.addEventListener('click', e => {
  e.preventDefault(); switchTab(el.dataset.tab);
}));
$('loginForm').addEventListener('submit', handleLogin);
$('signupForm').addEventListener('submit', handleSignup);
document.querySelectorAll('[data-toggle]').forEach(cb => cb.addEventListener('change', () => {
  cb.dataset.toggle.split(',').forEach(id => { $(id).type = cb.checked ? 'text' : 'password'; });
}));
$('logoutBtn').addEventListener('click', logout);
$('logoutSide').addEventListener('click', logout);

// App
document.querySelectorAll('.nav-btn[data-section]').forEach(b => b.addEventListener('click', () => show(b.dataset.section)));
$('menuBtn').addEventListener('click', () => $('sidebar').classList.toggle('open'));
$('themeBtn').addEventListener('click', () => applyTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'));
$('printBtn').addEventListener('click', () => window.print());

$('addBookBtn').addEventListener('click', () => openBookModal());
$('addMemberBtn').addEventListener('click', () => openMemberModal());
$('bookForm').addEventListener('submit', saveBook);
$('memberForm').addEventListener('submit', saveMember);
$('issueForm').addEventListener('submit', issueBook);

['bookSearch', 'bookCat', 'bookSort'].forEach(id => $(id).addEventListener('input', renderBooks));
$('memberSearch').addEventListener('input', renderMembers);

$('booksBody').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  if (b.dataset.edit) openBookModal(b.dataset.edit);
  if (b.dataset.del) deleteBook(b.dataset.del);
});
$('membersBody').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  if (b.dataset.edit) openMemberModal(b.dataset.edit);
  if (b.dataset.del) deleteMember(b.dataset.del);
});
$('issuedBody').addEventListener('click', e => {
  const b = e.target.closest('button');
  if (b && b.dataset.return) returnBook(b.dataset.return);
});

document.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => closeModal(b.dataset.close)));
document.querySelectorAll('.modal-overlay').forEach(o => o.addEventListener('click', e => { if (e.target === o) o.classList.remove('show'); }));
document.addEventListener('keydown', e => { if (e.key === 'Escape') document.querySelectorAll('.modal-overlay').forEach(o => o.classList.remove('show')); });

/* ---------- Init ---------- */
async function init() {
  $('today').textContent = new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  $('issDate').value = today();
  $('dueDate').value = addDays(14);
  applyTheme(load(K.theme, 'light'));
  saveAll(); // persists sample data on first run

  // Create a demo admin account on first run
  if (!users.length) {
    users.push({ name: 'Administrator', username: 'admin', email: 'admin@library.com', password: await hashPwd('admin123') });
    saveUsers();
  }

  // Restore session, otherwise show the login page
  const user = currentUser();
  if (user) enterApp(user);
  else { localStorage.removeItem(K.session); renderAll(); }
}
init();