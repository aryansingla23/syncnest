const path = require("path");
const http = require("http");
const express = require("express");
const { Server } = require("socket.io");
const { createSheepPushBattleEngine } = require("./server/sheepPushBattleEngine");
const {
  createAccount,
  loginAccount,
  issueAuthToken,
  verifyAuthToken,
  getUserById,
  updateUserPreferences,
  serializePublicUser
} = require("./server/authStore");

const app = express();
const server = http.createServer(app);
app.use(express.json({ limit: "256kb" }));
const rawAllowedOrigins = (process.env.ALLOWED_ORIGINS || "")
  .split(",")
  .map((origin) => origin.trim().replace(/\/+$/, ""))
  .filter(Boolean);
const allowedOrigins = new Set(rawAllowedOrigins);

function resolveAllowedOrigin(origin) {
  const cleanOrigin = String(origin || "").trim().replace(/\/+$/, "");
  if (!cleanOrigin) return "";
  if (allowedOrigins.size === 0 || allowedOrigins.has(cleanOrigin)) {
    return cleanOrigin;
  }
  return "";
}

app.use((req, res, next) => {
  const origin = resolveAllowedOrigin(req.headers.origin);
  if (origin) {
    res.header("Access-Control-Allow-Origin", origin);
    res.header("Vary", "Origin");
  }
  res.header("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Syncnest-Token");
  res.header("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }
  next();
});

const io = new Server(server, {
  cors: rawAllowedOrigins.length
    ? {
      origin: rawAllowedOrigins,
      methods: ["GET", "POST"]
    }
    : {
      origin: true,
      methods: ["GET", "POST"]
    }
});

const PORT = process.env.PORT || 3000;
const rooms = new Map();
const DATE_PROMPTS = [
  "What's one tiny thing I did this week that made you feel loved?",
  "If we had a 24-hour date in one city, where are we going first?",
  "What moment are you replaying in your head from us lately?",
  "What playlist vibe should our next date night have?",
  "What should we promise each other before this week ends?",
  "What's one fear you want us to beat together this month?",
  "What is your favorite memory of us that still gives butterflies?",
  "If I showed up right now, what would our first hour look like?",
  "What is one appreciation you have not said out loud yet?",
  "What should be our next mini-ritual during long-distance nights?"
];
const FUN_UNIVERSE_SCENES = ["space-station", "underwater-world", "retro-arcade", "haunted-house", "cozy-snow-cabin"];
const FUN_CINEMATIC_EVENTS = ["neon-rave", "rain-zoom", "dramatic-countdown", "award-ceremony"];
const FUN_CROWD_REASONS = ["score", "chaos", "teleport", "cinematic", "reaction", "challenge"];
const ROAST_OPENERS = [
  "Tiny roast incoming for",
  "Playful alert for",
  "Gentle chaos for",
  "Friendly roast unlocked for"
];
const ROAST_BODY = [
  "you bring main-character energy, then forget where you put your own plot.",
  "you start every mission at 110%, then celebrate at 300%.",
  "your focus face looks intense, but your snack choices expose you.",
  "you act mysterious, but your playlist tells the whole story.",
  "you call it strategy, we all know it is adorable overthinking."
];
const STORY_CONTINUATIONS = [
  "Then the room lights flickered, and the night turned cinematic.",
  "Suddenly, the soundtrack swelled like a final scene.",
  "Out of nowhere, destiny kicked the door open.",
  "At that exact moment, the universe decided to be dramatic.",
  "The air shifted, and everything felt like a movie trailer."
];
const STORY_ENDINGS = [
  "They looked at each other and knew this chapter had just begun.",
  "What started as a joke became a memory worth replaying.",
  "By midnight, even the stars felt like background extras.",
  "And somehow, chaos turned into the perfect plot twist.",
  "No one said it, but both knew this was their favorite scene yet."
];
const REMIX_KEYS = ["C", "D", "E", "G", "A"];
const MOOD_ENERGY = {
  relaxed: 22,
  tired: 18,
  happy: 65,
  stressed: 48,
  cozy: 35,
  "in love": 58,
  flirty: 72,
  "missing you": 45,
  calm: 30
};
const ALLOWED_MOODS = new Set([
  "🥰 Cozy",
  "💘 In love",
  "🔥 Flirty",
  "🫶 Missing you",
  "😌 Calm",
  "Relaxed",
  "Tired",
  "Happy",
  "Stressed"
]);
const ALLOWED_REACTIONS = new Set(["💖", "😘", "🤗", "❤️", "😂", "👍"]);
const DEFAULT_MOOD = "🥰 Cozy";
const DEFAULT_WORK_DURATION = 25 * 60;
const DEFAULT_BREAK_DURATION = 5 * 60;
const MIN_POMODORO_DURATION = 5 * 60;
const MAX_POMODORO_DURATION = 4 * 60 * 60;
const PLAYYARD_GAMES = ["tap-duel", "reaction-race", "dodge-grid", "memory-flash", "dodge-together"];
const PLAYYARD_REACTION_SET = ["❤️", "😂", "👍", "🤗"];
const PLAYYARD_UNLOCKS = [
  { level: 2, id: "neon-trails", label: "Neon Trails" },
  { level: 3, id: "cube-skin-rift", label: "Rift Cube Skin" },
  { level: 5, id: "hyper-ring-fx", label: "Hyper Ring FX" },
  { level: 7, id: "legend-badge", label: "Playyard Legend Badge" }
];
const MASCOT_ACTIVE_MODES = new Set(["fun", "playyard"]);
const MASCOT_STAGES = [
  { id: "sprout", minXp: 0, label: "Sprout", face: "o_o", vibe: "Just hatched and curious." },
  { id: "buddy", minXp: 120, label: "Buddy", face: "^_^", vibe: "Learns your duo rhythm." },
  { id: "star", minXp: 300, label: "Star", face: "*_*", vibe: "Glowing with team energy." },
  { id: "mythic", minXp: 560, label: "Mythic", face: "@_@", vibe: "Legendary mascot unlocked." }
];
const CHAOS_ARENA_COUNTDOWN_MS = 3_000;
const CHAOS_ARENA_SHRINK_DELAY_MS = 40_000;
const CHAOS_ARENA_MIN_PLAYERS = 1;
const CHAOS_ARENA_MAPS = new Set(["spinnerMayhem", "wobbleTiles", "risingLava", "iceChaos", "knockoutArena"]);
const CHAOS_ARENA_MODES = new Set(["survival", "knockout", "kingOfRing", "chaos"]);
const CHAOS_ARENA_MODIFIERS = new Set(["", "reverseControls", "speedBoost", "lowGravity", "invisiblePlayers", "doubleKnockback"]);
const DATE_LOUNGE_SCENES = new Set(["candlelight", "moonlight", "aurora"]);

const playyardRoundTimers = new Map();
const playyardDropTimers = new Map();
const playyardMotionTimers = new Map();
const mascotTickers = new Map();
const sheepPushBattle = createSheepPushBattleEngine({ io, rooms });

function sanitizePomodoroDuration(rawDuration, fallbackSeconds) {
  const parsed = Number(rawDuration);
  const fallback = Number.isFinite(Number(fallbackSeconds)) ? Number(fallbackSeconds) : DEFAULT_WORK_DURATION;
  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  const rounded = Math.round(parsed);
  return Math.max(MIN_POMODORO_DURATION, Math.min(MAX_POMODORO_DURATION, rounded));
}

function sanitizeRoomId(rawRoomId) {
  return String(rawRoomId || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "")
    .slice(0, 40);
}

function sanitizeName(rawName) {
  const value = String(rawName || "")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, 24);
  return value || `Guest-${Math.floor(Math.random() * 900 + 100)}`;
}

function pickRandomUniverseScene(currentScene = "") {
  const current = String(currentScene || "").trim();
  const options = FUN_UNIVERSE_SCENES.filter((scene) => scene !== current);
  const pool = options.length > 0 ? options : FUN_UNIVERSE_SCENES;
  return pool[Math.floor(Math.random() * pool.length)];
}

function pickRandomCinematicEvent(currentEvent = "") {
  const current = String(currentEvent || "").trim();
  const options = FUN_CINEMATIC_EVENTS.filter((eventId) => eventId !== current);
  const pool = options.length > 0 ? options : FUN_CINEMATIC_EVENTS;
  return pool[Math.floor(Math.random() * pool.length)];
}

function pickFunniestParticipant(room) {
  const names = Array.from(room?.participants?.values?.() || [])
    .map((participant) => String(participant?.name || "").trim())
    .filter(Boolean);
  if (names.length === 0) return "Guest";
  return names[Math.floor(Math.random() * names.length)];
}

function clearPlayyardTimers(roomId) {
  const roundTimer = playyardRoundTimers.get(roomId);
  if (roundTimer) {
    clearTimeout(roundTimer);
    playyardRoundTimers.delete(roomId);
  }
  const dropTimer = playyardDropTimers.get(roomId);
  if (dropTimer) {
    clearTimeout(dropTimer);
    playyardDropTimers.delete(roomId);
  }
  const motionTimer = playyardMotionTimers.get(roomId);
  if (motionTimer) {
    clearInterval(motionTimer);
    playyardMotionTimers.delete(roomId);
  }
}

function clampRange(value, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return min;
  return Math.max(min, Math.min(max, number));
}

function clearMascotTicker(roomId) {
  const ticker = mascotTickers.get(roomId);
  if (ticker) {
    clearInterval(ticker);
    mascotTickers.delete(roomId);
  }
}

function computeMascotXp(playSeconds, wins) {
  const seconds = Math.max(0, Number(playSeconds) || 0);
  const victoryCount = Math.max(0, Number(wins) || 0);
  return Math.floor(seconds / 15) + victoryCount * 40;
}

function getMascotStageForXp(xp) {
  const safeXp = Math.max(0, Number(xp) || 0);
  let stage = MASCOT_STAGES[0];
  for (let idx = 0; idx < MASCOT_STAGES.length; idx += 1) {
    if (safeXp >= MASCOT_STAGES[idx].minXp) {
      stage = MASCOT_STAGES[idx];
    }
  }
  return stage;
}

function ensureMascotState(room) {
  if (!room.mascot || typeof room.mascot !== "object") {
    room.mascot = {
      playSeconds: 0,
      wins: 0,
      xp: 0,
      level: 1,
      stage: "sprout",
      lastTickAt: Date.now(),
      updatedAt: Date.now()
    };
  }

  room.mascot.playSeconds = Math.max(0, Number(room.mascot.playSeconds) || 0);
  room.mascot.wins = Math.max(0, Number(room.mascot.wins) || 0);
  room.mascot.xp = Math.max(0, Number(room.mascot.xp) || 0);
  room.mascot.level = Math.max(1, Number(room.mascot.level) || 1);
  room.mascot.stage = String(room.mascot.stage || "sprout");
  room.mascot.lastTickAt = Number(room.mascot.lastTickAt) || Date.now();
  room.mascot.updatedAt = Number(room.mascot.updatedAt) || Date.now();
  return room.mascot;
}

function recalcMascot(room) {
  const mascot = ensureMascotState(room);
  mascot.xp = computeMascotXp(mascot.playSeconds, mascot.wins);
  mascot.level = Math.max(1, Math.floor(mascot.xp / 120) + 1);
  mascot.stage = getMascotStageForXp(mascot.xp).id;
  mascot.updatedAt = Date.now();
  return mascot;
}

function serializeMascot(room) {
  const mascot = recalcMascot(room);
  const stage = getMascotStageForXp(mascot.xp);
  const nextStage = MASCOT_STAGES.find((entry) => entry.minXp > mascot.xp) || null;
  return {
    playSeconds: mascot.playSeconds,
    wins: mascot.wins,
    xp: mascot.xp,
    level: mascot.level,
    stage: stage.id,
    stageLabel: stage.label,
    face: stage.face,
    vibe: stage.vibe,
    nextStageXp: nextStage ? nextStage.minXp : null
  };
}

function emitMascotState(roomId, room) {
  io.to(roomId).emit("mascot:state", {
    mascot: serializeMascot(room)
  });
}

function tickMascotProgress(roomId) {
  const room = rooms.get(roomId);
  if (!room) {
    clearMascotTicker(roomId);
    return;
  }

  const mascot = ensureMascotState(room);
  const now = Date.now();
  const elapsedSeconds = Math.max(0, Math.round((now - mascot.lastTickAt) / 1000));
  mascot.lastTickAt = now;

  if (!MASCOT_ACTIVE_MODES.has(String(room.mode || "")) || room.participants.size === 0 || elapsedSeconds <= 0) {
    return;
  }

  const beforeXp = Number(mascot.xp) || 0;
  const beforeStage = String(mascot.stage || "");
  const multiplier = Math.max(1, Math.min(2, room.participants.size));
  mascot.playSeconds += elapsedSeconds * multiplier;
  recalcMascot(room);

  if (beforeXp !== mascot.xp || beforeStage !== mascot.stage) {
    emitMascotState(roomId, room);
  }
}

function ensureMascotTicker(roomId) {
  if (mascotTickers.has(roomId)) return;
  const ticker = setInterval(() => {
    tickMascotProgress(roomId);
  }, 10_000);
  mascotTickers.set(roomId, ticker);
}

function awardMascotWin(roomId, room, amount = 1) {
  const mascot = ensureMascotState(room);
  const boost = Math.max(0, Math.round(Number(amount) || 0));
  if (boost <= 0) return;
  mascot.wins += boost;
  recalcMascot(room);
  emitMascotState(roomId, room);
}

function sanitizePlayyardGame(gameId) {
  const value = String(gameId || "").trim().toLowerCase();
  return PLAYYARD_GAMES.includes(value) ? value : "tap-duel";
}

function calcPlayyardLevelFromXp(xp) {
  return Math.max(1, Math.floor((Number(xp) || 0) / 40) + 1);
}

function unlocksForLevel(level) {
  return PLAYYARD_UNLOCKS.filter((item) => level >= item.level).map((item) => item.id);
}

function buildPlayyardPlayer(name = "Guest") {
  return {
    name: String(name || "Guest").trim() || "Guest",
    xp: 0,
    level: 1,
    wins: 0,
    unlocked: [],
    effects: {
      doubleUntil: 0,
      frozenUntil: 0,
      shieldCharges: 0
    }
  };
}

function ensurePlayyardState(room) {
  if (!room.playyard || typeof room.playyard !== "object") {
    room.playyard = {
      players: {},
      round: null,
      history: []
    };
  }
  if (!room.playyard.players || typeof room.playyard.players !== "object") {
    room.playyard.players = {};
  }
  if (!Array.isArray(room.playyard.history)) {
    room.playyard.history = [];
  }
  return room.playyard;
}

function ensurePlayyardPlayer(room, participantId, fallbackName = "Guest") {
  const playyard = ensurePlayyardState(room);
  const cleanId = String(participantId || "").trim();
  if (!cleanId) return null;
  const participant = room.participants.get(cleanId);
  const displayName = participant?.name || fallbackName || "Guest";
  if (!playyard.players[cleanId]) {
    playyard.players[cleanId] = buildPlayyardPlayer(displayName);
  }
  playyard.players[cleanId].name = String(displayName || "Guest").trim() || "Guest";
  if (!playyard.players[cleanId].effects) {
    playyard.players[cleanId].effects = { doubleUntil: 0, frozenUntil: 0, shieldCharges: 0 };
  }
  return playyard.players[cleanId];
}

function createPlayyardRound(room, gameId) {
  const game = sanitizePlayyardGame(gameId);
  const now = Date.now();
  const round = {
    id: `${now}-${Math.random().toString(36).slice(2, 7)}`,
    game,
    startedAt: now,
    endsAt: now + 45_000,
    prompt: "",
    target: "",
    options: [],
    answer: "",
    coop: null,
    scores: {},
    submissions: {},
    drop: null
  };

  const participantIds = Array.from(room.participants.keys());
  participantIds.forEach((id) => {
    round.scores[id] = 0;
    round.submissions[id] = false;
  });

  if (game === "tap-duel") {
    round.prompt = "Mash Primary Action as fast as you can.";
  } else if (game === "reaction-race") {
    round.target = PLAYYARD_REACTION_SET[Math.floor(Math.random() * PLAYYARD_REACTION_SET.length)];
    round.prompt = `Hit the matching emoji target: ${round.target}`;
  } else if (game === "dodge-grid") {
    round.prompt = "Use Primary Action to dodge obstacles and farm points.";
  } else if (game === "dodge-together") {
    const controls = {
      left: participantIds[0] || null,
      right: participantIds[1] || participantIds[0] || null
    };
    round.prompt = "Dodge Together: Left pilot shifts left, Right pilot shifts right. One crash and both lose.";
    round.target = "Co-op survival";
    round.coop = {
      x: 0.5,
      y: 0.88,
      width: 0.1,
      score: 0,
      speed: 0.2,
      obstacles: [],
      controls,
      crashed: false,
      crashBy: null,
      lastMoveBy: null,
      lastTickAt: now
    };
  } else {
    const options = ["Neon Wolf", "Pixel Drift", "Cyber Bloom", "Starline Echo"];
    const answer = options[Math.floor(Math.random() * options.length)];
    round.options = options;
    round.answer = answer;
    round.prompt = `Memory Flash: Which codename was shown? (Hint: ${answer})`;
  }

  return round;
}

function tickDodgeTogetherRound(roomId) {
  const room = rooms.get(roomId);
  if (!room) {
    clearPlayyardTimers(roomId);
    return;
  }

  const playyard = ensurePlayyardState(room);
  const round = playyard.round;
  if (!round || round.game !== "dodge-together" || !round.coop) {
    const timer = playyardMotionTimers.get(roomId);
    if (timer) {
      clearInterval(timer);
      playyardMotionTimers.delete(roomId);
    }
    return;
  }

  const now = Date.now();
  if (now >= Number(round.endsAt || 0)) {
    endPlayyardRound(roomId, room, "completed");
    return;
  }

  const coop = round.coop;
  const activeIds = Array.from(room.participants.keys());
  if (!activeIds.includes(String(coop.controls?.left || ""))) {
    coop.controls.left = activeIds[0] || null;
  }
  if (!activeIds.includes(String(coop.controls?.right || ""))) {
    coop.controls.right = activeIds[1] || activeIds[0] || null;
  }
  const dt = clampRange((now - Number(coop.lastTickAt || now)) / 1000, 0.08, 0.35);
  coop.lastTickAt = now;
  const elapsed = Math.max(0, (now - Number(round.startedAt || now)) / 1000);
  coop.speed = 0.22 + Math.min(0.24, elapsed * 0.008);
  coop.score = Math.max(0, Number(coop.score || 0) + dt * 2.4);

  const obstacles = Array.isArray(coop.obstacles) ? coop.obstacles : [];
  obstacles.forEach((obstacle) => {
    obstacle.y = Number(obstacle.y || 0) + coop.speed * dt;
    obstacle.spin = Number(obstacle.spin || 0) + dt * 150;
  });

  const spawnChance = (0.22 + Math.min(0.18, elapsed / 140)) * dt * 5;
  if (Math.random() < spawnChance) {
    obstacles.push({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      x: clampRange(0.12 + Math.random() * 0.76, 0.08, 0.92),
      y: -0.12,
      size: clampRange(0.08 + Math.random() * 0.05, 0.06, 0.15),
      spin: Math.random() * 360
    });
  }

  coop.obstacles = obstacles
    .filter((obstacle) => Number(obstacle.y || 0) < 1.18)
    .slice(-18);

  const playerX = clampRange(coop.x, 0.08, 0.92);
  const playerHalf = clampRange(coop.width || 0.1, 0.07, 0.14);
  const crashedObstacle = coop.obstacles.find((obstacle) => {
    const y = Number(obstacle.y || 0);
    const x = Number(obstacle.x || 0);
    const sizeHalf = clampRange((Number(obstacle.size || 0.1) * 0.85) / 2, 0.03, 0.09);
    const nearBottom = y >= 0.76 && y <= 1.02;
    const overlap = Math.abs(x - playerX) <= playerHalf + sizeHalf;
    return nearBottom && overlap;
  });

  const teamScore = Math.max(0, Math.floor(Number(coop.score || 0)));
  Object.keys(round.scores || {}).forEach((id) => {
    round.scores[id] = teamScore;
  });

  if (crashedObstacle) {
    coop.crashed = true;
    coop.crashBy = String(coop.lastMoveBy || "");
    endPlayyardRound(roomId, room, "crash");
    return;
  }

  emitPlayyardState(roomId, room);
}

function startDodgeTogetherTicker(roomId) {
  const existing = playyardMotionTimers.get(roomId);
  if (existing) {
    clearInterval(existing);
    playyardMotionTimers.delete(roomId);
  }

  const timer = setInterval(() => {
    tickDodgeTogetherRound(roomId);
  }, 120);
  playyardMotionTimers.set(roomId, timer);
}

function serializePlayyard(room, viewerId) {
  const playyard = ensurePlayyardState(room);
  const participantIds = Array.from(room.participants.keys());
  const players = participantIds.map((id) => {
    const state = ensurePlayyardPlayer(room, id, "Guest");
    return {
      id,
      name: state.name,
      xp: state.xp,
      level: state.level,
      wins: state.wins,
      unlocked: state.unlocked.slice(0, 24),
      effects: {
        doubleUntil: Number(state.effects?.doubleUntil) || 0,
        frozenUntil: Number(state.effects?.frozenUntil) || 0,
        shieldCharges: Number(state.effects?.shieldCharges) || 0
      },
      you: id === viewerId
    };
  });

  const round = playyard.round
    ? {
      id: playyard.round.id,
      game: playyard.round.game,
      startedAt: playyard.round.startedAt,
      endsAt: playyard.round.endsAt,
      prompt: playyard.round.prompt,
      target: playyard.round.target,
      options: Array.isArray(playyard.round.options) ? playyard.round.options.slice(0, 6) : [],
      coop: playyard.round.coop
        ? {
          x: clampRange(playyard.round.coop.x, 0.08, 0.92),
          y: clampRange(playyard.round.coop.y, 0.75, 0.95),
          width: clampRange(playyard.round.coop.width, 0.07, 0.14),
          score: Math.max(0, Math.floor(Number(playyard.round.coop.score || 0))),
          speed: clampRange(playyard.round.coop.speed, 0.12, 0.9),
          controls: {
            left: String(playyard.round.coop.controls?.left || ""),
            right: String(playyard.round.coop.controls?.right || "")
          },
          crashed: Boolean(playyard.round.coop.crashed),
          crashBy: String(playyard.round.coop.crashBy || ""),
          obstacles: Array.isArray(playyard.round.coop.obstacles)
            ? playyard.round.coop.obstacles.slice(-18).map((obstacle) => ({
              id: String(obstacle.id || ""),
              x: clampRange(obstacle.x, 0.05, 0.95),
              y: clampRange(obstacle.y, -0.25, 1.25),
              size: clampRange(obstacle.size, 0.05, 0.18),
              spin: Number(obstacle.spin || 0)
            }))
            : []
        }
        : null,
      scores: playyard.round.scores || {},
      submissions: playyard.round.submissions || {},
      drop: playyard.round.drop || null
    }
    : null;

  return {
    players,
    round,
    history: playyard.history.slice(-10)
  };
}

function emitPlayyardState(roomId, room) {
  io.to(roomId).emit("playyard:state", {
    playyard: serializePlayyard(room, "")
  });
}

function applyPlayyardXp(player, amount) {
  const gain = Math.max(0, Math.round(Number(amount) || 0));
  if (gain <= 0) return { gain: 0, leveledUp: false, newUnlocks: [] };

  const previousLevel = Number(player.level) || 1;
  const previousUnlocks = new Set(Array.isArray(player.unlocked) ? player.unlocked : []);
  player.xp = (Number(player.xp) || 0) + gain;
  player.level = calcPlayyardLevelFromXp(player.xp);
  player.unlocked = unlocksForLevel(player.level);

  const newUnlocks = player.unlocked.filter((unlockId) => !previousUnlocks.has(unlockId));
  return {
    gain,
    leveledUp: player.level > previousLevel,
    newUnlocks
  };
}

function schedulePlayyardDrop(roomId, room) {
  const playyard = ensurePlayyardState(room);
  const currentRound = playyard.round;
  if (!currentRound) return;

  const existing = playyardDropTimers.get(roomId);
  if (existing) {
    clearTimeout(existing);
    playyardDropTimers.delete(roomId);
  }

  const timeoutId = setTimeout(() => {
    const latestRoom = rooms.get(roomId);
    if (!latestRoom) return;
    const latestPlayyard = ensurePlayyardState(latestRoom);
    const latestRound = latestPlayyard.round;
    if (!latestRound || latestRound.id !== currentRound.id || Date.now() >= latestRound.endsAt) return;

    if (latestRound.drop && Date.now() < Number(latestRound.drop.expiresAt || 0)) {
      schedulePlayyardDrop(roomId, latestRoom);
      return;
    }
    if (latestRound.drop && Date.now() >= Number(latestRound.drop.expiresAt || 0)) {
      latestRound.drop = null;
    }

    const types = ["double", "shield", "freeze", "bonus"];
    const type = types[Math.floor(Math.random() * types.length)];
    const labels = {
      double: "2x Score Boost",
      shield: "Shield Charge",
      freeze: "Freeze Opponent",
      bonus: "Instant +5"
    };
    latestRound.drop = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      type,
      label: labels[type] || "Power-Up",
      createdAt: Date.now(),
      expiresAt: Date.now() + 7000,
      claimedBy: null
    };
    emitPlayyardState(roomId, latestRoom);

    schedulePlayyardDrop(roomId, latestRoom);
  }, 6000 + Math.floor(Math.random() * 4000));

  playyardDropTimers.set(roomId, timeoutId);
}

function endPlayyardRound(roomId, room, reason = "timeout") {
  const playyard = ensurePlayyardState(room);
  const round = playyard.round;
  if (!round) return;

  clearPlayyardTimers(roomId);

  const participantIds = Array.from(room.participants.keys());
  const isCoopDodge = round.game === "dodge-together";
  const teamScore = isCoopDodge
    ? Math.max(0, Math.floor(Number(round.coop?.score || 0)))
    : 0;
  if (isCoopDodge) {
    participantIds.forEach((id) => {
      round.scores[id] = Math.max(Number(round.scores?.[id]) || 0, teamScore);
    });
  }

  const ranked = participantIds
    .map((id) => ({ id, score: Number(round.scores?.[id]) || 0 }))
    .sort((a, b) => b.score - a.score);
  let winner = ranked[0] || null;
  const teamCleared = isCoopDodge && reason !== "crash";
  if (isCoopDodge) {
    winner = null;
    if (teamCleared) {
      participantIds.forEach((id) => {
        const player = ensurePlayyardPlayer(room, id, "Guest");
        player.wins = (Number(player.wins) || 0) + 1;
      });
      awardMascotWin(roomId, room, 1);
    }
  } else if (winner) {
    const winnerPlayer = ensurePlayyardPlayer(room, winner.id, "Guest");
    winnerPlayer.wins = (Number(winnerPlayer.wins) || 0) + 1;
    awardMascotWin(roomId, room, 1);
  }

  const xpAwarded = [];
  participantIds.forEach((id) => {
    const player = ensurePlayyardPlayer(room, id, "Guest");
    const score = Number(round.scores?.[id]) || 0;
    const baseXp = isCoopDodge
      ? (reason === "crash" ? 5 + Math.min(14, Math.floor(score * 0.45)) : 12 + Math.min(24, Math.floor(score * 0.6)))
      : 6 + Math.min(22, score);
    const bonusXp = isCoopDodge
      ? (teamCleared ? 8 : 0)
      : (winner && winner.id === id ? 10 : 0);
    const result = applyPlayyardXp(player, baseXp + bonusXp);
    xpAwarded.push({
      id,
      gain: result.gain,
      level: player.level,
      newUnlocks: result.newUnlocks
    });
  });

  playyard.history.push({
    id: round.id,
    game: round.game,
    endedAt: Date.now(),
    reason,
    winnerId: winner?.id || null,
    winnerName: winner ? ensurePlayyardPlayer(room, winner.id, "Guest")?.name || "Guest" : null,
    topScore: isCoopDodge ? teamScore : (winner?.score || 0)
  });
  if (playyard.history.length > 25) {
    playyard.history.shift();
  }
  playyard.round = null;

  io.to(roomId).emit("playyard:round-ended", {
    game: round.game,
    reason,
    teamCleared,
    teamScore: isCoopDodge ? teamScore : null,
    winnerId: winner?.id || null,
    winnerName: winner ? ensurePlayyardPlayer(room, winner.id, "Guest")?.name || "Guest" : null,
    score: isCoopDodge ? teamScore : (winner?.score || 0),
    xpAwarded
  });
  emitPlayyardState(roomId, room);
}

function sanitizeChaosArenaMap(rawMap) {
  const map = String(rawMap || "").trim();
  return CHAOS_ARENA_MAPS.has(map) ? map : "spinnerMayhem";
}

function sanitizeChaosArenaMode(rawMode) {
  const mode = String(rawMode || "").trim();
  return CHAOS_ARENA_MODES.has(mode) ? mode : "survival";
}

function sanitizeChaosArenaModifier(rawModifier) {
  const modifier = String(rawModifier || "").trim();
  return CHAOS_ARENA_MODIFIERS.has(modifier) ? modifier : "";
}

function ensureChaosArenaState(room) {
  if (!room.chaosArena || typeof room.chaosArena !== "object") {
    room.chaosArena = {
      active: false,
      countdownStartAt: 0,
      startedAt: 0,
      shrinkAt: 0,
      map: "spinnerMayhem",
      mode: "survival",
      modifierId: "",
      modifierUntil: 0,
      modeStateUpdatedAt: 0,
      ownerId: "",
      winnerId: null,
      players: {}
    };
  }
  if (!room.chaosArena.players || typeof room.chaosArena.players !== "object") {
    room.chaosArena.players = {};
  }
  if (!CHAOS_ARENA_MAPS.has(String(room.chaosArena.map || ""))) {
    room.chaosArena.map = "spinnerMayhem";
  }
  if (!CHAOS_ARENA_MODES.has(String(room.chaosArena.mode || ""))) {
    room.chaosArena.mode = "survival";
  }
  room.chaosArena.modifierId = sanitizeChaosArenaModifier(room.chaosArena.modifierId);
  room.chaosArena.modifierUntil = Number(room.chaosArena.modifierUntil) || 0;
  room.chaosArena.modeStateUpdatedAt = Number(room.chaosArena.modeStateUpdatedAt) || 0;
  room.chaosArena.ownerId = String(room.chaosArena.ownerId || "");
  return room.chaosArena;
}

function syncChaosArenaParticipants(room) {
  const chaos = ensureChaosArenaState(room);
  const participantIds = Array.from(room.participants.keys());
  const total = Math.max(1, participantIds.length);

  participantIds.forEach((id, index) => {
    const participant = room.participants.get(id);
    if (!chaos.players[id]) {
      const angle = (Math.PI * 2 * index) / total;
      chaos.players[id] = {
        x: Math.cos(angle) * 0.55,
        y: Math.sin(angle) * 0.55,
        vx: 0,
        vy: 0,
        eliminated: false,
        eliminatedAt: 0
      };
    }
    chaos.players[id].name = String(participant?.name || "Guest");
  });

  Object.keys(chaos.players).forEach((id) => {
    if (!room.participants.has(id)) {
      delete chaos.players[id];
    }
  });

  if (!chaos.ownerId || !room.participants.has(chaos.ownerId)) {
    chaos.ownerId = participantIds[0] || "";
  }

  return chaos;
}

function seedChaosArenaPlayers(room) {
  const chaos = syncChaosArenaParticipants(room);
  const participantIds = Array.from(room.participants.keys());
  const total = Math.max(1, participantIds.length);
  participantIds.forEach((id, index) => {
    const angle = (Math.PI * 2 * index) / total;
    const radius = total <= 1 ? 0 : 0.52;
    const player = chaos.players[id];
    player.x = Number((Math.cos(angle) * radius).toFixed(4));
    player.y = Number((Math.sin(angle) * radius).toFixed(4));
    player.vx = 0;
    player.vy = 0;
    player.eliminated = false;
    player.eliminatedAt = 0;
  });
  return chaos;
}

function serializeChaosArena(room) {
  const chaos = syncChaosArenaParticipants(room);
  const players = {};
  Object.entries(chaos.players).forEach(([id, entry]) => {
    players[id] = {
      id,
      name: String(entry?.name || "Guest"),
      x: clampRange(entry?.x, -1.8, 1.8),
      y: clampRange(entry?.y, -1.8, 1.8),
      vx: clampRange(entry?.vx, -6, 6),
      vy: clampRange(entry?.vy, -6, 6),
      eliminated: Boolean(entry?.eliminated),
      eliminatedAt: Number(entry?.eliminatedAt) || 0
    };
  });

  return {
    active: Boolean(chaos.active),
    countdownStartAt: Number(chaos.countdownStartAt) || 0,
    startedAt: Number(chaos.startedAt) || 0,
    shrinkAt: Number(chaos.shrinkAt) || 0,
    map: sanitizeChaosArenaMap(chaos.map),
    mode: sanitizeChaosArenaMode(chaos.mode),
    modifierId: sanitizeChaosArenaModifier(chaos.modifierId),
    modifierUntil: Number(chaos.modifierUntil) || 0,
    modeStateUpdatedAt: Number(chaos.modeStateUpdatedAt) || 0,
    ownerId: String(chaos.ownerId || ""),
    winnerId: String(chaos.winnerId || ""),
    players
  };
}

function emitChaosArenaState(roomId, room, targetSocketId = "") {
  const payload = { chaosArena: serializeChaosArena(room) };
  if (targetSocketId) {
    io.to(targetSocketId).emit("chaos-arena:state", payload);
    return;
  }
  io.to(roomId).emit("chaos-arena:state", payload);
}

function resolveChaosArenaWinner(roomId, room, reason = "elimination") {
  const chaos = ensureChaosArenaState(room);
  const activeIds = Object.entries(chaos.players)
    .filter(([, player]) => !player.eliminated)
    .map(([id]) => id);

  if (!chaos.active) return;
  if (activeIds.length > 1) return;

  const winnerId = activeIds[0] || "";
  chaos.active = false;
  chaos.winnerId = winnerId;
  chaos.modifierId = "";
  chaos.modifierUntil = 0;
  chaos.modeStateUpdatedAt = Date.now();
  io.to(roomId).emit("chaos-arena:winner", {
    winnerId,
    reason,
    endedAt: Date.now()
  });
  emitChaosArenaState(roomId, room);
}

function startChaosArenaMatch(roomId, room, startedBy = "", requestedMap = "", requestedMode = "") {
  const chaos = seedChaosArenaPlayers(room);
  if (Object.keys(chaos.players).length < CHAOS_ARENA_MIN_PLAYERS) return;
  const now = Date.now();
  chaos.map = sanitizeChaosArenaMap(requestedMap || chaos.map);
  chaos.mode = sanitizeChaosArenaMode(requestedMode || chaos.mode);
  chaos.active = true;
  chaos.ownerId = String(startedBy || chaos.ownerId || "");
  chaos.winnerId = "";
  chaos.countdownStartAt = now;
  chaos.startedAt = now + CHAOS_ARENA_COUNTDOWN_MS;
  chaos.shrinkAt = chaos.startedAt + CHAOS_ARENA_SHRINK_DELAY_MS;
  chaos.modifierId = "";
  chaos.modifierUntil = 0;
  chaos.modeStateUpdatedAt = now;

  io.to(roomId).emit("chaos-arena:started", {
    by: startedBy,
    countdownStartAt: chaos.countdownStartAt,
    startedAt: chaos.startedAt,
    shrinkAt: chaos.shrinkAt,
    map: chaos.map,
    mode: chaos.mode,
    ownerId: chaos.ownerId
  });
  emitChaosArenaState(roomId, room);
}

function stopChaosArenaMatch(roomId, room, stoppedBy = "") {
  const chaos = ensureChaosArenaState(room);
  chaos.active = false;
  chaos.countdownStartAt = 0;
  chaos.startedAt = 0;
  chaos.shrinkAt = 0;
  chaos.modifierId = "";
  chaos.modifierUntil = 0;
  chaos.modeStateUpdatedAt = Date.now();
  chaos.winnerId = "";
  Object.values(chaos.players).forEach((player) => {
    player.vx = 0;
    player.vy = 0;
    player.eliminated = false;
    player.eliminatedAt = 0;
  });
  io.to(roomId).emit("chaos-arena:stopped", {
    by: stoppedBy,
    stoppedAt: Date.now()
  });
  emitChaosArenaState(roomId, room);
}

function ensureRoom(roomId) {
  if (!rooms.has(roomId)) {
    const firstPrompt = DATE_PROMPTS[Math.floor(Math.random() * DATE_PROMPTS.length)];
    rooms.set(roomId, {
      id: roomId,
      mediaLink: "",
      timeline: {
        playing: false,
        currentTime: 0,
        playbackRate: 1,
        updatedAt: Date.now()
      },
      dateNight: {
        currentPrompt: firstPrompt,
        notes: []
      },
      participants: new Map(),
      mode: "none", // study, break, fun
      study: {
        pomodoro: {
          state: "idle", // work, break, idle
          startTime: null,
          duration: DEFAULT_WORK_DURATION,
          pausedTime: 0
        }
      },
      break: {
        duration: 10 * 60,
        endsAt: null,
        scene: "rain",
        mediaLink: "",
        memories: [],
        drawingEvents: [],
        ourSong: { url: "", title: "" }
      },
      dateLounge: {
        scene: "aurora",
        songLink: "",
        promises: [],
        pulse: null
      },
      fun: {
        scores: {},
        activeGame: null,
        winStreak: 0,
        totalPoints: 0,
        confession: {
          active: false,
          startedAt: null
        },
        cinematic: {
          active: false,
          theme: null,
          startedAt: null,
          endsAt: null,
          funniestName: null
        },
        ai: {
          lastRoast: null,
          story: {
            pending: {},
            lastResult: null
          },
          moodRemix: null
        },
        universe: {
          scene: null,
          changedAt: null
        }
      },
      playyard: {
        players: {},
        round: null,
        history: []
      },
      chaosArena: {
        active: false,
        countdownStartAt: 0,
        startedAt: 0,
        shrinkAt: 0,
        map: "spinnerMayhem",
        mode: "survival",
        modifierId: "",
        modifierUntil: 0,
        modeStateUpdatedAt: 0,
        ownerId: "",
        winnerId: "",
        players: {}
      },
      mascot: {
        playSeconds: 0,
        wins: 0,
        xp: 0,
        level: 1,
        stage: "sprout",
        lastTickAt: Date.now(),
        updatedAt: Date.now()
      }
    });
  }
  const room = rooms.get(roomId);
  ensureDateLoungeState(room);
  ensureMascotState(room);
  ensureMascotTicker(roomId);
  return room;
}

function getTimelinePosition(timeline) {
  if (!timeline.playing) {
    return timeline.currentTime;
  }

  const elapsedSeconds = (Date.now() - timeline.updatedAt) / 1000;
  return Math.max(0, timeline.currentTime + elapsedSeconds * timeline.playbackRate);
}

function getRoomSnapshot(room, viewerId) {
  const lounge = ensureDateLoungeState(room);
  const participants = Array.from(room.participants.entries()).map(([id, participant]) => ({
    id,
    name: participant.name,
    inCall: participant.inCall,
    mood: participant.mood,
    focusTask: participant.focusTask || "",
    visible: participant.visible !== false,
    you: id === viewerId
  }));

  return {
    roomId: room.id,
    participants,
    mediaLink: room.mediaLink,
    dateNight: {
      currentPrompt: room.dateNight.currentPrompt,
      notes: room.dateNight.notes
    },
    timeline: {
      ...room.timeline,
      currentTime: getTimelinePosition(room.timeline)
    },
    mode: room.mode,
    study: room.study,
    break: room.break,
    dateLounge: lounge,
    fun: room.fun,
    chaosArena: serializeChaosArena(room),
    mascot: serializeMascot(room),
    playyard: serializePlayyard(room, viewerId)
  };
}

function ensureDateLoungeState(room) {
  if (!room.dateLounge || typeof room.dateLounge !== "object") {
    room.dateLounge = {
      scene: "aurora",
      songLink: "",
      promises: [],
      pulse: null
    };
  }
  const cleanScene = String(room.dateLounge.scene || "aurora").trim().toLowerCase();
  room.dateLounge.scene = DATE_LOUNGE_SCENES.has(cleanScene) ? cleanScene : "aurora";
  room.dateLounge.songLink = String(room.dateLounge.songLink || "").trim().slice(0, 2000);
  room.dateLounge.promises = Array.isArray(room.dateLounge.promises) ? room.dateLounge.promises.slice(-24) : [];
  room.dateLounge.pulse = room.dateLounge.pulse && typeof room.dateLounge.pulse === "object"
    ? room.dateLounge.pulse
    : null;
  return room.dateLounge;
}

function pickNextPrompt(currentPrompt) {
  if (DATE_PROMPTS.length <= 1) {
    return DATE_PROMPTS[0] || "";
  }

  let nextPrompt = currentPrompt;
  let attempts = 0;
  while (nextPrompt === currentPrompt && attempts < 10) {
    nextPrompt = DATE_PROMPTS[Math.floor(Math.random() * DATE_PROMPTS.length)];
    attempts += 1;
  }
  return nextPrompt;
}

function sanitizeOneSentence(rawText, maxLength = 180) {
  const compact = String(rawText || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
  if (!compact) return "";

  const sentenceMatch = compact.match(/[^.!?]+[.!?]?/);
  return String(sentenceMatch?.[0] || compact).trim();
}

function randomItem(list, fallback = "") {
  if (!Array.isArray(list) || list.length === 0) return fallback;
  return list[Math.floor(Math.random() * list.length)];
}

function generateFriendlyRoast(targetName) {
  const safeTarget = String(targetName || "legend").trim() || "legend";
  const open = randomItem(ROAST_OPENERS, "Playful roast for");
  const body = randomItem(ROAST_BODY, "you are chaotic in the cutest way.");
  return `${open} ${safeTarget}: ${body}`;
}

function generateStoryContinuation(lineA, lineB) {
  const lead = randomItem(STORY_CONTINUATIONS, "And then everything got dramatic.");
  const finale = randomItem(STORY_ENDINGS, "That is how the scene became unforgettable.");
  const a = sanitizeOneSentence(lineA, 140);
  const b = sanitizeOneSentence(lineB, 140);
  return `${a} ${b} ${lead} ${finale}`.trim();
}

function normalizeMoodLabel(mood) {
  return String(mood || "")
    .toLowerCase()
    .replace(/[^\w\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function clamp(number, min, max) {
  return Math.max(min, Math.min(max, number));
}

function buildMoodRemixPayload(room) {
  const participants = Array.from(room.participants.values());
  const moods = participants.map((participant) => participant?.mood || DEFAULT_MOOD);
  const energyValues = moods.map((mood) => {
    const normalized = normalizeMoodLabel(mood);
    return MOOD_ENERGY[normalized] ?? 45;
  });
  const avgEnergy = energyValues.length
    ? Math.round(energyValues.reduce((sum, value) => sum + value, 0) / energyValues.length)
    : 45;
  const bpm = clamp(70 + Math.round(avgEnergy * 0.8), 72, 132);
  const key = REMIX_KEYS[(avgEnergy + moods.length) % REMIX_KEYS.length];
  const scale = avgEnergy >= 52 ? "major" : "minor";
  const intervals = scale === "major" ? [0, 2, 4, 7, 9, 7, 4, 2] : [0, 3, 5, 7, 10, 7, 5, 3];
  const rootSemitoneOffset = { C: 0, D: 2, E: 4, G: 7, A: 9 }[key] || 0;
  const rootFrequency = 220 * Math.pow(2, rootSemitoneOffset / 12);
  const notes = intervals.map((interval) => Number((rootFrequency * Math.pow(2, interval / 12)).toFixed(2)));
  const adjectives = avgEnergy >= 60 ? ["Neon", "Spark", "Turbo", "Pulse"] : ["Moonlight", "Velvet", "Soft", "Dream"];
  const themes = avgEnergy >= 60 ? ["Heartbeat", "Arcade", "Skyline", "Glow"] : ["Drizzle", "Cabin", "Tide", "Starlight"];

  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    title: `${randomItem(adjectives, "Soft")} ${randomItem(themes, "Glow")} Remix`,
    vibe: avgEnergy >= 60 ? "Playful Energy" : "Cozy Chill",
    bpm,
    key: `${key} ${scale}`,
    notes,
    moods: moods.slice(0, 4),
    generatedAt: Date.now()
  };
}

function canSignal(socket, targetId) {
  const roomId = socket.data.roomId;
  if (!roomId) {
    return false;
  }

  const room = rooms.get(roomId);
  if (!room) {
    return false;
  }

  return room.participants.has(targetId);
}

function leaveCurrentRoom(socket) {
  const roomId = socket.data.roomId;
  if (!roomId) {
    return;
  }

  const room = rooms.get(roomId);
  if (!room) {
    socket.data.roomId = null;
    return;
  }

  const leavingParticipant = room.participants.get(socket.id);
  room.participants.delete(socket.id);
  if (room.playyard?.players && room.playyard.players[socket.id]) {
    delete room.playyard.players[socket.id];
  }
  if (room.chaosArena?.players && room.chaosArena.players[socket.id]) {
    delete room.chaosArena.players[socket.id];
  }
  if (room.chaosArena?.ownerId === socket.id) {
    const nextOwner = Array.from(room.participants.keys())[0] || "";
    room.chaosArena.ownerId = nextOwner;
  }
  sheepPushBattle.handleParticipantLeft(roomId, room, socket.id);
  socket.leave(roomId);
  socket.data.roomId = null;

  socket.to(roomId).emit("participant-left", {
    id: socket.id,
    name: leavingParticipant?.name || "Guest",
    wasInCall: Boolean(leavingParticipant?.inCall)
  });
  if (room.chaosArena?.active) {
    resolveChaosArenaWinner(roomId, room, "disconnect");
  }
  emitChaosArenaState(roomId, room);
  emitPlayyardState(roomId, room);

  if (room.participants.size === 0) {
    clearPlayyardTimers(roomId);
    clearMascotTicker(roomId);
    sheepPushBattle.cleanupRoom(roomId);
    rooms.delete(roomId);
  }
}

function readAuthToken(req) {
  const bearer = String(req.headers.authorization || "").trim();
  if (bearer.toLowerCase().startsWith("bearer ")) {
    return bearer.slice(7).trim();
  }
  return String(req.headers["x-syncnest-token"] || "").trim();
}

function getAuthenticatedUser(req) {
  const token = readAuthToken(req);
  if (!token) return null;
  const verified = verifyAuthToken(token);
  if (!verified?.userId) return null;
  return getUserById(verified.userId);
}

function requireAuth(req, res, next) {
  const user = getAuthenticatedUser(req);
  if (!user) {
    res.status(401).json({ ok: false, error: "Authentication required." });
    return;
  }
  req.authUser = user;
  next();
}

app.post("/api/auth/signup", (req, res) => {
  try {
    const user = createAccount(req.body || {});
    const token = issueAuthToken(user.id);
    res.status(201).json({
      ok: true,
      token,
      user: serializePublicUser(user)
    });
  } catch (error) {
    res.status(Number(error?.status) || 500).json({
      ok: false,
      error: String(error?.message || "Could not create account.")
    });
  }
});

app.post("/api/auth/login", (req, res) => {
  try {
    const user = loginAccount(req.body || {});
    const token = issueAuthToken(user.id);
    res.json({
      ok: true,
      token,
      user: serializePublicUser(user)
    });
  } catch (error) {
    res.status(Number(error?.status) || 500).json({
      ok: false,
      error: String(error?.message || "Could not log in.")
    });
  }
});

app.get("/api/auth/me", requireAuth, (req, res) => {
  res.json({
    ok: true,
    user: serializePublicUser(req.authUser)
  });
});

app.put("/api/user/preferences", requireAuth, (req, res) => {
  try {
    const updated = updateUserPreferences(req.authUser.id, req.body || {});
    res.json({
      ok: true,
      user: serializePublicUser(updated)
    });
  } catch (error) {
    res.status(Number(error?.status) || 500).json({
      ok: false,
      error: String(error?.message || "Could not save preferences.")
    });
  }
});

app.post("/api/auth/logout", (_req, res) => {
  res.json({ ok: true });
});

app.use(express.static(path.join(__dirname, "public")));

app.get("/room/:roomId", (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "room.html"));
});

app.get("/room/:roomId/break", (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "room.html"));
});

app.get("/room/:roomId/modes", (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "ambient-modes.html"));
});


app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    rooms: rooms.size,
    now: new Date().toISOString()
  });
});

io.on("connection", (socket) => {
  sheepPushBattle.attachSocketHandlers(socket);

  socket.on("join-room", ({ roomId, name }, callback) => {
    const cleanRoomId = sanitizeRoomId(roomId);
    if (!cleanRoomId) {
      callback?.({ error: "Room ID must contain letters or numbers." });
      return;
    }

    const cleanName = sanitizeName(name);

    if (socket.data.roomId && socket.data.roomId !== cleanRoomId) {
      leaveCurrentRoom(socket);
    }

    const room = ensureRoom(cleanRoomId);

    socket.join(cleanRoomId);
    socket.data.roomId = cleanRoomId;
    socket.data.name = cleanName;

    room.participants.set(socket.id, { name: cleanName, inCall: false, mood: DEFAULT_MOOD, visible: true });
    ensurePlayyardPlayer(room, socket.id, cleanName);
    ensureMascotState(room);
    syncChaosArenaParticipants(room);
    sheepPushBattle.ensureParticipant(cleanRoomId, room, socket.id, cleanName);

    callback?.({
      participantId: socket.id,
      ...getRoomSnapshot(room, socket.id)
    });

    socket.to(cleanRoomId).emit("participant-joined", {
      id: socket.id,
      name: cleanName,
      inCall: false,
      mood: DEFAULT_MOOD,
      focusTask: ""
    });
    emitChaosArenaState(cleanRoomId, room);
    emitPlayyardState(cleanRoomId, room);
    emitMascotState(cleanRoomId, room);
  });

  socket.on("set-room-mode", ({ mode }) => {
    const roomId = socket.data.roomId;
    const room = roomId ? rooms.get(roomId) : null;
    if (!room) return;

    const cleanMode = String(mode || "").trim().toLowerCase();
    const allowedModes = new Set(["study", "break", "fun", "playyard", "date"]);
    room.mode = allowedModes.has(cleanMode) ? cleanMode : "study";
    const mascot = ensureMascotState(room);
    mascot.lastTickAt = Date.now();
    io.to(roomId).emit("room-mode-updated", { mode: room.mode, updatedBy: socket.id });
    emitMascotState(roomId, room);
  });

  socket.on("lounge:request-state", () => {
    const roomId = socket.data.roomId;
    const room = roomId ? rooms.get(roomId) : null;
    if (!room) return;
    socket.emit("lounge:state", { dateLounge: ensureDateLoungeState(room) });
  });

  socket.on("lounge:set-scene", ({ scene }) => {
    const roomId = socket.data.roomId;
    const room = roomId ? rooms.get(roomId) : null;
    if (!room) return;
    const lounge = ensureDateLoungeState(room);
    const cleanScene = String(scene || "").trim().toLowerCase();
    lounge.scene = DATE_LOUNGE_SCENES.has(cleanScene) ? cleanScene : "aurora";
    io.to(roomId).emit("lounge:scene-updated", { scene: lounge.scene, updatedBy: socket.id });
  });

  socket.on("lounge:set-song", ({ url }) => {
    const roomId = socket.data.roomId;
    const room = roomId ? rooms.get(roomId) : null;
    if (!room) return;
    const lounge = ensureDateLoungeState(room);
    lounge.songLink = String(url || "").trim().slice(0, 2000);
    io.to(roomId).emit("lounge:song-updated", { url: lounge.songLink, updatedBy: socket.id });
  });

  socket.on("lounge:add-promise", ({ text }) => {
    const roomId = socket.data.roomId;
    const room = roomId ? rooms.get(roomId) : null;
    if (!room) return;
    const sender = room.participants.get(socket.id);
    if (!sender) return;
    const cleanText = String(text || "").replace(/\s+/g, " ").trim().slice(0, 140);
    if (!cleanText) return;
    const lounge = ensureDateLoungeState(room);
    const payload = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      senderId: socket.id,
      senderName: String(sender.name || "Guest").trim() || "Guest",
      text: cleanText,
      createdAt: Date.now()
    };
    lounge.promises.push(payload);
    lounge.promises = lounge.promises.slice(-24);
    io.to(roomId).emit("lounge:promise-added", payload);
  });

  socket.on("lounge:send-pulse", ({ emoji, text }) => {
    const roomId = socket.data.roomId;
    const room = roomId ? rooms.get(roomId) : null;
    if (!room) return;
    const sender = room.participants.get(socket.id);
    if (!sender) return;
    const safeEmoji = String(emoji || "💖").trim().slice(0, 4) || "💖";
    const safeText = String(text || "Thinking of you").replace(/\s+/g, " ").trim().slice(0, 90) || "Thinking of you";
    const lounge = ensureDateLoungeState(room);
    lounge.pulse = {
      emoji: safeEmoji,
      text: safeText,
      fromId: socket.id,
      fromName: String(sender.name || "Guest").trim() || "Guest",
      at: Date.now()
    };
    io.to(roomId).emit("lounge:pulse", lounge.pulse);
  });

  socket.on("break-session-start", ({ duration }) => {
    const roomId = socket.data.roomId;
    const room = roomId ? rooms.get(roomId) : null;
    if (!room) return;

    const parsedDuration = Number(duration);
    const safeDuration = Number.isFinite(parsedDuration) && parsedDuration > 0 ? Math.round(parsedDuration) : 10 * 60;
    room.break.duration = safeDuration;
    room.break.endsAt = Date.now() + safeDuration * 1000;
    io.to(roomId).emit("break-session-updated", {
      duration: room.break.duration,
      endsAt: room.break.endsAt,
      updatedBy: socket.id
    });
  });

  socket.on("break-media-set", ({ url }) => {
    const roomId = socket.data.roomId;
    const room = roomId ? rooms.get(roomId) : null;
    if (!room) return;

    room.break.mediaLink = String(url || "").trim().slice(0, 2000);
    io.to(roomId).emit("break-media-updated", {
      url: room.break.mediaLink,
      updatedBy: socket.id
    });
  });

  socket.on("break-scene-set", ({ scene }) => {
    const roomId = socket.data.roomId;
    const room = roomId ? rooms.get(roomId) : null;
    if (!room) return;

    const cleanScene = String(scene || "").trim();
    const allowedScenes = new Set(["rain", "beach", "night-city", "campfire"]);
    room.break.scene = allowedScenes.has(cleanScene) ? cleanScene : "rain";
    io.to(roomId).emit("break-scene-updated", {
      scene: room.break.scene,
      updatedBy: socket.id
    });
  });

  socket.on("break-memory-save", ({ memory }) => {
    const roomId = socket.data.roomId;
    const room = roomId ? rooms.get(roomId) : null;
    if (!room) return;

    const sender = room.participants.get(socket.id);
    const safeMemory = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      createdAt: Date.now(),
      by: sender?.name || "Guest",
      scene: String(memory?.scene || room.break.scene || "rain"),
      mediaLink: String(memory?.mediaLink || room.break.mediaLink || "").slice(0, 2000),
      text: String(memory?.text || "Break moment").slice(0, 120)
    };
    room.break.memories.push(safeMemory);
    if (room.break.memories.length > 50) {
      room.break.memories.shift();
    }
    io.to(roomId).emit("break-memory-added", safeMemory);
  });

  socket.on("break-drawing-event", ({ stroke }) => {
    const roomId = socket.data.roomId;
    const room = roomId ? rooms.get(roomId) : null;
    if (!room) return;

    const safeStroke = {
      x0: Number(stroke?.x0) || 0,
      y0: Number(stroke?.y0) || 0,
      x1: Number(stroke?.x1) || 0,
      y1: Number(stroke?.y1) || 0,
      color: String(stroke?.color || "#ff66a3").slice(0, 16),
      width: Number(stroke?.width) || 2
    };
    room.break.drawingEvents.push(safeStroke);
    if (room.break.drawingEvents.length > 3000) {
      room.break.drawingEvents = room.break.drawingEvents.slice(-1200);
    }
    socket.to(roomId).emit("break-drawing-event", { stroke: safeStroke, fromId: socket.id });
  });

  socket.on("break-our-song-set", ({ url, title }) => {
    const roomId = socket.data.roomId;
    const room = roomId ? rooms.get(roomId) : null;
    if (!room) return;

    const cleanUrl = String(url || "").trim().slice(0, 2000);
    const cleanTitle = String(title || "").trim().slice(0, 120);
    room.break.ourSong = { url: cleanUrl, title: cleanTitle };
    io.to(roomId).emit("break-our-song-updated", {
      url: cleanUrl,
      title: cleanTitle,
      updatedBy: socket.id
    });
  });

  socket.on("break-clear-drawing", () => {
    const roomId = socket.data.roomId;
    const room = roomId ? rooms.get(roomId) : null;
    if (!room) return;

    room.break.drawingEvents = [];
    io.to(roomId).emit("break-drawing-cleared", { by: socket.id });
  });

  socket.on("study-pomodoro-action", ({ action, type, duration }) => {
    const roomId = socket.data.roomId;
    const room = roomId ? rooms.get(roomId) : null;
    if (!room) return;

    const p = room.study.pomodoro;
    if (action === "set-duration") {
      if (p.state === "idle") {
        p.duration = sanitizePomodoroDuration(duration, p.duration || DEFAULT_WORK_DURATION);
        p.pausedTime = 0;
      }
    } else if (action === "start") {
      p.state = type || "work";
      const fallbackDuration = p.state === "work" ? DEFAULT_WORK_DURATION : DEFAULT_BREAK_DURATION;
      p.duration = sanitizePomodoroDuration(duration, fallbackDuration);
      p.startTime = Date.now();
      p.pausedTime = 0;
    } else if (action === "pause") {
      if (p.state !== "idle" && p.startTime) {
        p.pausedTime += (Date.now() - p.startTime) / 1000;
        p.startTime = null;
      }
    } else if (action === "resume") {
      if (p.state !== "idle" && !p.startTime) {
        p.startTime = Date.now();
      }
    } else if (action === "reset") {
      p.state = "idle";
      p.startTime = null;
      p.pausedTime = 0;
      p.duration = sanitizePomodoroDuration(p.duration, DEFAULT_WORK_DURATION);
    }

    io.to(roomId).emit("study-pomodoro-updated", p);
  });


  socket.on("study-focus-update", ({ task }) => {
    const roomId = socket.data.roomId;
    const room = roomId ? rooms.get(roomId) : null;
    if (!room) return;

    const participant = room.participants.get(socket.id);
    if (participant) {
      participant.focusTask = String(task || "").slice(0, 50);
      io.to(roomId).emit("participant-focus-updated", {
        id: socket.id,
        focusTask: participant.focusTask
      });
    }
  });

  socket.on("task-completed", ({ task }) => {
    const roomId = socket.data.roomId;
    console.log(`[SERVER] Task completed in room ${roomId}: ${task}`);
    const room = roomId ? rooms.get(roomId) : null;
    if (!room) return;

    const p = room.participants.get(socket.id);
    if (!p) {
      console.log(`[SERVER] Participant not found for task completion`);
      return;
    }

    io.to(roomId).emit("task-completed", { id: socket.id, name: p.name, task });
  });

  socket.on("leave-room", () => {
    leaveCurrentRoom(socket);
  });

  socket.on("set-media-link", ({ url }) => {
    const roomId = socket.data.roomId;
    const room = roomId ? rooms.get(roomId) : null;
    if (!room) {
      return;
    }

    const link = String(url || "").trim().slice(0, 2000);
    room.mediaLink = link;

    io.to(roomId).emit("media-link-updated", {
      url: link,
      updatedBy: socket.id
    });
  });

  socket.on("participant-visibility", ({ visible }) => {
    const roomId = socket.data.roomId;
    const room = roomId ? rooms.get(roomId) : null;
    if (!room) return;

    const p = room.participants.get(socket.id);
    if (!p) return;

    p.visible = visible;
    io.to(roomId).emit("participant-visibility-updated", { id: socket.id, visible });
  });

  socket.on("send-focus-nudge", ({ toId, message }) => {
    const roomId = socket.data.roomId;
    const room = roomId ? rooms.get(roomId) : null;
    if (!room) return;

    const fromP = room.participants.get(socket.id);
    if (!fromP) return;

    if (toId) {
      io.to(toId).emit("focus-nudge", { fromName: fromP.name, message });
    } else {
      socket.to(roomId).emit("focus-nudge", { fromName: fromP.name, message });
    }
  });

  socket.on("timeline-action", ({ action, time, playbackRate }) => {
    const roomId = socket.data.roomId;
    const room = roomId ? rooms.get(roomId) : null;
    if (!room) {
      return;
    }

    const timeline = room.timeline;
    const now = Date.now();
    const normalizedTime =
      Number.isFinite(Number(time)) && Number(time) >= 0 ? Number(time) : getTimelinePosition(timeline);
    const normalizedRate =
      Number.isFinite(Number(playbackRate)) && Number(playbackRate) > 0
        ? Number(playbackRate)
        : timeline.playbackRate;

    if (action === "play") {
      timeline.currentTime = normalizedTime;
      timeline.playbackRate = normalizedRate;
      timeline.playing = true;
      timeline.updatedAt = now;
    } else if (action === "pause") {
      timeline.currentTime = normalizedTime;
      timeline.playing = false;
      timeline.updatedAt = now;
    } else if (action === "seek") {
      timeline.currentTime = normalizedTime;
      timeline.updatedAt = now;
    } else if (action === "rate") {
      timeline.currentTime = normalizedTime;
      timeline.playbackRate = normalizedRate;
      timeline.updatedAt = now;
    } else {
      return;
    }

    io.to(roomId).emit("timeline-updated", {
      action,
      updatedBy: socket.id,
      timeline: {
        ...timeline,
        currentTime: getTimelinePosition(timeline)
      }
    });
  });

  socket.on("chat-message", ({ text }) => {
    const roomId = socket.data.roomId;
    const room = roomId ? rooms.get(roomId) : null;
    if (!room) {
      return;
    }

    const cleanText = String(text || "").trim().slice(0, 500);
    if (!cleanText) {
      return;
    }

    const sender = room.participants.get(socket.id);
    io.to(roomId).emit("chat-message", {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      senderId: socket.id,
      senderName: sender?.name || "Guest",
      text: cleanText,
      sentAt: Date.now()
    });
  });

  socket.on("set-mood", ({ mood }) => {
    const roomId = socket.data.roomId;
    const room = roomId ? rooms.get(roomId) : null;
    if (!room) {
      return;
    }

    const participant = room.participants.get(socket.id);
    if (!participant) {
      return;
    }

    const cleanMood = String(mood || "").trim();
    participant.mood = ALLOWED_MOODS.has(cleanMood) ? cleanMood : DEFAULT_MOOD;

    io.to(roomId).emit("participant-mood-updated", {
      id: socket.id,
      mood: participant.mood
    });
  });

  socket.on("date-prompt-next", () => {
    const roomId = socket.data.roomId;
    const room = roomId ? rooms.get(roomId) : null;
    if (!room) {
      return;
    }

    room.dateNight.currentPrompt = pickNextPrompt(room.dateNight.currentPrompt);

    io.to(roomId).emit("date-prompt-updated", {
      prompt: room.dateNight.currentPrompt,
      updatedBy: socket.id
    });
  });

  socket.on("love-note", ({ text }) => {
    const roomId = socket.data.roomId;
    const room = roomId ? rooms.get(roomId) : null;
    if (!room) {
      return;
    }

    const cleanText = String(text || "").trim().slice(0, 180);
    if (!cleanText) {
      return;
    }

    const sender = room.participants.get(socket.id);
    const note = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      senderId: socket.id,
      senderName: sender?.name || "Guest",
      text: cleanText,
      createdAt: Date.now()
    };

    room.dateNight.notes.push(note);
    if (room.dateNight.notes.length > 24) {
      room.dateNight.notes.shift();
    }

    io.to(roomId).emit("love-note-added", note);
  });

  socket.on("quick-reaction", ({ emoji }) => {
    const roomId = socket.data.roomId;
    const room = roomId ? rooms.get(roomId) : null;
    if (!room) {
      return;
    }

    const cleanEmoji = String(emoji || "").trim();
    const sender = room.participants.get(socket.id);

    io.to(roomId).emit("quick-reaction", {
      emoji: ALLOWED_REACTIONS.has(cleanEmoji) ? cleanEmoji : "💖",
      fromId: socket.id,
      fromName: sender?.name || "Guest",
      sentAt: Date.now()
    });
  });

  socket.on("call-started", () => {
    const roomId = socket.data.roomId;
    const room = roomId ? rooms.get(roomId) : null;
    if (!room) {
      return;
    }

    const participant = room.participants.get(socket.id);
    if (!participant) {
      return;
    }

    participant.inCall = true;
    io.to(roomId).emit("participant-call-status", {
      id: socket.id,
      inCall: true
    });
  });

  socket.on("call-stopped", () => {
    const roomId = socket.data.roomId;
    const room = roomId ? rooms.get(roomId) : null;
    if (!room) {
      return;
    }

    const participant = room.participants.get(socket.id);
    if (!participant) {
      return;
    }

    participant.inCall = false;
    io.to(roomId).emit("participant-call-status", {
      id: socket.id,
      inCall: false
    });
  });

  socket.on("webrtc-offer", ({ to, offer }) => {
    if (!to || !offer || !canSignal(socket, to)) {
      return;
    }
    io.to(to).emit("webrtc-offer", { from: socket.id, offer });
  });

  socket.on("webrtc-answer", ({ to, answer }) => {
    if (!to || !answer || !canSignal(socket, to)) {
      return;
    }
    io.to(to).emit("webrtc-answer", { from: socket.id, answer });
  });

  socket.on("webrtc-ice-candidate", ({ to, candidate }) => {
    if (!to || !candidate || !canSignal(socket, to)) {
      return;
    }
    io.to(to).emit("webrtc-ice-candidate", { from: socket.id, candidate });
  });

  // --- FUN ROOM HANDLERS ---
  socket.on("fun:start-game", ({ game }) => {
    const roomId = socket.data.roomId;
    const room = roomId ? rooms.get(roomId) : null;
    if (!room) return;
    room.fun.activeGame = game;
    io.to(roomId).emit("fun:game-started", { game, startedBy: socket.id });
  });

  socket.on("fun:teleport", ({ scene }) => {
    const roomId = socket.data.roomId;
    const room = roomId ? rooms.get(roomId) : null;
    if (!room) return;

    const requested = String(scene || "").trim();
    const chosenScene = FUN_UNIVERSE_SCENES.includes(requested)
      ? requested
      : pickRandomUniverseScene(room.fun?.universe?.scene);

    room.fun.universe = {
      scene: chosenScene,
      changedAt: Date.now()
    };

    io.to(roomId).emit("fun:teleported", {
      scene: chosenScene,
      changedAt: room.fun.universe.changedAt,
      by: socket.id
    });
  });

  socket.on("fun:teleport-stop", () => {
    const roomId = socket.data.roomId;
    const room = roomId ? rooms.get(roomId) : null;
    if (!room) return;

    room.fun.universe = {
      scene: null,
      changedAt: Date.now()
    };

    io.to(roomId).emit("fun:teleport-cleared", {
      by: socket.id,
      changedAt: room.fun.universe.changedAt
    });
  });

  socket.on("fun:add-points", ({ points }) => {
    const roomId = socket.data.roomId;
    const room = roomId ? rooms.get(roomId) : null;
    if (!room) return;

    if (!room.fun.scores[socket.id]) room.fun.scores[socket.id] = 0;
    room.fun.scores[socket.id] += (Number(points) || 0);
    room.fun.totalPoints += (Number(points) || 0);

    // Get top 2 scores for vs display
    const sorted = Object.entries(room.fun.scores).sort((a, b) => b[1] - a[1]);
    io.to(roomId).emit("fun:points-update", {
      p1: sorted[0]?.[1] || 0,
      p2: sorted[1]?.[1] || 0,
      total: room.fun.totalPoints
    });
  });

  socket.on("fun:trigger-chaos", () => {
    const roomId = socket.data.roomId;
    io.to(roomId).emit("fun:chaos-trigger");
  });

  socket.on("fun:reaction", ({ emoji }) => {
    const roomId = socket.data.roomId;
    io.to(roomId).emit("fun:reaction", { emoji, fromId: socket.id });
  });

  socket.on("fun:hug", () => {
    const roomId = socket.data.roomId;
    const room = roomId ? rooms.get(roomId) : null;
    if (!room) return;
    const sender = room.participants.get(socket.id);
    if (!sender) return;

    io.to(roomId).emit("fun:hug", {
      fromId: socket.id,
      fromName: sender.name || "Guest",
      at: Date.now()
    });
  });

  socket.on("fun:thought", ({ text }) => {
    const roomId = socket.data.roomId;
    const room = roomId ? rooms.get(roomId) : null;
    if (!room) return;
    const sender = room.participants.get(socket.id);
    if (!sender) return;

    const safeText = String(text || "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 140);
    if (!safeText) return;

    io.to(roomId).emit("fun:thought", {
      fromId: socket.id,
      fromName: sender.name || "Guest",
      text: safeText,
      at: Date.now()
    });
  });

  socket.on("fun:confession-toggle", ({ active }) => {
    const roomId = socket.data.roomId;
    const room = roomId ? rooms.get(roomId) : null;
    if (!room) return;

    const nextActive = Boolean(active);
    room.fun.confession = {
      active: nextActive,
      startedAt: nextActive ? Date.now() : null
    };

    io.to(roomId).emit("fun:confession-state", {
      active: room.fun.confession.active,
      startedAt: room.fun.confession.startedAt,
      by: socket.id
    });
  });

  socket.on("fun:crowd-hype", ({ reason, strength }) => {
    const roomId = socket.data.roomId;
    const room = roomId ? rooms.get(roomId) : null;
    if (!room) return;

    const safeReason = FUN_CROWD_REASONS.includes(String(reason || "").trim())
      ? String(reason || "").trim()
      : "score";
    const numericStrength = Number(strength);
    const safeStrength = Number.isFinite(numericStrength)
      ? Math.max(1, Math.min(3, Math.round(numericStrength)))
      : 1;

    io.to(roomId).emit("fun:crowd-hype", {
      reason: safeReason,
      strength: safeStrength,
      by: socket.id,
      at: Date.now()
    });
  });

  socket.on("fun:ai-roast-request", ({ targetId }) => {
    const roomId = socket.data.roomId;
    const room = roomId ? rooms.get(roomId) : null;
    if (!room) return;

    const sender = room.participants.get(socket.id);
    if (!sender) return;

    const targetParticipant = room.participants.get(String(targetId || "").trim()) || sender;
    const payload = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      text: generateFriendlyRoast(targetParticipant.name || "legend"),
      fromId: socket.id,
      fromName: sender.name || "Guest",
      targetId: targetParticipant === sender ? socket.id : String(targetId || ""),
      targetName: targetParticipant.name || sender.name || "Guest",
      createdAt: Date.now()
    };

    if (!room.fun.ai) {
      room.fun.ai = { lastRoast: null, story: { pending: {}, lastResult: null }, moodRemix: null };
    }
    room.fun.ai.lastRoast = payload;
    io.to(roomId).emit("fun:ai-roast", payload);
  });

  socket.on("fun:story-submit", ({ sentence }) => {
    const roomId = socket.data.roomId;
    const room = roomId ? rooms.get(roomId) : null;
    if (!room) return;

    const sender = room.participants.get(socket.id);
    if (!sender) return;

    const cleanSentence = sanitizeOneSentence(sentence, 180);
    if (!cleanSentence) return;

    if (!room.fun.ai) {
      room.fun.ai = { lastRoast: null, story: { pending: {}, lastResult: null }, moodRemix: null };
    }
    if (!room.fun.ai.story) {
      room.fun.ai.story = { pending: {}, lastResult: null };
    }

    room.fun.ai.story.pending[socket.id] = {
      id: socket.id,
      name: sender.name || "Guest",
      sentence: cleanSentence
    };

    const pendingList = Object.values(room.fun.ai.story.pending);
    const needed = Math.min(2, Math.max(1, room.participants.size));
    io.to(roomId).emit("fun:story-progress", {
      pending: pendingList,
      needed
    });

    if (pendingList.length < needed) return;

    const lineA = pendingList[0];
    const lineB = pendingList[1] || pendingList[0];
    const storyPayload = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      title: "Cinematic Story Drop",
      lines: [lineA, lineB],
      continuation: generateStoryContinuation(lineA.sentence, lineB.sentence),
      createdAt: Date.now()
    };

    room.fun.ai.story.lastResult = storyPayload;
    room.fun.ai.story.pending = {};
    io.to(roomId).emit("fun:story-ready", storyPayload);
  });

  socket.on("fun:story-reset", () => {
    const roomId = socket.data.roomId;
    const room = roomId ? rooms.get(roomId) : null;
    if (!room) return;

    if (!room.fun.ai) {
      room.fun.ai = { lastRoast: null, story: { pending: {}, lastResult: null }, moodRemix: null };
    }
    if (!room.fun.ai.story) {
      room.fun.ai.story = { pending: {}, lastResult: null };
    }
    room.fun.ai.story.pending = {};

    io.to(roomId).emit("fun:story-progress", {
      pending: [],
      needed: Math.min(2, Math.max(1, room.participants.size))
    });
  });

  socket.on("fun:mood-remix-request", () => {
    const roomId = socket.data.roomId;
    const room = roomId ? rooms.get(roomId) : null;
    if (!room) return;

    if (!room.fun.ai) {
      room.fun.ai = { lastRoast: null, story: { pending: {}, lastResult: null }, moodRemix: null };
    }

    const remixPayload = buildMoodRemixPayload(room);
    room.fun.ai.moodRemix = remixPayload;
    io.to(roomId).emit("fun:mood-remix", remixPayload);
  });

  socket.on("fun:cinematic-trigger", ({ theme }) => {
    const roomId = socket.data.roomId;
    const room = roomId ? rooms.get(roomId) : null;
    if (!room) return;

    const requestedTheme = String(theme || "").trim();
    const chosenTheme = FUN_CINEMATIC_EVENTS.includes(requestedTheme)
      ? requestedTheme
      : pickRandomCinematicEvent(room.fun?.cinematic?.theme);

    const startedAt = Date.now();
    const endsAt = startedAt + 60_000;
    const funniestName = chosenTheme === "award-ceremony" ? pickFunniestParticipant(room) : null;

    room.fun.cinematic = {
      active: true,
      theme: chosenTheme,
      startedAt,
      endsAt,
      funniestName
    };

    io.to(roomId).emit("fun:cinematic-start", {
      theme: chosenTheme,
      startedAt,
      endsAt,
      funniestName,
      by: socket.id
    });
  });

  socket.on("fun:cinematic-stop", () => {
    const roomId = socket.data.roomId;
    const room = roomId ? rooms.get(roomId) : null;
    if (!room) return;

    room.fun.cinematic = {
      active: false,
      theme: null,
      startedAt: null,
      endsAt: null,
      funniestName: null
    };

    io.to(roomId).emit("fun:cinematic-stop", {
      by: socket.id,
      stoppedAt: Date.now()
    });
  });

  socket.on("playyard:request-state", () => {
    const roomId = socket.data.roomId;
    const room = roomId ? rooms.get(roomId) : null;
    if (!room) return;
    socket.emit("playyard:state", {
      playyard: serializePlayyard(room, socket.id)
    });
  });

  socket.on("mascot:request-state", () => {
    const roomId = socket.data.roomId;
    const room = roomId ? rooms.get(roomId) : null;
    if (!room) return;
    socket.emit("mascot:state", {
      mascot: serializeMascot(room)
    });
  });

  socket.on("playyard:start-round", ({ game }) => {
    const roomId = socket.data.roomId;
    const room = roomId ? rooms.get(roomId) : null;
    if (!room) return;

    const playyard = ensurePlayyardState(room);
    if (playyard.round && Date.now() < Number(playyard.round.endsAt || 0)) {
      emitPlayyardState(roomId, room);
      return;
    }

    clearPlayyardTimers(roomId);
    const round = createPlayyardRound(room, game);
    playyard.round = round;
    const endDelay = Math.max(500, round.endsAt - Date.now());
    const roundTimer = setTimeout(() => {
      const latestRoom = rooms.get(roomId);
      if (!latestRoom) return;
      endPlayyardRound(roomId, latestRoom, "timeout");
    }, endDelay);
    playyardRoundTimers.set(roomId, roundTimer);
    if (round.game === "dodge-together") {
      startDodgeTogetherTicker(roomId);
    } else {
      schedulePlayyardDrop(roomId, room);
    }

    io.to(roomId).emit("playyard:round-started", {
      game: round.game,
      startedBy: socket.id,
      roundId: round.id
    });
    emitPlayyardState(roomId, room);
  });

  socket.on("playyard:action", ({ kind, value }) => {
    const roomId = socket.data.roomId;
    const room = roomId ? rooms.get(roomId) : null;
    if (!room) return;

    const playyard = ensurePlayyardState(room);
    const round = playyard.round;
    if (!round) return;
    if (Date.now() >= Number(round.endsAt || 0)) {
      endPlayyardRound(roomId, room, "timeout");
      return;
    }

    const actionKind = String(kind || "primary").trim().toLowerCase();
    const actionValue = String(value || "").trim();
    const me = ensurePlayyardPlayer(room, socket.id, "Guest");
    if (!me) return;
    const now = Date.now();
    if (Number(me.effects?.frozenUntil || 0) > now) {
      socket.emit("playyard:action-feedback", { blocked: "frozen" });
      return;
    }

    let delta = 0;
    if (round.game === "tap-duel") {
      delta = actionKind === "secondary" ? 2 : 1;
    } else if (round.game === "reaction-race") {
      if (actionKind !== "reaction-choice") return;
      if (actionValue === String(round.target || "")) {
        delta = 4;
        round.target = PLAYYARD_REACTION_SET[Math.floor(Math.random() * PLAYYARD_REACTION_SET.length)];
        round.prompt = `Hit the matching emoji target: ${round.target}`;
      } else {
        const current = Number(round.scores[socket.id]) || 0;
        round.scores[socket.id] = Math.max(0, current - 1);
      }
    } else if (round.game === "dodge-grid") {
      const successChance = actionKind === "secondary" ? 0.78 : 0.62;
      const success = Math.random() <= successChance;
      delta = success ? (actionKind === "secondary" ? 3 : 2) : 0;
    } else if (round.game === "dodge-together") {
      if (!["primary", "secondary"].includes(actionKind)) return;
      const coop = round.coop;
      if (!coop) return;

      const leftId = String(coop.controls?.left || "");
      const rightId = String(coop.controls?.right || "");
      const isController = socket.id === leftId || socket.id === rightId;
      if (!isController) {
        socket.emit("playyard:action-feedback", { blocked: "not-controller" });
        return;
      }

      let direction = 0;
      const step = actionKind === "secondary" ? 0.056 : 0.034;
      if (leftId && rightId && leftId === rightId && socket.id === leftId) {
        direction = actionKind === "secondary" ? 1 : -1;
      } else if (socket.id === leftId) {
        direction = -1;
      } else if (socket.id === rightId) {
        direction = 1;
      }
      coop.x = clampRange(Number(coop.x || 0.5) + direction * step, 0.08, 0.92);
      coop.lastMoveBy = socket.id;
      emitPlayyardState(roomId, room);
      return;
    } else if (round.game === "memory-flash") {
      if (actionKind !== "memory-choice") return;
      if (round.submissions[socket.id]) return;
      round.submissions[socket.id] = true;
      delta = actionValue === String(round.answer || "") ? 8 : 2;
    }

    if (delta > 0) {
      const hasDouble = Number(me.effects?.doubleUntil || 0) > now;
      const applied = hasDouble ? delta * 2 : delta;
      round.scores[socket.id] = (Number(round.scores[socket.id]) || 0) + applied;
    }

    if (round.game === "memory-flash") {
      const participantIds = Array.from(room.participants.keys());
      const allSubmitted = participantIds.every((id) => Boolean(round.submissions[id]));
      if (allSubmitted) {
        endPlayyardRound(roomId, room, "completed");
        return;
      }
    }
    emitPlayyardState(roomId, room);
  });

  socket.on("playyard:claim-drop", ({ dropId }) => {
    const roomId = socket.data.roomId;
    const room = roomId ? rooms.get(roomId) : null;
    if (!room) return;
    const playyard = ensurePlayyardState(room);
    const round = playyard.round;
    if (!round?.drop) return;

    const cleanDropId = String(dropId || "").trim();
    if (!cleanDropId || cleanDropId !== String(round.drop.id)) return;
    if (Date.now() > Number(round.drop.expiresAt || 0)) {
      round.drop = null;
      emitPlayyardState(roomId, room);
      return;
    }
    if (round.drop.claimedBy) return;

    const claimer = ensurePlayyardPlayer(room, socket.id, "Guest");
    if (!claimer) return;

    const effectType = String(round.drop.type || "").trim();
    const now = Date.now();
    if (effectType === "double") {
      claimer.effects.doubleUntil = now + 8000;
    } else if (effectType === "shield") {
      claimer.effects.shieldCharges = (Number(claimer.effects.shieldCharges) || 0) + 1;
    } else if (effectType === "freeze") {
      const targetId = Array.from(room.participants.keys()).find((id) => id !== socket.id) || null;
      if (targetId) {
        const target = ensurePlayyardPlayer(room, targetId, "Guest");
        if ((Number(target.effects.shieldCharges) || 0) > 0) {
          target.effects.shieldCharges = Math.max(0, Number(target.effects.shieldCharges) - 1);
        } else {
          target.effects.frozenUntil = now + 3500;
        }
      }
    } else if (effectType === "bonus") {
      round.scores[socket.id] = (Number(round.scores[socket.id]) || 0) + 5;
    }

    round.drop.claimedBy = socket.id;
    io.to(roomId).emit("playyard:drop-claimed", {
      dropId: round.drop.id,
      type: effectType,
      by: socket.id
    });
    round.drop = null;
    emitPlayyardState(roomId, room);
  });

  socket.on("chaos-arena:request-state", () => {
    const roomId = socket.data.roomId;
    const room = roomId ? rooms.get(roomId) : null;
    if (!room) return;
    syncChaosArenaParticipants(room);
    emitChaosArenaState(roomId, room, socket.id);
  });

  socket.on("chaos-arena:set-config", ({ map, mode } = {}) => {
    const roomId = socket.data.roomId;
    const room = roomId ? rooms.get(roomId) : null;
    if (!room) return;
    const chaos = syncChaosArenaParticipants(room);
    if (chaos.active) return;
    chaos.map = sanitizeChaosArenaMap(map || chaos.map);
    chaos.mode = sanitizeChaosArenaMode(mode || chaos.mode);
    chaos.modifierId = "";
    chaos.modifierUntil = 0;
    chaos.modeStateUpdatedAt = Date.now();
    emitChaosArenaState(roomId, room);
  });

  socket.on("chaos-arena:start", ({ map, mode } = {}) => {
    const roomId = socket.data.roomId;
    const room = roomId ? rooms.get(roomId) : null;
    if (!room) return;
    startChaosArenaMatch(roomId, room, socket.id, map, mode);
  });

  socket.on("chaos-arena:stop", () => {
    const roomId = socket.data.roomId;
    const room = roomId ? rooms.get(roomId) : null;
    if (!room) return;
    stopChaosArenaMatch(roomId, room, socket.id);
  });

  socket.on("chaos-arena:player-update", ({ x, y, vx, vy, t }) => {
    const roomId = socket.data.roomId;
    const room = roomId ? rooms.get(roomId) : null;
    if (!room) return;
    const chaos = syncChaosArenaParticipants(room);
    if (!chaos.active) return;
    const player = chaos.players[socket.id];
    if (!player || player.eliminated) return;

    player.x = clampRange(x, -2, 2);
    player.y = clampRange(y, -2, 2);
    player.vx = clampRange(vx, -8, 8);
    player.vy = clampRange(vy, -8, 8);
    player.updatedAt = Date.now();

    socket.to(roomId).emit("chaos-arena:player-update", {
      id: socket.id,
      x: player.x,
      y: player.y,
      vx: player.vx,
      vy: player.vy,
      t: Number(t) || player.updatedAt
    });
  });

  socket.on("chaos-arena:dash", ({ dx, dy, x, y, t }) => {
    const roomId = socket.data.roomId;
    const room = roomId ? rooms.get(roomId) : null;
    if (!room) return;
    const chaos = syncChaosArenaParticipants(room);
    if (!chaos.active) return;
    const player = chaos.players[socket.id];
    if (!player || player.eliminated) return;
    player.x = clampRange(x, -2, 2);
    player.y = clampRange(y, -2, 2);

    io.to(roomId).emit("chaos-arena:dash", {
      id: socket.id,
      dx: clampRange(dx, -1.4, 1.4),
      dy: clampRange(dy, -1.4, 1.4),
      x: player.x,
      y: player.y,
      t: Number(t) || Date.now()
    });
  });

  socket.on("chaos-arena:mode-state", ({ modifierId, until, t } = {}) => {
    const roomId = socket.data.roomId;
    const room = roomId ? rooms.get(roomId) : null;
    if (!room) return;
    const chaos = syncChaosArenaParticipants(room);
    if (!chaos.active) return;
    if (socket.id !== chaos.ownerId) return;

    const cleanModifier = sanitizeChaosArenaModifier(modifierId);
    const now = Date.now();
    const parsedUntil = Number(until) || 0;
    const safeUntil = cleanModifier ? clampRange(parsedUntil, now + 500, now + 30_000) : 0;
    chaos.modifierId = cleanModifier;
    chaos.modifierUntil = safeUntil;
    chaos.modeStateUpdatedAt = now;

    io.to(roomId).emit("chaos-arena:mode-state", {
      modifierId: chaos.modifierId,
      until: chaos.modifierUntil,
      t: Number(t) || now
    });
  });

  socket.on("chaos-arena:objective-win", ({ winnerId, reason } = {}) => {
    const roomId = socket.data.roomId;
    const room = roomId ? rooms.get(roomId) : null;
    if (!room) return;
    const chaos = syncChaosArenaParticipants(room);
    if (!chaos.active) return;
    if (socket.id !== chaos.ownerId) return;

    const candidate = String(winnerId || "");
    const resolvedWinner = candidate && chaos.players[candidate] ? candidate : "";
    chaos.active = false;
    chaos.winnerId = resolvedWinner;
    chaos.modifierId = "";
    chaos.modifierUntil = 0;
    chaos.modeStateUpdatedAt = Date.now();

    io.to(roomId).emit("chaos-arena:winner", {
      winnerId: resolvedWinner,
      reason: String(reason || "objective").slice(0, 32),
      endedAt: Date.now()
    });
    emitChaosArenaState(roomId, room);
  });

  socket.on("chaos-arena:eliminated", ({ x, y, t }) => {
    const roomId = socket.data.roomId;
    const room = roomId ? rooms.get(roomId) : null;
    if (!room) return;
    const chaos = syncChaosArenaParticipants(room);
    if (!chaos.active) return;
    const player = chaos.players[socket.id];
    if (!player || player.eliminated) return;

    player.x = clampRange(x, -2, 2);
    player.y = clampRange(y, -2, 2);
    player.eliminated = true;
    player.eliminatedAt = Date.now();

    io.to(roomId).emit("chaos-arena:player-eliminated", {
      id: socket.id,
      x: player.x,
      y: player.y,
      t: Number(t) || player.eliminatedAt
    });
    resolveChaosArenaWinner(roomId, room, "elimination");
  });

  socket.on("disconnect", () => {
    leaveCurrentRoom(socket);
  });
});

server.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`SyncNest running on http://localhost:${PORT}`);
});
