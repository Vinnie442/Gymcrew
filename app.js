import {SUPABASE_URL,SUPABASE_ANON_KEY} from './config.js';
import {savePush, disablePush, refreshPush} from './push.js';

const STARTER_PROGRAM = {
  A: [
    ['Développé couché barre',3,'6–8',80],
    ['Tirage vertical',3,'8–10',68],
    ['Dips lestés',3,'8–10',25],
    ['Presse à cuisses',3,'10–12',130],
    ['Écartés poulie',3,'12–15',16],
    ['Élévations latérales',3,'12–20',8],
    ['Pushdown corde',3,'10–15',30],
    ['Curl marteau',3,'10–12',12]
  ],
  B: [
    ['Rowing barre',3,'6–8',40],
    ['Développé incliné haltères',3,'8–12',0],
    ['Hip thrust',3,'8–12',40],
    ['Tirage horizontal',3,'10–12',50],
    ['Face pull',3,'15–20',30],
    ['Curl poulie basse',3,'10–12',26],
    ['Pushdown corde',3,'10–15',30],
    ['Curl marteau',2,'12–15',18],
    ['Leg curl',3,'10–15',0]
  ]
};

// Photos départ/arrivée : free-exercise-db (domaine public, Unlicense), dans img/exercises/.
// Clés sans accents ni majuscules, pour reconnaître aussi les exercices des programmes perso.
const EXERCISE_IMAGES = {
  'developpe couche barre':'Barbell_Bench_Press_-_Medium_Grip',
  'developpe couche':'Barbell_Bench_Press_-_Medium_Grip',
  'tirage vertical':'Wide-Grip_Lat_Pulldown',
  'dips lestes':'Dips_-_Chest_Version',
  'dips':'Dips_-_Chest_Version',
  'presse a cuisses':'Leg_Press',
  'ecartes poulie':'Cable_Crossover',
  'elevations laterales':'Side_Lateral_Raise',
  'pushdown corde':'Triceps_Pushdown_-_Rope_Attachment',
  'curl marteau':'Hammer_Curls',
  'rowing barre':'Bent_Over_Barbell_Row',
  'developpe incline halteres':'Incline_Dumbbell_Press',
  'hip thrust':'Barbell_Hip_Thrust',
  'tirage horizontal':'Seated_Cable_Rows',
  'face pull':'Face_Pull',
  'curl poulie basse':'Standing_Biceps_Cable_Curl',
  'leg curl':'Lying_Leg_Curls'
};

function exerciseImage(name) {
  const key = name.normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase().trim();
  return EXERCISE_IMAGES[key] || '';
}

let showHowTo = false;
let flash = ''; // Message affiché une seule fois en haut de la séance.

let PROGRAM = structuredClone(STARTER_PROGRAM);
let programs = [];
let activeProgramId = '';
let programsReady = false;
let programsError = '';
let programsLoading = false;

function currentUserId() {
  if (!token) return '';
  return JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).sub;
}

function programById(id) {
  return programs.find(p => p.id === id);
}

function applyProgram() {
  const p = programById(activeProgramId);

  PROGRAM = p ? {
    A: p.exercises
      .filter(x => x.session === 'A')
      .sort((a,b) => a.position - b.position)
      .map(x => [x.exercise,x.sets,x.rep_range,Number(x.base_kg)]),
    B: p.exercises
      .filter(x => x.session === 'B')
      .sort((a,b) => a.position - b.position)
      .map(x => [x.exercise,x.sets,x.rep_range,Number(x.base_kg)])
  } : structuredClone(STARTER_PROGRAM);

  for (const key of ['A','B']) {
    state.exerciseIndex[key] = Math.min(
      state.exerciseIndex[key] || 0,
      Math.max(0, PROGRAM[key].length - 1)
    );
  }
}

async function loadPrograms() {
  if (programsLoading) return;
  if (!cloud) {
    programsError = 'ERREUR : Supabase non configuré (cloud = false)';
    if (state.tab === 'programs') render();
    return;
  }

  if (!state.group || state.group === 'local') {
    programsError = 'ERREUR : Aucun groupe trouvé (state.group vide)';
    if (state.tab === 'programs') render();
    return;
  }

  programsLoading = true;
  programsError = '';
  if (state.tab === 'programs') render();

  try {
    const [ps, es] = await Promise.all([
      api(`gym_programs?group_id=eq.${encodeURIComponent(state.group)}&select=*&order=created_at.asc`),
      api(`gym_program_exercises?select=*&order=position.asc`)
    ]);

    const uid = currentUserId();

    programs = ps.map(p => ({
      ...p,
      is_mine: p.owner_id === uid,
      exercises: es.filter(e => e.program_id === p.id)
    }));

    activeProgramId =
      localStorage.getItem('gymcrew_active_program_' + state.group) || '';

    if (activeProgramId && !programById(activeProgramId)) {
      activeProgramId = '';
    }

    applyProgram();
    programsReady = true;
    programsError = '';

  } catch (e) {
    console.error('Erreur de chargement des programmes :', e);
    programsReady = false;
    programsError = e.message || String(e);
  } finally {
    programsLoading = false;
    // Séance et Groupe affichent le programme chargé ; ailleurs, ne pas effacer
    // une saisie en cours (éditeur de programme, vote, mensuration).
    if (state.tab === 'train' || state.tab === 'group' ||
        (state.tab === 'programs' && state.editingProgram == null)) {
      captureDraft();
      render();
    }
  }
}

async function saveProgram() {
  const title = $('#program-title')?.value.trim();

  if (!title || title.length > 60) {
    return alert('Nom de programme invalide (1 à 60 caractères).');
  }

  const cards = [...document.querySelectorAll('.edit-exercise')];

  const exercises = cards.map((c,i) => ({
    session: c.querySelector('.edit-session').value,
    exercise: c.querySelector('.edit-name').value.trim(),
    sets: Number(c.querySelector('.edit-sets').value),
    rep_range: c.querySelector('.edit-range').value.trim(),
    base_kg: Number(c.querySelector('.edit-kg').value),
    position: i
  }));

  if (exercises.length > 100) return alert('Maximum 100 exercices par programme.');

  if (!exercises.length) {
    return alert('Ajoute au moins un exercice.');
  }

  if (exercises.some(x =>
    !x.exercise ||
    x.exercise.length > 100 ||
    !Number.isInteger(x.sets) ||
    x.sets < 1 ||
    x.sets > 20 ||
    !/^\d{1,2}\s*[–-]\s*\d{1,2}$/.test(x.rep_range) ||
    !Number.isFinite(x.base_kg) ||
    x.base_kg < 0 ||
    x.base_kg > 1000
  )) {
    return alert('Vérifie les exercices, les séries, la plage de répétitions (ex : 8–12) et les charges.');
  }

  const editing = state.editingProgram;
  const own = programById(editing);

  if (own && !own.is_mine) {
    return alert('Tu ne peux modifier que tes propres programmes. Duplique celui-ci.');
  }

  try {
    let id = editing;

    if (!own) {
      const res = await api('gym_programs','POST',{
        group_id:state.group,
        title
      });
      id = res[0].id;

      try {
        await api('gym_program_exercises','POST',
          exercises.map(x => ({...x,program_id:id}))
        );
      } catch (e) {
        // Ne pas laisser un programme vide : un nouvel essai en recréerait un autre.
        await api(`gym_programs?id=eq.${encodeURIComponent(id)}`,'DELETE').catch(console.warn);
        throw e;
      }
    } else {
      await api(`gym_programs?id=eq.${encodeURIComponent(id)}`,'PATCH',{title});

      // Insérer d'abord, puis supprimer les anciens exercices : en cas d'échec
      // de l'insertion, le programme garde ses exercices précédents.
      const inserted = await api('gym_program_exercises','POST',
        exercises.map(x => ({...x,program_id:id}))
      );
      const keep = inserted.map(x => x.id).join(',');

      await api(
        `gym_program_exercises?program_id=eq.${encodeURIComponent(id)}&id=not.in.(${keep})`,
        'DELETE'
      );
    }

    delete state.editingProgram;
    delete state.newProgramSource;
    delete state.newProgramTitle;
    activeProgramId = id;

    localStorage.setItem('gymcrew_active_program_' + state.group,id);

    await loadPrograms();
    save();
    render();

  } catch (e) {
    alert('Impossible de sauvegarder le programme : ' + e.message);
  }
}
function editCard(x={session:'A',exercise:'',sets:3,rep_range:'8–12',base_kg:0}){
  return `<div class="edit-exercise">
    <div class="flex">
      <strong>Exercice</strong>
      <button type="button" class="outline remove-ex">Supprimer</button>
    </div>
    <input class="field edit-name" maxlength="100"
      placeholder="Nom de l’exercice" value="${safe(x.exercise)}">
    <div class="edit-grid">
      <label>Séance
        <select class="field edit-session">
          <option value="A" ${x.session==='A'?'selected':''}>A</option>
          <option value="B" ${x.session==='B'?'selected':''}>B</option>
        </select>
      </label>
      <label>Séries
        <input class="field edit-sets" type="number" min="1" max="20"
          value="${x.sets}">
      </label>
      <label>Répétitions
        <input class="field edit-range" value="${safe(x.rep_range)}"
          placeholder="8–12">
      </label>
      <label>Charge initiale (kg)
        <input class="field edit-kg" type="number" min="0" max="1000"
          step="0.5" value="${x.base_kg}">
      </label>
    </div>
  </div>`;
}

function programsView(){
  if(!programsReady){
    return `<h1>Programmes</h1>
      <div class="notice">
        ${programsLoading ? 'Chargement des programmes…' : 'Impossible de charger les programmes.'}
        <p><strong>Détail de l'erreur :</strong></p>
        <pre style="white-space:pre-wrap;overflow-wrap:anywhere">${safe(programsError || 'Chargement en cours…')}</pre>
      </div>
      <button id="retry-programs" class="outline" ${programsLoading ? 'disabled' : ''}>Réessayer</button>`;
  }

  if(state.editingProgram!==undefined && state.editingProgram!==null){
    const own=programById(state.editingProgram);
    const source=own?own.exercises:state.newProgramSource||[];

    return `<h1>${own?'Modifier':'Créer'} un programme</h1>
      <div class="card">
        <label>Nom du programme</label>
        <input id="program-title" class="field" maxlength="60"
          value="${safe(own?.title||state.newProgramTitle||'Mon programme')}">
        <div id="edit-exercises">${source.map(editCard).join('')}</div>
        <button id="add-exercise" class="outline full">+ Ajouter un exercice</button>
        <button id="save-program" class="primary full spaced">Enregistrer le programme</button>
        <button id="cancel-edit" class="outline full spaced">Annuler</button>
      </div>`;
  }

  return `<h1>Mes programmes</h1>
    <p class="muted">
      Choisis un programme partagé ou crée le tien.
      Les charges de tout le groupe restent visibles sur les exercices communs.
    </p>
    <div class="card">
      <strong>Programme historique A/B</strong>
      <p class="muted">Ton programme actuel, conservé tel quel.</p>
      <button class="${!activeProgramId?'primary':'outline'} full"
        data-select-program="">
        ${!activeProgramId?'✓ Programme sélectionné':'Choisir ce programme'}
      </button>
      <button id="copy-starter" class="outline full spaced">
        Créer une copie modifiable
      </button>
    </div>
    ${programs.map(p=>`
      <div class="card">
        <div class="flex">
          <h3>${safe(p.title)}</h3>
          <span class="pill">${p.is_mine?'À moi':'Partagé'}</span>
        </div>
        <p class="muted">
          ${p.exercises.filter(e=>e.session==='A').length} exercices A ·
          ${p.exercises.filter(e=>e.session==='B').length} exercices B
        </p>
        <button class="${activeProgramId===p.id?'primary':'outline'} full"
          data-select-program="${p.id}">
          ${activeProgramId===p.id?'✓ Programme sélectionné':'Choisir ce programme'}
        </button>
        ${p.is_mine?`
          <button class="outline full spaced" data-edit-program="${p.id}">
            Modifier
          </button>
          <button class="outline full spaced danger" data-delete-program="${p.id}">
            Supprimer ce programme
          </button>`:`
          <button class="outline full spaced" data-copy-program="${p.id}">
            Dupliquer et personnaliser
          </button>`}
      </div>`).join('')}
    <button id="new-program" class="primary full">+ Créer mon programme</button>`;
}

// V4 — sondage du vendredi et rappel personnel de créatine.

let fridayPoll=null, fridayVotes=[];
const pollTimes=['18:00','18:30','19:00','19:30'];
const reminderKey='gymcrew_creatine_reminder';

function reminderSettings(){
  try {
    return JSON.parse(localStorage.getItem(reminderKey)) ||
      {enabled:false,time:'20:00'};
  } catch {
    return {enabled:false,time:'20:00'};
  }
}

function nextFridayDate(){
  const d=new Date();
  d.setHours(12,0,0,0);
  d.setDate(d.getDate()+(5-d.getDay()+7)%7);
  return d.toLocaleDateString('en-CA');
}

async function loadPoll(){
  if(!cloud||!state.group||state.group==='local')return;

  try {
    const date=nextFridayDate();
    const ps=await api(
      `gym_friday_polls?group_id=eq.${encodeURIComponent(state.group)}&friday_date=eq.${date}&select=*&limit=1`
    );

    fridayPoll=ps[0]||null;
    fridayVotes=fridayPoll
      ?await api(`gym_friday_votes?poll_id=eq.${fridayPoll.id}&select=*&order=created_at.asc`)
      :[];

  } catch(e){
    console.warn('Sondage V4 : migration requise',e);
    fridayPoll=null;
    fridayVotes=[];
  }
}

async function ensurePoll(){
  if(!cloud||!state.group||state.group==='local')return;

  try {
    await api('rpc/gymcrew_ensure_friday_poll','POST',{
      p_group:state.group,
      p_friday:nextFridayDate()
    });
    await loadPoll();
    render();
  } catch(e){
    alert('Création du sondage impossible : '+e.message);
  }
}

async function votePoll(){
  if(!fridayPoll)return;

  const choices=[
    ...document.querySelectorAll('input[name="polltime"]:checked')
  ].map(e=>e.value);

  const absent=$('#poll-absent')?.checked||false;

  if(!absent&&!choices.length){
    return alert('Sélectionne au moins un créneau ou Absent.');
  }

  try {
    await api('rpc/gymcrew_cast_friday_vote','POST',{
      p_poll:fridayPoll.id,
      p_choices:absent?[]:choices,
      p_absent:absent
    });
    await loadPoll();
    render();
  } catch(e){
    alert('Vote impossible : '+e.message);
  }
}

function pollView(){
  const date=nextFridayDate();
  const my=fridayVotes.find(v=>v.user_id===currentUserId());

  const counts=Object.fromEntries(
    pollTimes.map(t=>[
      t,
      fridayVotes.filter(v=>!v.absent&&(v.choices||[]).includes(t)).length
    ])
  );

  const max=Math.max(0,...Object.values(counts));

  return `<h1>Vendredi ensemble</h1>
    <p class="muted">
      Sondage du vendredi
      ${safe(new Date(date+'T12:00:00').toLocaleDateString('fr-FR',{
        day:'numeric',month:'long'
      }))}.
      Tu peux sélectionner plusieurs horaires.
    </p>
    ${!fridayPoll?`
      <div class="card">
        <p>Le sondage de cette semaine n'est pas encore créé.</p>
        <button id="create-poll" class="primary full">
          Créer le sondage
        </button>
        <p class="muted">
          La création automatique du mercredi nécessite
          l'activation du Cron Supabase.
        </p>
      </div>`:`
      <div class="card">
        <h3>À quelle heure es-tu disponible ?</h3>
        ${pollTimes.map(t=>`
          <label class="poll-option">
            <input type="checkbox" name="polltime" value="${t}"
              ${my&&!my.absent&&(my.choices||[]).includes(t)?'checked':''}>
            <span>${t}</span>
            <strong>${counts[t]} vote(s) ${max>0&&counts[t]===max?'★':''}</strong>
          </label>`).join('')}
        <label class="poll-option">
          <input type="checkbox" id="poll-absent" ${my?.absent?'checked':''}>
          <span>Absent</span>
        </label>
        <button id="poll-vote" class="primary full">
          ${my?'Modifier mon vote':'Enregistrer mon vote'}
        </button>
      </div>
      <div class="card">
        <h3>Réponses du groupe</h3>
        ${fridayVotes.length
          ?fridayVotes.map(v=>`
            <div class="crew-person">
              <span>${safe(v.nickname)}</span>
              <strong>${v.absent?'Absent':safe((v.choices||[]).join(', '))}</strong>
            </div>`).join('')
          :'<p class="muted">Aucune réponse pour le moment.</p>'}
      </div>
      <p class="muted">
        Le créneau le plus populaire est indiqué par ★.
        En cas d’égalité, plusieurs créneaux restent possibles.
      </p>`}
    <div class="card">
      <h3>Rappel de créatine</h3>
      <p class="muted">
        Rappel quotidien à l’heure de Paris, même lorsque l’application est fermée,
        après activation des notifications sur cet appareil.
      </p>
      <label class="poll-option">
        <input type="checkbox" id="creatine-enabled"
          ${reminderSettings().enabled?'checked':''}>
        Activer le rappel
      </label>
      <label>Heure du rappel
        <input class="field" type="time" id="creatine-time"
          value="${safe(reminderSettings().time)}">
      </label>
      <label class="poll-option">
        <input type="checkbox" id="friday-push" ${reminderSettings().friday !== false ? 'checked' : ''}>
        Ouverture du sondage et horaire retenu le vendredi à 16 h (Paris)
      </label>
      <button class="outline full" id="save-creatine">
        Activer / enregistrer les notifications
      </button>
      <button class="outline full spaced" id="disable-push">Désactiver les notifications sur cet appareil</button>
    </div>`;
}
const cloud = !!(SUPABASE_URL && SUPABASE_ANON_KEY);

const defaultState = {
  name: '',
  group: '',
  code: '',
  tab: 'train',
  session: 'A',
  records: [],
  arm: [],
  draft: {},
  exerciseIndex: {A:0,B:0}
};

let state = {
  ...defaultState,
  ...JSON.parse(localStorage.getItem('gymcrew_state') || 'null')
};

let token = localStorage.getItem('gymcrew_token') || '';
let refreshToken = localStorage.getItem('gymcrew_refresh') || '';
let expiresAt = Number(localStorage.getItem('gymcrew_expiry') || 0);

let members = [];
let loading = false;
let timerEnd = 0;
let interval = null;
let polling = null;

const $ = s => document.querySelector(s);

const safe = s => String(s ?? '').replace(
  /[&<>"']/g,
  c => ({
    '&':'&amp;',
    '<':'&lt;',
    '>':'&gt;',
    '"':'&quot;',
    "'":'&#39;'
  }[c])
);

const save = () =>
  localStorage.setItem('gymcrew_state', JSON.stringify(state));

const today = () => new Date().toLocaleDateString('en-CA');

const fmt = iso =>
  new Date(iso).toLocaleDateString('fr-FR', {
    day:'2-digit',
    month:'short'
  });

const exKey = (session,ex) => session+'|'+ex;

function persistAuth(d) {
  token = d.access_token;
  refreshToken = d.refresh_token || refreshToken;
  expiresAt = Date.now() + (d.expires_in || 3600) * 1000;

  localStorage.setItem('gymcrew_token',token);
  localStorage.setItem('gymcrew_refresh',refreshToken);
  localStorage.setItem('gymcrew_expiry',String(expiresAt));
}

let authPromise = null;

async function ensureAuth() {
  if (!authPromise) authPromise = authenticate().finally(() => { authPromise = null; });
  return authPromise;
}

// Le délai couvre la connexion et la lecture du corps de la réponse.
async function request(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);
  try {
    const response = await fetch(url, {...options, signal: controller.signal});
    const text = await response.text();
    let data;
    try { data = text ? JSON.parse(text) : null; }
    catch { throw Error('Réponse serveur invalide (HTTP ' + response.status + ').'); }
    if (!response.ok) throw Error('HTTP ' + response.status + ' : ' +
      (data?.message || data?.msg || data?.error_description || data?.error || text));
    return data;
  } catch (e) {
    if (e.name === 'AbortError') throw Error('Le serveur ne répond pas après 20 secondes. Vérifie la connexion puis réessaie.');
    throw e;
  } finally {
    clearTimeout(timeout);
  }
}

async function authenticate() {
  if (!cloud) return;

  if (token && (!expiresAt || Date.now() < expiresAt-90000)) {
    return;
  }

  if (refreshToken) {
    const d = await request(
      `${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`,
      {
        method:'POST',
        headers:{
          apikey:SUPABASE_ANON_KEY,
          'Content-Type':'application/json'
        },
        body:JSON.stringify({refresh_token:refreshToken})
      }
    );

    persistAuth(d);
    return;
  }

  if (token || (state.group && state.group !== 'local')) {
    throw Error('Session existante indisponible. Les identifiants locaux sont conservés ; aucun nouveau compte ne sera créé.');
  }

  const d = await request(`${SUPABASE_URL}/auth/v1/signup`, {
    method:'POST',
    headers:{
      apikey:SUPABASE_ANON_KEY,
      'Content-Type':'application/json'
    },
    body:JSON.stringify({
      data:{app:'gymcrew'},
      is_anonymous:true
    })
  });

  if (!d?.access_token) {
    throw Error(
      d.msg ||
      d.message ||
      d.error_description ||
      'Connexion impossible'
    );
  }

  persistAuth(d);
}

async function api(path,method='GET',body) {
  await ensureAuth();

  return request(`${SUPABASE_URL}/rest/v1/${path}`, {
    method,
    headers:{
      apikey:SUPABASE_ANON_KEY,
      Authorization:`Bearer ${token}`,
      'Content-Type':'application/json',
      Prefer:'return=representation'
    },
    body:body===undefined ? undefined : JSON.stringify(body)
  });

}

async function join() {
  const name = $('#name').value.trim().slice(0,24);
  const code = $('#invite').value.trim().toUpperCase();

  if (!name) return alert('Saisis un pseudo');
  if (cloud && state.group === 'local' && (!code || code === 'DEMO')) {
    return alert('Saisis le code d’invitation de ton groupe existant.');
  }

  if (cloud) {
    try {
      await ensureAuth();

      const result = await api('rpc/join_gymcrew','POST',{
        p_name:name,
        p_code:code||null
      });

      if (state.group === 'local') {
        // Archive la démo avant que la synchronisation charge les séries du groupe.
        localStorage.setItem('gymcrew_demo_backup_' + Date.now(), JSON.stringify(state));
      }
      state.group = result.group_id;
      state.code = result.invite_code;

    } catch(e) {
      alert('Impossible de rejoindre : '+e.message);
      return;
    }
  } else {
    state.group = 'local';
    state.code = 'DEMO';
  }

  state.name = name;
  save();
  render();

  await Promise.all([
    sync(),
    loadPrograms(),
    loadPoll()
  ]);

  render();
}

// Code de récupération : 16 caractères sans 0/O/1/I (pas d'ambiguïté à la saisie), 80 bits.
const RECOVERY_ALPHABET='23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
let recoveryShown='';

function newRecoveryCode() {
  const bytes=crypto.getRandomValues(new Uint8Array(16));
  const raw=[...bytes].map(b=>RECOVERY_ALPHABET[b%32]).join(''); // 256 = 8×32 : tirage uniforme
  return raw.match(/.{4}/g).join('-');
}

async function createRecoveryCode() {
  if (!confirm('Créer un nouveau code ? Un éventuel ancien code ne fonctionnera plus.')) return;
  const code=newRecoveryCode();
  try {
    await api('rpc/gymcrew_set_recovery','POST',{p_code:code});
    recoveryShown=code;
    localStorage.setItem('gymcrew_recovery_date',today());
    render();
  } catch(e) {
    alert('Création du code impossible : '+e.message);
  }
}

async function recover() {
  const code=$('#recovery').value.toUpperCase().replace(/[^A-Z0-9]/g,'');
  if (!cloud) return alert('La récupération nécessite la connexion à Supabase.');
  if (code.length!==16) return alert('Le code de récupération contient 16 caractères (ex : ABCD-EFGH-JKLM-NPQR).');

  try {
    await ensureAuth();
    const r=await api('rpc/gymcrew_recover','POST',{p_code:code});
    state.group=r.group_id;
    state.code=r.invite_code;
    state.name=r.nickname;
    state.tab='train';
    save();
    render();
    await Promise.all([sync(),loadPrograms(),loadPoll()]);
    render();
  } catch(e) {
    alert('Récupération impossible : '+e.message);
  }
}

async function sync(quiet=true) {
  if (!cloud || !state.group || state.group === 'local') return;

  try {
    const rows = await api(
      `workout_sets?group_id=eq.${encodeURIComponent(state.group)}&select=*&order=performed_at.desc&limit=3000`
    );

    state.records = rows.map(r=>({
      id:r.id,
      user_id:r.user_id,
      person:r.nickname,
      exercise:r.exercise,
      kg:Number(r.kg),
      reps:r.reps,
      // Date locale (Paris) et non UTC, comme today().
      date:new Date(r.performed_at).toLocaleDateString('en-CA'),
      timestamp:r.performed_at,
      session:r.session,
      series:r.series
    }));

    try {
      members = await api('rpc/list_gymcrew_members','POST',{
        p_group:state.group
      });
    } catch(e) {
      console.warn('Liste des membres indisponible',e);

      members = [
        ...new Set(state.records.map(r=>r.person))
      ].map(n=>({nickname:n}));
    }

    save();

    if (!quiet) render();

  } catch(e) {
    console.warn('Synchronisation GymCrew',e);

    if (!quiet) {
      alert('Synchronisation impossible : '+e.message);
    }
  }
}

function recent(person,exercise) {
  return state.records
    .filter(r=>r.person===person && r.exercise===exercise)
    .sort((a,b)=>
      String(b.timestamp||b.date)
        .localeCompare(String(a.timestamp||a.date))
    )[0];
}

function lastSession(person,exercise) {
  return state.records
    .filter(r=>r.person===person && r.exercise===exercise)
    .sort((a,b)=>
      String(b.timestamp||b.date)
        .localeCompare(String(a.timestamp||a.date))
    );
}

function nav() {
  const icons = {"train":"<path d=\"m6 8 10 8M4 6l4-2 12 14-4 2ZM3 10l4-4m10 12 4-4\"/>","group":"<circle cx=\"9\" cy=\"8\" r=\"3\"/><path d=\"M3 20v-2a6 6 0 0 1 12 0v2m1-15a3 3 0 0 1 0 6m2 3a5 5 0 0 1 3 5\"/>","programs":"<rect x=\"5\" y=\"4\" width=\"14\" height=\"17\" rx=\"2\"/><path d=\"M9 4V2h6v2M9 10h6m-6 5h6\"/>","history":"<path d=\"M4 4v16h16M7 15l4-5 4 3 5-7\"/>","poll":"<rect x=\"4\" y=\"5\" width=\"16\" height=\"16\" rx=\"2\"/><path d=\"M8 3v4m8-4v4M4 11h16m-12 5 2 2 5-4\"/>","profile":"<circle cx=\"12\" cy=\"8\" r=\"4\"/><path d=\"M4 21v-2a8 8 0 0 1 16 0v2\"/>"};
  return `<nav aria-label="Navigation principale">${[
    ['train','Séance'], ['group','Groupe'], ['programs','Programmes'],
    ['history','Historique'], ['poll','Vendredi'], ['profile','Profil']
  ].map(([t,label])=>`<button data-tab="${t}" class="${state.tab===t?'active':''}" ${state.tab===t?'aria-current="page"':''}>
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[t]}</svg><span>${label}</span>
  </button>`).join('')}</nav>`;
}

function people() {
  const names = [
    ...new Set([
      state.name,
      ...members.map(m=>m.nickname),
      ...state.records.map(r=>r.person)
    ])
  ];

  return names.filter(Boolean);
}

function weightLabel(ex,kg) {
  return `${kg} kg${
    ex==='Dips lestés'
      ?' lestés'
      :ex.includes('haltères')
        ?' / haltère'
        :''
  }`;
}

function howToPanel(ex) {
  const img = exerciseImage(ex);
  const search = encodeURIComponent(ex+' exécution technique musculation');
  const video = `<a class="muted" target="_blank" rel="noopener"
    href="https://www.youtube.com/results?search_query=${search}">▶ Voir des vidéos</a>`;

  if (!img) {
    // Exercice personnalisé sans photo intégrée : recherche d'images.
    return `<div class="howto">
      <a class="muted" target="_blank" rel="noopener"
        href="https://www.google.com/search?tbm=isch&q=${search}">🔎 Chercher des photos de cet exercice</a>
      · ${video}
    </div>`;
  }

  return `<div class="howto">
    <div class="howto-grid">
      ${['Départ','Arrivée'].map((label,i)=>`
        <figure>
          <img src="img/exercises/${img}/${i}.jpg" alt="${safe(ex)} : position ${label.toLowerCase()}" loading="lazy">
          <figcaption>${label}</figcaption>
        </figure>`).join('')}
    </div>
    ${video}
  </div>`;
}

function exerciseCard(ex,sets,range,base) {
  const names = people();
  const me = recent(state.name,ex);
  const draftKey = exKey(state.session,ex);

  const d = state.draft[draftKey] || {
    kg:me?.kg??base,
    reps:me?.reps??Number(range.split(/[–-]/)[0])
  };

  const todaySets = state.records.filter(r=>
    r.person===state.name &&
    r.exercise===ex &&
    r.session===state.session &&
    r.date===today()
  );

  const lastToday = todaySets.slice().sort((a,b)=>
    String(b.timestamp||b.date).localeCompare(String(a.timestamp||a.date))
  )[0];

  return `<div class="card focus">
    <div class="flex">
      <div>
        <small>
          EXERCICE ${state.exerciseIndex[state.session]+1}
          / ${PROGRAM[state.session].length}
        </small>
        <h2>${safe(ex)}</h2>
        <button id="howto" class="outline" style="padding:4px 10px;font-size:13px">
          📷 ${showHowTo?'Masquer':'Voir'} l’exécution
        </button>
      </div>
      <span class="pill">${sets} × ${range}</span>
    </div>

    ${showHowTo ? howToPanel(ex) : ''}

    <div class="sectionlabel">
      MA PROCHAINE SÉRIE
      <span class="muted">
        ${Math.min(todaySets.length+1,sets)} / ${sets}
      </span>
    </div>

    <div class="set-progress" aria-label="${todaySets.length} séries effectuées sur ${sets} prévues">${Array.from({length:sets},(_,i)=>`<span class="${i<todaySets.length?'done':''}" aria-hidden="true">${i<todaySets.length?'✓':i+1}</span>`).join('')}</div>

    <div class="inputs">
      <div>
        <label for="kg">Charge (kg)</label>
        <div class="stepper">
          <button data-adjust="kg:-2.5">−</button>
          <input id="kg" type="number" inputmode="decimal"
            min="0" max="1000" step="0.5" value="${d.kg}">
          <button data-adjust="kg:2.5">+</button>
        </div>
      </div>
      <div>
        <label for="reps">Répétitions</label>
        <div class="stepper">
          <button data-adjust="reps:-1">−</button>
          <input id="reps" type="number" inputmode="numeric"
            min="1" max="100" step="1" value="${d.reps}">
          <button data-adjust="reps:1">+</button>
        </div>
      </div>
    </div>

    <button id="record" class="primary full" ${loading?'disabled':''}>
      ✓ Enregistrer ma série
    </button>

    <div class="muted centered">
      ${todaySets.length} série(s) enregistrée(s) aujourd'hui ·
      Dernière charge personnelle :
      ${me?weightLabel(ex,me.kg)+' × '+me.reps:'aucune'}
    </div>

    <details class="crew-details"><summary>Charges du groupe <span>Voir les dernières séries</span></summary>

    <div class="crew-list">
      ${names.map(n=>{
        const r=recent(n,ex);

        return `<div class="crew-person">
          <div class="avatar">${safe(n[0].toUpperCase())}</div>
          <span class="person-name">
            ${safe(n)}
            ${n===state.name?' <small>· moi</small>':''}
          </span>
          <strong>
            ${r?`${weightLabel(ex,r.kg)} × ${r.reps}`:'—'}
          </strong>
        </div>`;
      }).join('')}
    </div>
    </details>

    ${lastToday && canDeleteSet(lastToday) ? `
      <button class="outline full spaced" data-delete-set="${safe(lastToday.id)}">
        Supprimer ma dernière série (${lastToday.kg} kg × ${lastToday.reps})
      </button>` : ''}
  </div>`;
}

function training() {
  const list=PROGRAM[state.session];

  if (!list.length) {
    return `<h1>Séance ${state.session}</h1>
      <p class="notice">
        Aucun exercice dans cette séance.
        Ajoute-en depuis Programmes.
      </p>
      <div class="tabs">
        <button data-session="A">Séance A</button>
        <button data-session="B">Séance B</button>
      </div>`;
  }

  const idx=Math.min(
    state.exerciseIndex[state.session]||0,
    list.length-1
  );

  state.exerciseIndex[state.session]=idx;

  const [ex,sets,range,base]=list[idx];

  const msg=flash;
  flash='';

  return `${msg?`<p class="notice">${safe(msg)}</p>`:''}
  <div class="top">
    <div>
      <small>GYMCREW · ${safe(state.name)}</small>
      <h1>Séance ${state.session}</h1>
    </div>
    <span class="pill">
      ${cloud?'● Synchronisé':'● Démo'}
    </span>
  </div>

  <div class="tabs">
    <button data-session="A"
      class="${state.session==='A'?'active':''}">
      Séance A
    </button>
    <button data-session="B"
      class="${state.session==='B'?'active':''}">
      Séance B
    </button>
  </div>

  <div class="exercise-picker">
    <div class="exercise-position"><label for="pick">Ton exercice</label><span>${idx+1} <span class="muted">/ ${list.length}</span></span></div>
    <div class="exercise-progress" aria-hidden="true"><span style="width:${Math.round((idx+1)/list.length*100)}%"></span></div>
    <select id="pick" class="field">
      ${list.map(([name],i)=>`
        <option value="${i}" ${idx===i?'selected':''}>
          ${i+1}. ${safe(name)}
        </option>
      `).join('')}
    </select>
  </div>

  ${exerciseCard(ex,sets,range,base)}

  <div class="flex next">
    <button class="outline" id="previous" ${idx===0?'disabled':''}>
      ← Précédent
    </button>
    <button class="primary" id="next"
      ${idx===list.length-1?'disabled':''}>
      Suivant →
    </button>
  </div>

  <div class="card rest">
    <div>
      <small>Repos</small>
      <strong id="timer">02:00</strong>
    </div>
    <button class="outline" id="starttimer">Lancer 2 min</button>
    <button class="outline" id="stoptimer">Stop</button>
  </div>`;
}

function group() {
  return `<h1>Charges du groupe</h1>
    <p class="muted">
      Consultez les dernières charges sans lancer de séance.
      Chaque personne enregistre ses propres séries.
    </p>

    <div class="tabs">
      <button data-session="A"
        class="${state.session==='A'?'active':''}">
        Séance A
      </button>
      <button data-session="B"
        class="${state.session==='B'?'active':''}">
        Séance B
      </button>
    </div>

    ${PROGRAM[state.session].map(([ex],i)=>`
      <div class="card compact">
        <button class="exercise-link" data-open="${i}">
          <strong>${safe(ex)}</strong>
          <span>Ouvrir →</span>
        </button>

        ${people().map(n=>{
          const r=recent(n,ex);
          return `<div class="crew-person">
            <span>${safe(n)}</span>
            <strong>
              ${r?`${weightLabel(ex,r.kg)} × ${r.reps}`:'—'}
            </strong>
          </div>`;
        }).join('')}
      </div>
    `).join('')}

    <button id="refresh" class="outline full">
      ↻ Actualiser
    </button>`;
}

// Courbe de progression : meilleure série (charge max, puis reps) de chaque séance,
// une ligne par personne. Couleur liée à la personne (moi = 1er créneau, puis ordre
// alphabétique du groupe), jamais au rang. Palette sombre validée ≥ 3:1 sur #172338.
const SERIES_COLORS=['#3987e5','#d95926','#199e70','#c98500','#d55181','#008300','#9085e9','#e66767'];
const PG={W:340,H:200,L:36,R:70,T:12,B:24};
let pgSeries=[], pgDates=[], pgSel=null;

function progressSeries(ex) {
  const others=people().filter(n=>n!==state.name).sort((a,b)=>a.localeCompare(b,'fr'));
  const order=[state.name,...others].slice(0,SERIES_COLORS.length);

  return order.map((name,i)=>{
    const best=new Map();
    for (const r of state.records) {
      if (r.person!==name || r.exercise!==ex) continue;
      const b=best.get(r.date);
      if (!b || r.kg>b.kg || (r.kg===b.kg && r.reps>b.reps)) best.set(r.date,{date:r.date,kg:r.kg,reps:r.reps});
    }
    return {
      name,
      me:name===state.name,
      color:SERIES_COLORS[i],
      points:[...best.values()].sort((a,b)=>a.date.localeCompare(b.date))
    };
  }).filter(s=>s.points.length);
}

function niceStep(range) {
  for (const s of [1,2,2.5,5,10,20,25,50,100]) if (range/s<=4) return s;
  return 200;
}

function progressChart(series) {
  const {W,H,L,R,T,B}=PG;
  pgDates=[...new Set(series.flatMap(s=>s.points.map(p=>p.date)))].sort();
  const t=d=>Date.parse(d+'T12:00:00');
  const t0=t(pgDates[0]), t1=t(pgDates[pgDates.length-1]);
  const x=d=>t1===t0 ? L+(W-L-R)/2 : L+(t(d)-t0)/(t1-t0)*(W-L-R);

  const kgs=series.flatMap(s=>s.points.map(p=>p.kg));
  let lo=Math.min(...kgs), hi=Math.max(...kgs);
  const step=niceStep(Math.max(hi-lo,5));
  lo=Math.max(0,Math.floor(lo/step)*step-(lo%step===0?step:0));
  hi=Math.ceil(hi/step)*step+(hi%step===0?step:0);
  const y=kg=>T+(hi-kg)/(hi-lo)*(H-T-B);

  const ticks=[];
  for (let v=lo; v<=hi+1e-9; v+=step) ticks.push(v);

  // Étiquettes directes en fin de ligne, écartées d'au moins 12 px.
  const labels=series.map(s=>{
    const p=s.points[s.points.length-1];
    return {s,x:x(p.date),y:y(p.kg)};
  }).sort((a,b)=>a.y-b.y);
  for (let i=1;i<labels.length;i++) labels[i].y=Math.max(labels[i].y,labels[i-1].y+12);
  const overflow=labels.length ? labels[labels.length-1].y-(H-B) : 0;
  if (overflow>0) labels.forEach(l=>l.y=Math.max(T,l.y-overflow));

  const short=n=>n.length>9 ? n.slice(0,8)+'…' : n;

  return `<svg id="pg-svg" viewBox="0 0 ${W} ${H}" width="100%" tabindex="0"
      role="img" aria-label="Évolution de la meilleure charge par séance"
      style="display:block;touch-action:pan-y;outline:none">
    ${ticks.map(v=>`
      <line x1="${L}" x2="${W-R}" y1="${y(v)}" y2="${y(v)}" stroke="#2a3a53" stroke-width="1"/>
      <text x="${L-6}" y="${y(v)+3.5}" text-anchor="end" fill="#94a3b8" font-size="10">${v}</text>`).join('')}
    <text x="${L}" y="${H-6}" fill="#94a3b8" font-size="10">${fmt(pgDates[0])}</text>
    ${pgDates.length>1?`<text x="${W-R}" y="${H-6}" text-anchor="end" fill="#94a3b8" font-size="10">${fmt(pgDates[pgDates.length-1])}</text>`:''}
    <line id="pg-cross" y1="${T}" y2="${H-B}" stroke="#94a3b8" stroke-width="1" visibility="hidden"/>
    ${series.slice().reverse().map(s=>`
      ${s.points.length>1?`<path d="${s.points.map((p,i)=>`${i?'L':'M'}${x(p.date).toFixed(1)},${y(p.kg).toFixed(1)}`).join('')}"
        fill="none" stroke="${s.color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`:''}
      ${s.points.map(p=>`<circle cx="${x(p.date).toFixed(1)}" cy="${y(p.kg).toFixed(1)}" r="4"
        fill="${s.color}" stroke="#172338" stroke-width="2"/>`).join('')}`).join('')}
    ${labels.map(l=>`<text x="${l.x+8}" y="${l.y+3.5}" fill="#cbd5e1" font-size="10">${safe(short(l.s.me?'Moi':l.s.name))}</text>`).join('')}
    <rect id="pg-hit" x="${L}" y="${T}" width="${W-L-R}" height="${H-T-B}" fill="transparent"/>
  </svg>`;
}

function progressCard() {
  const exercises=[...new Set([
    ...PROGRAM.A.map(e=>e[0]),
    ...PROGRAM.B.map(e=>e[0]),
    ...state.records.map(r=>r.exercise)
  ])];

  if (!exercises.includes(state.progressEx)) {
    state.progressEx=PROGRAM[state.session][state.exerciseIndex[state.session]]?.[0]||exercises[0];
  }
  const ex=state.progressEx;

  pgSeries=progressSeries(ex);
  if (pgSel!==null && pgSel>=pgDates.length) pgSel=null;

  const key=c=>`<span style="display:inline-block;width:14px;height:2px;background:${c};vertical-align:middle;margin-right:6px"></span>`;
  const rec=s=>s.points.reduce((b,p)=>p.kg>b.kg||(p.kg===b.kg&&p.reps>b.reps)?p:b);

  return `<div class="card">
    <h3>Progression</h3>
    <select id="pg-ex" class="field" aria-label="Exercice">
      ${exercises.map(e=>`<option ${e===ex?'selected':''}>${safe(e)}</option>`).join('')}
    </select>
    ${pgSeries.length ? `
      ${progressChart(pgSeries)}
      <div id="pg-read" class="muted" style="min-height:18px;margin:6px 0 10px">
        Touche le graphique pour voir les charges d'une séance.
      </div>
      ${pgSeries.length>1?`<div class="muted" style="display:flex;flex-wrap:wrap;gap:4px 14px;margin-bottom:8px">
        ${pgSeries.map(s=>`<span>${key(s.color)}${safe(s.me?'Moi':s.name)}</span>`).join('')}
      </div>`:''}
      <div class="sectionlabel">RECORDS</div>
      ${pgSeries.map(s=>{const r=rec(s); return `<div class="crew-person">
        <span>${key(s.color)}${safe(s.me?'Moi':s.name)}</span>
        <strong>${r.kg} kg × ${r.reps} <small>· ${fmt(r.date)}</small></strong>
      </div>`;}).join('')}`
    : '<p class="muted">Aucune série enregistrée sur cet exercice.</p>'}
  </div>`;
}

function showProgressAt(i) {
  const svg=$('#pg-svg'), read=$('#pg-read');
  if (!svg || !read || !pgDates.length) return;
  pgSel=Math.max(0,Math.min(pgDates.length-1,i));
  const d=pgDates[pgSel];

  const {W,L,R}=PG;
  const t=s=>Date.parse(s+'T12:00:00');
  const t0=t(pgDates[0]), t1=t(pgDates[pgDates.length-1]);
  const cx=t1===t0 ? L+(W-L-R)/2 : L+(t(d)-t0)/(t1-t0)*(W-L-R);
  const cross=$('#pg-cross');
  cross.setAttribute('x1',cx); cross.setAttribute('x2',cx);
  cross.setAttribute('visibility','visible');

  read.innerHTML=`<strong style="color:#fff">${fmt(d)}</strong> · `+pgSeries.map(s=>{
    const p=s.points.find(p=>p.date===d);
    return `<span style="white-space:nowrap"><span style="display:inline-block;width:10px;height:2px;background:${s.color};vertical-align:middle;margin-right:4px"></span><strong style="color:#fff">${p?`${p.kg} kg × ${p.reps}`:'—'}</strong> ${safe(s.me?'Moi':s.name)}</span>`;
  }).join(' · ');
}

function bindProgress() {
  const sel=$('#pg-ex');
  if (sel) sel.onchange=()=>{ state.progressEx=sel.value; pgSel=null; save(); render(); };

  const svg=$('#pg-svg');
  if (!svg) return;

  // Le réticule se cale sur la séance la plus proche du doigt.
  const pick=e=>{
    const box=svg.getBoundingClientRect();
    const sx=(e.clientX-box.left)/box.width*PG.W;
    const t=s=>Date.parse(s+'T12:00:00');
    const t0=t(pgDates[0]), t1=t(pgDates[pgDates.length-1]);
    let best=0, dist=Infinity;
    pgDates.forEach((d,i)=>{
      const cx=t1===t0 ? 0 : PG.L+(t(d)-t0)/(t1-t0)*(PG.W-PG.L-PG.R);
      if (Math.abs(cx-sx)<dist) { dist=Math.abs(cx-sx); best=i; }
    });
    showProgressAt(best);
  };
  svg.onpointerdown=pick;
  svg.onpointermove=e=>{ if (e.buttons || e.pointerType==='mouse') pick(e); };
  svg.onkeydown=e=>{
    if (e.key==='ArrowLeft') { e.preventDefault(); showProgressAt((pgSel??pgDates.length)-1); }
    if (e.key==='ArrowRight') { e.preventDefault(); showProgressAt((pgSel??-1)+1); }
  };
  svg.onfocus=()=>{ if (pgSel===null) showProgressAt(pgDates.length-1); };

  if (pgSel!==null) showProgressAt(pgSel);
}

function history() {
  const mine=state.records
    .filter(r=>r.person===state.name)
    .sort((a,b)=>
      String(b.timestamp||b.date)
        .localeCompare(String(a.timestamp||a.date))
    );

  const days=[...new Set(mine.map(r=>r.date))];

  return `<h1>Mon historique</h1>
    <div class="card">
      <strong>${mine.length}</strong> séries ·
      <strong>${days.length}</strong> jours d'entraînement
    </div>

    ${progressCard()}

    ${days.length
      ?days.map(d=>`
        <div class="card">
          <h3>${fmt(d)}</h3>
          ${mine.filter(r=>r.date===d).map(r=>`
            <div class="crew-person">
              <span>
                ${safe(r.exercise)}
                <small>· ${r.series}</small>
              </span>
              <strong>${r.kg} kg × ${r.reps}</strong>
              ${canDeleteSet(r)
                ?`<button class="outline" style="padding:4px 9px" data-delete-set="${safe(r.id)}" aria-label="Supprimer cette série">✕</button>`
                :''}
            </div>
          `).join('')}
        </div>
      `).join('')
      :'<div class="card">Aucune série enregistrée.</div>'}

    `;
}

function profile() {
  return `<h1>Mon profil</h1>
    <div class="card">
      <h3>${safe(state.name)}</h3>
      <p>Groupe : <strong>${safe(state.code||'—')}</strong></p>
      <p class="muted">
        ${cloud?'Synchronisation Supabase':'Mode démonstration local'}
      </p>
      <p class="notice">
        Les comptes anonymes sont liés au navigateur.
        Évite de supprimer les données de l'application :
        tu pourrais perdre l'accès à ton profil.
      </p>
    </div>

    ${cloud ? `<div class="card">
      <h3>Code de récupération</h3>
      <p class="muted">
        Permet de retrouver ton profil (groupe, séries, programmes) sur un nouveau
        téléphone ou après avoir effacé Chrome. Note-le dans un endroit sûr :
        sans lui, le compte ne peut pas être récupéré. Ne le partage pas.
      </p>
      ${recoveryShown ? `
        <div class="notice">
          <div class="invite" style="font-size:22px;letter-spacing:1px;user-select:all">${safe(recoveryShown)}</div>
          <p>Note ce code maintenant : il ne sera plus affiché.</p>
          <button id="copy-recovery" class="outline full">Copier le code</button>
        </div>` : `
        <p class="muted">${localStorage.getItem('gymcrew_recovery_date')
          ? 'Code créé le '+safe(fmt(localStorage.getItem('gymcrew_recovery_date')))+'.'
          : '<strong>Aucun code créé sur cet appareil.</strong>'}</p>`}
      <button id="make-recovery" class="${localStorage.getItem('gymcrew_recovery_date')?'outline':'primary'} full spaced">
        ${localStorage.getItem('gymcrew_recovery_date')?'Créer un nouveau code':'Créer mon code de récupération'}
      </button>
    </div>` : ''}`;
}

function captureDraft() {
  if (!PROGRAM[state.session]?.length) return;

  const kg=$('#kg');
  const reps=$('#reps');

  if (!kg || !reps) return;

  const ex=PROGRAM[state.session][state.exerciseIndex[state.session]][0];

  state.draft[exKey(state.session,ex)]={
    kg:Number(kg.value),
    reps:Number(reps.value)
  };

  save();
}

async function record() {
  if (loading) return;

  captureDraft();

  const [ex,sets]=PROGRAM[state.session][state.exerciseIndex[state.session]];
  const d=state.draft[exKey(state.session,ex)];

  if (
    !Number.isFinite(d.kg) ||
    d.kg<0 ||
    d.kg>1000 ||
    !Number.isInteger(d.reps) ||
    d.reps<1 ||
    d.reps>100
  ) {
    return alert('Poids ou répétitions invalides');
  }

  const todaySets=state.records.filter(r=>
    r.person===state.name &&
    r.exercise===ex &&
    r.session===state.session &&
    r.date===today()
  );

  const series=Math.min(todaySets.length+1,20);

  const row={
    person:state.name,
    exercise:ex,
    kg:d.kg,
    reps:d.reps,
    date:today(),
    timestamp:new Date().toISOString(),
    session:state.session,
    series
  };

  loading=true;

  const btn=$('#record');

  if (btn) {
    btn.disabled=true;
    btn.textContent='Enregistrement…';
  }

  try {
    if (cloud) {
      await api('workout_sets','POST',{
        group_id:state.group,
        nickname:state.name,
        exercise:ex,
        kg:d.kg,
        reps:d.reps,
        session:state.session,
        series
      });

      await sync();
    } else {
      state.records.unshift({...row,id:crypto.randomUUID()});
    }

    // Dernière série prévue : passage automatique à l'exercice suivant.
    const list=PROGRAM[state.session];
    const idx=state.exerciseIndex[state.session];

    if (series===sets) {
      if (idx<list.length-1) {
        state.exerciseIndex[state.session]=idx+1;
        flash=`✓ ${ex} terminé · au tour de ${list[idx+1][0]}`;
      } else {
        flash=`💪 Séance ${state.session} terminée !`;
      }
    }

    save();
    render();

    const status=$('#status');
    if (status) status.textContent='Série enregistrée ✓';

  } catch(e) {
    alert('Erreur de sauvegarde : '+e.message);
  } finally {
    loading=false;
    if ($('#record')) $('#record').disabled=false;
  }
}

function canDeleteSet(r) {
  return !cloud || r.user_id === currentUserId();
}

async function deleteSet(id) {
  const r = state.records.find(x => x.id === id);
  if (!r || !canDeleteSet(r)) return;

  if (!confirm(`Supprimer la série ${r.exercise} : ${r.kg} kg × ${r.reps} ?`)) return;

  try {
    if (cloud) {
      const deleted = await api(`workout_sets?id=eq.${encodeURIComponent(id)}`,'DELETE');
      // RLS : une suppression refusée ne renvoie aucune ligne, sans erreur HTTP.
      if (!deleted?.length) {
        throw Error('Suppression refusée par le serveur (migration_v6_delete_sets.sql exécutée ?).');
      }
    }

    state.records = state.records.filter(x => x.id !== id);
    save();
    render();

  } catch (e) {
    alert('Suppression impossible : ' + e.message);
  }
}

function bindRemove() {
  document.querySelectorAll('.remove-ex').forEach(b=>{
    b.onclick=()=>b.closest('.edit-exercise').remove();
  });
}

function bind() {
  const createPoll=$('#create-poll');
  if (createPoll) createPoll.onclick=ensurePoll;

  const cast=$('#poll-vote');
  if (cast) cast.onclick=votePoll;

  const absent=$('#poll-absent');

  if (absent) {
    absent.onchange=()=>{
      if (absent.checked) {
        document.querySelectorAll('input[name="polltime"]')
          .forEach(e=>e.checked=false);
      }
    };
  }

  document.querySelectorAll('input[name="polltime"]').forEach(e=>{
    e.onchange=()=>{
      if (e.checked && absent) absent.checked=false;
    };
  });

  const cr=$('#save-creatine');

  if (cr) {
    cr.onclick=async()=>{
      const v={
        enabled:$('#creatine-enabled').checked,
        time:$('#creatine-time').value,
        friday:$('#friday-push').checked
      };

      if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(v.time)) {
        return alert('Heure incorrecte');
      }

      cr.disabled=true;
      try {
        if (v.enabled || v.friday) await savePush(api,state.group,v);
        else await disablePush(api);
        localStorage.setItem(reminderKey,JSON.stringify(v));
        alert('Préférences enregistrées sur le serveur pour cet appareil.');
      } catch(e) { alert('Notifications : '+e.message); }
      finally { cr.disabled=false; }
    };
  }

  const off=$('#disable-push');
  if (off) off.onclick=async()=>{
    off.disabled=true;
    try {
      await disablePush(api);
      localStorage.setItem(reminderKey,JSON.stringify({...reminderSettings(),enabled:false,friday:false}));
      render();
      alert('Notifications désactivées sur cet appareil.');
    } catch(e) { alert('Désactivation impossible : '+e.message); }
    finally { off.disabled=false; }
  };

  document.querySelectorAll('[data-tab]').forEach(b=>{
    b.onclick=()=>{
      captureDraft();
      state.tab=b.dataset.tab;
      save();
      render();
      if (state.tab === 'programs' && !programsReady) loadPrograms();
      if (state.tab === 'poll') loadPoll().then(() => { if (state.tab === 'poll') render(); });
    };
  });

  document.querySelectorAll('[data-session]').forEach(b=>{
    b.onclick=()=>{
      captureDraft();
      state.session=b.dataset.session;
      save();
      render();
    };
  });

  const pick=$('#pick');

  if (pick) {
    pick.onchange=()=>{
      captureDraft();
      state.exerciseIndex[state.session]=Number(pick.value);
      save();
      render();
    };
  }

  for (const [id,delta] of [['previous',-1],['next',1]]) {
    const b=$('#'+id);

    if (b) {
      b.onclick=()=>{
        captureDraft();
        state.exerciseIndex[state.session]=Math.max(
          0,
          Math.min(
            PROGRAM[state.session].length-1,
            state.exerciseIndex[state.session]+delta
          )
        );
        save();
        render();
      };
    }
  }

  document.querySelectorAll('[data-adjust]').forEach(b=>{
    b.onclick=()=>{
      const [field,step]=b.dataset.adjust.split(':');
      const el=$('#'+field);

      el.value=Math.max(
        field==='reps'?1:0,
        Number(el.value)+Number(step)
      );

      captureDraft();
    };
  });

  for (const id of ['kg','reps']) {
    const el=$('#'+id);
    if (el) el.onchange=captureDraft;
  }

  const retry = $('#retry-programs');
  if (retry) retry.onclick = loadPrograms;

  document.querySelectorAll('[data-select-program]').forEach(b=>{
    b.onclick=()=>{
      activeProgramId=b.dataset.selectProgram;

      localStorage.setItem(
        'gymcrew_active_program_'+state.group,
        activeProgramId
      );

      applyProgram();
      state.tab='train';
      save();
      render();
    };
  });

  const newp=$('#new-program');

  if (newp) {
    newp.onclick=()=>{
      state.editingProgram='';
      state.newProgramSource=[];
      state.newProgramTitle='Mon programme';
      render();
    };
  }

  const copyStarter=$('#copy-starter');

  if (copyStarter) {
    copyStarter.onclick=()=>{
      state.editingProgram='';
      state.newProgramTitle='Copie du programme A/B';

      state.newProgramSource=Object.entries(STARTER_PROGRAM)
        .flatMap(([session,list])=>
          list.map(([exercise,sets,rep_range,base_kg],position)=>({
            session,
            exercise,
            sets,
            rep_range,
            base_kg,
            position
          }))
        );

      render();
    };
  }

  document.querySelectorAll('[data-copy-program]').forEach(b=>{
    b.onclick=()=>{
      const p=programById(b.dataset.copyProgram);
      state.editingProgram='';
      state.newProgramTitle='Copie de '+p.title;
      state.newProgramSource=p.exercises.map(x=>({...x}));
      render();
    };
  });

  document.querySelectorAll('[data-edit-program]').forEach(b=>{
    b.onclick=()=>{
      state.editingProgram=b.dataset.editProgram;
      render();
    };
  });

  document.querySelectorAll('[data-delete-program]').forEach(b=>{
    b.onclick=async()=>{
      const id=b.dataset.deleteProgram;

      if (!confirm(
        'Supprimer ce programme ? Les séries déjà enregistrées seront conservées.'
      )) return;

      try {
        await api(
          `gym_programs?id=eq.${encodeURIComponent(id)}`,
          'DELETE'
        );

        if (activeProgramId===id) {
          activeProgramId='';
          localStorage.removeItem(
            'gymcrew_active_program_'+state.group
          );
        }

        await loadPrograms();
        render();

      } catch(e) {
        alert(e.message);
      }
    };
  });

  const add=$('#add-exercise');

  if (add) {
    add.onclick=()=>{
      $('#edit-exercises').insertAdjacentHTML(
        'beforeend',
        editCard()
      );
      bindRemove();
    };
  }

  bindRemove();

  const cancel=$('#cancel-edit');

  if (cancel) {
    cancel.onclick=()=>{
      delete state.editingProgram;
      render();
    };
  }

  const sp=$('#save-program');
  if (sp) sp.onclick=saveProgram;

  const r=$('#record');
  if (r) r.onclick=record;

  bindProgress();

  const howto=$('#howto');
  if (howto) {
    howto.onclick=()=>{
      captureDraft();
      showHowTo=!showHowTo;
      render();
    };
  }

  document.querySelectorAll('[data-delete-set]').forEach(b=>{
    b.onclick=()=>deleteSet(b.dataset.deleteSet);
  });

  document.querySelectorAll('[data-open]').forEach(b=>{
    b.onclick=()=>{
      state.exerciseIndex[state.session]=Number(b.dataset.open);
      state.tab='train';
      save();
      render();
    };
  });

  const refresh=$('#refresh');
  if (refresh) refresh.onclick=()=>sync(false);

  const mkRecovery=$('#make-recovery');
  if (mkRecovery) mkRecovery.onclick=createRecoveryCode;

  const copyRecovery=$('#copy-recovery');
  if (copyRecovery) {
    copyRecovery.onclick=()=>navigator.clipboard.writeText(recoveryShown)
      .then(()=>{ copyRecovery.textContent='Copié ✓'; });
  }

  const start=$('#starttimer');

  if (start) {
    start.onclick=()=>{
      timerEnd=Date.now()+120000;
      tickTimer();
    };
  }

  const stop=$('#stoptimer');

  if (stop) {
    stop.onclick=()=>{
      timerEnd=0;
      tickTimer();
    };
  }
}

function tickTimer() {
  const el=$('#timer');
  if (!el) return;

  const sec=timerEnd
    ?Math.max(0,Math.ceil((timerEnd-Date.now())/1000))
    :120;

  el.textContent=
    `${String(Math.floor(sec/60)).padStart(2,'0')}:`+
    `${String(sec%60).padStart(2,'0')}`;
}

function render() {
  const recoveringDemo = cloud && state.group === 'local';
  if (!state.name || recoveringDemo) {
    $('#app').innerHTML=`<main>
      <h1>🏋️ GymCrew</h1>
      <p class="muted">
        Vos charges, sur une seule interface.
      </p>

      ${!cloud
        ?'<div class="notice">Mode démo. Configure Supabase pour partager les données.</div>'
        :''}

      <div class="card">
        <h2>Rejoindre GymCrew</h2>
        ${recoveringDemo ? '<p class="notice">Cet appareil utilise encore le groupe de démonstration. Saisis le code de ton groupe existant pour te reconnecter. Les données locales seront conservées dans une sauvegarde.</p>' : ''}
        <label>Pseudo</label>
        <input class="field" id="name" maxlength="24"
          placeholder="Ton pseudo" value="${safe(state.name)}">

        <label>${recoveringDemo ? 'Code d’invitation du groupe existant (obligatoire)' : 'Code d’invitation (vide pour créer un groupe)'}</label>
        <input class="field" id="invite"
          placeholder="Ex : ABCD1234">

        <button class="primary full" id="join">
          Commencer
        </button>
      </div>

      ${cloud && !recoveringDemo ? `<div class="card">
        <h2>J’ai déjà un profil</h2>
        <p class="muted">
          Nouveau téléphone ou Chrome effacé ? Saisis ton code de récupération
          (onglet Profil de ton ancien appareil).
        </p>
        <input class="field" id="recovery" autocomplete="off" autocapitalize="characters"
          placeholder="ABCD-EFGH-JKLM-NPQR">
        <button class="outline full" id="recover">Récupérer mon profil</button>
      </div>` : ''}
    </main>`;

    $('#join').onclick=join;
    const rec=$('#recover');
    if (rec) rec.onclick=recover;
    return;
  }

  $('#app').innerHTML=`
    <main>
      ${
        state.tab==='train' ? training() :
        state.tab==='group' ? group() :
        state.tab==='history' ? history() :
        state.tab==='programs' ? programsView() :
        state.tab==='poll' ? pollView() :
        profile()
      }
      <div id="status" class="sr-status" role="status"></div>
    </main>
    ${nav()}
  `;

  bind();
  tickTimer();
}

// Démarrage de GymCrew
if (new URLSearchParams(location.search).get('tab') === 'poll') state.tab='poll';
render();

if (cloud && state.group && state.group !== 'local') {
  Promise.all([
    sync(),
    loadPrograms(),
    loadPoll()
  ]);

  // Uniquement si les notifications ont été activées sur cet appareil.
  if (localStorage.getItem(reminderKey)) {
    refreshPush(api,state.group,reminderSettings())
      .catch(e=>console.warn('Notifications : resynchronisation impossible',e));
  }
}

// Rafraîchit l'affichage seulement si aucune saisie ne peut être perdue.
function autoRender() {
  if (!['train','group','history'].includes(state.tab)) return;

  const focused=document.activeElement;
  if (focused?.tagName==='INPUT' || focused?.tagName==='SELECT') return;

  captureDraft();
  render();
}

// Actualisation périodique
polling=setInterval(async()=>{
  if (
    document.visibilityState==='visible' &&
    state.group &&
    cloud
  ) {
    await sync();

    if (state.tab==='poll') {
      await loadPoll();
    }

    autoRender();
  }
},15000);

// Chronomètre
interval=setInterval(tickTimer,1000);

// Retour dans l'application
document.addEventListener('visibilitychange',()=>{
  // Sans alerte ni rendu forcé : pas de message à chaque retour hors connexion,
  // et un programme ou un vote en cours d'édition n'est pas effacé.
  if (document.visibilityState==='visible' && state.group) {
    sync().then(autoRender);
  }
});

// Service Worker PWA
if ('serviceWorker' in navigator && location.protocol==='https:') {
  navigator.serviceWorker.register('./sw.js').catch(console.warn);
}
