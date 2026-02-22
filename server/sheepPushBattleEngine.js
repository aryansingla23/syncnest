const SHEEP_TYPES = {
  small: { cost: 20, force: 1.35, speed: 0.11, size: 0.06 },
  medium: { cost: 32, force: 2.25, speed: 0.082, size: 0.074 },
  large: { cost: 46, force: 3.9, speed: 0.058, size: 0.09 }
};
const SHEEP_TYPE_KEYS = Object.keys(SHEEP_TYPES);

const LANE_COUNT = 3;
const MATCH_DURATION_MS = 90_000;
const ENERGY_MAX = 100;
const ENERGY_REGEN_PER_SEC = 9;
const TICK_MS = 70;

function clamp(value, min, max) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return min;
  return Math.max(min, Math.min(max, numeric));
}

function makeLane(index) {
  return {
    index,
    sheep: [],
    capturedBy: null,
    capturedAt: 0,
    pushDirection: 0,
    pushStrength: 0,
    impactAt: 0
  };
}

function makePlayer(name) {
  return {
    name: String(name || "Guest").trim() || "Guest",
    energy: ENERGY_MAX,
    energyUpdatedAt: Date.now(),
    spawned: 0,
    nextSheep: "small"
  };
}

function createBattleState() {
  return {
    status: "idle",
    startedAt: 0,
    endsAt: 0,
    winnerSide: null,
    lanes: Array.from({ length: LANE_COUNT }, (_, idx) => makeLane(idx)),
    players: {},
    sides: {
      left: null,
      right: null
    },
    lastTickAt: Date.now(),
    updatedAt: Date.now()
  };
}

function createEngine({ io, rooms }) {
  const battleTickers = new Map();

  function randomSheepType(previousType = "") {
    const cleanPrev = String(previousType || "").trim();
    const pool = SHEEP_TYPE_KEYS.filter((type) => type !== cleanPrev);
    const source = pool.length > 0 ? pool : SHEEP_TYPE_KEYS;
    return source[Math.floor(Math.random() * source.length)] || "small";
  }

  function ensureBattleState(room) {
    if (!room.sheepBattle || typeof room.sheepBattle !== "object") {
      room.sheepBattle = createBattleState();
    }

    const state = room.sheepBattle;
    if (!Array.isArray(state.lanes) || state.lanes.length !== LANE_COUNT) {
      state.lanes = Array.from({ length: LANE_COUNT }, (_, idx) => makeLane(idx));
    }
    if (!state.players || typeof state.players !== "object") {
      state.players = {};
    }
    if (!state.sides || typeof state.sides !== "object") {
      state.sides = { left: null, right: null };
    }
    if (!state.status) {
      state.status = "idle";
    }
    if (!Number.isFinite(Number(state.lastTickAt))) {
      state.lastTickAt = Date.now();
    }
    return state;
  }

  function refreshEnergy(player, now = Date.now()) {
    if (!player) return;
    const prev = Number(player.energyUpdatedAt) || now;
    const dt = Math.max(0, (now - prev) / 1000);
    player.energy = clamp((Number(player.energy) || 0) + dt * ENERGY_REGEN_PER_SEC, 0, ENERGY_MAX);
    player.energyUpdatedAt = now;
  }

  function assignSides(room) {
    const state = ensureBattleState(room);
    const participantIds = Array.from(room.participants.keys());

    Object.keys(state.players).forEach((playerId) => {
      if (!room.participants.has(playerId)) {
        delete state.players[playerId];
      }
    });

    participantIds.forEach((id) => {
      const participant = room.participants.get(id);
      if (!state.players[id]) {
        state.players[id] = makePlayer(participant?.name || "Guest");
      }
      state.players[id].name = String(participant?.name || state.players[id].name || "Guest").trim() || "Guest";
      if (!SHEEP_TYPES[state.players[id].nextSheep]) {
        state.players[id].nextSheep = randomSheepType();
      }
    });

    const [first, second] = participantIds;
    state.sides.left = first || null;
    state.sides.right = second || null;

    return state;
  }

  function getSideForPlayer(state, socketId) {
    if (!socketId) return null;
    if (state.sides.left === socketId) return "left";
    if (state.sides.right === socketId) return "right";
    return null;
  }

  function scoreFromLanes(state) {
    let left = 0;
    let right = 0;
    state.lanes.forEach((lane) => {
      if (lane.capturedBy === "left") left += 1;
      if (lane.capturedBy === "right") right += 1;
    });
    return { left, right };
  }

  function resetBattle(room, now = Date.now()) {
    const state = assignSides(room);
    state.status = "running";
    state.startedAt = now;
    state.endsAt = now + MATCH_DURATION_MS;
    state.winnerSide = null;
    state.lastTickAt = now;
    state.updatedAt = now;
    state.lanes = Array.from({ length: LANE_COUNT }, (_, idx) => makeLane(idx));

    Object.values(state.players).forEach((player) => {
      player.energy = ENERGY_MAX;
      player.energyUpdatedAt = now;
      player.nextSheep = randomSheepType(player.nextSheep);
    });

    return state;
  }

  function stopTicker(roomId) {
    const timer = battleTickers.get(roomId);
    if (timer) {
      clearInterval(timer);
      battleTickers.delete(roomId);
    }
  }

  function ensureTicker(roomId) {
    if (battleTickers.has(roomId)) return;
    const timer = setInterval(() => tickBattle(roomId), TICK_MS);
    battleTickers.set(roomId, timer);
  }

  function resolveLaneForces(lane, now) {
    const leftSheep = lane.sheep.filter((unit) => unit.side === "left");
    const rightSheep = lane.sheep.filter((unit) => unit.side === "right");

    const collidingPairs = [];
    const collidingLeftSet = new Set();
    const collidingRightSet = new Set();

    leftSheep.forEach((leftUnit) => {
      rightSheep.forEach((rightUnit) => {
        const collisionDistance = (Number(leftUnit.size) + Number(rightUnit.size)) * 0.92;
        if (Math.abs(Number(leftUnit.x) - Number(rightUnit.x)) <= collisionDistance) {
          collidingPairs.push({ leftUnit, rightUnit, collisionDistance });
          collidingLeftSet.add(leftUnit);
          collidingRightSet.add(rightUnit);
        }
      });
    });

    if (collidingPairs.length === 0) {
      lane.pushDirection = 0;
      lane.pushStrength = 0;
      return;
    }

    collidingPairs.forEach(({ leftUnit, rightUnit, collisionDistance }) => {
      const leftX = Number(leftUnit.x);
      const rightX = Number(rightUnit.x);
      const middle = (leftX + rightX) / 2;
      const halfGap = collisionDistance * 0.52;
      leftUnit.x = clamp(Math.min(leftX, middle - halfGap), -0.2, 1.2);
      rightUnit.x = clamp(Math.max(rightX, middle + halfGap), -0.2, 1.2);
    });

    const collidingLeft = Array.from(collidingLeftSet);
    const collidingRight = Array.from(collidingRightSet);
    const leftForce = collidingLeft.reduce((sum, unit) => sum + Number(unit.force || 0), 0);
    const rightForce = collidingRight.reduce((sum, unit) => sum + Number(unit.force || 0), 0);
    const diff = leftForce - rightForce;

    if (Math.abs(diff) <= 0.02) {
      lane.pushDirection = 0;
      lane.pushStrength = 0.002;
      lane.impactAt = now;
      return;
    }

    const direction = diff > 0 ? 1 : -1;
    const pushStrength = Math.min(0.028, 0.0048 + Math.abs(diff) * 0.0032);

    collidingLeft.forEach((unit) => {
      unit.x = clamp(Number(unit.x) + pushStrength * direction * 0.45, -0.2, 1.2);
    });
    collidingRight.forEach((unit) => {
      unit.x = clamp(Number(unit.x) + pushStrength * direction * 1.02, -0.2, 1.2);
    });

    lane.pushDirection = direction;
    lane.pushStrength = pushStrength;
    lane.impactAt = now;
  }

  function tickBattle(roomId) {
    const room = rooms.get(roomId);
    if (!room) {
      stopTicker(roomId);
      return;
    }

    const state = assignSides(room);
    const now = Date.now();
    Object.values(state.players).forEach((player) => refreshEnergy(player, now));

    if (state.status !== "running") {
      state.updatedAt = now;
      emitBattleState(roomId, room);
      return;
    }

    const dt = clamp((now - Number(state.lastTickAt || now)) / 1000, 0.03, 0.14);
    state.lastTickAt = now;

    state.lanes.forEach((lane) => {
      if (lane.capturedBy) return;

      lane.sheep.forEach((unit) => {
        const direction = unit.side === "left" ? 1 : -1;
        unit.x = clamp(Number(unit.x) + direction * Number(unit.speed || 0) * dt, -0.3, 1.3);
      });

      resolveLaneForces(lane, now);
      lane.sheep = lane.sheep.filter((unit) => Number(unit.x) >= -0.18 && Number(unit.x) <= 1.18);

      const leftReached = lane.sheep.some((unit) => unit.side === "left" && Number(unit.x) >= 0.985);
      const rightReached = lane.sheep.some((unit) => unit.side === "right" && Number(unit.x) <= 0.015);
      if (leftReached || rightReached) {
        lane.capturedBy = leftReached ? "left" : "right";
        lane.capturedAt = now;
        lane.sheep = [];
        lane.pushStrength = 0;
        lane.impactAt = now;
      }
    });

    const score = scoreFromLanes(state);
    if (score.left >= 2 || score.right >= 2) {
      state.status = "ended";
      state.winnerSide = score.left >= 2 ? "left" : "right";
      state.endsAt = now;
      stopTicker(roomId);
    } else if (now >= Number(state.endsAt || 0)) {
      state.status = "ended";
      state.winnerSide = score.left === score.right ? "draw" : (score.left > score.right ? "left" : "right");
      state.endsAt = now;
      stopTicker(roomId);
    }

    state.updatedAt = now;
    emitBattleState(roomId, room);
  }

  function serializeBattle(room, viewerId) {
    const state = assignSides(room);
    const now = Date.now();
    const score = scoreFromLanes(state);
    const youSide = getSideForPlayer(state, viewerId);

    const leftPlayer = state.sides.left ? state.players[state.sides.left] : null;
    const rightPlayer = state.sides.right ? state.players[state.sides.right] : null;

    const toPlayerPayload = (id, side) => {
      if (!id) return null;
      const player = state.players[id];
      if (!player) return null;
      return {
        id,
        side,
        name: String(player.name || "Guest"),
        energy: Math.round(clamp(Number(player.energy) || 0, 0, ENERGY_MAX)),
        nextSheep: SHEEP_TYPES[player.nextSheep] ? player.nextSheep : randomSheepType(),
        you: id === viewerId
      };
    };

    return {
      status: state.status,
      startedAt: Number(state.startedAt) || 0,
      endsAt: Number(state.endsAt) || 0,
      remainingMs: Math.max(0, Number(state.endsAt || 0) - now),
      winnerSide: state.winnerSide,
      lanes: state.lanes.map((lane) => ({
        index: lane.index,
        capturedBy: lane.capturedBy,
        capturedAt: Number(lane.capturedAt) || 0,
        pushDirection: Number(lane.pushDirection) || 0,
        pushStrength: Number(lane.pushStrength) || 0,
        impactAt: Number(lane.impactAt) || 0,
        sheep: lane.sheep.map((unit) => ({
          id: String(unit.id || ""),
          ownerId: String(unit.ownerId || ""),
          side: unit.side === "right" ? "right" : "left",
          type: String(unit.type || "small"),
          x: clamp(unit.x, -0.2, 1.2),
          size: clamp(unit.size, 0.03, 0.12)
        }))
      })),
      score,
      energy: {
        max: ENERGY_MAX,
        regenPerSec: ENERGY_REGEN_PER_SEC,
        you: youSide ? Math.round(clamp(Number(state.players[state.sides[youSide]]?.energy || 0), 0, ENERGY_MAX)) : 0,
        left: Math.round(clamp(Number(leftPlayer?.energy || 0), 0, ENERGY_MAX)),
        right: Math.round(clamp(Number(rightPlayer?.energy || 0), 0, ENERGY_MAX))
      },
      players: {
        left: toPlayerPayload(state.sides.left, "left"),
        right: toPlayerPayload(state.sides.right, "right")
      },
      nextSheep: youSide ? (state.players[state.sides[youSide]]?.nextSheep || "small") : "small",
      youSide
    };
  }

  function emitBattleState(roomId, room) {
    const participantIds = Array.from(room.participants.keys());
    participantIds.forEach((participantId) => {
      io.to(participantId).emit("sheep:state", {
        battle: serializeBattle(room, participantId)
      });
    });
  }

  function spawnSheep(roomId, room, socketId, laneIndex) {
    const state = assignSides(room);
    const side = getSideForPlayer(state, socketId);
    if (!side) {
      io.to(socketId).emit("sheep:spawn-result", { ok: false, reason: "not-player" });
      return;
    }

    const laneIdx = Number(laneIndex);
    if (!Number.isInteger(laneIdx) || laneIdx < 0 || laneIdx >= LANE_COUNT) {
      io.to(socketId).emit("sheep:spawn-result", { ok: false, reason: "invalid-lane" });
      return;
    }

    const player = state.players[socketId];
    if (!player) {
      io.to(socketId).emit("sheep:spawn-result", { ok: false, reason: "player-missing" });
      return;
    }

    const selectedType = SHEEP_TYPES[player.nextSheep] ? String(player.nextSheep) : randomSheepType();
    const config = SHEEP_TYPES[selectedType] || null;
    if (!config) {
      io.to(socketId).emit("sheep:spawn-result", { ok: false, reason: "invalid-sheep" });
      return;
    }

    const lane = state.lanes[laneIdx];
    if (!lane || lane.capturedBy) {
      io.to(socketId).emit("sheep:spawn-result", { ok: false, reason: "lane-captured" });
      return;
    }

    refreshEnergy(player);
    if (Number(player.energy) < config.cost) {
      io.to(socketId).emit("sheep:spawn-result", { ok: false, reason: "low-energy" });
      return;
    }

    player.energy = clamp(Number(player.energy) - config.cost, 0, ENERGY_MAX);
    player.energyUpdatedAt = Date.now();
    player.spawned = (Number(player.spawned) || 0) + 1;
    player.nextSheep = randomSheepType(selectedType);

    lane.sheep.push({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      ownerId: socketId,
      side,
      type: selectedType,
      force: config.force,
      speed: config.speed,
      size: config.size,
      x: side === "left" ? 0.08 : 0.92
    });
    lane.impactAt = Date.now();

    io.to(roomId).emit("sheep:spawned", {
      by: socketId,
      laneIndex: laneIdx,
      sheepType: selectedType
    });
    emitBattleState(roomId, room);
  }

  function startBattle(roomId, room) {
    const state = resetBattle(room);
    ensureTicker(roomId);
    emitBattleState(roomId, room);
    io.to(roomId).emit("sheep:match-started", {
      startedAt: state.startedAt,
      endsAt: state.endsAt
    });
  }

  function ensureParticipant(roomId, room, socketId, name) {
    const state = assignSides(room);
    if (!state.players[socketId]) {
      state.players[socketId] = makePlayer(name || "Guest");
    }
    state.players[socketId].name = String(name || state.players[socketId].name || "Guest").trim() || "Guest";
    if (!SHEEP_TYPES[state.players[socketId].nextSheep]) {
      state.players[socketId].nextSheep = randomSheepType();
    }
    refreshEnergy(state.players[socketId]);

    if (state.status === "running") {
      emitBattleState(roomId, room);
    }
  }

  function handleParticipantLeft(roomId, room, socketId) {
    const state = ensureBattleState(room);
    state.lanes.forEach((lane) => {
      lane.sheep = lane.sheep.filter((unit) => String(unit.ownerId) !== String(socketId));
    });
    delete state.players[socketId];
    assignSides(room);

    if (room.participants.size === 0) {
      stopTicker(roomId);
      return;
    }

    if (state.status === "running" && room.participants.size < 2) {
      state.status = "ended";
      state.winnerSide = "draw";
      state.endsAt = Date.now();
      stopTicker(roomId);
    }

    emitBattleState(roomId, room);
  }

  function requestState(roomId, room, socketId) {
    const state = ensureBattleState(room);
    Object.values(state.players).forEach((player) => refreshEnergy(player));
    io.to(socketId).emit("sheep:state", {
      battle: serializeBattle(room, socketId)
    });
  }

  function stopBattle(roomId, room, stoppedBy) {
    const state = ensureBattleState(room);
    state.status = "ended";
    state.winnerSide = "draw";
    state.endsAt = Date.now();
    stopTicker(roomId);
    emitBattleState(roomId, room);
    io.to(roomId).emit("sheep:match-stopped", {
      by: stoppedBy,
      stoppedAt: Date.now()
    });
  }

  function attachSocketHandlers(socket) {
    socket.on("sheep:request-state", () => {
      const roomId = socket.data.roomId;
      const room = roomId ? rooms.get(roomId) : null;
      if (!room) return;
      requestState(roomId, room, socket.id);
    });

    socket.on("sheep:start-match", () => {
      const roomId = socket.data.roomId;
      const room = roomId ? rooms.get(roomId) : null;
      if (!room) return;
      startBattle(roomId, room);
    });

    socket.on("sheep:spawn", ({ laneIndex }) => {
      const roomId = socket.data.roomId;
      const room = roomId ? rooms.get(roomId) : null;
      if (!room) return;
      const state = ensureBattleState(room);
      if (state.status !== "running") {
        startBattle(roomId, room);
      }
      spawnSheep(roomId, room, socket.id, laneIndex);
    });

    socket.on("sheep:stop-match", () => {
      const roomId = socket.data.roomId;
      const room = roomId ? rooms.get(roomId) : null;
      if (!room) return;
      stopBattle(roomId, room, socket.id);
    });
  }

  function cleanupRoom(roomId) {
    stopTicker(roomId);
  }

  return {
    attachSocketHandlers,
    ensureParticipant,
    handleParticipantLeft,
    cleanupRoom
  };
}

module.exports = {
  createSheepPushBattleEngine,
  SHEEP_TYPES,
  LANE_COUNT,
  MATCH_DURATION_MS
};

function createSheepPushBattleEngine(deps) {
  return createEngine(deps);
}
