'use strict';

/* ==========================================================================
   gee-companion · Ahotɔ Wellness Enterprise
   Everyday Health. Everyday Wellness.
   Native iOS Mobile Companion with Step-by-Step Survey Logging
   ========================================================================== */

const DB_NAME = 'weight-companion-db';
const DB_VERSION = 1;
const STORE = 'records';
const PROFILE_KEY = 'wc-profile-v1';
const PREFS_KEY = 'wc-prefs-v1';

const DEFAULT_PROFILE = {
  age: 42,
  sex: 'Male',
  heightCm: 160,
  startWeight: 73,
  firstMilestone: 68,
  nextMilestones: [64, 60],
  targetLow: 54,
  targetHigh: 56,
  waterTargetMl: 2500,
  strengthTarget: 3,
  hiitTarget: 2,
  wakeTime: '',
  bedTime: '',
  fluidRestriction: false,
  exerciseRestriction: false
};

const DEFAULT_PREFS = {
  theme: 'system',
  notifications: false,
  onboardingDone: true
};

const WORKOUT = [
  ['Chair squat', '12–15 reps', 'Use a chair; add backpack resistance when comfortable.'],
  ['Incline push-up', '8–15 reps', 'Hands on a stable counter/table; progress lower as you get stronger.'],
  ['Backpack bent-over row', '10–15 reps', 'Pull toward lower chest/abdomen with a straight back.'],
  ['Reverse lunge', '8–12 / leg', 'Hold a chair for balance; use chair squats if knees object.'],
  ['Glute bridge', '15–20 reps', 'Pause and squeeze at the top.'],
  ['Backpack overhead press', '8–12 reps', 'Use a light load; skip if shoulder pain.'],
  ['Plank', '20–30 sec', 'Progress gradually toward 45–60 sec.']
];

let db;
let state = {
  profile: loadJSON(PROFILE_KEY, DEFAULT_PROFILE),
  prefs: loadJSON(PREFS_KEY, DEFAULT_PREFS),
  records: []
};
let deferredInstallPrompt = null;
let route = 'today';

/* ==========================================================================
   Utilities
   ========================================================================== */
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const pad = n => String(n).padStart(2, '0');
const nowIso = () => new Date().toISOString();
const localDate = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const formatDate = iso => new Date(iso + 'T12:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
const esc = (v = '') => String(v).replace(/[&<>'"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c]));
const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
const uid = () => `${Date.now()}-${Math.random().toString(16).slice(2)}`;

function haptic(ms = 10) {
  try {
    if (navigator.vibrate) navigator.vibrate(ms);
  } catch (_) {}
}

function loadJSON(k, fallback) {
  try {
    return { ...fallback, ...JSON.parse(localStorage.getItem(k) || '{}') };
  } catch {
    return { ...fallback };
  }
}
function saveProfile() {
  localStorage.setItem(PROFILE_KEY, JSON.stringify(state.profile));
}
function savePrefs() {
  localStorage.setItem(PREFS_KEY, JSON.stringify(state.prefs));
}
function toast(msg) {
  const t = $('#toast');
  if (!t) return;
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.remove('show'), 2200);
}

/* ==========================================================================
   IndexedDB Persistence (100% Offline)
   ========================================================================== */
function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const d = req.result;
      if (!d.objectStoreNames.contains(STORE)) {
        const s = d.createObjectStore(STORE, { keyPath: 'id' });
        s.createIndex('type', 'type');
        s.createIndex('date', 'date');
      }
    };
    req.onsuccess = () => {
      db = req.result;
      resolve(db);
    };
    req.onerror = () => reject(req.error);
  });
}

function dbPut(rec) {
  return new Promise((res, rej) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(rec);
    tx.oncomplete = () => res(rec);
    tx.onerror = () => rej(tx.error);
  });
}

function dbDelete(id) {
  return new Promise((res, rej) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(id);
    tx.oncomplete = res;
    tx.onerror = () => rej(tx.error);
  });
}

function dbAll() {
  return new Promise((res, rej) => {
    const tx = db.transaction(STORE, 'readonly');
    const q = tx.objectStore(STORE).getAll();
    q.onsuccess = () => res(q.result || []);
    q.onerror = () => rej(q.error);
  });
}

async function addRecord(type, data = {}) {
  const rec = { id: uid(), type, date: data.date || localDate(), createdAt: nowIso(), ...data };
  await dbPut(rec);
  state.records.unshift(rec);
  render();
  return rec;
}

async function removeRecord(id) {
  await dbDelete(id);
  state.records = state.records.filter(r => r.id !== id);
  render();
}

function dayRecords(date = localDate()) {
  return state.records.filter(r => r.date === date);
}

function startOfWeek(d = new Date()) {
  const x = new Date(d);
  const day = (x.getDay() + 6) % 7;
  x.setHours(0, 0, 0, 0);
  x.setDate(x.getDate() - day);
  return x;
}

function dateFromLocal(s) {
  return new Date(`${s}T12:00:00`);
}

function inWeek(rec, start) {
  const d = dateFromLocal(rec.date);
  const end = new Date(start);
  end.setDate(end.getDate() + 7);
  return d >= start && d < end;
}

function weekData(offset = 0) {
  const start = startOfWeek();
  start.setDate(start.getDate() + (offset * 7));
  return state.records.filter(r => inWeek(r, start));
}

function sum(arr, fn = x => x) {
  return arr.reduce((a, x) => a + (Number(fn(x)) || 0), 0);
}

function avg(arr, fn = x => x) {
  return arr.length ? sum(arr, fn) / arr.length : null;
}

function morningWeights(data = state.records) {
  return data.filter(r => r.type === 'weight' && r.context === 'Morning').sort((a, b) => a.date.localeCompare(b.date));
}

function currentWeight() {
  const m = morningWeights();
  return m.length ? Number(m[m.length - 1].kg) : state.profile.startWeight;
}

function weeklyMorningAverage(offset = 0) {
  const w = morningWeights(weekData(offset));
  return w.length ? avg(w, x => Number(x.kg)) : null;
}

function weeklyChange() {
  const c = weeklyMorningAverage(0), p = weeklyMorningAverage(-1);
  return c != null && p != null ? c - p : null;
}

function bmi(weight = currentWeight()) {
  const h = state.profile.heightCm / 100;
  return weight / (h * h);
}

function dayStats(date = localDate()) {
  const d = dayRecords(date);
  const meals = d.filter(r => r.type === 'meal');
  return {
    water: sum(d.filter(r => r.type === 'water'), r => r.ml),
    meals: meals.length,
    postWalks: d.filter(r => r.type === 'walk' && r.postMeal).length,
    walkMin: sum(d.filter(r => r.type === 'walk'), r => r.minutes),
    strength: d.filter(r => r.type === 'workout' && r.kind === 'Strength').length,
    hiit: d.filter(r => r.type === 'workout' && r.kind === 'HIIT').length,
    breaks: d.filter(r => r.type === 'break').length,
    sugary: meals.filter(m => ['Sugary drink', 'Juice', 'Malt', 'Alcohol'].includes(m.drink)).length,
    caffeine: d.filter(r => r.type === 'drink' && r.caffeinated).length,
    tea: d.filter(r => r.type === 'drink' && r.name.includes('Tiens')).length
  };
}

function weekStats(offset = 0) {
  const d = weekData(offset);
  const meals = d.filter(r => r.type === 'meal');
  const walks = d.filter(r => r.type === 'walk');
  const water = d.filter(r => r.type === 'water');
  const activeDates = [...new Set(d.map(r => r.date))];
  const waterByDate = {};
  water.forEach(r => waterByDate[r.date] = (waterByDate[r.date] || 0) + Number(r.ml));
  const proteinMeals = meals.filter(m => m.protein && m.protein !== 'None' && m.proteinAmount !== 'Low').length;
  const vegMeals = meals.filter(m => ['Good portion', 'Large portion'].includes(m.vegetables)).length;
  const highStarch = meals.filter(m => m.starch === 'Large').length;
  const sugary = meals.filter(m => ['Sugary drink', 'Juice', 'Malt', 'Alcohol'].includes(m.drink)).length;
  const snackExtras = meals.filter(m => m.extras && m.extras !== 'None').length;
  const postWalks = walks.filter(w => w.postMeal);
  return {
    walkingMinutes: sum(walks, r => r.minutes),
    postWalkingMinutes: sum(postWalks, r => r.minutes),
    postWalks: postWalks.length,
    mealCount: meals.length,
    postWalkRate: meals.length ? postWalks.length / meals.length : 0,
    strength: d.filter(r => r.type === 'workout' && r.kind === 'Strength').length,
    hiit: d.filter(r => r.type === 'workout' && r.kind === 'HIIT').length,
    breaks: d.filter(r => r.type === 'break').length,
    waterAvg: activeDates.length ? avg(activeDates, x => waterByDate[x] || 0) : 0,
    proteinRate: meals.length ? proteinMeals / meals.length : 0,
    vegRate: meals.length ? vegMeals / meals.length : 0,
    highStarch, sugary, snackExtras,
    morningCount: morningWeights(d).length,
    avgWeight: weeklyMorningAverage(offset)
  };
}

function consistencyScore(offset = 0) {
  const s = weekStats(offset);
  let num = 0, den = 0;
  if (s.mealCount) {
    den += 3;
    num += Math.min(1, s.proteinRate) * 1 + Math.min(1, s.postWalkRate) * 1 + (s.sugary === 0 ? 1 : Math.max(0, 1 - s.sugary / s.mealCount));
  }
  if (s.waterAvg > 0) {
    den += 1;
    num += Math.min(1, s.waterAvg / state.profile.waterTargetMl);
  }
  den += 1;
  num += Math.min(1, s.strength / Math.max(2, state.profile.strengthTarget));
  return den ? Math.round((num / den) * 100) : null;
}

function nextAction() {
  const s = dayStats();
  if (s.water < 500) return ['Start with water', 'Drink about 500–600 mL to begin your day.', '+500 mL', 'water'];
  if (s.meals === 0) return ['Stay with the plan', 'Have your first protein-centred meal when genuinely hungry.', 'Log meal', 'meal'];
  if (s.meals > s.postWalks) return ['Walk after your meal', 'A 10–15 minute brisk walk completes this habit.', 'Done 10 min', 'postwalk'];
  if (s.water < state.profile.waterTargetMl * 0.7) return ['Top up your water', `${(s.water / 1000).toFixed(1)} L logged so far. Spread fluids through the day.`, '+500 mL', 'water'];
  const dow = new Date().getDay();
  const strengthDay = [1, 3, 5].includes(dow);
  const hiitDay = [2, 6].includes(dow);
  if (strengthDay && !s.strength && !state.profile.exerciseRestriction) return ['Strength session due', 'Complete your planned indoor resistance workout.', 'Start workout', 'strength'];
  if (hiitDay && !s.hiit && !state.profile.exerciseRestriction) return ['HIIT is optional today', '15–20 minutes is sufficient; avoid compensating for food.', 'Log HIIT', 'hiit'];
  if (s.meals < 2) return ['Next meal', 'Keep the second meal protein-centred and lighter on starch.', 'Log meal', 'meal'];
  return ['Stay steady', 'You have covered the core habits today. Rest well tonight.', 'Add note', 'note'];
}

function dssNotes() {
  const s = weekStats(), change = weeklyChange(), score = consistencyScore();
  const out = [];
  if (change != null) {
    const loss = -change;
    if (loss >= 0.3 && loss <= 0.9) out.push(['ok', 'Weight trend is moving in the intended direction. Keep the routine steady rather than making it stricter.']);
    if (loss > 1 && morningWeights(weekData(-1)).length >= 2) out.push(['warn', 'Weight is falling rapidly. Keep hydration steady and consult a clinician if you feel faint or unwell.']);
    if (Math.abs(change) < 0.2 && score != null && score < 70) {
      if (s.sugary > 0) out.push(['warn', 'The clearest opportunity is liquid calories. Replace sugary drinks, juice, malt, or alcohol with water.']);
      else if (s.postWalkRate < 0.6) out.push(['warn', 'Post-meal walks are irregular. Target a 10–15 minute walk after main meals.']);
      else if (s.highStarch > 1) out.push(['warn', 'Large starch portions appeared multiple times. Aim for about one fist per main meal.']);
    }
  }
  if (s.strength < 2 && new Date().getDay() === 0) out.push(['warn', 'Strength training was low this week. Aim for at least 2 sessions next week.']);
  if (s.hiit > 3) out.push(['warn', 'More HIIT is not necessarily better. Prioritise post-meal walking and resistance training.']);
  if (s.waterAvg > 0 && s.waterAvg < state.profile.waterTargetMl * 0.7) out.push(['warn', 'Recorded water intake is below target. Keep a bottle close by.']);
  return out.slice(0, 3);
}

/* ==========================================================================
   Views Rendering
   ========================================================================== */
function render() {
  $('#dateLabel').textContent = new Date().toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  const titles = { today: 'Today', log: 'Log', progress: 'Progress', plan: 'Plan', more: 'More' };
  $('#pageTitle').textContent = titles[route] || 'Today';

  $$('.nav-item').forEach(b => b.classList.toggle('active', b.dataset.route === route));

  const v = $('#view');
  if (route === 'today') v.innerHTML = todayView();
  if (route === 'log') v.innerHTML = logView();
  if (route === 'progress') {
    v.innerHTML = progressView();
    requestAnimationFrame(drawChart);
  }
  if (route === 'plan') v.innerHTML = planView();
  if (route === 'more') v.innerHTML = moreView();

  bindViewEvents();
}

function todayView() {
  const s = dayStats(), n = nextAction(), wa = weeklyMorningAverage(), ch = weeklyChange(), current = wa ?? currentWeight();
  const remaining = Math.max(0, current - state.profile.firstMilestone);
  const progress = clamp(((state.profile.startWeight - current) / (state.profile.startWeight - state.profile.firstMilestone)) * 100, 0, 100);
  const dss = dssNotes();

  return `
    <section class="card hero">
      <div class="hero-grid">
        <div>
          <p class="eyebrow">First Milestone</p>
          <div><span class="metric-big">${current.toFixed(1)}</span> <span class="metric-unit">kg ${wa != null ? 'weekly avg' : 'latest'}</span></div>
          <p class="subtle">${remaining.toFixed(1)} kg to ${state.profile.firstMilestone} kg</p>
        </div>
        <div class="pill">BMI ${bmi(current).toFixed(1)}</div>
      </div>
      <div class="progress"><span style="width:${progress}%"></span></div>
      <div class="row" style="margin-top: 8px">
        <span class="subtle">Start: ${state.profile.startWeight} kg</span>
        <span class="subtle">Target: ${state.profile.firstMilestone} kg</span>
      </div>
    </section>

    <section class="card next-card">
      <p class="eyebrow">Next Routine Step</p>
      <h2>${esc(n[0])}</h2>
      <p>${esc(n[1])}</p>
      <button class="secondary-btn" data-quick="${n[3]}">${esc(n[2])}</button>
    </section>

    <section>
      <h2 class="section-title">Today's Habits</h2>
      <div class="grid-2">
        ${metricCard('Water Logged', `${(s.water / 1000).toFixed(1)} / ${(state.profile.waterTargetMl / 1000).toFixed(1)} L`, s.water / state.profile.waterTargetMl)}
        ${metricCard('Main Meals', `${Math.min(s.meals, 2)} / 2`, Math.min(1, s.meals / 2))}
        ${metricCard('Post-Meal Walks', `${s.postWalks} / ${Math.min(2, s.meals || 2)}`, s.meals ? Math.min(1, s.postWalks / s.meals) : 0)}
        ${metricCard('Move Breaks', `${s.breaks} breaks`, Math.min(1, s.breaks / 4))}
      </div>
    </section>

    <section>
      <h2 class="section-title">Quick Tap Log</h2>
      <div class="quick-grid">
        ${qbtn('💧', '+250 mL', 'water250')}
        ${qbtn('🥤', '+500 mL', 'water')}
        ${qbtn('🍽️', 'Meal', 'meal')}
        ${qbtn('🚶‍♂️', 'Walk', 'walk')}
        ${qbtn('⚖️', 'Weight', 'weight')}
        ${qbtn('🏋️', 'Workout', 'strength')}
        ${qbtn('🍵', 'Tiens Tea', 'tea')}
        ${qbtn('☕', 'Coffee', 'coffee')}
        ${qbtn('↕️', 'Move Break', 'break')}
        ${qbtn('📝', 'Note', 'note')}
        ${qbtn('🚫', 'No Scale', 'noscale')}
      </div>
    </section>

    ${ch != null ? `
    <section class="card">
      <div class="row">
        <div>
          <p class="eyebrow">Weekly Average Trend</p>
          <div class="kpi">${ch > 0 ? '+' : ''}${ch.toFixed(1)} kg</div>
        </div>
        <span class="pill ${ch < 0 ? 'ok' : 'warn'}">${ch < 0 ? '↓ Moving down' : 'Trend steady'}</span>
      </div>
    </section>` : ''}

    ${dss.length ? `
    <section>
      <h2 class="section-title">Daily Guidance</h2>
      ${dss.map(([k, m]) => `<div class="alert ${k}">${esc(m)}</div>`).join('')}
    </section>` : ''}
  `;
}

function metricCard(label, val, p) {
  return `
    <div class="mini-card">
      <div class="label">${label}</div>
      <div class="value">${val}</div>
      <div class="progress" style="margin-top: 6px">
        <span style="width:${clamp((p || 0) * 100, 0, 100)}%"></span>
      </div>
    </div>
  `;
}

function qbtn(icon, label, action) {
  return `<button class="quick-btn" data-quick="${action}"><span>${icon}</span><b>${label}</b></button>`;
}

function logView() {
  const sorted = [...state.records].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 60);
  return `
    <section class="card">
      <h2 class="section-title">Record Activity</h2>
      <div class="quick-grid">
        ${qbtn('⚖️', 'Weight', 'weight')}
        ${qbtn('🍽️', 'Meal', 'meal')}
        ${qbtn('💧', 'Water', 'water')}
        ${qbtn('🚶‍♂️', 'Walk', 'walk')}
        ${qbtn('🏋️', 'Workout', 'strength')}
        ${qbtn('📝', 'Note', 'note')}
      </div>
    </section>

    <section class="card">
      <div class="row">
        <h2 class="section-title">Recent Entries</h2>
        <span class="pill">${state.records.length} saved</span>
      </div>
      ${sorted.length ? sorted.map(historyItem).join('') : '<div class="subtle" style="text-align:center;padding:24px 0;">No entries recorded yet. Tap any item above to log.</div>'}
    </section>
  `;
}

function historyItem(r) {
  let title = r.type, detail = '';
  if (r.type === 'weight') { title = `${r.context || 'Morning'} Weight`; detail = `${r.kg} kg${r.note ? ' · ' + esc(r.note) : ''}`; }
  if (r.type === 'water') { title = 'Hydration'; detail = `${r.ml} mL water`; }
  if (r.type === 'meal') { title = `${r.meal || 'Meal'}`; detail = `${esc(r.protein || '')} · starch: ${esc(r.starch || '1 fist')}${r.drink ? ' · ' + esc(r.drink) : ''}`; }
  if (r.type === 'walk') { title = r.postMeal ? 'Post-Meal Walk' : 'Walk'; detail = `${r.minutes} min${r.steps ? ' · ' + r.steps + ' steps' : ''}`; }
  if (r.type === 'workout') { title = r.kind || 'Workout'; detail = `${r.rounds ? `${r.rounds} rounds · ` : ''}${r.minutes} min`; }
  if (r.type === 'break') { title = 'Movement Break'; detail = `${r.minutes} min active pause`; }
  if (r.type === 'drink') { title = r.name || 'Drink'; detail = r.caffeinated ? 'Caffeinated' : 'Caffeine-free'; }
  if (r.type === 'note') { title = 'Daily Note'; detail = esc(r.text); }
  if (r.type === 'noscale') { title = 'Scale Unavailable'; detail = 'Logged without penalty'; }

  return `
    <div class="log-item">
      <div class="row">
        <div>
          <h4>${esc(title)}</h4>
          <p>${formatDate(r.date)} · ${detail}</p>
        </div>
        <button class="ghost-btn" style="padding:4px 8px;font-size:0.75rem;" data-delete="${r.id}">Delete</button>
      </div>
    </div>
  `;
}

function progressView() {
  const s = weekStats(), p = weekStats(-1), change = weeklyChange(), score = consistencyScore();
  const avgText = s.avgWeight != null ? s.avgWeight.toFixed(1) + ' kg' : 'Awaiting data';

  return `
    <section class="grid-3">
      <div class="mini-card">
        <div class="label">This Week</div>
        <div class="kpi">${avgText}</div>
        <div class="subtle">morning avg</div>
      </div>
      <div class="mini-card">
        <div class="label">Weekly Diff</div>
        <div class="kpi">${change == null ? '—' : `${change > 0 ? '+' : ''}${change.toFixed(1)}`}</div>
        <div class="subtle">kg vs last wk</div>
      </div>
      <div class="mini-card">
        <div class="label">Consistency</div>
        <div class="kpi">${score == null ? '—' : score + '%'}</div>
        <div class="subtle">habit score</div>
      </div>
    </section>

    <section class="card">
      <h2 class="section-title">Morning Weight Trend (kg)</h2>
      <div class="chart-wrap"><canvas id="weightChart"></canvas></div>
      <div class="legend">
        <span><i></i>Daily morning weight</span>
        <span><i class="alt"></i>Weekly moving avg</span>
      </div>
    </section>

    <section class="card">
      ${weeklyReviewHTML(s, p, change, score)}
    </section>

    <section class="card">
      <h2 class="section-title">Weekly Behaviour Summary</h2>
      <table class="table">
        <tbody>
          <tr><th>Total Walking</th><td>${s.walkingMinutes} min</td></tr>
          <tr><th>Post-Meal Walks</th><td>${s.postWalks} / ${s.mealCount || 0} meals (${Math.round(s.postWalkRate * 100)}%)</td></tr>
          <tr><th>Strength Training</th><td>${s.strength} / ${state.profile.strengthTarget} sessions</td></tr>
          <tr><th>HIIT Sessions</th><td>${s.hiit} / ${state.profile.hiitTarget}</td></tr>
          <tr><th>Average Fluid Intake</th><td>${(s.waterAvg / 1000).toFixed(1)} L/day</td></tr>
          <tr><th>Protein-Centred Meals</th><td>${Math.round(s.proteinRate * 100)}%</td></tr>
          <tr><th>Sugary / Liquid Calories</th><td>${s.sugary} logged</td></tr>
          <tr><th>Movement Breaks</th><td>${s.breaks}</td></tr>
        </tbody>
      </table>
    </section>
  `;
}

function weeklyReviewHTML(s, p, change, score) {
  const working = [], opps = [];
  if (change != null && change < 0) working.push(`Morning weekly average decreased by ${Math.abs(change).toFixed(1)} kg.`);
  if (s.strength >= 2) working.push(`${s.strength} resistance sessions maintained muscle preservation.`);
  if (s.postWalkRate >= 0.7) working.push(`Post-meal walks completed after ${Math.round(s.postWalkRate * 100)}% of meals.`);
  if (s.sugary > 0) opps.push(`Sugary or alcoholic drinks logged ${s.sugary} time(s); replacing these accelerates progress.`);
  if (s.postWalkRate < 0.6 && s.mealCount >= 3) opps.push('Take a 10–15 minute walk after main meals.');
  if (s.waterAvg > 0 && s.waterAvg < state.profile.waterTargetMl * 0.8) opps.push('Water intake is below target; keep a bottle nearby.');
  if (!working.length) working.push('Consistency builds gradually. Continue daily logging to unlock deeper insights.');
  if (!opps.length) opps.push('Keep the established structure rather than making it overly restrictive.');

  return `
    <h3 style="margin:0 0 6px;font-size:1.05rem;">Weekly Note</h3>
    <p class="subtle">Evidence-grounded lifestyle review based entirely on your local records.</p>
    <div class="divider"></div>
    <b style="color:var(--primary);font-size:0.85rem;">What is working well</b>
    <ul style="margin:6px 0 10px;padding-left:18px;font-size:0.85rem;">${working.map(x => `<li>${esc(x)}</li>`).join('')}</ul>
    <b style="color:var(--accent);font-size:0.85rem;">Focus opportunity</b>
    <ul style="margin:6px 0 10px;padding-left:18px;font-size:0.85rem;">${opps.map(x => `<li>${esc(x)}</li>`).join('')}</ul>
  `;
}

function planView() {
  const todayDay = new Date().getDay();
  const schedule = [
    ['Monday', 'Strength Training'],
    ['Tuesday', 'HIIT Session'],
    ['Wednesday', 'Strength Training'],
    ['Thursday', 'Recovery & Walking'],
    ['Friday', 'Strength Training'],
    ['Saturday', 'HIIT or Long Walk'],
    ['Sunday', 'Rest & Recovery']
  ];

  return `
    <section class="card">
      <h2 class="section-title">30-Day Core Rules</h2>
      <ol style="margin:0;padding-left:18px;font-size:0.86rem;line-height:1.6;">
        <li>Start each morning with <b>500–600 mL water</b> before food.</li>
        <li>Power Black coffee or unsweetened tea early in the day.</li>
        <li>Aim for <b>two main protein-centred meals</b>; zero calorie-counting.</li>
        <li>Fill plate generously with vegetables; keep starch near <b>one fist</b>.</li>
        <li>Eliminate routine sugary drinks, malt, juice, fried pastries, and pies.</li>
        <li>Walk <b>10–15 minutes after main meals</b> whenever practical.</li>
        <li>Take a <b>2–5 minute movement break</b> after long desk sitting.</li>
        <li>Strength train 3× weekly; HIIT up to 2× weekly.</li>
      </ol>
    </section>

    <section class="card">
      <h2 class="section-title">Weekly Rhythm</h2>
      ${schedule.map(([d, a], i) => `
        <div class="workout-row">
          <div>
            <span class="status-dot ${((i + 1) % 7) === todayDay ? 'ok' : ''}"></span>
            <b style="font-size:0.88rem;margin-left:4px;">${d}</b>
          </div>
          <span class="subtle">${a}</span>
        </div>
      `).join('')}
    </section>

    <section class="card">
      <div class="row">
        <div>
          <h2 class="section-title">Indoor Resistance Workout</h2>
          <p class="subtle">Week 1: 2 rounds · Weeks 2–4: 3 rounds</p>
        </div>
        <button class="primary-btn" data-quick="strength">Log Workout</button>
      </div>
      ${WORKOUT.map(x => `
        <div class="workout-row">
          <div>
            <b style="font-size:0.86rem;">${x[0]}</b>
            <div class="subtle" style="font-size:0.75rem;">${x[2]}</div>
          </div>
          <span class="pill">${x[1]}</span>
        </div>
      `).join('')}
    </section>

    <section class="card">
      <h2 class="section-title">Local Ghanaian Meals Guide</h2>
      <ul style="margin:0;padding-left:18px;font-size:0.86rem;line-height:1.6;">
        <li><b>Rice:</b> Moderate rice portion, double fish or chicken, generous salad/vegetables.</li>
        <li><b>Waakye:</b> Emphasise beans and boiled egg/fish; avoid stacking spaghetti + gari + fried extras.</li>
        <li><b>Kenkey:</b> One moderate portion with grilled fish, fresh pepper, and sliced tomatoes/onions.</li>
        <li><b>Banku / Fufu:</b> Smaller fist-sized portion; prioritise light soup/okra with fish or lean meat.</li>
        <li><b>Yam / Plantain:</b> One fist-sized portion, preferably boiled or roasted rather than heavily fried.</li>
      </ul>
    </section>
  `;
}

function moreView() {
  return `
    <section class="card">
      <h2 class="section-title">Profile & Targets</h2>
      <form id="settingsForm">
        ${numField('Age (years)', 'age', state.profile.age, 18, 100, 1)}
        ${numField('Height (cm)', 'heightCm', state.profile.heightCm, 120, 230, 1)}
        ${numField('Starting Weight (kg)', 'startWeight', state.profile.startWeight, 35, 250, 0.1)}
        ${numField('First Milestone (kg)', 'firstMilestone', state.profile.firstMilestone, 35, 250, 0.1)}
        ${numField('Daily Water Target (mL)', 'waterTargetMl', state.profile.waterTargetMl, 500, 6000, 100)}
        
        <label class="ios-toggle-row" style="margin-top:10px;">
          <span style="font-size:0.86rem;font-weight:700;">Clinician-advised fluid restriction</span>
          <input type="checkbox" name="fluidRestriction" ${state.profile.fluidRestriction ? 'checked' : ''}>
        </label>
        <label class="ios-toggle-row">
          <span style="font-size:0.86rem;font-weight:700;">Clinician-advised exercise restriction</span>
          <input type="checkbox" name="exerciseRestriction" ${state.profile.exerciseRestriction ? 'checked' : ''}>
        </label>
        
        <button class="primary-btn" style="width:100%;margin-top:8px;" type="submit">Save Profile</button>
      </form>
    </section>

    <section class="card">
      <h2 class="section-title">Local Data & Backup</h2>
      <div class="stack">
        <button class="secondary-btn" id="exportJson">Export Backup (JSON)</button>
        <button class="secondary-btn" id="exportCsv">Export Spreadsheet (CSV)</button>
        <label class="secondary-btn" style="text-align:center;cursor:pointer;">
          Import Backup
          <input id="importJson" type="file" accept="application/json" hidden>
        </label>
      </div>
      <p class="subtle">Your data is stored 100% locally on your device and runs completely offline.</p>
    </section>

    <section class="card">
      <h2 class="section-title">About gee-companion</h2>
      <p class="subtle">Everyday Health. Everyday Wellness. Simple checks and smarter lifestyle habits.</p>
      <div class="alert ok" style="margin-top:10px;">
        <b>Local & Private:</b> No external cloud servers or tracking. Works entirely offline after first installation.
      </div>
    </section>
  `;
}

function numField(label, name, val, min, max, step) {
  return `
    <div style="margin-bottom:10px;">
      <label style="display:block;font-size:0.78rem;font-weight:750;color:var(--muted);margin-bottom:4px;" for="${name}">${label}</label>
      <input style="width:100%;padding:10px 12px;border:0.5px solid var(--border);border-radius:10px;background:var(--surface-2);color:var(--text);font:inherit;font-size:0.9rem;"
             id="${name}" name="${name}" type="number" value="${val}" min="${min}" max="${max}" step="${step}">
    </div>
  `;
}

function bindViewEvents() {
  $$('[data-quick]').forEach(b => b.onclick = () => quick(b.dataset.quick));
  $$('[data-delete]').forEach(b => b.onclick = async () => {
    if (confirm('Delete this entry?')) await removeRecord(b.dataset.delete);
  });

  const f = $('#settingsForm');
  if (f) f.onsubmit = e => {
    e.preventDefault();
    const fd = new FormData(f);
    ['age', 'heightCm', 'startWeight', 'firstMilestone', 'waterTargetMl'].forEach(k => state.profile[k] = Number(fd.get(k)));
    state.profile.fluidRestriction = fd.has('fluidRestriction');
    state.profile.exerciseRestriction = fd.has('exerciseRestriction');
    saveProfile();
    toast('Profile updated');
    render();
  };

  const ej = $('#exportJson'); if (ej) ej.onclick = exportJSON;
  const ec = $('#exportCsv'); if (ec) ec.onclick = exportCSV;
  const ij = $('#importJson'); if (ij) ij.onchange = importJSON;
}

/* ==========================================================================
   MOBILE SURVEY ENGINE (One Question Per Screen with Instant Tap Options)
   ========================================================================== */
function runSurvey({ title = 'Log', eyebrow = 'Quick Log', steps = [], initialData = {}, onComplete }) {
  const modal = $('#modal');
  const body = $('#modalBody');
  const footer = $('#surveyFooter');
  const backBtn = $('#surveyBackBtn');
  const closeBtn = $('#surveyCloseBtn');
  const eyebrowEl = $('#modalEyebrow');
  const stepBadge = $('#surveyStepBadge');
  const progressFill = $('#surveyProgressFill');

  let currentStep = 0;
  const data = { ...initialData };

  eyebrowEl.textContent = eyebrow;

  function renderStep(idx) {
    currentStep = idx;
    const step = steps[idx];
    const total = steps.length;

    // Update Header Navigation
    stepBadge.textContent = total > 1 ? `Step ${idx + 1} of ${total}` : '';
    progressFill.style.width = `${((idx + 1) / total) * 100}%`;
    backBtn.classList.toggle('hidden', idx === 0);

    // Build Question Body
    let contentHtml = `
      <div class="survey-step">
        <div class="survey-question-head">
          <h2 class="survey-question-title">${esc(step.question)}</h2>
          ${step.hint ? `<p class="survey-question-hint">${esc(step.hint)}</p>` : ''}
        </div>
    `;

    if (step.type === 'segmented') {
      contentHtml += `
        <div class="ios-segmented">
          ${step.options.map(opt => {
            const val = typeof opt === 'object' ? opt.value : opt;
            const lbl = typeof opt === 'object' ? opt.label : opt;
            const isSel = data[step.id] === val;
            return `<button type="button" class="ios-segment-btn ${isSel ? 'active' : ''}" data-val="${esc(val)}">${esc(lbl)}</button>`;
          }).join('')}
        </div>
      `;
    } else if (step.type === 'options') {
      const colsClass = step.columns === 1 ? 'cols-1' : (step.columns === 3 ? 'cols-3' : '');
      contentHtml += `
        <div class="tap-options-grid ${colsClass}">
          ${step.options.map(opt => {
            const val = typeof opt === 'object' ? opt.value : opt;
            const lbl = typeof opt === 'object' ? opt.label : opt;
            const icon = typeof opt === 'object' && opt.icon ? opt.icon : '';
            const desc = typeof opt === 'object' && opt.desc ? opt.desc : '';
            const isSel = data[step.id] === val;
            return `
              <div class="tap-option-card ${isSel ? 'active' : ''}" data-val="${esc(val)}" role="button" tabindex="0">
                <div class="tap-option-content">
                  <div class="tap-option-title">${icon ? `<span class="tap-option-icon">${icon}</span>` : ''}${esc(lbl)}</div>
                  ${desc ? `<div class="tap-option-desc">${esc(desc)}</div>` : ''}
                </div>
                <div class="tap-option-check">✓</div>
              </div>
            `;
          }).join('')}
        </div>
      `;
    } else if (step.type === 'stepper') {
      const val = data[step.id] != null ? data[step.id] : (step.defaultValue || 0);
      data[step.id] = val;
      contentHtml += `
        <div class="stepper-container">
          <button type="button" class="stepper-btn" id="stepMinus">−</button>
          <div class="stepper-value-wrap">
            <input type="number" id="stepperInput" class="stepper-number-input" value="${val}" step="${step.step || 1}" min="${step.min || 0}" max="${step.max || 999}">
            <span class="stepper-unit">${esc(step.unit || '')}</span>
          </div>
          <button type="button" class="stepper-btn" id="stepPlus">+</button>
        </div>
        ${step.presets ? `
          <div class="quick-presets-row">
            ${step.presets.map(p => `<button type="button" class="preset-chip ${data[step.id] === p ? 'active' : ''}" data-preset="${p}">${p} ${step.unit || ''}</button>`).join('')}
          </div>
        ` : ''}
      `;
    } else if (step.type === 'toggles') {
      contentHtml += `
        <div class="stack">
          ${step.items.map(it => `
            <label class="ios-toggle-row">
              <span style="font-size:0.9rem;font-weight:750;">${esc(it.label)}</span>
              <input type="checkbox" data-toggle="${esc(it.id)}" ${data[it.id] ? 'checked' : ''}>
            </label>
          `).join('')}
        </div>
      `;
    } else if (step.type === 'note') {
      contentHtml += `
        <div>
          <textarea id="surveyTextarea" class="ios-textarea" placeholder="${esc(step.placeholder || 'Optional note...')}">${esc(data[step.id] || '')}</textarea>
          ${step.chips ? `
            <div class="quick-presets-row" style="margin-top:10px;">
              ${step.chips.map(c => `<button type="button" class="preset-chip" data-chip="${esc(c)}">${esc(c)}</button>`).join('')}
            </div>
          ` : ''}
        </div>
      `;
    }

    contentHtml += `</div>`;
    body.innerHTML = contentHtml;

    // Build Footer Navigation
    const isLast = idx === total - 1;
    let footerHtml = '';

    if (step.type === 'stepper' || step.type === 'toggles' || step.type === 'note' || step.showNext) {
      if (step.optional) {
        footerHtml += `<button type="button" class="secondary-btn" id="surveySkipBtn">Skip</button>`;
      }
      footerHtml += `<button type="button" class="primary-btn" id="surveyNextBtn">${isLast ? 'Save Entry' : 'Next'}</button>`;
    } else if (step.optional) {
      footerHtml += `<button type="button" class="secondary-btn" id="surveySkipBtn">Skip</button>`;
    }

    footer.innerHTML = footerHtml;
    bindStepEvents(step, idx, total);
  }

  function bindStepEvents(step, idx, total) {
    const isLast = idx === total - 1;

    // Segmented or Option Cards Tap Handlers
    $$('.ios-segment-btn, .tap-option-card').forEach(el => {
      el.onclick = () => {
        haptic(10);
        const val = el.dataset.val;
        data[step.id] = val;

        // Visual selection indicator
        $$('.ios-segment-btn, .tap-option-card').forEach(c => c.classList.remove('active'));
        el.classList.add('active');

        // Smooth iOS auto-advance on tap
        setTimeout(() => {
          if (isLast) {
            finishSurvey();
          } else {
            renderStep(idx + 1);
          }
        }, 160);
      };
    });

    // Stepper Handlers
    const minusBtn = $('#stepMinus');
    const plusBtn = $('#stepPlus');
    const numInput = $('#stepperInput');
    if (minusBtn && plusBtn && numInput) {
      const stepVal = Number(step.step || 1);
      const minVal = Number(step.min || 0);
      const maxVal = Number(step.max || 9999);

      minusBtn.onclick = () => {
        haptic(8);
        let cur = Number(numInput.value) || 0;
        cur = Math.max(minVal, Number((cur - stepVal).toFixed(1)));
        numInput.value = cur;
        data[step.id] = cur;
      };
      plusBtn.onclick = () => {
        haptic(8);
        let cur = Number(numInput.value) || 0;
        cur = Math.min(maxVal, Number((cur + stepVal).toFixed(1)));
        numInput.value = cur;
        data[step.id] = cur;
      };
      numInput.oninput = () => {
        data[step.id] = Number(numInput.value);
      };
      $$('[data-preset]').forEach(b => {
        b.onclick = () => {
          haptic(10);
          const v = Number(b.dataset.preset);
          numInput.value = v;
          data[step.id] = v;
          $$('[data-preset]').forEach(p => p.classList.remove('active'));
          b.classList.add('active');
        };
      });
    }

    // Toggles Handlers
    $$('[data-toggle]').forEach(cb => {
      cb.onchange = () => {
        haptic(8);
        data[cb.dataset.toggle] = cb.checked;
      };
    });

    // Note Textarea & Chips
    const ta = $('#surveyTextarea');
    if (ta) {
      ta.oninput = () => {
        data[step.id] = ta.value;
      };
      $$('[data-chip]').forEach(c => {
        c.onclick = () => {
          haptic(8);
          const chipText = c.dataset.chip;
          ta.value = ta.value ? `${ta.value}, ${chipText}` : chipText;
          data[step.id] = ta.value;
        };
      });
    }

    // Next Button
    const nextBtn = $('#surveyNextBtn');
    if (nextBtn) {
      nextBtn.onclick = () => {
        haptic(10);
        if (isLast) {
          finishSurvey();
        } else {
          renderStep(idx + 1);
        }
      };
    }

    // Skip Button
    const skipBtn = $('#surveySkipBtn');
    if (skipBtn) {
      skipBtn.onclick = () => {
        haptic(6);
        if (isLast) {
          finishSurvey();
        } else {
          renderStep(idx + 1);
        }
      };
    }
  }

  function finishSurvey() {
    modal.close();
    onComplete(data);
  }

  backBtn.onclick = () => {
    if (currentStep > 0) {
      haptic(8);
      renderStep(currentStep - 1);
    }
  };

  closeBtn.onclick = () => {
    modal.close();
  };

  renderStep(0);
  modal.showModal();
}

/* ==========================================================================
   TAP LOGGERS (All Dropdowns Converted to Native Tap Surveys)
   ========================================================================== */
function quick(action) {
  if (action === 'water' || action === 'water250') {
    const ml = action === 'water250' ? 250 : 500;
    return addRecord('water', { ml }).then(() => {
      haptic(15);
      toast(`+${ml} mL water logged`);
    });
  }
  if (action === 'postwalk') {
    return addRecord('walk', { minutes: 10, postMeal: true }).then(() => {
      haptic(15);
      toast('10-minute post-meal walk logged');
    });
  }
  if (action === 'noscale') {
    return addRecord('noscale', {}).then(() => {
      haptic(15);
      toast('Scale unavailable recorded without penalty');
    });
  }
  if (action === 'tea') {
    return addRecord('drink', { name: 'Tiens Antilipemic Tea', caffeinated: false }).then(() => {
      haptic(15);
      toast('Tiens Tea logged');
    });
  }

  if (action === 'meal') return mealSurvey();
  if (action === 'weight') return weightSurvey();
  if (action === 'walk') return walkSurvey();
  if (action === 'strength') return workoutSurvey('Strength');
  if (action === 'hiit') return workoutSurvey('HIIT');
  if (action === 'break') return breakSurvey();
  if (action === 'coffee') return coffeeSurvey();
  if (action === 'note') return noteSurvey();
}

/**
 * 1. MEAL LOGGING (Step-by-step Survey)
 */
function mealSurvey() {
  runSurvey({
    title: 'Log Meal',
    eyebrow: 'Meal Tracker',
    initialData: {
      meal: 'Meal 1',
      protein: 'Fish',
      proteinAmount: 'About 2 palms',
      vegetables: 'Good portion',
      starch: 'About 1 fist',
      starchType: 'Rice',
      drink: 'Water',
      extras: 'None',
      note: ''
    },
    steps: [
      {
        id: 'meal',
        question: 'Which meal is this?',
        hint: 'Aim for two main protein-centred meals each day.',
        type: 'options',
        columns: 1,
        options: [
          { label: 'Meal 1', value: 'Meal 1', icon: '☀️', desc: 'First main meal of the day' },
          { label: 'Meal 2', value: 'Meal 2', icon: '🌤️', desc: 'Second main meal' },
          { label: 'Additional Meal / Snack', value: 'Additional meal', icon: '🌙', desc: 'Extra meal or structured gap snack' }
        ]
      },
      {
        id: 'protein',
        question: 'Main protein source?',
        hint: 'Protein anchors satiety and protects lean muscle.',
        type: 'options',
        columns: 2,
        options: [
          { label: 'Fish', value: 'Fish', icon: '🐟' },
          { label: 'Chicken', value: 'Chicken', icon: '🍗' },
          { label: 'Eggs', value: 'Eggs', icon: '🥚' },
          { label: 'Lean Meat', value: 'Lean meat', icon: '🥩' },
          { label: 'Beans', value: 'Beans', icon: '🫘' },
          { label: 'Yoghurt', value: 'Yoghurt', icon: '🥣' },
          { label: 'Other', value: 'Other', icon: '🍽️' },
          { label: 'None', value: 'None', icon: '🚫' }
        ]
      },
      {
        id: 'proteinAmount',
        question: 'How much protein?',
        hint: 'Two palm-sized servings is the target benchmark.',
        type: 'options',
        columns: 1,
        options: [
          { label: 'About 2 palms', value: 'About 2 palms', icon: '🤲', desc: 'Target guideline' },
          { label: 'About 1 palm', value: 'About 1 palm', icon: '✋', desc: 'Moderate portion' },
          { label: 'Low portion', value: 'Low', icon: '🤏', desc: 'Below recommended benchmark' },
          { label: 'More than 2 palms', value: 'More', icon: '💪', desc: 'Substantial protein' }
        ]
      },
      {
        id: 'vegetables',
        question: 'Vegetable portion?',
        hint: 'Use vegetables generously for volume, micronutrients and fibre.',
        type: 'options',
        columns: 1,
        options: [
          { label: 'Good portion', value: 'Good portion', icon: '🥦', desc: 'About 1/3 to 1/2 of your plate' },
          { label: 'Large portion', value: 'Large portion', icon: '🥗', desc: 'More than half the plate' },
          { label: 'Some', value: 'Some', icon: '🥕', desc: 'Small side or garnish' },
          { label: 'None', value: 'None', icon: '🚫', desc: 'No vegetables included' }
        ]
      },
      {
        id: 'starch',
        question: 'Starch serving size?',
        hint: 'Keep starch to about one fist, preferably at one main meal.',
        type: 'options',
        columns: 1,
        options: [
          { label: 'About 1 fist', value: 'About 1 fist', icon: '✊', desc: 'Target portion' },
          { label: 'Small portion', value: 'Small', icon: '🍠', desc: 'Lighter starch serving' },
          { label: 'None', value: 'None', icon: '🥬', desc: 'Protein and vegetables only' },
          { label: 'Large portion', value: 'Large', icon: '🍚', desc: 'Exceeds one fist' }
        ]
      },
      {
        id: 'starchType',
        question: 'Starch type?',
        hint: 'Local dietary choices.',
        type: 'options',
        columns: 2,
        options: [
          { label: 'Rice', value: 'Rice', icon: '🍚' },
          { label: 'Waakye', value: 'Waakye', icon: '🍲' },
          { label: 'Kenkey', value: 'Kenkey', icon: '🌽' },
          { label: 'Banku', value: 'Banku', icon: '🥣' },
          { label: 'Fufu', value: 'Fufu', icon: '🍲' },
          { label: 'Yam', value: 'Yam', icon: '🍠' },
          { label: 'Plantain', value: 'Plantain', icon: '🍌' },
          { label: 'Bread', value: 'Bread', icon: '🍞' },
          { label: 'None / Other', value: 'None/other', icon: '🍴' }
        ]
      },
      {
        id: 'drink',
        question: 'Drink with your meal?',
        hint: 'Avoid routine liquid calories (malt, juices, sodas, alcohol).',
        type: 'options',
        columns: 2,
        options: [
          { label: 'Water', value: 'Water', icon: '💧' },
          { label: 'Unsweetened Tea', value: 'Unsweetened tea', icon: '🍵' },
          { label: 'Black Coffee', value: 'Coffee', icon: '☕' },
          { label: 'Sugary Drink', value: 'Sugary drink', icon: '🥤' },
          { label: 'Fruit Juice', value: 'Juice', icon: '🧃' },
          { label: 'Malt', value: 'Malt', icon: '🍺' },
          { label: 'Alcohol', value: 'Alcohol', icon: '🍷' },
          { label: 'Other', value: 'Other', icon: '🥛' }
        ]
      },
      {
        id: 'extras',
        question: 'Any extras or fried snacks?',
        hint: 'Fried street snacks and pastries are high calorie densities.',
        type: 'options',
        columns: 2,
        options: [
          { label: 'None', value: 'None', icon: '✅' },
          { label: 'Pastry', value: 'Pastry', icon: '🥐' },
          { label: 'Biscuits', value: 'Biscuits', icon: '🍪' },
          { label: 'Chips', value: 'Chips', icon: '🍟' },
          { label: 'Fried Snack', value: 'Fried snack', icon: '🥟' },
          { label: 'Meat Pie', value: 'Meat pie', icon: '🥧' },
          { label: 'Doughnut', value: 'Doughnut', icon: '🍩' },
          { label: 'Other', value: 'Other', icon: '🥨' }
        ]
      },
      {
        id: 'note',
        question: 'Any meal notes?',
        hint: 'Optional reflections or restaurant details.',
        type: 'note',
        optional: true,
        placeholder: 'e.g. at home, ate late, restaurant meal...',
        chips: ['Home cooked', 'Restaurant', 'Ate early', 'Very full']
      }
    ],
    onComplete: async recData => {
      await addRecord('meal', recData);
      haptic(20);
      toast('Meal saved — take a 10–15 min walk when practical');
    }
  });
}

/**
 * 2. WEIGHT LOGGING (Stepper + Segmented Context + Notes)
 */
function weightSurvey() {
  const lastWeight = currentWeight();
  runSurvey({
    title: 'Log Weight',
    eyebrow: 'Morning Weight',
    initialData: {
      kg: lastWeight || 70.0,
      context: 'Morning',
      note: ''
    },
    steps: [
      {
        id: 'kg',
        question: 'Enter body weight',
        hint: 'Weigh first thing in the morning after using the bathroom.',
        type: 'stepper',
        defaultValue: lastWeight || 70.0,
        unit: 'kg',
        step: 0.1,
        min: 35,
        max: 250,
        presets: [
          round(lastWeight - 0.5),
          round(lastWeight - 0.2),
          round(lastWeight),
          round(lastWeight + 0.2),
          round(lastWeight + 0.5)
        ].filter(v => v > 35 && v < 250)
      },
      {
        id: 'context',
        question: 'Weigh-in context',
        hint: 'Morning weights are used for weekly trend averages.',
        type: 'segmented',
        options: [
          { label: 'Morning 🌅', value: 'Morning' },
          { label: 'Evening 🌆', value: 'Evening' },
          { label: 'Other ⏱️', value: 'Other' }
        ]
      },
      {
        id: 'note',
        question: 'Context note (optional)',
        hint: 'Record any factors affecting water balance.',
        type: 'note',
        optional: true,
        placeholder: 'e.g. slept poorly, salty meal last night...',
        chips: ['Slept well', 'Poor sleep', 'Travel day', 'Ate late']
      }
    ],
    onComplete: async recData => {
      const kg = Number(recData.kg);
      if (!kg || kg < 35 || kg > 250) {
        toast('Enter a valid weight (35–250 kg)');
        return;
      }
      await addRecord('weight', { kg, context: recData.context || 'Morning', note: recData.note });
      haptic(20);
      toast('Weight entry recorded');
    }
  });
}

function round(v) {
  return Number(v.toFixed(1));
}

/**
 * 3. WALK LOGGING (Duration Presets + Timing Toggle)
 */
function walkSurvey() {
  runSurvey({
    title: 'Log Walk',
    eyebrow: 'Activity Tracker',
    initialData: {
      minutes: 15,
      postMeal: true,
      steps: '',
      note: ''
    },
    steps: [
      {
        id: 'minutes',
        question: 'Walk duration',
        hint: 'A 10–15 minute brisk walk after meals significantly blunts glucose spikes.',
        type: 'stepper',
        defaultValue: 15,
        unit: 'minutes',
        step: 5,
        min: 2,
        max: 180,
        presets: [10, 15, 20, 30, 45]
      },
      {
        id: 'postMeal',
        question: 'Was this after a main meal?',
        hint: 'Post-meal walking is a core routine habit.',
        type: 'options',
        columns: 1,
        options: [
          { label: 'Yes, post-meal walk', value: true, icon: '🚶‍♂️', desc: 'Completed within 45 min of eating' },
          { label: 'General / other walk', value: false, icon: '🏃', desc: 'General brisk walk during the day' }
        ]
      },
      {
        id: 'note',
        question: 'Steps or walk note (optional)',
        hint: 'Keep track of route or pedometer count.',
        type: 'note',
        optional: true,
        placeholder: 'e.g. 2,400 steps, brisk outdoor pace...',
        chips: ['Brisk pace', 'Casual walk', 'Treadmill', 'Sunny day']
      }
    ],
    onComplete: async recData => {
      await addRecord('walk', {
        minutes: Number(recData.minutes) || 10,
        postMeal: recData.postMeal === true || recData.postMeal === 'true',
        note: recData.note
      });
      haptic(20);
      toast('Walk entry saved');
    }
  });
}

/**
 * 4. WORKOUT LOGGING (Rounds Segmented + Minutes + Feedback)
 */
function workoutSurvey(kind = 'Strength') {
  const isS = kind === 'Strength';
  runSurvey({
    title: `Log ${kind}`,
    eyebrow: 'Resistance & Fitness',
    initialData: {
      kind,
      rounds: 2,
      minutes: isS ? 25 : 15,
      note: ''
    },
    steps: isS ? [
      {
        id: 'rounds',
        question: 'How many rounds completed?',
        hint: 'Week 1: 2 rounds · Weeks 2–4: 3 rounds. Final reps should feel challenging.',
        type: 'segmented',
        options: [
          { label: '1 Round', value: 1 },
          { label: '2 Rounds (Wk 1)', value: 2 },
          { label: '3 Rounds (Wk 2+)', value: 3 },
          { label: '4 Rounds', value: 4 }
        ]
      },
      {
        id: 'minutes',
        question: 'Session duration',
        hint: 'Include rest intervals between movements.',
        type: 'stepper',
        defaultValue: 25,
        unit: 'minutes',
        step: 5,
        min: 5,
        max: 120,
        presets: [15, 20, 25, 30, 40]
      },
      {
        id: 'note',
        question: 'Session notes (optional)',
        hint: 'Track backpack weight or knee/joint comfort.',
        type: 'note',
        optional: true,
        placeholder: 'e.g. backpack load 5kg, good form on lunges...',
        chips: ['Light load', 'Heavy load', 'Felt strong', 'Knee fatigue']
      }
    ] : [
      {
        id: 'minutes',
        question: 'HIIT duration',
        hint: '15–20 minutes is optimal. Avoid compensating for missed food with extra HIIT.',
        type: 'stepper',
        defaultValue: 15,
        unit: 'minutes',
        step: 5,
        min: 5,
        max: 60,
        presets: [10, 15, 20, 25]
      },
      {
        id: 'note',
        question: 'HIIT notes (optional)',
        hint: 'Interval style or notes.',
        type: 'note',
        optional: true,
        placeholder: 'e.g. interval sprint, jump rope...',
        chips: ['Brisk intervals', 'High intensity', 'Good recovery']
      }
    ],
    onComplete: async recData => {
      await addRecord('workout', {
        kind,
        minutes: Number(recData.minutes) || (isS ? 25 : 15),
        rounds: Number(recData.rounds) || null,
        note: recData.note
      });
      haptic(20);
      toast(`${kind} workout logged`);
    }
  });
}

/**
 * 5. MOVEMENT BREAK LOGGING (Single Tap Options)
 */
function breakSurvey() {
  runSurvey({
    title: 'Movement Break',
    eyebrow: 'Sedentary Interruption',
    initialData: { minutes: 5 },
    steps: [
      {
        id: 'minutes',
        question: 'Break length',
        hint: 'Stand up, stretch, or walk for a few minutes after prolonged sitting.',
        type: 'options',
        columns: 2,
        options: [
          { label: '2 Minutes', value: 2, icon: '⏱️', desc: 'Quick posture reset' },
          { label: '3 Minutes', value: 3, icon: '🧘', desc: 'Calf raises & reach' },
          { label: '5 Minutes', value: 5, icon: '🚶‍♂️', desc: 'Corridor walk / stairs' },
          { label: '10 Minutes', value: 10, icon: '🤸', desc: 'Extended movement' }
        ]
      }
    ],
    onComplete: async recData => {
      await addRecord('break', { minutes: Number(recData.minutes) || 5 });
      haptic(15);
      toast(`${recData.minutes}-minute movement break logged`);
    }
  });
}

/**
 * 6. COFFEE LOGGING (Tap Choice + Caffeine/Sugar Toggles)
 */
function coffeeSurvey() {
  runSurvey({
    title: 'Log Coffee',
    eyebrow: 'Hydration & Stimulants',
    initialData: {
      name: 'Edmark Power Black',
      caffeinated: true,
      sugar: false
    },
    steps: [
      {
        id: 'name',
        question: 'Which coffee did you have?',
        hint: 'Unsweetened black coffee fits well before noon.',
        type: 'options',
        columns: 1,
        options: [
          { label: 'Edmark Power Black', value: 'Edmark Power Black', icon: '☕', desc: 'Unsweetened black coffee' },
          { label: 'Other Black Coffee', value: 'Other black coffee', icon: '☕', desc: 'No added milk or sugar' },
          { label: 'Other Coffee', value: 'Other coffee', icon: '☕', desc: 'With milk or other additions' }
        ]
      },
      {
        id: 'addons',
        question: 'Additions & Caffeine',
        hint: 'Avoid sugar, condensed milk, and flavoured syrups.',
        type: 'toggles',
        items: [
          { id: 'caffeinated', label: 'Contains caffeine' },
          { id: 'sugar', label: 'Sugar or creamer added' }
        ]
      }
    ],
    onComplete: async recData => {
      await addRecord('drink', {
        name: recData.name || 'Edmark Power Black',
        caffeinated: recData.caffeinated !== false,
        sugar: recData.sugar === true
      });
      haptic(15);
      toast('Coffee recorded');
    }
  });
}

/**
 * 7. NOTE LOGGING (Text + Quick Tags)
 */
function noteSurvey() {
  runSurvey({
    title: 'Daily Note',
    eyebrow: 'Reflections',
    initialData: { text: '' },
    steps: [
      {
        id: 'text',
        question: 'What is on your mind?',
        hint: 'Record sleep, stress, energy levels, or special circumstances.',
        type: 'note',
        placeholder: 'e.g. Slept 8 hours, felt energetic, busy day...',
        chips: ['Poor sleep', 'High energy', 'Restaurant meal', 'Travel day', 'Feeling great']
      }
    ],
    onComplete: async recData => {
      if (!recData.text || !recData.text.trim()) {
        toast('Note was empty');
        return;
      }
      await addRecord('note', { text: recData.text.trim() });
      haptic(15);
      toast('Note saved');
    }
  });
}

/* ==========================================================================
   Chart Rendering (High DPR support)
   ========================================================================== */
function drawChart() {
  const c = $('#weightChart');
  if (!c) return;
  const ctx = c.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const w = c.clientWidth;
  const h = c.clientHeight || 240;
  c.width = w * dpr;
  c.height = h * dpr;
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, w, h);

  const data = morningWeights().slice(-30);
  if (data.length < 1) {
    ctx.fillStyle = getCss('--muted');
    ctx.font = '13px system-ui';
    ctx.fillText('Log morning weights to generate your trend curve.', 20, h / 2);
    return;
  }

  const vals = data.map(x => Number(x.kg));
  const min = Math.min(...vals, state.profile.firstMilestone) - 1;
  const max = Math.max(...vals, state.profile.startWeight) + 1;
  const padX = 36, padY = 20;
  const x = i => padX + (i / Math.max(1, data.length - 1)) * (w - padX - 16);
  const y = v => padY + ((max - v) / (max - min)) * (h - padY - 32);

  // Horizontal Gridlines
  ctx.strokeStyle = getCss('--border');
  ctx.lineWidth = 0.5;
  [min, (min + max) / 2, max].forEach(v => {
    ctx.beginPath();
    ctx.moveTo(padX, y(v));
    ctx.lineTo(w - 12, y(v));
    ctx.stroke();
    ctx.fillStyle = getCss('--muted');
    ctx.font = '10px system-ui';
    ctx.fillText(v.toFixed(1), 2, y(v) + 3);
  });

  // Morning Weight Trend Line (Ahotɔ Green)
  ctx.strokeStyle = getCss('--primary');
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  data.forEach((p, i) => {
    const X = x(i), Y = y(Number(p.kg));
    i ? ctx.lineTo(X, Y) : ctx.moveTo(X, Y);
  });
  ctx.stroke();

  // Data Dots
  data.forEach((p, i) => {
    ctx.beginPath();
    ctx.fillStyle = getCss('--primary');
    ctx.arc(x(i), y(Number(p.kg)), 3.5, 0, Math.PI * 2);
    ctx.fill();
  });

  // Weekly Average Dashed Line (Ahotɔ Gold)
  const wa = weeklyMorningAverage();
  if (wa != null) {
    ctx.setLineDash([5, 4]);
    ctx.strokeStyle = getCss('--accent');
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(padX, y(wa));
    ctx.lineTo(w - 12, y(wa));
    ctx.stroke();
    ctx.setLineDash([]);
  }
}

function getCss(v) {
  return getComputedStyle(document.documentElement).getPropertyValue(v).trim();
}

/* ==========================================================================
   Backup & Export
   ========================================================================== */
function download(name, text, type = 'application/json') {
  const blob = new Blob([text], { type });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 500);
}

function exportJSON() {
  download(`gee-companion-backup-${localDate()}.json`, JSON.stringify({
    version: 2,
    brand: 'Ahotɔ Wellness Enterprise',
    profile: state.profile,
    prefs: state.prefs,
    records: state.records
  }, null, 2));
}

function exportCSV() {
  const fields = ['id', 'type', 'date', 'createdAt', 'kg', 'context', 'ml', 'meal', 'protein', 'proteinAmount', 'vegetables', 'starch', 'starchType', 'drink', 'extras', 'minutes', 'postMeal', 'kind', 'rounds', 'name', 'text', 'note'];
  const q = v => `"${String(v ?? '').replaceAll('"', '""')}"`;
  const csv = [fields.join(','), ...state.records.map(r => fields.map(f => q(r[f])).join(','))].join('\n');
  download(`gee-companion-records-${localDate()}.csv`, csv, 'text/csv');
}

async function importJSON(e) {
  const file = e.target.files[0];
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    if (!Array.isArray(data.records)) throw new Error('Backup format not recognised');
    if (!confirm(`Import ${data.records.length} records? Existing records will be updated.`)) return;
    for (const r of data.records) await dbPut(r);
    if (data.profile) {
      state.profile = { ...DEFAULT_PROFILE, ...data.profile };
      saveProfile();
    }
    state.records = await dbAll();
    toast('Data imported successfully');
    render();
  } catch (err) {
    alert('Import failed: ' + err.message);
  }
  e.target.value = '';
}

/* ==========================================================================
   Global Routing, Offline Check & PWA Installation
   ========================================================================== */
function bindGlobal() {
  $$('.nav-item').forEach(b => {
    b.onclick = () => {
      haptic(10);
      route = b.dataset.route;
      location.hash = route;
      render();
    };
  });

  window.addEventListener('hashchange', () => {
    const h = location.hash.slice(1);
    if (['today', 'log', 'progress', 'plan', 'more'].includes(h)) {
      route = h;
      render();
    }
  });

  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault();
    deferredInstallPrompt = e;
    const btn = $('#installBtn');
    if (btn) btn.classList.remove('hidden');
  });

  const instBtn = $('#installBtn');
  if (instBtn) {
    instBtn.onclick = async () => {
      if (!deferredInstallPrompt) {
        toast('Use your browser "Add to Home Screen" option');
        return;
      }
      deferredInstallPrompt.prompt();
      await deferredInstallPrompt.userChoice;
      deferredInstallPrompt = null;
      instBtn.classList.add('hidden');
    };
  }

  // Monitor Online/Offline Status
  function updateNetworkStatus() {
    const badge = $('#offlineBadge');
    if (badge) {
      badge.classList.toggle('hidden', navigator.onLine);
    }
  }
  window.addEventListener('online', updateNetworkStatus);
  window.addEventListener('offline', updateNetworkStatus);
  updateNetworkStatus();
}

/* ==========================================================================
   Initialization
   ========================================================================== */
async function init() {
  await openDB();
  state.records = await dbAll();
  state.records.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const h = location.hash.slice(1);
  if (['today', 'log', 'progress', 'plan', 'more'].includes(h)) route = h;

  bindGlobal();
  render();

  // Register service worker for complete offline caching
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js')
      .then(reg => {
        reg.update();
      })
      .catch(err => {
        console.warn('SW registration:', err);
      });
  }
}

init().catch(err => {
  console.error(err);
  $('#view').innerHTML = `<div class="alert danger">Local database initialisation error: ${esc(err.message)}</div>`;
});
