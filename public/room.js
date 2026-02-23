const roomId = decodeURIComponent((window.location.pathname.split("/room/")[1] || "").trim());
if (!roomId) {
  window.location.assign("/");
}

const STORAGE = {
  name: "syncnest_name",
  legacyName: "watchparty_name",
  vibe: "syncnest_vibe",
  legacyVibe: "pulse_vibe",
  authToken: "syncnest_auth_token",
  authUser: "syncnest_auth_user",
  localDateModeKey: `syncnest_date_mode_${roomId}`,
  legacyLocalDateModeKey: `pulseroom_date_mode_${roomId}`,
  localRoomModeKey: `syncnest_mode_${roomId}`,
  legacyLocalRoomModeKey: `pulseroom_mode_${roomId}`
};

function readStorage(primaryKey, legacyKey = "") {
  return localStorage.getItem(primaryKey) ?? (legacyKey ? localStorage.getItem(legacyKey) : null);
}

function writeStorage(primaryKey, value, legacyKey = "") {
  localStorage.setItem(primaryKey, value);
  if (legacyKey) localStorage.setItem(legacyKey, value);
}

function readLocalDateMode() {
  try {
    const raw = readStorage(STORAGE.localDateModeKey, STORAGE.legacyLocalDateModeKey);
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") {
      return null;
    }

    const notes = Array.isArray(parsed.notes) ? parsed.notes.slice(-24) : [];
    return {
      currentPrompt: String(parsed.currentPrompt || "").trim(),
      notes,
      myMood: String(parsed.myMood || "").trim()
    };
  } catch {
    return null;
  }
}

const params = new URLSearchParams(window.location.search);
const requestedMode = String(params.get("mode") || "").trim().toLowerCase();
function normalizeBackendUrl(value) {
  const trimmed = String(value || "").trim();
  if (!trimmed) {
    return "";
  }
  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed.replace(/\/+$/, "");
  }
  return `https://${trimmed}`.replace(/\/+$/, "");
}

const queryBackend = normalizeBackendUrl(params.get("backend"));
const configuredBackend = normalizeBackendUrl(window.PULSE_BACKEND_URL);
// Force local origin if on localhost to avoid production sync issues
const socketServerUrl = (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1")
  ? window.location.origin
  : (queryBackend || configuredBackend || window.location.origin);
const apiBaseUrl = socketServerUrl;

function resolveApiUrl(path) {
  const cleanPath = String(path || "").trim();
  if (!cleanPath) return apiBaseUrl;
  if (/^https?:\/\//i.test(cleanPath)) return cleanPath;
  const normalized = cleanPath.startsWith("/") ? cleanPath : `/${cleanPath}`;
  return `${apiBaseUrl}${normalized}`;
}

console.log("Connecting to Socket.io at:", socketServerUrl);
const socket = io(socketServerUrl, {
  transports: ["websocket", "polling"],
  reconnection: true
});
window.socket = socket; // Expose for debugging and cross-script access
const MIN_POMODORO_MINUTES = 5;
const MAX_POMODORO_MINUTES = 240;
const DEFAULT_WORK_DURATION = 25 * 60;

const fallbackName = readStorage(STORAGE.name, STORAGE.legacyName) || "";
const userName =
  (params.get("name") || fallbackName || "").trim().slice(0, 24) ||
  `Guest-${Math.floor(Math.random() * 900 + 100)}`;
writeStorage(STORAGE.name, userName, STORAGE.legacyName);
const localDateMode = readLocalDateMode();

const ui = {
  roomCode: document.getElementById("roomCode"),
  themeToggle: document.getElementById("themeToggle"),
  copyLinkBtn: document.getElementById("copyLinkBtn"),
  mediaLinkInput: document.getElementById("mediaLinkInput"),
  saveMediaLinkBtn: document.getElementById("saveMediaLinkBtn"),
  openMediaLinkBtn: document.getElementById("openMediaLinkBtn"),
  mediaLinkStatus: document.getElementById("mediaLinkStatus"),
  demoVideoInput: document.getElementById("demoVideoInput"),
  loadDemoVideoBtn: document.getElementById("loadDemoVideoBtn"),
  demoPlayer: document.getElementById("demoPlayer"),
  seekSlider: document.getElementById("seekSlider"),
  timelineValue: document.getElementById("timelineValue"),
  playSyncBtn: document.getElementById("playSyncBtn"),
  pauseSyncBtn: document.getElementById("pauseSyncBtn"),
  syncNowBtn: document.getElementById("syncNowBtn"),
  rateSelect: document.getElementById("rateSelect"),
  participantCount: document.getElementById("participantCount"),
  participantList: document.getElementById("participantList"),
  moodSelect: document.getElementById("moodSelect"),
  setMoodBtn: document.getElementById("setMoodBtn"),
  nextPromptBtn: document.getElementById("nextPromptBtn"),
  sendHeartBtn: document.getElementById("sendHeartBtn"),
  sendKissBtn: document.getElementById("sendKissBtn"),
  sendHugBtn: document.getElementById("sendHugBtn"),
  promptCard: document.getElementById("promptCard"),
  loveNoteForm: document.getElementById("loveNoteForm"),
  loveNoteInput: document.getElementById("loveNoteInput"),
  loveNotes: document.getElementById("loveNotes"),
  reactionRain: document.getElementById("reactionRain"),
  startCallBtn: document.getElementById("startCallBtn"),
  endCallBtn: document.getElementById("endCallBtn"),
  muteBtn: document.getElementById("muteBtn"),
  cameraBtn: document.getElementById("cameraBtn"),
  localVideo: document.getElementById("localVideo"),
  remoteVideos: document.getElementById("remoteVideos"),
  chatMessages: document.getElementById("chatMessages"),
  chatForm: document.getElementById("chatForm"),
  chatInput: document.getElementById("chatInput"),
  modeSetupOverlay: document.getElementById("modeSetupOverlay"),
  modeCards: document.querySelectorAll(".mode-overlay .mode-card"),
  roomShell: document.querySelector(".room-shell"),
  userCount: document.getElementById("userCount"),
  activeModeBadge: document.getElementById("activeModeBadge"),
  modeBadgeIcon: document.getElementById("modeBadgeIcon"),
  modeBadgeText: document.getElementById("modeBadgeText"),
  accountBadge: document.getElementById("accountBadge"),
  leaveRoomBtn: document.getElementById("leaveRoomBtn"),
  studyPanel: document.getElementById("studyPanel"),
  studyGoBreakBtn: document.getElementById("studyGoBreakBtn"),
  funPanel: document.getElementById("funPanel"),
  playyardPanel: document.getElementById("playyardPanel"),
  playyardBackToFunBtn: document.getElementById("playyardBackToFunBtn"),
  playyardWarpBtn: document.getElementById("playyardWarpBtn"),
  playyardBoostBtn: document.getElementById("playyardBoostBtn"),
  playyardBattleFullscreenBtn: document.getElementById("playyardBattleFullscreenBtn"),
  playyardStartRoundBtn: document.getElementById("playyardStartRoundBtn"),
  playyardClaimDropBtn: document.getElementById("playyardClaimDropBtn"),
  playyardGameButtons: document.querySelectorAll(".playyard-game-btn"),
  playyardRoundTitle: document.getElementById("playyardRoundTitle"),
  playyardRoundPrompt: document.getElementById("playyardRoundPrompt"),
  playyardRoundTarget: document.getElementById("playyardRoundTarget"),
  playyardMemoryOptions: document.getElementById("playyardMemoryOptions"),
  playyardDropCard: document.getElementById("playyardDropCard"),
  playyardDropText: document.getElementById("playyardDropText"),
  playyardRoundTimer: document.getElementById("playyardRoundTimer"),
  playyardMyStats: document.getElementById("playyardMyStats"),
  playyardPartnerStats: document.getElementById("playyardPartnerStats"),
  playyardUnlockList: document.getElementById("playyardUnlockList"),
  playyardMiniCall: document.getElementById("playyardMiniCall"),
  playyardMiniCallBody: document.getElementById("playyardMiniCallBody"),
  playyardCallToggleBtn: document.getElementById("playyardCallToggleBtn"),
  playyardCallCollapseBtn: document.getElementById("playyardCallCollapseBtn"),
  playyardLocalVideo: document.getElementById("playyardLocalVideo"),
  playyardPartnerVideo: document.getElementById("playyardPartnerVideo"),
  playyardPartnerVideoLabel: document.getElementById("playyardPartnerVideoLabel"),
  oasisMixAmbientBar: document.getElementById("oasisMixAmbientBar"),
  oasisMixAmbientValue: document.getElementById("oasisMixAmbientValue"),
  pomoTimer: document.getElementById("pomoTimer"),
  pomoLabel: document.getElementById("pomoLabel"),
  pomoPreset25Btn: document.getElementById("pomoPreset25Btn"),
  pomoPreset45Btn: document.getElementById("pomoPreset45Btn"),
  pomoCustomMinutesInput: document.getElementById("pomoCustomMinutesInput"),
  pomoCustomSetBtn: document.getElementById("pomoCustomSetBtn"),
  pomoStartBtn: document.getElementById("pomoStartBtn"),
  pomoPauseBtn: document.getElementById("pomoPauseBtn"),
  pomoResetBtn: document.getElementById("pomoResetBtn"),
  pomoResetBtn: document.getElementById("pomoResetBtn"),
  focusTaskForm: document.getElementById("focusTaskForm"),
  focusTaskInput: document.getElementById("focusTaskInput"),
  focusTaskDoneBtn: document.getElementById("focusTaskDoneBtn"),
  localVideoCard: document.getElementById("localVideoCard"),
  localTileFullscreenBtn: document.getElementById("localTileFullscreenBtn"),
  minimizeSelfBtn: document.getElementById("minimizeSelfBtn"),
  studyToolbar: document.getElementById("studyToolbar"),
  toggleMicBtn: document.getElementById("toggleMicBtn"),
  toggleCamBtn: document.getElementById("toggleCamBtn"),
  startStudyCallBtn: document.getElementById("startStudyCallBtn"),
  leaveStudyCallBtn: document.getElementById("leaveStudyCallBtn"),
  volRain: document.getElementById("volRain"),
  volRainVal: document.getElementById("volRainVal"),
  volCafe: document.getElementById("volCafe"),
  volCafeVal: document.getElementById("volCafeVal"),
  volNoise: document.getElementById("volNoise"),
  volNoiseVal: document.getElementById("volNoiseVal"),
  vibeOverlay: document.getElementById("vibeOverlay"),
  rainVibe: document.querySelector(".rain-vibe"),
  cafeVibe: document.querySelector(".cafe-vibe"),
  noiseVibe: document.querySelector(".noise-vibe"),
  focusVibe: document.querySelector(".focus-vibe"),
  sparkleContainer: document.getElementById("sparkleContainer"),
  vibeToggle: document.getElementById("vibeToggle"),
  wallOfDone: document.getElementById("wallOfDone"),
  statFocusTime: document.getElementById("statFocusTime"),
  statTasksDone: document.getElementById("statTasksDone"),
  chimeWork: document.getElementById("chimeWork"),
  chimeBreak: document.getElementById("chimeBreak"),
  breakPanel: document.getElementById("breakPanel"),
  breakTimerDisplay: document.getElementById("breakTimerDisplay"),
  breakStart5Btn: document.getElementById("breakStart5Btn"),
  breakStart10Btn: document.getElementById("breakStart10Btn"),
  breakMediaLinkInput: document.getElementById("breakMediaLinkInput"),
  breakPlayTogetherBtn: document.getElementById("breakPlayTogetherBtn"),
  breakMediaStage: document.getElementById("breakMediaStage"),
  breakAmbientScene: document.getElementById("breakAmbientScene"),
  breakMediaIframe: document.getElementById("breakMediaIframe"),
  breakPartnerVideoWrap: document.getElementById("breakPartnerVideoWrap"),
  breakPartnerVideo: document.getElementById("breakPartnerVideo"),
  breakPartnerVideoLabel: document.getElementById("breakPartnerVideoLabel"),
  breakPartnerMinimizeBtn: document.getElementById("breakPartnerMinimizeBtn"),
  breakSceneButtons: document.querySelectorAll(".break-scene-btn"),
  breakPartnerName: document.getElementById("breakPartnerName"),
  breakPartnerMood: document.getElementById("breakPartnerMood"),
  breakMaximizePartnerBtn: document.getElementById("breakMaximizePartnerBtn"),
  breakMoodSelect: document.getElementById("breakMoodSelect"),
  breakMoodSetBtn: document.getElementById("breakMoodSetBtn"),
  breakReactionButtons: document.querySelectorAll(".break-reaction-btn"),
  breakMemoriesList: document.getElementById("breakMemoriesList"),
  breakToolbarShareBtn: document.getElementById("breakToolbarShareBtn"),
  breakToolbarFullscreenBtn: document.getElementById("breakToolbarFullscreenBtn"),
  breakToolbarFullscreenVideoBtn: document.getElementById("breakToolbarFullscreenVideoBtn"),
  breakToolbarReactionsBtn: document.getElementById("breakToolbarReactionsBtn"),
  breakToolbarSceneBtn: document.getElementById("breakToolbarSceneBtn"),
  breakToolbarDrawingBtn: document.getElementById("breakToolbarDrawingBtn"),
  breakToolbarPromptBtn: document.getElementById("breakToolbarPromptBtn"),
  breakToolbarFullscreenVideoBtn: document.getElementById("breakToolbarFullscreenVideoBtn"),
  breakToolbarSaveMomentBtn: document.getElementById("breakToolbarSaveMomentBtn"),
  breakToolbarEndBtn: document.getElementById("breakToolbarEndBtn"),
  breakGoFunBtn: document.getElementById("breakGoFunBtn"),
  breakShowMomentsBtn: document.getElementById("breakShowMomentsBtn"),
  breakMomentsPanel: document.getElementById("breakMomentsPanel"),
  breakPromptPanel: document.getElementById("breakPromptPanel"),
  breakDrawingPanel: document.getElementById("breakDrawingPanel"),
  breakOverNotice: document.getElementById("breakOverNotice"),
  breathingGuide: document.getElementById("breathingGuide"),
  breathingText: document.getElementById("breathingText"),
  burstContainer: document.getElementById("burstContainer"),
  btnToggleWellness: document.getElementById("btnToggleWellness"),
  helpBtn: document.getElementById("helpBtn"),
  helpOverlay: document.getElementById("helpOverlay"),
  ourSongCard: document.getElementById("ourSongCard"),
  ourSongInput: document.getElementById("ourSongInput"),
  ourSongTitle: document.getElementById("ourSongTitle"),
  ourSongSaveBtn: document.getElementById("ourSongSaveBtn"),
  ourSongPlayBtn: document.getElementById("ourSongPlayBtn"),
  sharedMascotCards: document.querySelectorAll("[data-shared-mascot]")
};
window.ui = ui; // Expose for debugging

let authToken = String(localStorage.getItem(STORAGE.authToken) || "").trim();
let accountUser = (() => {
  try {
    const raw = localStorage.getItem(STORAGE.authUser);
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
})();

function updateAccountBadge() {
  if (!ui.accountBadge) return;
  const label = String(accountUser?.displayName || accountUser?.username || "").trim();
  if (!authToken || !label) {
    ui.accountBadge.textContent = "";
    ui.accountBadge.classList.add("hidden");
    return;
  }
  ui.accountBadge.textContent = `👤 ${label}`;
  ui.accountBadge.classList.remove("hidden");
}

async function accountApi(path, { method = "GET", body, keepalive = false } = {}) {
  if (!authToken) return null;
  const headers = {
    Authorization: `Bearer ${authToken}`
  };
  const init = {
    method,
    headers,
    keepalive
  };
  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    init.body = JSON.stringify(body);
  }
  const canFallbackToLocalAuth = Boolean(
    window.SyncNestLocalAuth
    && typeof window.SyncNestLocalAuth.shouldHandle === "function"
    && window.SyncNestLocalAuth.shouldHandle(path)
  );

  let response = null;
  try {
    response = await fetch(resolveApiUrl(path), init);
  } catch (error) {
    if (canFallbackToLocalAuth) {
      return window.SyncNestLocalAuth.handle(path, { method, headers, body });
    }
    throw error;
  }
  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }
  if ((!response.ok || !payload?.ok) && canFallbackToLocalAuth && response.status === 404) {
    return window.SyncNestLocalAuth.handle(path, { method, headers, body });
  }
  if (!response.ok || !payload?.ok) {
    throw new Error(payload?.error || `Request failed (${response.status}).`);
  }
  return payload;
}

async function hydrateAccountUser() {
  if (!authToken) {
    accountUser = null;
    updateAccountBadge();
    return;
  }
  try {
    const payload = await accountApi("/api/auth/me");
    accountUser = payload?.user || null;
  } catch {
    authToken = "";
    accountUser = null;
    localStorage.removeItem(STORAGE.authToken);
    localStorage.removeItem(STORAGE.authUser);
  }
  updateAccountBadge();
}

async function syncAccountPreferences(patch, options = {}) {
  if (!authToken) return;
  const cleanPatch = patch && typeof patch === "object" ? patch : {};
  try {
    const payload = await accountApi("/api/user/preferences", {
      method: "PUT",
      body: cleanPatch,
      keepalive: Boolean(options.keepalive)
    });
    accountUser = payload?.user || accountUser;
    if (accountUser) {
      localStorage.setItem(STORAGE.authUser, JSON.stringify(accountUser));
    }
    updateAccountBadge();
  } catch {
    // Silent fail to avoid interrupting room flows.
  }
}

updateAccountBadge();
void hydrateAccountUser();

let studyState = {
  mode: "none",
  pomodoro: { state: "idle", startTime: null, duration: 25 * 60, pausedTime: 0 },
  stats: { focusMinutes: 0, tasksDone: 0 }
};
window.studyState = studyState; // For debugging

let pomoInterval = null;
const mixerTracks = {
  rain: new Audio("https://upload.wikimedia.org/wikipedia/commons/1/15/Sound_of_light_rainfall.ogg"),
  cafe: new Audio("https://upload.wikimedia.org/wikipedia/commons/e/ea/Cafe_ambiance.ogg"),
  noise: new Audio("https://upload.wikimedia.org/wikipedia/commons/a/aa/White_noise.ogg")
};
Object.values(mixerTracks).forEach(a => {
  a.loop = true;
  a.volume = 0;
});

function clampPomodoroDuration(seconds, fallbackSeconds = DEFAULT_WORK_DURATION) {
  const parsed = Number(seconds);
  const fallback = Number.isFinite(Number(fallbackSeconds)) ? Number(fallbackSeconds) : DEFAULT_WORK_DURATION;
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.max(MIN_POMODORO_MINUTES * 60, Math.min(MAX_POMODORO_MINUTES * 60, Math.round(parsed)));
}

function getPomodoroMinutes() {
  const duration = clampPomodoroDuration(studyState.pomodoro?.duration, DEFAULT_WORK_DURATION);
  return Math.max(1, Math.round(duration / 60));
}

function setPomodoroControlsDisabled(disabled) {
  if (ui.pomoPreset25Btn) ui.pomoPreset25Btn.disabled = disabled;
  if (ui.pomoPreset45Btn) ui.pomoPreset45Btn.disabled = disabled;
  if (ui.pomoCustomMinutesInput) ui.pomoCustomMinutesInput.disabled = disabled;
  if (ui.pomoCustomSetBtn) ui.pomoCustomSetBtn.disabled = disabled;
}

function renderPomodoroPresetState() {
  const minutes = getPomodoroMinutes();

  if (ui.pomoPreset25Btn) {
    ui.pomoPreset25Btn.classList.toggle("active", minutes === 25);
  }
  if (ui.pomoPreset45Btn) {
    ui.pomoPreset45Btn.classList.toggle("active", minutes === 45);
  }

  if (ui.pomoCustomMinutesInput && document.activeElement !== ui.pomoCustomMinutesInput) {
    ui.pomoCustomMinutesInput.value = String(minutes);
  }
}

function setPomodoroDuration(minutes, notifyServer = true) {
  const numericMinutes = Number(minutes);
  if (!Number.isFinite(numericMinutes)) {
    return;
  }

  const duration = clampPomodoroDuration(numericMinutes * 60, studyState.pomodoro?.duration || DEFAULT_WORK_DURATION);
  studyState.pomodoro.duration = duration;
  renderPomodoroPresetState();
  updatePomoUI();

  if (notifyServer) {
    socket.emit("study-pomodoro-action", { action: "set-duration", duration });
  }
}

function applyCustomPomodoroDuration() {
  if (!ui.pomoCustomMinutesInput) {
    return;
  }

  const minutes = Number(ui.pomoCustomMinutesInput.value);
  if (!Number.isFinite(minutes)) {
    addSystemMessage(`Enter a custom timer between ${MIN_POMODORO_MINUTES} and ${MAX_POMODORO_MINUTES} minutes.`);
    return;
  }

  setPomodoroDuration(minutes, true);
}


function buildRoomParams(extra = {}) {
  const roomParams = new URLSearchParams();
  if (params.get("name")) {
    roomParams.set("name", params.get("name"));
  } else if (userName) {
    roomParams.set("name", userName);
  }
  if (queryBackend) {
    roomParams.set("backend", queryBackend);
  }

  Object.entries(extra).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      roomParams.set(key, String(value));
    }
  });

  return roomParams.toString();
}


const rtcConfig = {
  iceServers: [{ urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] }]
};

const state = {
  meId: "",
  mediaLink: "",
  participants: new Map(),
  peers: new Map(),
  remoteStreams: new Map(),
  timeline: {
    playing: false,
    currentTime: 0,
    playbackRate: 1,
    updatedAt: Date.now()
  },
  dateNight: {
    currentPrompt: localDateMode?.currentPrompt || "Tap \"New question card\" and go deep.",
    notes: localDateMode?.notes || []
  },
  breakRoom: {
    duration: 10 * 60,
    endsAt: null,
    scene: "rain",
    mediaLink: ""
  },
  mascot: {
    playSeconds: 0,
    wins: 0,
    xp: 0,
    level: 1,
    stage: "sprout",
    stageLabel: "Sprout",
    face: "o_o",
    vibe: "Play together to evolve your mascot.",
    nextStageXp: 120
  },
  callActive: false,
  callBooting: false,
  muted: false,
  cameraOff: false,
  localStream: null,
  syncingPlayer: false,
  autoplayWarningShown: false
};
let playyardMiniCallCollapsed = false;

if (ui.roomCode) ui.roomCode.textContent = roomId;
if (ui.moodSelect && localDateMode?.myMood) {
  ui.moodSelect.value = localDateMode.myMood;
  if (ui.breakMoodSelect) {
    ui.breakMoodSelect.value = localDateMode.myMood;
  }
}
renderDateNight();

// --- Vibe & Animations ---
let vibeMode = readStorage(STORAGE.vibe, STORAGE.legacyVibe) || 'cinema';
if (vibeMode === 'pookie') document.body.classList.add('pookie-mode');

ui.vibeToggle?.addEventListener('click', () => {
  document.body.classList.toggle('pookie-mode');
  vibeMode = document.body.classList.contains('pookie-mode') ? 'pookie' : 'cinema';
  writeStorage(STORAGE.vibe, vibeMode, STORAGE.legacyVibe);
  void syncAccountPreferences({ vibe: vibeMode, lastRoomId: roomId, lastMode: studyState.mode }, { keepalive: true });
});

function createSparkle() {
  if (vibeMode !== 'pookie' || !ui.sparkleContainer) return;
  const s = document.createElement('div');
  s.className = 'sparkle';
  const size = Math.random() * 4 + 2;
  s.style.width = `${size}px`;
  s.style.height = `${size}px`;
  s.style.left = `${Math.random() * 100}%`;
  s.style.top = `${Math.random() * 100}%`;
  s.style.animationDelay = `${Math.random() * 2}s`;
  ui.sparkleContainer.appendChild(s);
  setTimeout(() => s.remove(), 3000);
}

function createFloater() {
  if (vibeMode !== 'pookie') return;
  const f = document.createElement('div');
  f.className = 'pookie-floater';
  const emojis = ['💖', '🎀', '🌸', '✨', '💝', '🧸', '🍭'];
  f.textContent = emojis[Math.floor(Math.random() * emojis.length)];
  f.style.left = `${Math.random() * 100}%`;
  const size = Math.random() * 1 + 1.2;
  f.style.fontSize = `${size}rem`;
  f.style.animationDuration = `${Math.random() * 5 + 8}s`;
  document.body.appendChild(f);
  setTimeout(() => f.remove(), 12000);
}

setInterval(createSparkle, 300);
setInterval(createFloater, 2000);

renderDateNight();

// Mode Setup Logic
if (ui.modeCards) {
  ui.modeCards.forEach(card => {
    card.addEventListener("click", () => {
      const mode = card.dataset.mode;
      writeStorage(STORAGE.localRoomModeKey, mode, STORAGE.legacyLocalRoomModeKey);
      activateMode(mode);
    });
  });
}

function activateMode(mode) {
  console.log("Activating mode:", mode);
  writeStorage(STORAGE.localRoomModeKey, mode, STORAGE.legacyLocalRoomModeKey);
  socket.emit("set-room-mode", { mode });
  applyRoomMode(mode);
  void syncAccountPreferences({ lastMode: String(mode || ""), lastRoomId: roomId }, { keepalive: true });

  // Fade out overlay
  if (ui.modeSetupOverlay) {
    ui.modeSetupOverlay.classList.add("hidden");
  }
  if (ui.roomShell) {
    ui.roomShell.classList.remove("blurred");
  }

  addSystemMessage(`Room mode set to: ${mode.toUpperCase()}`);
}

const syncNestAppApi = {
  setMode: activateMode
};
window.SyncNest = syncNestAppApi;
window.PulseRoom = syncNestAppApi;

// Help Guide Logic
ui.helpBtn?.addEventListener("click", () => {
  ui.helpOverlay?.classList.toggle("hidden");
});

// Check if mode already set
const savedMode = readStorage(STORAGE.localRoomModeKey, STORAGE.legacyLocalRoomModeKey);
if (savedMode) {
  window.addEventListener("DOMContentLoaded", () => {
    activateMode(savedMode);
  });
}

function normalizeLink(value) {
  const trimmed = String(value || "").trim();
  if (!trimmed) {
    return "";
  }
  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }
  return `https://${trimmed}`;
}

function getDomainLabel(urlValue) {
  try {
    const parsed = new URL(urlValue);
    return parsed.hostname.replace(/^www\./, "");
  } catch {
    return urlValue;
  }
}

function renderMediaStatus() {
  if (!ui.mediaLinkStatus) return;
  if (!state.mediaLink) {
    ui.mediaLinkStatus.textContent = "No shared link yet.";
    if (ui.openMediaLinkBtn) ui.openMediaLinkBtn.disabled = true;
    return;
  }
  ui.mediaLinkStatus.textContent = `Shared: ${getDomainLabel(state.mediaLink)}`;
  if (ui.openMediaLinkBtn) ui.openMediaLinkBtn.disabled = false;
}

function formatClock(totalSeconds) {
  const safeSeconds = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const seconds = safeSeconds % 60;

  if (hours > 0) {
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(
      2,
      "0"
    )}`;
  }
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function formatPomoClock(totalSeconds) {
  const safeSeconds = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(safeSeconds / 60);
  const seconds = safeSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function updateLocalStats() {
  if (ui.statFocusTime) ui.statFocusTime.textContent = `${studyState.stats.focusMinutes}m`;
  if (ui.statTasksDone) ui.statTasksDone.textContent = `${studyState.stats.tasksDone}`;
}

function playChime(type) {
  const chime = type === "work" ? ui.chimeWork : ui.chimeBreak;
  if (chime) {
    chime.currentTime = 0;
    chime.play().catch(e => console.warn("Chime blocked:", e));
  }
}

function applyRoomMode(mode) {
  console.log("Applying room mode:", mode);
  studyState.mode = mode;
  if (!ui.studyPanel) return;

  const modeData = {
    study: { icon: "📚", label: "Study Room" },
    break: { icon: "☕", label: "Break Room" },
    fun: { icon: "🎮", label: "Fun Room" },
    playyard: { icon: "🧩", label: "Mini Playyard" }
  };

  if (ui.activeModeBadge) {
    if (modeData[mode]) {
      ui.activeModeBadge.classList.remove("hidden");
      ui.modeBadgeIcon.textContent = modeData[mode].icon;
      ui.modeBadgeText.textContent = modeData[mode].label;
    } else {
      ui.activeModeBadge.classList.add("hidden");
    }
  }

  if (mode === "study") {
    ui.studyPanel.classList.remove("hidden");
    ui.breakPanel?.classList.add("hidden");
    ui.funPanel?.classList.add("hidden");
    ui.playyardPanel?.classList.add("hidden");
    ui.roomShell.classList.add("study-layout");
    ui.studyToolbar?.classList.remove("hidden");
    document.body.classList.remove("break-layout");
    document.body.classList.remove("playyard-room-active");
    stopPlayyardTicker();
    playyardRuntime.chaosArena?.setPaused(true);
    unmountChaosArenaTarget();
    relaxMode?.leave();
    funMode?.leave();
  } else if (mode === "break") {
    ui.studyPanel.classList.add("hidden");
    ui.breakPanel?.classList.remove("hidden");
    ui.funPanel?.classList.add("hidden");
    ui.playyardPanel?.classList.add("hidden");
    ui.roomShell.classList.remove("study-layout");
    ui.studyToolbar?.classList.remove("hidden");
    document.body.classList.remove("minimalist");
    document.body.classList.add("break-layout");
    document.body.classList.remove("playyard-room-active");
    stopPlayyardTicker();
    playyardRuntime.chaosArena?.setPaused(true);
    unmountChaosArenaTarget();
    relaxMode?.enter();
    funMode?.leave();
  } else if (mode === "fun") {
    ui.studyPanel?.classList.add("hidden");
    ui.breakPanel?.classList.add("hidden");
    ui.funPanel?.classList.remove("hidden");
    ui.playyardPanel?.classList.add("hidden");
    ui.roomShell.classList.remove("study-layout");
    ui.studyToolbar?.classList.remove("hidden");
    document.body.classList.remove("minimalist");
    document.body.classList.remove("playyard-room-active");
    stopPlayyardTicker();
    playyardRuntime.chaosArena?.setPaused(true);
    unmountChaosArenaTarget();
    relaxMode?.leave();
    funMode?.enter();
    socket.emit("mascot:request-state");
  } else if (mode === "playyard") {
    ui.studyPanel?.classList.add("hidden");
    ui.breakPanel?.classList.add("hidden");
    ui.funPanel?.classList.add("hidden");
    ui.playyardPanel?.classList.remove("hidden");
    ui.roomShell.classList.remove("study-layout");
    ui.studyToolbar?.classList.add("hidden");
    document.body.classList.remove("minimalist");
    document.body.classList.remove("break-layout");
    document.body.classList.add("playyard-room-active");
    socket.emit("playyard:request-state");
    socket.emit("chaos-arena:request-state");
    socket.emit("mascot:request-state");
    startPlayyardTicker();
    playyardRuntime.chaosArena?.setPaused(false);
    if (playyardRuntime.selectedGame === "chaos-arena" && !playyardRuntime.state.round) {
      mountChaosArenaTarget();
    }
    relaxMode?.leave();
    funMode?.leave();
  } else {
    ui.studyPanel?.classList.add("hidden");
    ui.breakPanel?.classList.add("hidden");
    ui.funPanel?.classList.add("hidden");
    ui.playyardPanel?.classList.add("hidden");
    ui.roomShell.classList.remove("study-layout");
    ui.studyToolbar?.classList.add("hidden");
    document.body.classList.remove("minimalist");
    document.body.classList.remove("playyard-room-active");
    stopPlayyardTicker();
    playyardRuntime.chaosArena?.setPaused(true);
    unmountChaosArenaTarget();
    relaxMode?.leave();
    funMode?.leave();
  }
  if (mode !== "playyard") {
    const playyardTarget = getPlayyardFullscreenTarget();
    if (playyardTarget && document.fullscreenElement === playyardTarget) {
      document.exitFullscreen().catch(() => { });
    }
  }
  syncPlayyardMiniCallUI();
  refreshPlayyardBattleFullscreenButton();
}

function updatePomoUI() {
  const p = studyState.pomodoro;
  console.log("Updating Pomo UI:", p);
  clearInterval(pomoInterval);

  if (!ui.pomoTimer) return;
  p.duration = clampPomodoroDuration(p.duration, DEFAULT_WORK_DURATION);
  renderPomodoroPresetState();

  if (p.state === "idle") {
    ui.pomoTimer.textContent = formatPomoClock(p.duration);
    ui.pomoLabel.textContent = `Ready to Focus? (${getPomodoroMinutes()} min)`;
    ui.pomoStartBtn.textContent = `Start ${getPomodoroMinutes()}m`;
    ui.pomoStartBtn.classList.remove("hidden");
    ui.pomoPauseBtn.classList.add("hidden");
    setPomodoroControlsDisabled(false);
    document.body.classList.remove("minimalist");
  } else {
    ui.pomoStartBtn.textContent = "Start Work";
    ui.pomoStartBtn.classList.add("hidden");
    ui.pomoPauseBtn.classList.remove("hidden");
    ui.pomoLabel.textContent = p.state === "work" ? "Deep Focus" : "Short Break";
    setPomodoroControlsDisabled(true);

    if (p.state === "work") {
      document.body.classList.add("minimalist");
      if (ui.focusVibe) ui.focusVibe.style.opacity = "1";
      ui.localVideoCard?.classList.add("focusing");
    } else {
      document.body.classList.remove("minimalist");
      if (ui.focusVibe) ui.focusVibe.style.opacity = "0";
      ui.localVideoCard?.classList.remove("focusing");
    }

    let lastSeconds = -1;
    pomoInterval = setInterval(() => {
      let secondsLeft = p.duration - p.pausedTime;
      if (p.startTime) {
        secondsLeft -= (Date.now() - p.startTime) / 1000;
      }

      const currentSec = Math.floor(secondsLeft);
      if (lastSeconds !== -1 && lastSeconds !== currentSec && p.state === "work" && p.startTime) {
        // Increment focus minutes roughly
        if (currentSec % 60 === 0) {
          studyState.stats.focusMinutes++;
          updateLocalStats();
        }
      }
      lastSeconds = currentSec;

      if (secondsLeft <= 0) {
        clearInterval(pomoInterval);
        ui.pomoTimer.textContent = "00:00";
        if (p.state === "work") {
          playChime("work");
          addSystemMessage("Deep work session complete! Take a break? 🎉");
        } else if (p.state === "break") {
          playChime("break");
          addSystemMessage("Break's over! Ready to focus again? 📚");
        }
        return;
      }

      ui.pomoTimer.textContent = formatPomoClock(secondsLeft);
    }, 1000);

    ui.pomoPauseBtn.textContent = p.startTime ? "Pause" : "Resume";
  }
}


function setMixUI(value, barEl, labelEl) {
  const numeric = Math.max(0, Math.min(100, Number(value) || 0));
  if (barEl) barEl.style.width = `${numeric}%`;
  if (labelEl) labelEl.textContent = `${numeric}%`;
}

function getPrimaryPartnerParticipant() {
  return Array.from(state.participants.values()).find((participant) => participant.id !== state.meId) || null;
}

function getOasisFocusText() {
  const me = state.participants.get(state.meId);
  const partner = getPrimaryPartnerParticipant();
  const ownTask = String(me?.focusTask || "").trim();
  const partnerTask = String(partner?.focusTask || "").trim();

  if (partnerTask) {
    return `${partner?.name || "Partner"}: ${partnerTask}`;
  }
  if (ownTask) {
    return `You: ${ownTask}`;
  }
  return "Ready to focus together.";
}

function getCurrentPomodoroSeconds() {
  const p = studyState.pomodoro;
  if (!p || p.state === "idle") {
    return clampPomodoroDuration(p?.duration, DEFAULT_WORK_DURATION);
  }

  let secondsLeft = p.duration - p.pausedTime;
  if (p.startTime) {
    secondsLeft -= (Date.now() - p.startTime) / 1000;
  }
  return Math.max(0, secondsLeft);
}

function updateOasisStageUI() { }

let relaxMode = null;
if (window.RelaxMode && ui.breakPanel) {
  relaxMode = new window.RelaxMode({
    ui,
    socket,
    getPartner: getPrimaryPartnerParticipant,
    launchReaction,
    copyInviteLink: copyInviteLinkToClipboard
  });
}

let funMode = null;
if (window.FunMode && ui.funPanel) {
  funMode = new window.FunMode({
    socket,
    roomId,
    setMode: activateMode,
    addSystemMessage
  });
}

const playyardRuntime = {
  selectedGame: "chaos-arena",
  state: { players: [], round: null, history: [] },
  ticker: null,
  dodgeVisual: null,
  chaosArena: null
};

const playyardGameMeta = {
  "chaos-arena": { title: "Chaos Arena", prompt: "Arrow keys move, Space dashes. Press M for maps and N for modes." }
};
const mascotStageLabels = {
  sprout: "Sprout",
  buddy: "Buddy",
  star: "Star",
  mythic: "Mythic"
};

function sanitizeMascotStage(value) {
  const clean = String(value || "").trim().toLowerCase();
  return mascotStageLabels[clean] ? clean : "sprout";
}

function normalizeMascotPayload(payload) {
  const stage = sanitizeMascotStage(payload?.stage);
  const wins = Math.max(0, Number(payload?.wins) || 0);
  const playSeconds = Math.max(0, Number(payload?.playSeconds) || 0);
  const xp = Math.max(0, Number(payload?.xp) || 0);
  const level = Math.max(1, Number(payload?.level) || 1);
  const nextStageXp = Number.isFinite(Number(payload?.nextStageXp)) ? Number(payload.nextStageXp) : null;
  return {
    stage,
    stageLabel: String(payload?.stageLabel || mascotStageLabels[stage]),
    face: String(payload?.face || "o_o").slice(0, 12),
    vibe: String(payload?.vibe || "Play together to evolve your mascot."),
    wins,
    playSeconds,
    xp,
    level,
    nextStageXp
  };
}

function formatMascotPlaytime(seconds, compact = false) {
  const safe = Math.max(0, Math.round(Number(seconds) || 0));
  const totalMinutes = Math.max(0, Math.floor(safe / 60));
  if (compact) return `${totalMinutes}m`;
  if (totalMinutes >= 60) {
    const hours = Math.floor(totalMinutes / 60);
    const mins = totalMinutes % 60;
    return `${hours}h ${mins}m`;
  }
  return `${totalMinutes}m`;
}

function clampRange(value, min, max) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return min;
  return Math.max(min, Math.min(max, numeric));
}

function renderMascotState(payload) {
  state.mascot = normalizeMascotPayload(payload || state.mascot);
  const mascot = state.mascot;
  const cards = Array.from(ui.sharedMascotCards || []);
  if (cards.length === 0) return;

  cards.forEach((card) => {
    const compact = card.classList.contains("compact");
    const stage = card.querySelector("[data-mascot-stage]");
    const avatar = card.querySelector("[data-mascot-avatar]");
    const face = card.querySelector("[data-mascot-face]");
    const note = card.querySelector("[data-mascot-note]");
    const play = card.querySelector("[data-mascot-play]");
    const wins = card.querySelector("[data-mascot-wins]");
    const level = card.querySelector("[data-mascot-level]");

    if (stage) stage.textContent = mascot.stageLabel;
    if (avatar) avatar.className = `shared-mascot-avatar stage-${mascot.stage}`;
    if (face) face.textContent = mascot.face;

    if (note) {
      if (Number.isFinite(mascot.nextStageXp) && mascot.nextStageXp !== null && mascot.nextStageXp > mascot.xp) {
        const remaining = Math.max(0, mascot.nextStageXp - mascot.xp);
        note.textContent = `${mascot.vibe} ${remaining} XP to next evolve.`;
      } else {
        note.textContent = `${mascot.vibe} Max evolution reached.`;
      }
    }
    if (play) play.textContent = compact ? formatMascotPlaytime(mascot.playSeconds, true) : `${formatMascotPlaytime(mascot.playSeconds)} playtime`;
    if (wins) wins.textContent = `${mascot.wins} wins`;
    if (level) level.textContent = `L${mascot.level} • ${mascot.xp} XP`;
  });
}

function getPlayyardShell() {
  return ui.playyardPanel?.querySelector(".playyard-full-shell") || null;
}

function getPlayyardFullscreenTarget() {
  return getPlayyardShell();
}

function isSheepPushBattleActive() {
  return Boolean(getPlayyardShell()?.classList.contains("spb-active"));
}

function shouldShowPlayyardBattleFullscreenBtn() {
  if (studyState.mode !== "playyard") return false;
  return playyardRuntime.selectedGame === "chaos-arena" || isSheepPushBattleActive();
}

async function togglePlayyardBattleFullscreen() {
  const target = getPlayyardFullscreenTarget();
  if (!target || typeof target.requestFullscreen !== "function") return;
  const isCurrent = document.fullscreenElement === target;
  try {
    if (isCurrent && document.fullscreenElement) {
      await document.exitFullscreen();
    } else {
      if (document.fullscreenElement && document.fullscreenElement !== target) {
        await document.exitFullscreen();
      }
      await target.requestFullscreen();
    }
  } catch {
    // ignore browser fullscreen restrictions
  }
  refreshPlayyardBattleFullscreenButton();
}

async function ensurePlayyardBattleFullscreen() {
  const target = getPlayyardFullscreenTarget();
  if (!target || typeof target.requestFullscreen !== "function") return;
  if (document.fullscreenElement === target) return;
  try {
    if (document.fullscreenElement && document.fullscreenElement !== target) {
      await document.exitFullscreen();
    }
    await target.requestFullscreen();
  } catch {
    // ignore browser fullscreen restrictions
  }
  refreshPlayyardBattleFullscreenButton();
}

function refreshPlayyardBattleFullscreenButton() {
  const btn = ui.playyardBattleFullscreenBtn;
  if (!btn) return;
  const shouldShow = shouldShowPlayyardBattleFullscreenBtn();
  const target = getPlayyardFullscreenTarget();
  const active = Boolean(target && document.fullscreenElement === target);

  btn.classList.toggle("hidden", !shouldShow);
  btn.disabled = !shouldShow;
  btn.classList.toggle("active", active);
  btn.textContent = active ? "✕ Exit Fullscreen" : "⛶ Fullscreen";
  btn.setAttribute("aria-label", active ? "Exit fullscreen playyard" : "Fullscreen playyard");
}

function triggerPlayyardWarp() {
  const shell = getPlayyardShell();
  if (!shell) return;
  shell.classList.remove("warp-active");
  void shell.offsetWidth;
  shell.classList.add("warp-active");
  window.setTimeout(() => shell.classList.remove("warp-active"), 1800);
}

function getPlayyardPlayerById(id) {
  return (playyardRuntime.state.players || []).find((entry) => entry.id === id) || null;
}

function getPlayyardMe() {
  return getPlayyardPlayerById(state.meId);
}

function getPlayyardPartner() {
  return (playyardRuntime.state.players || []).find((entry) => entry.id !== state.meId) || null;
}

function formatPlayyardStats(player) {
  if (!player) return "Level 1 • 0 XP • 0 wins";
  return `Level ${Number(player.level) || 1} • ${Number(player.xp) || 0} XP • ${Number(player.wins) || 0} wins`;
}

function formatPlayyardUnlocks(player) {
  const unlocks = Array.isArray(player?.unlocked) ? player.unlocked : [];
  if (unlocks.length === 0) return "No unlocks yet.";
  return unlocks.map((id) => String(id || "").replace(/-/g, " ")).join(" • ");
}

function setPlayyardSelectedGame(gameId) {
  const previous = playyardRuntime.selectedGame;
  const next = String(gameId || "").trim();
  if (!playyardGameMeta[next]) return;
  playyardRuntime.selectedGame = next;
  if (previous === "chaos-arena" && next !== "chaos-arena") {
    unmountChaosArenaTarget();
  }
  ui.playyardGameButtons?.forEach((btn) => {
    btn.classList.toggle("active", String(btn.dataset.playyardGame || "") === next);
  });

  const activeRound = playyardRuntime.state.round;
  if (activeRound) return;
  if (ui.playyardRoundTitle) ui.playyardRoundTitle.textContent = playyardGameMeta[next].title;
  if (ui.playyardRoundPrompt) ui.playyardRoundPrompt.textContent = playyardGameMeta[next].prompt;
  if (next === "chaos-arena") {
    mountChaosArenaTarget();
  }
  refreshPlayyardBattleFullscreenButton();
}

function getPlayyardControlRole(round) {
  const leftId = String(round?.coop?.controls?.left || "");
  const rightId = String(round?.coop?.controls?.right || "");
  const meId = String(state.meId || "");
  if (!meId) return "spectator";
  if (leftId && rightId && leftId === meId && rightId === meId) return "both";
  if (leftId === meId) return "left";
  if (rightId === meId) return "right";
  return "spectator";
}

function destroyPlayyardDodgeVisual() {
  const visual = playyardRuntime.dodgeVisual;
  if (!visual) return;
  visual.obstacleExitTimers?.forEach((timerId) => clearTimeout(timerId));
  visual.obstacleExitTimers?.clear?.();
  visual.obstacles?.forEach((node) => node.remove());
  visual.obstacles?.clear?.();
  if (visual.root?.isConnected) {
    visual.root.remove();
  }
  playyardRuntime.dodgeVisual = null;
}

function ensureChaosArenaInstance() {
  if (playyardRuntime.chaosArena || !window.ChaosArena) return playyardRuntime.chaosArena;
  playyardRuntime.chaosArena = new window.ChaosArena({
    socket,
    roomId,
    getSelfId: () => state.meId,
    getPlayerName: (id) => state.participants.get(String(id || ""))?.name || "Guest",
    onEvent: (message) => {
      const text = String(message || "").trim();
      if (text) addSystemMessage(text);
    }
  });
  return playyardRuntime.chaosArena;
}

function mountChaosArenaTarget() {
  if (!ui.playyardRoundTarget) return;
  const chaosArena = ensureChaosArenaInstance();
  if (!chaosArena) return;
  ui.playyardRoundTarget.classList.add("active", "chaos-arena-active");
  ui.playyardRoundTarget.classList.remove("dodge-together-active");
  chaosArena.setPaused(studyState.mode !== "playyard");
  chaosArena.mount(ui.playyardRoundTarget);
}

function unmountChaosArenaTarget() {
  if (ui.playyardRoundTarget) {
    ui.playyardRoundTarget.classList.remove("chaos-arena-active");
  }
  playyardRuntime.chaosArena?.unmount();
}

function destroyChaosArenaRuntime() {
  if (!playyardRuntime.chaosArena) return;
  playyardRuntime.chaosArena.destroy();
  playyardRuntime.chaosArena = null;
}

function ensurePlayyardDodgeVisual() {
  if (!ui.playyardRoundTarget) return null;
  const existing = playyardRuntime.dodgeVisual;
  if (existing?.root?.isConnected) return existing;

  ui.playyardRoundTarget.innerHTML = "";
  const root = document.createElement("div");
  root.className = "playyard-dodge-stage";

  const info = document.createElement("div");
  info.className = "playyard-target-label";
  root.appendChild(info);

  const arena = document.createElement("div");
  arena.className = "playyard-dodge-arena";
  root.appendChild(arena);

  const ship = document.createElement("div");
  ship.className = "playyard-dodge-ship";
  ship.innerHTML = `<span>SYNC</span>`;
  arena.appendChild(ship);

  const score = document.createElement("div");
  score.className = "playyard-dodge-score";
  root.appendChild(score);

  ui.playyardRoundTarget.appendChild(root);
  const visual = {
    root,
    info,
    arena,
    ship,
    score,
    obstacles: new Map(),
    obstacleExitTimers: new Map(),
    lastX: null
  };
  playyardRuntime.dodgeVisual = visual;
  return visual;
}

function renderPlayyardDodgeTogetherTarget(round) {
  const coop = round?.coop || null;
  if (!coop || !ui.playyardRoundTarget) return;
  ui.playyardRoundTarget.classList.add("active", "dodge-together-active");

  const leftName = state.participants.get(String(coop.controls?.left || ""))?.name || "Left pilot";
  const rightName = state.participants.get(String(coop.controls?.right || ""))?.name || "Right pilot";
  const role = getPlayyardControlRole(round);
  const roleText = role === "left"
    ? "You steer LEFT"
    : role === "right"
      ? "You steer RIGHT"
      : role === "both"
        ? "Solo mode: Primary = Left, Secondary = Right"
        : "Spectator view";
  const visual = ensurePlayyardDodgeVisual();
  if (!visual) return;

  visual.info.textContent = `Left: ${leftName} • Right: ${rightName} • ${roleText}`;

  const x = clampRange(coop.x, 0.08, 0.92) * 100;
  const y = clampRange(coop.y, 0.75, 0.95) * 100;
  const previousX = Number.isFinite(visual.lastX) ? visual.lastX : x;
  const bank = clampRange((x - previousX) * 0.8, -14, 14);
  visual.lastX = x;

  visual.ship.style.left = `${x}%`;
  visual.ship.style.top = `${y}%`;
  visual.ship.style.setProperty("--ship-bank", `${bank}deg`);

  const obstacles = Array.isArray(coop.obstacles) ? coop.obstacles : [];
  const activeIds = new Set();
  obstacles.forEach((obstacle) => {
    const id = String(obstacle.id || "");
    if (!id) return;
    activeIds.add(id);
    let node = visual.obstacles.get(id);
    if (!node) {
      node = document.createElement("span");
      node.className = "playyard-dodge-obstacle obstacle-enter";
      visual.arena.appendChild(node);
      visual.obstacles.set(id, node);
      requestAnimationFrame(() => node.classList.remove("obstacle-enter"));
    }
    const exitTimer = visual.obstacleExitTimers.get(id);
    if (exitTimer) {
      clearTimeout(exitTimer);
      visual.obstacleExitTimers.delete(id);
    }
    const sizePct = clampRange(Number(obstacle.size || 0.1) * 100, 6, 16);
    node.style.left = `${clampRange(obstacle.x, 0.05, 0.95) * 100}%`;
    node.style.top = `${clampRange(obstacle.y, -0.25, 1.25) * 100}%`;
    node.style.width = `${sizePct}%`;
    node.style.height = `${sizePct * 1.2}%`;
    node.style.transform = `translate3d(-50%, -50%, 0) rotate(${Number(obstacle.spin || 0)}deg)`;
  });

  visual.obstacles.forEach((node, id) => {
    if (activeIds.has(id)) return;
    if (visual.obstacleExitTimers.has(id)) return;
    node.classList.add("obstacle-exit");
    const timerId = setTimeout(() => {
      node.remove();
      visual.obstacles.delete(id);
      visual.obstacleExitTimers.delete(id);
    }, 220);
    visual.obstacleExitTimers.set(id, timerId);
  });

  visual.score.textContent = `Team Score: ${Math.max(0, Math.floor(Number(coop.score) || 0))}`;
}

function renderPlayyardTarget(round) {
  if (!ui.playyardRoundTarget) return;
  const displayGame = round?.game || playyardRuntime.selectedGame;

  if (!round) {
    if (displayGame === "chaos-arena") {
      destroyPlayyardDodgeVisual();
      mountChaosArenaTarget();
      return;
    }
    unmountChaosArenaTarget();
    destroyPlayyardDodgeVisual();
    ui.playyardRoundTarget.innerHTML = "";
    ui.playyardRoundTarget.classList.remove("active", "dodge-together-active");
    return;
  }

  unmountChaosArenaTarget();
  if (round.game === "dodge-together") {
    renderPlayyardDodgeTogetherTarget(round);
    return;
  }

  destroyPlayyardDodgeVisual();
  ui.playyardRoundTarget.innerHTML = "";
  ui.playyardRoundTarget.classList.remove("active", "dodge-together-active");

  if (round.game !== "reaction-race") {
    return;
  }

  ui.playyardRoundTarget.classList.add("active");
  const target = String(round.target || "❤️");
  const info = document.createElement("div");
  info.className = "playyard-target-label";
  info.textContent = `Target: ${target}`;
  ui.playyardRoundTarget.appendChild(info);

  const choices = document.createElement("div");
  choices.className = "playyard-target-choices";
  ["❤️", "😂", "👍", "🤗"].forEach((emoji) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "playyard-target-btn";
    btn.textContent = emoji;
    btn.addEventListener("click", () => {
      socket.emit("playyard:action", { kind: "reaction-choice", value: emoji });
    });
    choices.appendChild(btn);
  });
  ui.playyardRoundTarget.appendChild(choices);
}

function renderPlayyardMemoryOptions(round) {
  if (!ui.playyardMemoryOptions) return;
  ui.playyardMemoryOptions.innerHTML = "";

  if (!round || round.game !== "memory-flash") {
    ui.playyardMemoryOptions.classList.add("hidden");
    return;
  }

  ui.playyardMemoryOptions.classList.remove("hidden");
  const meId = state.meId;
  const submitted = Boolean(round.submissions?.[meId]);
  const options = Array.isArray(round.options) ? round.options : [];
  options.forEach((option) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "playyard-memory-btn";
    btn.textContent = option;
    btn.disabled = submitted;
    btn.addEventListener("click", () => {
      socket.emit("playyard:action", { kind: "memory-choice", value: option });
    });
    ui.playyardMemoryOptions.appendChild(btn);
  });
}

function renderPlayyardScores(round) {
  const me = getPlayyardMe();
  const partner = getPlayyardPartner();
  const myScore = Number(round?.scores?.[state.meId]) || 0;
  const partnerScore = Number(round?.scores?.[partner?.id || ""]) || 0;
  if (ui.playyardMyStats) {
    ui.playyardMyStats.innerHTML = `<h4>${me?.name || "You"}</h4><p>${formatPlayyardStats(me)} • Round ${myScore}</p>`;
  }
  if (ui.playyardPartnerStats) {
    ui.playyardPartnerStats.innerHTML = partner
      ? `<h4>${partner.name}</h4><p>${formatPlayyardStats(partner)} • Round ${partnerScore}</p>`
      : "<h4>Partner</h4><p>Waiting for another player...</p>";
  }
}

function renderPlayyardDrop(round) {
  const drop = round?.drop || null;
  if (!ui.playyardDropCard || !ui.playyardDropText || !ui.playyardClaimDropBtn) return;
  if (!drop) {
    ui.playyardDropCard.classList.add("hidden");
    ui.playyardDropText.textContent = "No active drop yet.";
    ui.playyardClaimDropBtn.disabled = true;
    ui.playyardClaimDropBtn.dataset.dropId = "";
    return;
  }
  ui.playyardDropCard.classList.remove("hidden");
  ui.playyardDropText.textContent = `${drop.label} • expires soon`;
  const claimed = Boolean(drop.claimedBy);
  ui.playyardClaimDropBtn.disabled = claimed;
  ui.playyardClaimDropBtn.dataset.dropId = claimed ? "" : String(drop.id || "");
}

function renderPlayyardRoundTimer() {
  if (!ui.playyardRoundTimer) return;
  const round = playyardRuntime.state.round;
  if (!round) {
    if (playyardRuntime.selectedGame === "chaos-arena" && playyardRuntime.chaosArena) {
      ui.playyardRoundTimer.textContent = playyardRuntime.chaosArena.getStatusLine();
      return;
    }
    ui.playyardRoundTimer.textContent = "No active round";
    return;
  }
  const remaining = Math.max(0, Math.ceil((Number(round.endsAt) - Date.now()) / 1000));
  ui.playyardRoundTimer.textContent = `${remaining}s left`;
}

function stopPlayyardTicker() {
  if (!playyardRuntime.ticker) return;
  clearInterval(playyardRuntime.ticker);
  playyardRuntime.ticker = null;
}

function startPlayyardTicker() {
  stopPlayyardTicker();
  playyardRuntime.ticker = setInterval(() => {
    renderPlayyardRoundTimer();
  }, 250);
}

function renderPlayyardState(playyard) {
  playyardRuntime.state = playyard || { players: [], round: null, history: [] };
  const round = playyardRuntime.state.round || null;
  if (round && playyardGameMeta[round.game]) {
    setPlayyardSelectedGame(round.game);
  }

  const displayGame = round?.game || playyardRuntime.selectedGame;
  if (ui.playyardRoundTitle) {
    ui.playyardRoundTitle.textContent = playyardGameMeta[displayGame]?.title || "Mini Playyard";
  }
  if (ui.playyardRoundPrompt) {
    ui.playyardRoundPrompt.textContent = round?.prompt || playyardGameMeta[displayGame]?.prompt || "Start a round to begin.";
  }

  renderPlayyardScores(round);
  renderPlayyardTarget(round);
  renderPlayyardMemoryOptions(round);
  renderPlayyardDrop(round);
  renderPlayyardRoundTimer();

  const me = getPlayyardMe();
  if (ui.playyardUnlockList) {
    ui.playyardUnlockList.textContent = formatPlayyardUnlocks(me);
  }

  const chaosSelected = displayGame === "chaos-arena";
  const chaosActive = Boolean(chaosSelected && playyardRuntime.chaosArena?.isMatchActive?.());
  const activeRound = Boolean(round) || chaosActive;
  if (ui.playyardStartRoundBtn) {
    ui.playyardStartRoundBtn.disabled = activeRound;
    ui.playyardStartRoundBtn.textContent = activeRound
      ? (chaosSelected ? "🌪 Chaos Live" : "⏳ Round Live")
      : (chaosSelected ? "🚀 Start Chaos" : "🚀 Start Round");
  }
  if (ui.playyardWarpBtn && ui.playyardBoostBtn) {
    if (chaosSelected) {
      ui.playyardWarpBtn.disabled = true;
      ui.playyardBoostBtn.disabled = true;
      ui.playyardWarpBtn.textContent = "⌨ Arrow Keys";
      ui.playyardBoostBtn.textContent = "␣ Dash (3s CD)";
    } else if (!activeRound) {
      ui.playyardWarpBtn.disabled = true;
      ui.playyardBoostBtn.disabled = true;
      ui.playyardWarpBtn.textContent = "⚡ Primary Action";
      ui.playyardBoostBtn.textContent = "🏁 Secondary Action";
    } else if (round.game === "dodge-together") {
      const role = getPlayyardControlRole(round);
      if (role === "left") {
        ui.playyardWarpBtn.disabled = false;
        ui.playyardBoostBtn.disabled = false;
        ui.playyardWarpBtn.textContent = "⬅ Drift Left";
        ui.playyardBoostBtn.textContent = "⬅ Dash Left";
      } else if (role === "right") {
        ui.playyardWarpBtn.disabled = false;
        ui.playyardBoostBtn.disabled = false;
        ui.playyardWarpBtn.textContent = "➡ Drift Right";
        ui.playyardBoostBtn.textContent = "➡ Dash Right";
      } else if (role === "both") {
        ui.playyardWarpBtn.disabled = false;
        ui.playyardBoostBtn.disabled = false;
        ui.playyardWarpBtn.textContent = "⬅ Drift Left";
        ui.playyardBoostBtn.textContent = "➡ Drift Right";
      } else {
        ui.playyardWarpBtn.disabled = true;
        ui.playyardBoostBtn.disabled = true;
        ui.playyardWarpBtn.textContent = "👀 Spectator";
        ui.playyardBoostBtn.textContent = "👀 Spectator";
      }
    } else {
      ui.playyardWarpBtn.disabled = false;
      ui.playyardBoostBtn.disabled = false;
      ui.playyardWarpBtn.textContent = "⚡ Primary Action";
      ui.playyardBoostBtn.textContent = "🏁 Secondary Action";
    }
  }
  refreshPlayyardBattleFullscreenButton();
}

ui.playyardBackToFunBtn?.addEventListener("click", () => activateMode("fun"));
ui.studyGoBreakBtn?.addEventListener("click", () => activateMode("break"));
ui.breakGoFunBtn?.addEventListener("click", () => activateMode("fun"));
ui.playyardGameButtons?.forEach((btn) => {
  btn.addEventListener("click", () => setPlayyardSelectedGame(btn.dataset.playyardGame));
});
function showPlayyardInstructions(title, prompt, onStart) {
  const container = document.querySelector(".playyard-full-shell") || document.querySelector(".mini-playyard-stage");
  if (!container) {
    onStart();
    return;
  }

  const existing = container.querySelector(".game-instruction-panel");
  if (existing) existing.remove();

  const panelHtml = `
    <div class="game-instruction-panel game-fade-in" style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); z-index: 1000; width: 80%; max-width: 400px; text-align: center;">
      <h2>${title}</h2>
      <p>${prompt}</p>
      <button id="btnStartActualPlayyardRound" class="btn-start-game">Start Game</button>
    </div>
  `;
  container.insertAdjacentHTML("beforeend", panelHtml);

  const btn = document.getElementById("btnStartActualPlayyardRound");
  if (btn) {
    btn.addEventListener("click", () => {
      const panel = container.querySelector(".game-instruction-panel");
      if (panel) {
        panel.classList.remove("game-fade-in");
        panel.classList.add("game-fade-out");
        setTimeout(() => {
          panel.remove();
          onStart();
        }, 300);
      } else {
        onStart();
      }
    });
  }
}

ui.playyardStartRoundBtn?.addEventListener("click", () => {
  if (playyardRuntime.selectedGame === "chaos-arena") {
    void ensurePlayyardBattleFullscreen();
    ensureChaosArenaInstance()?.startMatch?.();
    return;
  }

  const meta = playyardGameMeta[playyardRuntime.selectedGame];
  if (!meta) {
    void ensurePlayyardBattleFullscreen();
    socket.emit("playyard:start-round", { game: playyardRuntime.selectedGame });
    return;
  }

  showPlayyardInstructions(meta.title, meta.prompt, () => {
    void ensurePlayyardBattleFullscreen();
    socket.emit("playyard:start-round", { game: playyardRuntime.selectedGame });
  });
});
ui.playyardWarpBtn?.addEventListener("click", () => {
  if (playyardRuntime.selectedGame === "chaos-arena") return;
  if (playyardRuntime.state.round?.game !== "dodge-together") {
    triggerPlayyardWarp();
  }
  socket.emit("playyard:action", { kind: "primary" });
});
ui.playyardBoostBtn?.addEventListener("click", () => {
  if (playyardRuntime.selectedGame === "chaos-arena") return;
  socket.emit("playyard:action", { kind: "secondary" });
});
ui.playyardBattleFullscreenBtn?.addEventListener("click", () => {
  togglePlayyardBattleFullscreen();
});
ui.playyardClaimDropBtn?.addEventListener("click", () => {
  const dropId = String(ui.playyardClaimDropBtn?.dataset?.dropId || "").trim();
  if (!dropId) return;
  socket.emit("playyard:claim-drop", { dropId });
});
ui.playyardCallToggleBtn?.addEventListener("click", async () => {
  if (state.callActive) {
    stopCall(true);
    return;
  }
  await startCall();
});
ui.playyardCallCollapseBtn?.addEventListener("click", () => {
  playyardMiniCallCollapsed = !playyardMiniCallCollapsed;
  syncPlayyardMiniCallUI();
});
setPlayyardSelectedGame(playyardRuntime.selectedGame);
renderPlayyardState(playyardRuntime.state);
renderMascotState(state.mascot);
syncPlayyardMiniCallUI();
refreshPlayyardBattleFullscreenButton();

window.addEventListener("playyard:sheep-battle-visibility", () => {
  refreshPlayyardBattleFullscreenButton();
});




function liveTimelineTime() {
  const { playing, currentTime, playbackRate, updatedAt } = state.timeline;
  if (!playing) {
    return currentTime;
  }
  const elapsed = (Date.now() - updatedAt) / 1000;
  return Math.max(0, currentTime + elapsed * playbackRate);
}

function renderTimeline() {
  const liveTime = liveTimelineTime();
  const player = ui.demoPlayer;
  if (!player) return;

  if (ui.seekSlider) {
    if (Number.isFinite(player.duration) && player.duration > 0) {
      ui.seekSlider.max = Math.ceil(player.duration).toString();
    } else {
      const dynamicMax = Math.max(7200, Math.ceil(liveTime + 180));
      ui.seekSlider.max = String(dynamicMax);
    }
    ui.seekSlider.value = String(Math.min(Number(ui.seekSlider.max), liveTime));
  }

  if (ui.timelineValue) {
    ui.timelineValue.textContent = formatClock(liveTime);
  }
}

function applyTimeline(timelinePayload) {
  state.timeline = {
    playing: Boolean(timelinePayload.playing),
    currentTime: Number(timelinePayload.currentTime) || 0,
    playbackRate: Number(timelinePayload.playbackRate) || 1,
    updatedAt: Number(timelinePayload.updatedAt) || Date.now()
  };

  if (!state.timeline.playing) {
    state.autoplayWarningShown = false;
  }

  if (ui.rateSelect) ui.rateSelect.value = String(state.timeline.playbackRate);
  renderTimeline();
  syncDemoPlayerToTimeline();
}

function renderParticipants() {
  if (ui.userCount) {
    ui.userCount.textContent = `${state.participants.size} online`;
  }
  if (ui.participantCount) ui.participantCount.textContent = String(state.participants.size);
  if (ui.participantList) {
    ui.participantList.innerHTML = "";

    const entries = Array.from(state.participants.values()).sort((a, b) => {
      if (a.id === state.meId) return -1;
      if (b.id === state.meId) return 1;
      return a.name.localeCompare(b.name);
    });

    for (const participant of entries) {
      const item = document.createElement("li");
      const baseClass = participant.id === state.meId ? "participant-pill participant-you" : "participant-pill";
      const isInactive = participant.visible === false;
      item.innerHTML = `
    < span class="${baseClass} ${isInactive ? "participant - inactive" : ""}" >
      <span class="status-dot ${participant.inCall ? " live" : ""}" ></span >
        <span>${participant.name}${participant.id === state.meId ? " (you)" : ""}</span>
          ${isInactive ? "<small class=\"status-tag\">Inactive</small>" : ""}
          ${isInactive && participant.id !== state.meId ? "<button class=\"nudge-btn\" title=\"Nudge to focus\">🔔 Nudge</button>" : ""}
          ${participant.mood ? `<small class="participant-mood">${participant.mood}</small>` : ""}
  <span class="focus-tag">${participant.focusTask ? "• " + participant.focusTask : ""}</span>
        </span >
    `;
      const nudgeBtn = item.querySelector(".nudge-btn");
      if (nudgeBtn) {
        nudgeBtn.onclick = (e) => {
          e.stopPropagation();
          socket.emit("send-focus-nudge", { toId: participant.id, message: "Your friends are still in the zone. Keep going!" });
          addSystemMessage(`Sent a nudge to ${participant.name}.`);
        };
      }
      ui.participantList.appendChild(item);

      // Also update remote video tile focus state
      const remoteTile = document.getElementById(`remote - ${participant.id} `);
      if (remoteTile) {
        // Note: we need a way to know if they are focusing. 
        // For now, let's assume if they have a focus task and it's active room mode.
        // Better: We could emit a focus status.
      }
    }
  }
  relaxMode?.renderPartnerCard();
  funMode?.setParticipants(Array.from(state.participants.values()), state.meId);
  syncPlayyardMiniCallUI();
}

function renderPromptCard() {
  if (!ui.promptCard) return;
  const prompt = String(state.dateNight.currentPrompt || "").trim();
  ui.promptCard.textContent = prompt || "Tap \"New question card\" and go deep.";
}

function renderLoveNotes() {
  if (!ui.loveNotes) return;
  ui.loveNotes.innerHTML = "";
  if (state.dateNight.notes.length === 0) {
    const empty = document.createElement("article");
    empty.className = "note-card note-empty";
    empty.textContent = "No notes yet. Leave the first one.";
    ui.loveNotes.appendChild(empty);
    return;
  }

  const notes = state.dateNight.notes.slice().sort((a, b) => a.createdAt - b.createdAt);
  for (const note of notes) {
    const card = document.createElement("article");
    card.className = "note-card";
    const sentAt = new Date(note.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    card.innerHTML = `< p class="note-meta" > ${note.senderName} · ${sentAt}</p > <p class="note-body"></p>`;
    card.querySelector(".note-body").textContent = note.text;
    ui.loveNotes.appendChild(card);
  }

  ui.loveNotes.scrollTop = ui.loveNotes.scrollHeight;
}

function renderDateNight() {
  renderPromptCard();
  renderLoveNotes();
  persistDateNightToLocal();
}

function launchReaction(emoji) {
  if (!ui.reactionRain) return;
  const pop = document.createElement("span");
  pop.className = "reaction-pop";
  pop.textContent = emoji;
  pop.style.left = `${10 + Math.random() * 80}% `;
  pop.style.animationDuration = `${900 + Math.random() * 700} ms`;
  ui.reactionRain.appendChild(pop);
  window.setTimeout(() => pop.remove(), 1900);
}

function persistDateNightToLocal() {
  try {
    const payload = {
      currentPrompt: state.dateNight.currentPrompt || "",
      notes: state.dateNight.notes.slice(-24),
      myMood: ui.moodSelect?.value || "",
      updatedAt: Date.now()
    };
    writeStorage(STORAGE.localDateModeKey, JSON.stringify(payload), STORAGE.legacyLocalDateModeKey);
  } catch {
    // Ignore localStorage write issues (private mode/quota).
  }
}

function addMessage({ senderName, text, mine = false, system = false, sentAt = Date.now() }) {
  const msg = document.createElement("div");
  msg.className = `chat - msg ${mine ? "msg-sent" : "msg-received"}${system ? " system-msg" : ""} `;

  const author = document.createElement("div");
  author.className = "msg-author";
  author.textContent = system ? "System" : senderName;

  const content = document.createElement("div");
  content.className = "msg-content";
  content.textContent = text;

  msg.appendChild(author);
  msg.appendChild(content);
  ui.chatMessages.appendChild(msg);
  ui.chatMessages.scrollTop = ui.chatMessages.scrollHeight;
}

function addSystemMessage(text) {
  addMessage({ senderName: "System", text, system: true });
}

async function copyInviteLinkToClipboard() {
  const inviteUrl = new URL(`/room/${encodeURIComponent(roomId)}`, window.location.origin);
  inviteUrl.searchParams.set("name", "");
  if (queryBackend) {
    inviteUrl.searchParams.set("backend", queryBackend);
  }
  try {
    await navigator.clipboard.writeText(inviteUrl.toString());
    addSystemMessage("Invite link copied.");
  } catch {
    addSystemMessage("Clipboard blocked. Copy the URL from your address bar.");
  }
}

function getPrimaryRemoteStreamEntry() {
  const preferred = Array.from(state.participants.values())
    .filter((participant) => participant.id !== state.meId)
    .map((participant) => participant.id);
  for (const peerId of preferred) {
    const stream = state.remoteStreams.get(peerId);
    if (stream) {
      return { peerId, stream };
    }
  }
  for (const [peerId, stream] of state.remoteStreams.entries()) {
    if (peerId !== state.meId && stream) {
      return { peerId, stream };
    }
  }
  return { peerId: "", stream: null };
}

function syncPlayyardMiniCallUI() {
  if (!ui.playyardMiniCall || !ui.playyardMiniCallBody || !ui.playyardCallToggleBtn || !ui.playyardCallCollapseBtn || !ui.playyardLocalVideo || !ui.playyardPartnerVideo || !ui.playyardPartnerVideoLabel) {
    return;
  }

  ui.playyardMiniCall.classList.toggle("live", state.callActive);
  ui.playyardMiniCallBody.classList.toggle("collapsed", playyardMiniCallCollapsed || !state.callActive);
  ui.playyardCallCollapseBtn.textContent = playyardMiniCallCollapsed ? "👁" : "🙈";
  ui.playyardCallCollapseBtn.title = playyardMiniCallCollapsed ? "Show mini popups" : "Hide mini popups";
  ui.playyardCallToggleBtn.textContent = state.callActive
    ? "📴 End Mini Call"
    : state.callBooting
      ? "⏳ Connecting..."
      : "📹 Start Mini Call";
  ui.playyardCallToggleBtn.classList.toggle("active", state.callActive);
  ui.playyardCallToggleBtn.disabled = state.callBooting;
  ui.playyardCallCollapseBtn.disabled = !state.callActive;

  if (state.callActive && state.localStream) {
    if (ui.playyardLocalVideo.srcObject !== state.localStream) {
      ui.playyardLocalVideo.srcObject = state.localStream;
    }
  } else {
    ui.playyardLocalVideo.srcObject = null;
  }

  const { peerId, stream } = getPrimaryRemoteStreamEntry();
  if (state.callActive && stream) {
    if (ui.playyardPartnerVideo.srcObject !== stream) {
      ui.playyardPartnerVideo.srcObject = stream;
    }
    const peerName = state.participants.get(peerId)?.name || "Partner";
    ui.playyardPartnerVideoLabel.textContent = peerName;
  } else {
    ui.playyardPartnerVideo.srcObject = null;
    ui.playyardPartnerVideoLabel.textContent = state.callActive ? "Connecting..." : "Partner";
  }
}

function updateCallButtons() {
  if (ui.startCallBtn) ui.startCallBtn.disabled = state.callActive;
  if (ui.endCallBtn) ui.endCallBtn.disabled = !state.callActive;

  const updateBtnState = (btn, iconClass, labelText, isActive) => {
    if (!btn) return;
    btn.disabled = !state.callActive;
    btn.classList.toggle(iconClass, isActive);
    const label = btn.querySelector(".p-label");
    if (label) label.textContent = labelText;
  };

  updateBtnState(ui.muteBtn, "muted", state.muted ? "Unmute" : "Mute", state.muted);
  updateBtnState(ui.toggleMicBtn, "muted", state.muted ? "Unmute" : "Mute", state.muted);

  updateBtnState(ui.cameraBtn, "camera-off", state.cameraOff ? "Cam On" : "Cam Off", state.cameraOff);
  updateBtnState(ui.toggleCamBtn, "camera-off", state.cameraOff ? "Cam On" : "Cam Off", state.cameraOff);

  if (ui.startStudyCallBtn) {
    ui.startStudyCallBtn.classList.toggle("hidden", state.callActive);
  }
  if (ui.leaveStudyCallBtn) {
    ui.leaveStudyCallBtn.classList.toggle("hidden", !state.callActive);
  }
  syncPlayyardMiniCallUI();
}

async function toggleVideoTileFullscreen(tile) {
  if (!tile) return;
  const video = tile.querySelector("video");
  const target = (video && typeof video.requestFullscreen === "function") ? video : tile;
  const isCurrent = document.fullscreenElement === target || document.fullscreenElement === tile;

  try {
    if (isCurrent && document.fullscreenElement) {
      await document.exitFullscreen();
    } else if (typeof target.requestFullscreen === "function") {
      await target.requestFullscreen();
    }
  } catch {
    // ignore browser fullscreen restrictions
  }
}

function refreshVideoTileFullscreenButtons() {
  const fullElement = document.fullscreenElement;
  document.querySelectorAll(".video-item .tile-fullscreen-btn").forEach((btn) => {
    const tile = btn.closest(".video-item");
    if (!tile) return;
    const video = tile.querySelector("video");
    const active = fullElement === tile || fullElement === video;
    btn.textContent = active ? "✕" : "⛶";
    btn.setAttribute("aria-label", active ? "Exit fullscreen video" : "Fullscreen video");
  });
}

function refreshFullscreenButtons() {
  refreshVideoTileFullscreenButtons();
  refreshPlayyardBattleFullscreenButton();
}

function ensurePeerConnection(peerId) {
  if (state.peers.has(peerId)) {
    return state.peers.get(peerId);
  }

  const connection = new RTCPeerConnection(rtcConfig);
  state.peers.set(peerId, connection);

  if (state.localStream) {
    for (const track of state.localStream.getTracks()) {
      connection.addTrack(track, state.localStream);
    }
  }

  connection.onicecandidate = (event) => {
    if (event.candidate) {
      socket.emit("webrtc-ice-candidate", { to: peerId, candidate: event.candidate });
    }
  };

  connection.ontrack = (event) => {
    const [remoteStream] = event.streams;
    if (remoteStream) {
      attachRemoteStream(peerId, remoteStream);
    }
  };

  connection.onconnectionstatechange = () => {
    if (["failed", "disconnected", "closed"].includes(connection.connectionState)) {
      removePeer(peerId);
    }
  };

  return connection;
}

function attachRemoteStream(peerId, stream) {
  state.remoteStreams.set(peerId, stream);
  const existing = document.getElementById(`remote - ${peerId} `);
  if (existing) {
    existing.querySelector("video").srcObject = stream;
    syncPlayyardMiniCallUI();
    return;
  }

  const tile = document.createElement("article");
  tile.className = "video-item remote-video";
  tile.id = `remote - ${peerId} `;
  const participantName = state.participants.get(peerId)?.name || "Participant";
  tile.innerHTML = `
    < video autoplay playsinline ></video >
    <div class="video-label">${participantName}</div>
    <button class="tile-fullscreen-btn" title="Fullscreen video">⛶</button>
    <button class="btn-icon pin-btn" title="Pin video">📌</button>
  `;
  tile.querySelector("video").srcObject = stream;
  tile.querySelector(".pin-btn").onclick = () => togglePin(peerId);
  ui.remoteVideos.appendChild(tile);
  refreshVideoTileFullscreenButtons();
  syncPlayyardMiniCallUI();
}

function togglePin(peerId) {
  const tile = document.getElementById(`remote - ${peerId} `);
  if (!tile) return;

  const isPinned = tile.classList.contains("pinned");

  // Unpin everyone first
  document.querySelectorAll(".video-item").forEach(card => card.classList.remove("pinned"));

  if (!isPinned) {
    tile.classList.add("pinned");
  }
}

function removePeer(peerId) {
  const connection = state.peers.get(peerId);
  if (connection) {
    connection.onicecandidate = null;
    connection.ontrack = null;
    connection.close();
  }
  state.peers.delete(peerId);
  state.remoteStreams.delete(peerId);
  const tile = document.getElementById(`remote - ${peerId} `);
  if (tile) {
    tile.remove();
  }
  syncPlayyardMiniCallUI();
}

async function maybeCreateOffer(peerId) {
  if (!state.callActive || !state.localStream) {
    return;
  }

  if (state.meId.localeCompare(peerId) >= 0) {
    return;
  }

  const connection = ensurePeerConnection(peerId);
  if (connection.signalingState !== "stable") {
    return;
  }

  const offer = await connection.createOffer();
  await connection.setLocalDescription(offer);
  socket.emit("webrtc-offer", { to: peerId, offer: connection.localDescription });
}

async function startCall() {
  if (state.callActive || state.callBooting) {
    return;
  }

  state.callBooting = true;
  updateCallButtons();

  const mediaAttempts = [
    { audio: true, video: { width: { ideal: 1280 }, height: { ideal: 720 } } },
    { audio: true, video: true },
    { audio: true, video: false }
  ];

  try {
    let localStream = null;
    let lastError = null;
    for (const constraints of mediaAttempts) {
      try {
        // Try a few media profiles so Mini Call works on more devices/browsers.
        localStream = await navigator.mediaDevices.getUserMedia(constraints);
        break;
      } catch (error) {
        lastError = error;
      }
    }

    if (!localStream) {
      throw lastError || new Error("No media stream available");
    }

    state.localStream = localStream;
    state.callActive = true;
    state.callBooting = false;
    state.muted = false;
    state.cameraOff = false;
    ui.localVideo.srcObject = localStream;
    updateCallButtons();

    const me = state.participants.get(state.meId);
    if (me) {
      me.inCall = true;
      renderParticipants();
    }

    socket.emit("call-started");

    const livePeers = Array.from(state.participants.values())
      .filter((participant) => participant.id !== state.meId && participant.inCall)
      .map((participant) => participant.id);

    for (const peerId of livePeers) {
      await maybeCreateOffer(peerId);
    }

    addSystemMessage("Call connected.");
  } catch (error) {
    state.callBooting = false;
    updateCallButtons();
    addSystemMessage("Could not access camera/mic. Check browser permissions.");
    // eslint-disable-next-line no-console
    console.error(error);
  }
}

function applyMuteStateToLocalMedia() {
  if (!state.localStream) return;
  const enabled = !state.muted;
  for (const track of state.localStream.getAudioTracks()) {
    track.enabled = enabled;
  }
  for (const connection of state.peers.values()) {
    for (const sender of connection.getSenders()) {
      if (sender.track && sender.track.kind === "audio") {
        sender.track.enabled = enabled;
      }
    }
  }
}

function stopCall(notifyServer = true) {
  if (notifyServer) {
    socket.emit("call-stopped");
  }

  const me = state.participants.get(state.meId);
  if (me) {
    me.inCall = false;
    renderParticipants();
  }

  for (const peerId of state.peers.keys()) {
    removePeer(peerId);
  }
  state.remoteStreams.clear();

  if (state.localStream) {
    for (const track of state.localStream.getTracks()) {
      track.stop();
    }
  }

  state.localStream = null;
  state.callActive = false;
  state.callBooting = false;
  state.muted = false;
  state.cameraOff = false;
  ui.localVideo.srcObject = null;
  updateCallButtons();
}

function emitTimelineAction(action, timeOverride) {
  const playerTime = Number(ui.demoPlayer.currentTime);
  const sliderTime = Number(ui.seekSlider.value);
  const fallback = liveTimelineTime();
  const time = Number.isFinite(timeOverride)
    ? timeOverride
    : Number.isFinite(playerTime) && ui.demoPlayer.src
      ? playerTime
      : Number.isFinite(sliderTime)
        ? sliderTime
        : fallback;

  const payload = {
    action,
    time,
    playbackRate: Number(ui.rateSelect.value) || 1
  };

  socket.emit("timeline-action", payload);
}

function withPlayerSync(update) {
  state.syncingPlayer = true;
  update();
  window.setTimeout(() => {
    state.syncingPlayer = false;
  }, 120);
}

function syncDemoPlayerToTimeline() {
  const player = ui.demoPlayer;
  if (!player || !player.src) {
    return;
  }

  const targetTime = liveTimelineTime();
  if (Math.abs((player.currentTime || 0) - targetTime) > 1.2) {
    withPlayerSync(() => {
      player.currentTime = targetTime;
    });
  }

  if (Math.abs(player.playbackRate - state.timeline.playbackRate) > 0.01) {
    withPlayerSync(() => {
      player.playbackRate = state.timeline.playbackRate;
    });
  }

  if (state.timeline.playing && player.paused) {
    withPlayerSync(() => {
      player.play().catch(() => {
        if (!state.autoplayWarningShown) {
          addSystemMessage("Browser blocked autoplay. Press play once.");
          state.autoplayWarningShown = true;
        }
      });
    });
  } else if (!state.timeline.playing && !player.paused) {
    withPlayerSync(() => {
      player.pause();
    });
  }
}

let seenConnectEvent = false;
socket.on("connect", () => {
  if (seenConnectEvent) {
    addSystemMessage("Realtime connection restored.");
  }
  seenConnectEvent = true;
  if (studyState.mode === "playyard") {
    socket.emit("chaos-arena:request-state");
  }
});

socket.on("disconnect", () => {
  addSystemMessage("Realtime disconnected. Reconnecting...");
});

socket.on("connect_error", () => {
  addSystemMessage("Could not reach realtime backend. Check backend deployment/config.");
});

socket.emit("join-room", { roomId, name: userName }, (payload) => {
  if (!payload || payload.error) {
    window.alert(payload?.error || "Could not join room.");
    window.location.assign("/");
    return;
  }

  state.meId = payload.participantId;
  state.mediaLink = payload.mediaLink || "";
  if (ui.mediaLinkInput) ui.mediaLinkInput.value = state.mediaLink;
  renderMediaStatus();

  const serverPrompt = String(payload.dateNight?.currentPrompt || "").trim();
  if (serverPrompt) {
    state.dateNight.currentPrompt = serverPrompt;
  }
  if (Array.isArray(payload.dateNight?.notes) && payload.dateNight.notes.length > 0) {
    state.dateNight.notes = payload.dateNight.notes.slice(-24);
  }
  renderDateNight();

  state.participants.clear();
  for (const participant of payload.participants || []) {
    state.participants.set(participant.id, participant);
  }
  renderParticipants();
  const myMood = state.participants.get(state.meId)?.mood;
  if (ui.moodSelect && myMood) {
    ui.moodSelect.value = myMood;
    persistDateNightToLocal();
  }
  applyTimeline(payload.timeline || state.timeline);
  funMode?.syncWatchState?.({
    url: state.mediaLink,
    timeline: state.timeline
  });

  addSystemMessage(`Joined as ${userName}.`);
  addSystemMessage(`Realtime server: ${new URL(socketServerUrl).hostname} `);
  addSystemMessage("Share your invite link to watch together.");
  void syncAccountPreferences({
    displayName: userName,
    lastRoomId: roomId,
    lastMode: payload.mode || studyState.mode || "study",
    vibe: vibeMode
  }, { keepalive: true });

  // Sync initial study state
  if (payload.mode) applyRoomMode(payload.mode);
  if (payload.study) {
    studyState.pomodoro = payload.study.pomodoro;
    updatePomoUI();
  }
  if (payload.break) {
    state.breakRoom = {
      duration: Number(payload.break.duration) || 10 * 60,
      endsAt: Number(payload.break.endsAt) || null,
      scene: String(payload.break.scene || "rain"),
      mediaLink: String(payload.break.mediaLink || "")
    };
    if (ui.breakMoodSelect && myMood) {
      ui.breakMoodSelect.value = myMood;
    }
    relaxMode?.syncBreakSession({
      endsAt: state.breakRoom.endsAt
    });
    relaxMode?.setScene(state.breakRoom.scene, false);
    relaxMode?.setMedia(state.breakRoom.mediaLink, false);
    if (Array.isArray(payload.break.memories)) {
      payload.break.memories.forEach((memory) => relaxMode?.addMemory(memory));
    }
    if (Array.isArray(payload.break.drawingEvents)) {
      payload.break.drawingEvents.forEach((stroke) => relaxMode?.drawingBoard.drawStroke(stroke));
    }
  }
  if (payload.fun) {
    funMode?.syncFromRoom(payload.fun);
  }
  if (payload.mascot) {
    renderMascotState(payload.mascot);
  }
  if (payload.playyard) {
    renderPlayyardState(payload.playyard);
  }

  if (["study", "break", "fun", "playyard"].includes(requestedMode) && studyState.mode !== requestedMode) {
    activateMode(requestedMode);
  }
});

socket.on("room-mode-updated", ({ mode }) => {
  applyRoomMode(mode);
});

socket.on("playyard:state", ({ playyard }) => {
  renderPlayyardState(playyard);
});

socket.on("mascot:state", ({ mascot }) => {
  renderMascotState(mascot);
});

socket.on("playyard:round-started", ({ game, startedBy }) => {
  const starter = state.participants.get(String(startedBy || ""))?.name || "A player";
  if (startedBy !== state.meId) {
    addSystemMessage(`${starter} started ${playyardGameMeta[game]?.title || "a Playyard round"}.`);
  } else {
    addSystemMessage("Round started.");
  }
});

socket.on("playyard:round-ended", ({ game, reason, teamCleared, teamScore, winnerId, winnerName, score, xpAwarded }) => {
  if (game === "dodge-together") {
    if (reason === "crash") {
      addSystemMessage(`Dodge Together crashed.Team score: ${Number(teamScore) || 0}.`);
    } else if (teamCleared) {
      addSystemMessage(`Dodge Together cleared.Team score: ${Number(teamScore) || 0}.`);
    } else {
      addSystemMessage("Dodge Together round ended.");
    }
  } else if (winnerId) {
    if (winnerId === state.meId) {
      addSystemMessage(`You won the round with ${Number(score) || 0} points.`);
    } else {
      addSystemMessage(`${winnerName || "Your partner"} won the round with ${Number(score) || 0} points.`);
    }
  } else {
    addSystemMessage("Round ended.");
  }

  const myAward = Array.isArray(xpAwarded) ? xpAwarded.find((entry) => entry.id === state.meId) : null;
  if (myAward) {
    const unlockCount = Array.isArray(myAward.newUnlocks) ? myAward.newUnlocks.length : 0;
    const unlockSuffix = unlockCount > 0 ? ` • ${unlockCount} new unlock${unlockCount > 1 ? "s" : ""} ` : "";
    addSystemMessage(`Mini Playyard: +${Number(myAward.gain) || 0} XP${unlockSuffix}.`);
  }
});

socket.on("playyard:drop-claimed", ({ type, by }) => {
  const who = by === state.meId ? "You" : (state.participants.get(String(by || ""))?.name || "Partner");
  addSystemMessage(`${who} claimed ${String(type || "a power-up")} drop.`);
});

socket.on("playyard:action-feedback", ({ blocked }) => {
  if (blocked === "frozen") {
    addSystemMessage("You are frozen for a moment.");
  } else if (blocked === "not-controller") {
    addSystemMessage("Only the assigned left/right pilot can steer in Dodge Together.");
  }
});

socket.on("chaos-arena:state", () => {
  if (playyardRuntime.selectedGame === "chaos-arena") {
    renderPlayyardRoundTimer();
    renderPlayyardState(playyardRuntime.state);
  }
});

socket.on("chaos-arena:started", () => {
  if (playyardRuntime.selectedGame === "chaos-arena") {
    renderPlayyardState(playyardRuntime.state);
  }
});

socket.on("chaos-arena:stopped", () => {
  if (playyardRuntime.selectedGame === "chaos-arena") {
    renderPlayyardState(playyardRuntime.state);
  }
});

socket.on("chaos-arena:winner", () => {
  if (playyardRuntime.selectedGame === "chaos-arena") {
    renderPlayyardState(playyardRuntime.state);
  }
});

socket.on("break-session-updated", ({ duration, endsAt }) => {
  state.breakRoom.duration = Number(duration) || state.breakRoom.duration;
  state.breakRoom.endsAt = Number(endsAt) || null;
  relaxMode?.syncBreakSession({ endsAt: state.breakRoom.endsAt });
});

socket.on("break-media-updated", ({ url }) => {
  state.breakRoom.mediaLink = String(url || "");
  relaxMode?.setMedia(state.breakRoom.mediaLink, false);
});

socket.on("break-scene-updated", ({ scene }) => {
  state.breakRoom.scene = String(scene || "rain");
  relaxMode?.setScene(state.breakRoom.scene, false);
});

socket.on("break-memory-added", (memory) => {
  relaxMode?.addMemory(memory);
});

socket.on("break-drawing-event", ({ stroke }) => {
  relaxMode?.drawingBoard.drawStroke(stroke);
});

socket.on("break-drawing-cleared", () => {
  relaxMode?.drawingBoard.clear(false);
});

socket.on("study-pomodoro-updated", (p) => {
  studyState.pomodoro = p;
  updatePomoUI();
});


socket.on("participant-focus-updated", ({ id, focusTask }) => {
  const p = state.participants.get(id);
  if (p) p.focusTask = focusTask;
  renderParticipants();
});

socket.on("participant-visibility-updated", ({ id, visible }) => {
  const p = state.participants.get(id);
  if (p) {
    p.visible = visible;
    renderParticipants();
  }
});

socket.on("participant-joined", (participant) => {
  state.participants.set(participant.id, participant);
  renderParticipants();
  addSystemMessage(`${participant.name} joined the room.`);
});

socket.on("participant-left", ({ id, name }) => {
  state.participants.delete(id);
  renderParticipants();
  removePeer(id);
  addSystemMessage(`${name || "A participant"} left.`);
});

socket.on("participant-call-status", async ({ id, inCall }) => {
  const participant = state.participants.get(id);
  if (!participant) {
    return;
  }
  participant.inCall = Boolean(inCall);
  renderParticipants();

  if (!inCall) {
    removePeer(id);
    return;
  }

  if (state.callActive && id !== state.meId) {
    await maybeCreateOffer(id);
  }
});

socket.on("participant-mood-updated", ({ id, mood }) => {
  const participant = state.participants.get(id);
  if (!participant) {
    return;
  }
  participant.mood = mood;
  if (id === state.meId) {
    if (ui.moodSelect) ui.moodSelect.value = mood;
    if (ui.breakMoodSelect) ui.breakMoodSelect.value = mood;
    persistDateNightToLocal();
  }
  renderParticipants();
  if (id !== state.meId) {
    addSystemMessage(`${participant.name} is now ${mood}.`);
  }
});

socket.on("date-prompt-updated", ({ prompt, updatedBy }) => {
  state.dateNight.currentPrompt = String(prompt || "").trim();
  renderPromptCard();
  if (updatedBy !== state.meId) {
    addSystemMessage("A new question card is ready.");
  }
});

socket.on("love-note-added", (note) => {
  state.dateNight.notes.push(note);
  if (state.dateNight.notes.length > 24) {
    state.dateNight.notes.shift();
  }
  renderLoveNotes();
  if (note.senderId !== state.meId) {
    addSystemMessage(`${note.senderName} left a love note.`);
  }
});

socket.on("quick-reaction", ({ emoji, fromId, fromName }) => {
  launchReaction(String(emoji || "💖"));
  if (fromId !== state.meId) {
    addSystemMessage(`${fromName} sent ${emoji} `);
  }
});

socket.on("media-link-updated", ({ url, updatedBy }) => {
  state.mediaLink = url || "";
  if (ui.mediaLinkInput) ui.mediaLinkInput.value = state.mediaLink;
  renderMediaStatus();
  funMode?.handleSharedMediaUpdate?.(state.mediaLink);
  if (updatedBy !== state.meId) {
    addSystemMessage("Shared stream link updated.");
  }
});

socket.on("timeline-updated", ({ timeline, updatedBy }) => {
  applyTimeline(timeline);
  funMode?.handleSharedTimelineUpdate?.(timeline);
  if (updatedBy !== state.meId) {
    renderTimeline();
  }
  // Also sync the YouTube player in Break Mode
  relaxMode?.applyTimelineToYT(timeline);
});

socket.on("chat-message", ({ senderId, senderName, text, sentAt }) => {
  addMessage({
    senderName,
    text,
    mine: senderId === state.meId,
    sentAt
  });
});

socket.on("webrtc-offer", async ({ from, offer }) => {
  if (!state.callActive || !state.localStream) {
    return;
  }

  try {
    const connection = ensurePeerConnection(from);
    const remoteDescription = new RTCSessionDescription(offer);

    if (connection.signalingState !== "stable") {
      await Promise.all([
        connection.setLocalDescription({ type: "rollback" }).catch(() => null),
        connection.setRemoteDescription(remoteDescription)
      ]);
    } else {
      await connection.setRemoteDescription(remoteDescription);
    }

    const answer = await connection.createAnswer();
    await connection.setLocalDescription(answer);
    socket.emit("webrtc-answer", { to: from, answer: connection.localDescription });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("Offer handling failed", error);
  }
});

socket.on("webrtc-answer", async ({ from, answer }) => {
  const connection = state.peers.get(from);
  if (!connection) {
    return;
  }
  try {
    await connection.setRemoteDescription(new RTCSessionDescription(answer));
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("Answer handling failed", error);
  }
});

socket.on("webrtc-ice-candidate", async ({ from, candidate }) => {
  if (!state.callActive || !state.localStream) {
    return;
  }
  try {
    const connection = ensurePeerConnection(from);
    await connection.addIceCandidate(new RTCIceCandidate(candidate));
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("ICE candidate handling failed", error);
  }
});

ui.copyLinkBtn.addEventListener("click", () => {
  copyInviteLinkToClipboard();
});

if (ui.moodSelect && ui.setMoodBtn) {
  ui.setMoodBtn.addEventListener("click", () => {
    const mood = String(ui.moodSelect.value || "").trim();
    if (!mood) {
      return;
    }
    persistDateNightToLocal();
    socket.emit("set-mood", { mood });
  });
}

if (ui.nextPromptBtn) {
  ui.nextPromptBtn.addEventListener("click", () => {
    socket.emit("date-prompt-next");
  });
}

function sendReaction(emoji) {
  socket.emit("quick-reaction", { emoji });
}

if (ui.sendHeartBtn) {
  ui.sendHeartBtn.addEventListener("click", () => {
    sendReaction("💖");
  });
}

if (ui.sendKissBtn) {
  ui.sendKissBtn.addEventListener("click", () => {
    sendReaction("😘");
  });
}

if (ui.sendHugBtn) {
  ui.sendHugBtn.addEventListener("click", () => {
    sendReaction("🤗");
  });
}

if (ui.loveNoteForm) {
  ui.loveNoteForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const text = String(ui.loveNoteInput?.value || "").trim();
    if (!text) {
      return;
    }
    socket.emit("love-note", { text });
    if (ui.loveNoteInput) ui.loveNoteInput.value = "";
  });
}

if (ui.saveMediaLinkBtn) {
  ui.saveMediaLinkBtn.addEventListener("click", () => {
    const normalized = normalizeLink(ui.mediaLinkInput?.value || "");
    state.mediaLink = normalized;
    if (ui.mediaLinkInput) ui.mediaLinkInput.value = normalized;
    renderMediaStatus();
    funMode?.handleSharedMediaUpdate?.(state.mediaLink);
    socket.emit("set-media-link", { url: normalized });
    addSystemMessage("Shared link saved.");
  });
}

if (ui.openMediaLinkBtn) {
  ui.openMediaLinkBtn.addEventListener("click", () => {
    if (!state.mediaLink) {
      return;
    }
    window.open(state.mediaLink, "_blank", "noopener,noreferrer");
  });
}

if (ui.loadDemoVideoBtn) {
  ui.loadDemoVideoBtn.addEventListener("click", () => {
    const normalized = normalizeLink(ui.demoVideoInput?.value || "");
    if (!normalized) {
      return;
    }
    if (ui.demoPlayer) {
      ui.demoPlayer.src = normalized;
      ui.demoPlayer.load();
      addSystemMessage("Demo video loaded. Timeline sync now controls this player.");
    }
  });
}

if (ui.playSyncBtn) {
  ui.playSyncBtn.addEventListener("click", () => {
    emitTimelineAction("play");
  });
}

if (ui.pauseSyncBtn) {
  ui.pauseSyncBtn.addEventListener("click", () => {
    emitTimelineAction("pause");
  });
}

if (ui.syncNowBtn) {
  ui.syncNowBtn.addEventListener("click", () => {
    emitTimelineAction("seek", liveTimelineTime());
  });
}

if (ui.seekSlider) {
  ui.seekSlider.addEventListener("change", () => {
    emitTimelineAction("seek", Number(ui.seekSlider.value));
  });
}

if (ui.rateSelect) {
  ui.rateSelect.addEventListener("change", () => {
    emitTimelineAction("rate");
  });
}

if (ui.startCallBtn) {
  ui.startCallBtn.addEventListener("click", async () => {
    await startCall();
  });
}

if (ui.endCallBtn) {
  ui.endCallBtn.addEventListener("click", () => {
    stopCall(true);
  });
}

// Oasis Floating Toolbar Logic
const handleMicToggle = () => {
  if (!state.localStream) return;
  state.muted = !state.muted;
  applyMuteStateToLocalMedia();
  updateCallButtons();
  addSystemMessage(state.muted ? "Microphone muted." : "Microphone unmuted.");
};

if (ui.toggleMicBtn) {
  ui.toggleMicBtn.onclick = handleMicToggle;
}

if (ui.muteBtn) {
  ui.muteBtn.onclick = handleMicToggle;
}

if (ui.toggleCamBtn) {
  ui.toggleCamBtn.onclick = () => {
    if (!state.localStream) return;
    state.cameraOff = !state.cameraOff;
    for (const track of state.localStream.getVideoTracks()) track.enabled = !state.cameraOff;
    updateCallButtons();
  };
}

if (ui.startStudyCallBtn) {
  ui.startStudyCallBtn.onclick = async () => {
    await startCall();
  };
}

if (ui.leaveStudyCallBtn) {
  ui.leaveStudyCallBtn.onclick = () => {
    stopCall(true);
  };
}

ui.chatForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const text = String(ui.chatInput.value || "").trim();
  if (!text) {
    return;
  }
  socket.emit("chat-message", { text });
  ui.chatInput.value = "";
});

if (ui.leaveRoomBtn) {
  ui.leaveRoomBtn.onclick = () => {
    if (confirm("Leave this room?")) {
      destroyChaosArenaRuntime();
      window.location.assign("/");
    }
  };
}

if (ui.minimizeSelfBtn) {
  ui.minimizeSelfBtn.onclick = () => {
    ui.localVideoCard.classList.toggle("minimized");
    ui.minimizeSelfBtn.textContent = ui.localVideoCard.classList.contains("minimized") ? "➕" : "➖";
  };
}

if (ui.remoteVideos) {
  ui.remoteVideos.addEventListener("click", (event) => {
    const button = event.target.closest(".tile-fullscreen-btn");
    if (!button) return;
    event.preventDefault();
    event.stopPropagation();
    const tile = button.closest(".video-item");
    toggleVideoTileFullscreen(tile);
  });
}

document.addEventListener("fullscreenchange", refreshFullscreenButtons);
refreshFullscreenButtons();

ui.focusTaskForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const task = ui.focusTaskInput.value.trim();
  console.log("Emitting focus task:", task);
  socket.emit("study-focus-update", { task });
});

// Re-attach study mode btn listeners just in case
if (ui.pomoStartBtn) {
  ui.pomoStartBtn.onclick = () => {
    console.log("Pomo Start Clicked");
    const duration = clampPomodoroDuration(studyState.pomodoro.duration, DEFAULT_WORK_DURATION);
    socket.emit("study-pomodoro-action", { action: "start", type: "work", duration });
  };
}

if (ui.pomoPreset25Btn) {
  ui.pomoPreset25Btn.onclick = () => {
    setPomodoroDuration(25, true);
  };
}

if (ui.pomoPreset45Btn) {
  ui.pomoPreset45Btn.onclick = () => {
    setPomodoroDuration(45, true);
  };
}

if (ui.pomoCustomSetBtn) {
  ui.pomoCustomSetBtn.onclick = () => {
    applyCustomPomodoroDuration();
  };
}

if (ui.pomoCustomMinutesInput) {
  ui.pomoCustomMinutesInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      applyCustomPomodoroDuration();
    }
  });
}


if (ui.pomoPauseBtn) {
  ui.pomoPauseBtn.onclick = () => {
    const isRunning = Boolean(studyState.pomodoro.startTime);
    socket.emit("study-pomodoro-action", { action: isRunning ? "pause" : "resume" });
  };
}

if (ui.pomoResetBtn) {
  ui.pomoResetBtn.onclick = () => {
    socket.emit("study-pomodoro-action", { action: "reset" });
  };
}


if (ui.demoPlayer) {
  ui.demoPlayer.addEventListener("play", () => {
    state.autoplayWarningShown = false;
    if (!state.syncingPlayer) {
      emitTimelineAction("play", Number(ui.demoPlayer.currentTime));
    }
  });

  ui.demoPlayer.addEventListener("pause", () => {
    if (!state.syncingPlayer) {
      emitTimelineAction("pause", Number(ui.demoPlayer.currentTime));
    }
  });

  ui.demoPlayer.addEventListener("seeked", () => {
    if (!state.syncingPlayer) {
      emitTimelineAction("seek", Number(ui.demoPlayer.currentTime));
    }
  });

  ui.demoPlayer.addEventListener("ratechange", () => {
    if (!state.syncingPlayer) {
      if (ui.rateSelect) ui.rateSelect.value = String(ui.demoPlayer.playbackRate);
      emitTimelineAction("rate", Number(ui.demoPlayer.currentTime));
    }
  });
}

window.setInterval(() => {
  renderTimeline();
  syncDemoPlayerToTimeline();
}, 350);

window.addEventListener("beforeunload", () => {
  destroyChaosArenaRuntime();
  socket.emit("leave-room");
  if (state.callActive) {
    stopCall(false);
  }
});

// Lo-Fi Mixer Logic
function updateMixerSlider(slider, label, audio, vibeLayer) {
  if (!slider || !label || !audio) return;

  const val = slider.value;
  label.textContent = `${val}% `;
  slider.style.backgroundSize = `${val}% 100 % `;

  const volume = val / 100;
  audio.volume = volume;

  // Sync Vibe Intensity
  if (vibeLayer) {
    vibeLayer.style.opacity = (volume * 0.8).toFixed(2);
  }

  if (volume > 0 && audio.paused) {
    audio.play().catch(e => console.warn("Autoplay blocked:", e));
  } else if (volume === 0 && !audio.paused) {
    audio.pause();
  }
}

if (ui.volRain) {
  ui.volRain.oninput = () => updateMixerSlider(ui.volRain, ui.volRainVal, mixerTracks.rain, ui.rainVibe);
}
if (ui.volCafe) {
  ui.volCafe.oninput = () => updateMixerSlider(ui.volCafe, ui.volCafeVal, mixerTracks.cafe, ui.cafeVibe);
}
if (ui.volNoise) {
  ui.volNoise.oninput = () => updateMixerSlider(ui.volNoise, ui.volNoiseVal, mixerTracks.noise, ui.noiseVibe);
}

// Wall of Done Helper
function addToWallOfDone(taskText, name) {
  if (!ui.wallOfDone || !taskText) return;

  const card = document.createElement("div");
  card.className = "done-card";
  card.innerHTML = `
    < div class="done-text" > ${taskText}</div >
    <div style="font-size: 8px; color: var(--accent); margin-bottom: 2px;">BY ${name.toUpperCase()}</div>
    <div class="done-date">${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
  `;
  ui.wallOfDone.prepend(card);
}

if (ui.focusTaskDoneBtn) {
  ui.focusTaskDoneBtn.onclick = () => {
    const task = ui.focusTaskInput.value.trim();
    if (!task) return;
    socket.emit("task-completed", { task });
    ui.focusTaskInput.value = "";
    socket.emit("update-focus-task", { focusTask: "" });
  };
}

socket.on("task-completed", ({ id, name, task }) => {
  console.log(`[CLIENT] Received task - completed from ${name}: ${task} `);
  addToWallOfDone(task, name);
  addSystemMessage(`${name} completed a task: "${task}"! 🎉`);
  if (id === state.meId) {
    studyState.stats.tasksDone++;
    updateLocalStats();
  }
});

// Focus Nudges (Visibility Detection)
let visibilityTimeout = null;
document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    // User left the tab
    visibilityTimeout = setTimeout(() => {
      socket.emit("participant-visibility", { visible: false });
    }, 5000); // 5 second grace period
  } else {
    // User returned
    if (visibilityTimeout) clearTimeout(visibilityTimeout);
    socket.emit("participant-visibility", { visible: true });
  }
});

socket.on("focus-nudge", ({ fromName, message }) => {
  addSystemMessage(`🔔 ${fromName}: ${message} `);
  // If browser supports notifications, show one?
  if (Notification.permission === "granted" && document.hidden) {
    new Notification("SyncNest Focus Nudge", {
      body: `${fromName}: ${message} `,
      icon: "/favicon.ico"
    });
  }
});

// Request notification permission on first interaction if possible
document.addEventListener("click", () => {
  if (Notification.permission === "default") {
    Notification.requestPermission();
  }
}, { once: true });
