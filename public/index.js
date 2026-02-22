// DOM refs
const createNameInput = document.getElementById('createName');
const joinNameInput = document.getElementById('joinName');
const joinRoomIdInput = document.getElementById('joinRoomId');
const createRoomBtn = document.getElementById('createRoomBtn');
const joinRoomBtn = document.getElementById('joinRoomBtn');
const vibeToggle = document.getElementById('vibeToggle');
const sparkleContainer = document.getElementById('sparkleContainer');
const tabCreateBtn = document.getElementById('tab-create');
const tabJoinBtn = document.getElementById('tab-join');
const createCard = document.getElementById('card-create');
const joinCard = document.getElementById('card-join');

const accountStatusPill = document.getElementById('accountStatusPill');
const accountStatusText = document.getElementById('accountStatusText');
const accountMessage = document.getElementById('accountMessage');
const accountSignupTab = document.getElementById('accountSignupTab');
const accountLoginTab = document.getElementById('accountLoginTab');
const accountSignupForm = document.getElementById('accountSignupForm');
const accountLoginForm = document.getElementById('accountLoginForm');
const accountGuestPanel = document.getElementById('accountGuestPanel');
const accountUserPanel = document.getElementById('accountUserPanel');
const accountUserName = document.getElementById('accountUserName');
const accountUserMeta = document.getElementById('accountUserMeta');
const accountLogoutBtn = document.getElementById('accountLogoutBtn');
const signupUsernameInput = document.getElementById('signupUsername');
const signupEmailInput = document.getElementById('signupEmail');
const signupPasswordInput = document.getElementById('signupPassword');
const signupDisplayNameInput = document.getElementById('signupDisplayName');
const loginIdentifierInput = document.getElementById('loginIdentifier');
const loginPasswordInput = document.getElementById('loginPassword');

const STORAGE = {
  name: 'syncnest_name',
  legacyName: 'watchparty_name',
  vibe: 'syncnest_vibe',
  legacyVibe: 'pulse_vibe',
  authToken: 'syncnest_auth_token',
  authUser: 'syncnest_auth_user'
};

let accountMode = 'signup';
let authToken = '';
let authUser = null;
let authBusy = false;

function readStorage(primaryKey, legacyKey = '') {
  return localStorage.getItem(primaryKey) ?? (legacyKey ? localStorage.getItem(legacyKey) : null);
}

function writeStorage(primaryKey, value, legacyKey = '') {
  localStorage.setItem(primaryKey, value);
  if (legacyKey) localStorage.setItem(legacyKey, value);
}

function removeStorage(primaryKey, legacyKey = '') {
  localStorage.removeItem(primaryKey);
  if (legacyKey) localStorage.removeItem(legacyKey);
}

function parseStoredUser() {
  try {
    const raw = localStorage.getItem(STORAGE.authUser);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

function saveAuthSession(token, user) {
  authToken = String(token || '').trim();
  authUser = user && typeof user === 'object' ? user : null;

  if (authToken) {
    localStorage.setItem(STORAGE.authToken, authToken);
  } else {
    localStorage.removeItem(STORAGE.authToken);
  }

  if (authUser) {
    localStorage.setItem(STORAGE.authUser, JSON.stringify(authUser));
  } else {
    localStorage.removeItem(STORAGE.authUser);
  }
}

function setAccountMessage(text, type = '') {
  if (!accountMessage) return;
  accountMessage.textContent = String(text || '').trim();
  accountMessage.classList.remove('error', 'success');
  if (type) accountMessage.classList.add(type);
}

function setAuthBusy(nextBusy) {
  authBusy = Boolean(nextBusy);
  const disabled = authBusy;

  [
    accountSignupTab,
    accountLoginTab,
    accountLogoutBtn,
    createRoomBtn,
    joinRoomBtn,
    signupUsernameInput,
    signupEmailInput,
    signupPasswordInput,
    signupDisplayNameInput,
    loginIdentifierInput,
    loginPasswordInput
  ].forEach((el) => {
    if (!el) return;
    el.disabled = disabled;
  });

  const signupSubmitBtn = document.getElementById('signupSubmitBtn');
  const loginSubmitBtn = document.getElementById('loginSubmitBtn');
  if (signupSubmitBtn) signupSubmitBtn.disabled = disabled;
  if (loginSubmitBtn) loginSubmitBtn.disabled = disabled;
}

function setAccountMode(mode) {
  accountMode = mode === 'login' ? 'login' : 'signup';
  accountSignupTab?.classList.toggle('active', accountMode === 'signup');
  accountLoginTab?.classList.toggle('active', accountMode === 'login');
  accountSignupForm?.classList.toggle('hidden', accountMode !== 'signup');
  accountLoginForm?.classList.toggle('hidden', accountMode !== 'login');
}

function applyUserToNameInputs() {
  const name = String(authUser?.displayName || '').trim();
  if (!name) return;
  if (createNameInput && !String(createNameInput.value || '').trim()) createNameInput.value = name;
  if (joinNameInput && !String(joinNameInput.value || '').trim()) joinNameInput.value = name;
  if (signupDisplayNameInput && !String(signupDisplayNameInput.value || '').trim()) signupDisplayNameInput.value = name;
  writeStorage(STORAGE.name, name, STORAGE.legacyName);
}

function renderAccountUI() {
  const loggedIn = Boolean(authToken && authUser);
  accountGuestPanel?.classList.toggle('hidden', loggedIn);
  accountUserPanel?.classList.toggle('hidden', !loggedIn);

  if (!loggedIn) {
    if (accountStatusPill) accountStatusPill.textContent = 'Guest Mode';
    if (accountStatusText) {
      accountStatusText.textContent = 'Optional account login to save your profile and preferences.';
    }
    return;
  }

  if (accountStatusPill) accountStatusPill.textContent = 'Signed In';
  if (accountStatusText) {
    accountStatusText.textContent = 'Your SyncNest profile is active. Preferences will be saved to your account.';
  }
  if (accountUserName) accountUserName.textContent = authUser.displayName || authUser.username || 'SyncNest User';
  if (accountUserMeta) {
    const email = String(authUser.email || '').trim();
    const handle = String(authUser.username || '').trim();
    accountUserMeta.textContent = email || handle || '';
  }
  applyUserToNameInputs();
}

async function callApi(path, options = {}) {
  const method = String(options.method || 'GET').toUpperCase();
  const headers = {
    ...(options.headers || {})
  };
  let body;

  if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(options.body);
  }

  if (options.auth !== false && authToken) {
    headers.Authorization = `Bearer ${authToken}`;
  }

  const response = await fetch(path, {
    method,
    headers,
    body,
    keepalive: Boolean(options.keepalive)
  });

  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok || !payload?.ok) {
    const errorMessage = payload?.error || `Request failed (${response.status}).`;
    throw new Error(errorMessage);
  }

  return payload;
}

async function syncAccountPreferences(patch, options = {}) {
  if (!authToken) return null;
  const cleanPatch = patch && typeof patch === 'object' ? patch : {};
  try {
    const payload = await callApi('/api/user/preferences', {
      method: 'PUT',
      body: cleanPatch,
      keepalive: Boolean(options.keepalive)
    });
    if (payload?.user) {
      saveAuthSession(authToken, payload.user);
      renderAccountUI();
    }
    return payload;
  } catch {
    return null;
  }
}

async function hydrateAuthSession() {
  authToken = String(localStorage.getItem(STORAGE.authToken) || '').trim();
  authUser = parseStoredUser();
  renderAccountUI();

  if (!authToken) return;

  try {
    const payload = await callApi('/api/auth/me');
    if (payload?.user) {
      saveAuthSession(authToken, payload.user);
      renderAccountUI();
      applyUserToNameInputs();

      const prefVibe = String(payload.user?.preferences?.vibe || '').toLowerCase();
      if (prefVibe === 'cinema' || prefVibe === 'pookie') {
        applyVibeMode(prefVibe);
        writeStorage(STORAGE.vibe, prefVibe, STORAGE.legacyVibe);
      }
    }
  } catch {
    saveAuthSession('', null);
    renderAccountUI();
  }
}

function cleanRoomId(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '')
    .slice(0, 40);
}

function randomRoomId() {
  const words = ['binge', 'night', 'match', 'stream', 'party', 'sync', 'crew', 'watch'];
  const pick = () => words[Math.floor(Math.random() * words.length)];
  return `${pick()}-${pick()}-${Math.floor(Math.random() * 900 + 100)}`;
}

function getDisplayName(isCreate) {
  const input = isCreate ? createNameInput : joinNameInput;
  const value = String(input?.value || '').trim().replace(/\s+/g, ' ').slice(0, 24);
  const accountName = String(authUser?.displayName || '').trim();
  const name = value || accountName || `Guest-${Math.floor(Math.random() * 900 + 100)}`;
  writeStorage(STORAGE.name, name, STORAGE.legacyName);
  void syncAccountPreferences({ displayName: name });
  return name;
}

function openRoom(roomId, isCreate) {
  const name = getDisplayName(isCreate);
  void syncAccountPreferences({
    displayName: name,
    lastRoomId: roomId
  }, { keepalive: true });
  window.location.assign(`/room/${encodeURIComponent(roomId)}?name=${encodeURIComponent(name)}`);
}

function setRoomTab(target) {
  const showCreate = target !== 'join';
  tabCreateBtn?.classList.toggle('active', showCreate);
  tabCreateBtn?.setAttribute('aria-selected', showCreate ? 'true' : 'false');
  tabJoinBtn?.classList.toggle('active', !showCreate);
  tabJoinBtn?.setAttribute('aria-selected', showCreate ? 'false' : 'true');
  createCard?.classList.toggle('hidden', !showCreate);
  joinCard?.classList.toggle('hidden', showCreate);
  if (showCreate) {
    createNameInput?.focus();
  } else {
    joinNameInput?.focus();
  }
}

async function handleSignupSubmit(event) {
  event.preventDefault();
  if (authBusy) return;

  const username = String(signupUsernameInput?.value || '').trim();
  const email = String(signupEmailInput?.value || '').trim();
  const password = String(signupPasswordInput?.value || '');
  const displayName = String(signupDisplayNameInput?.value || '').trim();

  if (!username || !email || !password) {
    setAccountMessage('Username, email, and password are required.', 'error');
    return;
  }

  try {
    setAuthBusy(true);
    setAccountMessage('Creating account...');
    const payload = await callApi('/api/auth/signup', {
      method: 'POST',
      auth: false,
      body: { username, email, password, displayName }
    });

    saveAuthSession(payload.token, payload.user);
    setAccountMessage('Account created and logged in.', 'success');
    renderAccountUI();
    applyUserToNameInputs();

    if (signupPasswordInput) signupPasswordInput.value = '';
    if (loginPasswordInput) loginPasswordInput.value = '';
  } catch (error) {
    setAccountMessage(String(error?.message || 'Could not create account.'), 'error');
  } finally {
    setAuthBusy(false);
  }
}

async function handleLoginSubmit(event) {
  event.preventDefault();
  if (authBusy) return;

  const identifier = String(loginIdentifierInput?.value || '').trim();
  const password = String(loginPasswordInput?.value || '');
  if (!identifier || !password) {
    setAccountMessage('Enter your email/username and password.', 'error');
    return;
  }

  try {
    setAuthBusy(true);
    setAccountMessage('Logging in...');
    const payload = await callApi('/api/auth/login', {
      method: 'POST',
      auth: false,
      body: { identifier, password }
    });

    saveAuthSession(payload.token, payload.user);
    setAccountMessage('Logged in successfully.', 'success');
    renderAccountUI();
    applyUserToNameInputs();

    if (loginPasswordInput) loginPasswordInput.value = '';
    if (signupPasswordInput) signupPasswordInput.value = '';
  } catch (error) {
    setAccountMessage(String(error?.message || 'Could not log in.'), 'error');
  } finally {
    setAuthBusy(false);
  }
}

async function handleLogout() {
  if (authBusy) return;
  try {
    setAuthBusy(true);
    if (authToken) {
      await callApi('/api/auth/logout', { method: 'POST' });
    }
  } catch {
    // no-op
  } finally {
    saveAuthSession('', null);
    renderAccountUI();
    setAuthBusy(false);
    setAccountMessage('Logged out.', 'success');
    setAccountMode('login');
  }
}

function applyVibeMode(nextMode) {
  const mode = nextMode === 'pookie' ? 'pookie' : 'cinema';
  document.body.classList.toggle('pookie-mode', mode === 'pookie');
}

// Pre-fill name from localStorage
const savedName = readStorage(STORAGE.name, STORAGE.legacyName);
if (savedName) {
  if (createNameInput) createNameInput.value = savedName;
  if (joinNameInput) joinNameInput.value = savedName;
}

// --- Vibe & Animations ---
let vibeMode = readStorage(STORAGE.vibe, STORAGE.legacyVibe) || 'cinema';
applyVibeMode(vibeMode);

vibeToggle?.addEventListener('click', () => {
  vibeMode = document.body.classList.contains('pookie-mode') ? 'cinema' : 'pookie';
  applyVibeMode(vibeMode);
  writeStorage(STORAGE.vibe, vibeMode, STORAGE.legacyVibe);
  void syncAccountPreferences({ vibe: vibeMode });
});

function createSparkle() {
  if (vibeMode !== 'pookie' || !sparkleContainer) return;
  const s = document.createElement('div');
  s.className = 'sparkle';
  const size = Math.random() * 4 + 2;
  s.style.width = `${size}px`;
  s.style.height = `${size}px`;
  s.style.left = `${Math.random() * 100}%`;
  s.style.top = `${Math.random() * 100}%`;
  s.style.animationDelay = `${Math.random() * 2}s`;
  sparkleContainer.appendChild(s);
  setTimeout(() => s.remove(), 3000);
}

function createFloater() {
  if (vibeMode !== 'pookie') return;
  const f = document.createElement('div');
  f.className = 'pookie-floater';
  const emojis = ['💖', '🎀', '🌸', '✨', '💝'];
  f.textContent = emojis[Math.floor(Math.random() * emojis.length)];
  f.style.left = `${Math.random() * 100}%`;
  f.style.fontSize = `${Math.random() * 1 + 1}rem`;
  document.body.appendChild(f);
  setTimeout(() => f.remove(), 10000);
}

// Events
setRoomTab('create');
setAccountMode('signup');
renderAccountUI();
void hydrateAuthSession();

accountSignupTab?.addEventListener('click', () => setAccountMode('signup'));
accountLoginTab?.addEventListener('click', () => setAccountMode('login'));
accountSignupForm?.addEventListener('submit', handleSignupSubmit);
accountLoginForm?.addEventListener('submit', handleLoginSubmit);
accountLogoutBtn?.addEventListener('click', handleLogout);

tabCreateBtn?.addEventListener('click', () => setRoomTab('create'));
tabJoinBtn?.addEventListener('click', () => setRoomTab('join'));

createRoomBtn?.addEventListener('click', () => openRoom(randomRoomId(), true));
joinRoomBtn?.addEventListener('click', () => {
  const roomId = cleanRoomId(joinRoomIdInput?.value);
  if (!roomId) {
    joinRoomIdInput?.focus();
    joinRoomIdInput?.classList.add('input-error');
    setTimeout(() => joinRoomIdInput?.classList.remove('input-error'), 700);
    return;
  }
  openRoom(roomId, false);
});

joinRoomIdInput?.addEventListener('keydown', e => {
  if (e.key === 'Enter') joinRoomBtn?.click();
});
createNameInput?.addEventListener('keydown', e => {
  if (e.key === 'Enter') createRoomBtn?.click();
});
joinNameInput?.addEventListener('keydown', e => {
  if (e.key === 'Enter') joinRoomBtn?.click();
});

setInterval(createSparkle, 300);
setInterval(createFloater, 2000);
