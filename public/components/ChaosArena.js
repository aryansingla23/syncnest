(function initChaosArenaComponent() {
  const TAU = Math.PI * 2;
  const MAX_DT = 0.04;
  const FIXED_STEP = 1 / 60;

  const MAP_ORDER = ["spinnerMayhem", "wobbleTiles", "risingLava", "iceChaos", "knockoutArena"];
  const MODE_ORDER = ["survival", "knockout", "kingOfRing", "chaos"];

  const MAP_CONFIGS = {
    spinnerMayhem: {
      id: "spinnerMayhem",
      label: "Spinner Mayhem",
      shape: "circle",
      radius: 1,
      minRadius: 0.6,
      shrinkStartMs: 40_000,
      shrinkDurationMs: 22_000,
      supportsShrink: true,
      frictionMul: 1,
      playerKnockbackMul: 1,
      obstacleSpeedMul: 1
    },
    wobbleTiles: {
      id: "wobbleTiles",
      label: "Wobble Tiles",
      shape: "square",
      half: 0.95,
      minHalf: 0.7,
      supportsShrink: false,
      frictionMul: 1,
      playerKnockbackMul: 1,
      obstacleSpeedMul: 0.9,
      tileGrid: 7,
      tileDropDelayMs: 2_000
    },
    risingLava: {
      id: "risingLava",
      label: "Rising Lava",
      shape: "square",
      half: 0.95,
      minHalf: 0.76,
      supportsShrink: false,
      frictionMul: 1,
      playerKnockbackMul: 1,
      obstacleSpeedMul: 0.85,
      lavaRiseDurationMs: 58_000,
      lavaStartDelayMs: 3_500
    },
    iceChaos: {
      id: "iceChaos",
      label: "Ice Chaos",
      shape: "circle",
      radius: 0.98,
      minRadius: 0.68,
      shrinkStartMs: 48_000,
      shrinkDurationMs: 25_000,
      supportsShrink: true,
      frictionMul: 0.38,
      playerKnockbackMul: 1.05,
      obstacleSpeedMul: 1.15
    },
    knockoutArena: {
      id: "knockoutArena",
      label: "Knockout Arena",
      shape: "circle",
      radius: 0.74,
      minRadius: 0.74,
      supportsShrink: false,
      frictionMul: 1,
      playerKnockbackMul: 1.5,
      obstacleSpeedMul: 0.9
    }
  };

  const MODE_CONFIGS = {
    survival: {
      id: "survival",
      label: "Survival",
      win: "lastStanding",
      dashCooldownMs: 3_000,
      gravity: 0,
      knockbackMul: 1,
      shrinkSpeedMul: 1,
      obstacleSpeedMul: 1,
      frictionMul: 1,
      accelMul: 1,
      maxSpeedMul: 1,
      durationMs: 0
    },
    knockout: {
      id: "knockout",
      label: "Knockout",
      win: "lastStanding",
      dashCooldownMs: 2_550,
      gravity: 0,
      knockbackMul: 1.45,
      shrinkSpeedMul: 1,
      obstacleSpeedMul: 1.1,
      frictionMul: 1,
      accelMul: 1.05,
      maxSpeedMul: 1.08,
      durationMs: 0
    },
    kingOfRing: {
      id: "kingOfRing",
      label: "King of the Ring",
      win: "score",
      dashCooldownMs: 2_850,
      gravity: 0,
      knockbackMul: 1.1,
      shrinkSpeedMul: 1,
      obstacleSpeedMul: 1,
      frictionMul: 1,
      accelMul: 1,
      maxSpeedMul: 1,
      durationMs: 60_000,
      ringRadius: 0.22,
      scoreRate: 19
    },
    chaos: {
      id: "chaos",
      label: "Chaos",
      win: "lastStanding",
      dashCooldownMs: 2_450,
      gravity: 0,
      knockbackMul: 1.2,
      shrinkSpeedMul: 1.2,
      obstacleSpeedMul: 1.2,
      frictionMul: 0.94,
      accelMul: 1.08,
      maxSpeedMul: 1.1,
      durationMs: 75_000,
      modifierEveryMs: 15_000,
      modifierDurationMs: 10_000
    }
  };

  const CHAOS_MODIFIER_LIST = [
    { id: "reverseControls", label: "Reverse Controls" },
    { id: "speedBoost", label: "Speed Boost" },
    { id: "lowGravity", label: "Low Gravity" },
    { id: "invisiblePlayers", label: "Invisible Players" },
    { id: "doubleKnockback", label: "Double Knockback" }
  ];

  function clamp(value, min, max) {
    const n = Number(value);
    if (!Number.isFinite(n)) return min;
    if (n < min) return min;
    if (n > max) return max;
    return n;
  }

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  function easeOutCubic(t) {
    const p = clamp(t, 0, 1);
    return 1 - Math.pow(1 - p, 3);
  }

  class ChaosArenaSoundBank {
    constructor() {
      this.ctx = null;
      this.master = null;
      this.buffers = {
        dash: null,
        hit: null,
        eliminate: null,
        countdown: null,
        go: null
      };
      this.enabled = true;
    }

    ensureReady() {
      if (!this.enabled) return false;
      if (!this.ctx) {
        const Ctx = window.AudioContext || window.webkitAudioContext;
        if (!Ctx) {
          this.enabled = false;
          return false;
        }
        this.ctx = new Ctx();
        this.master = this.ctx.createGain();
        this.master.gain.value = 0.2;
        this.master.connect(this.ctx.destination);
      }
      if (!this.buffers.dash) {
        this.buildBuffers();
      }
      if (this.ctx.state === "suspended") {
        this.ctx.resume().catch(() => {});
      }
      return true;
    }

    stop() {
      if (!this.ctx) return;
      if (this.ctx.state === "running") {
        this.ctx.suspend().catch(() => {});
      }
    }

    buildBuffer(durationSec, renderer) {
      const ctx = this.ctx;
      const sampleRate = ctx.sampleRate;
      const length = Math.max(1, Math.floor(durationSec * sampleRate));
      const buffer = ctx.createBuffer(1, length, sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < length; i += 1) {
        const t = i / sampleRate;
        data[i] = renderer(t);
      }
      return buffer;
    }

    buildBuffers() {
      this.buffers.dash = this.buildBuffer(0.18, (t) => {
        const env = Math.max(0, 1 - t / 0.18);
        return ((Math.random() * 2 - 1) * 0.55 + Math.sin(2 * Math.PI * (150 + t * 260) * t) * 0.4) * env;
      });

      this.buffers.hit = this.buildBuffer(0.14, (t) => {
        const env = Math.exp(-20 * t);
        return Math.sin(2 * Math.PI * 120 * t) * env * 0.75;
      });

      this.buffers.eliminate = this.buildBuffer(0.3, (t) => {
        const env = Math.max(0, 1 - t / 0.3);
        return (Math.sin(2 * Math.PI * (380 - 260 * t) * t) * 0.75 + (Math.random() * 2 - 1) * 0.22) * env;
      });

      this.buffers.countdown = this.buildBuffer(0.1, (t) => {
        const env = Math.max(0, 1 - t / 0.1);
        return Math.sin(2 * Math.PI * 640 * t) * env * 0.8;
      });

      this.buffers.go = this.buildBuffer(0.18, (t) => {
        const env = Math.max(0, 1 - t / 0.18);
        return (Math.sin(2 * Math.PI * (380 + 240 * t) * t) * 0.82 + Math.sin(2 * Math.PI * 180 * t) * 0.2) * env;
      });
    }

    play(name, volume = 1, rate = 1) {
      if (!this.ensureReady()) return;
      const buffer = this.buffers[name];
      if (!buffer) return;
      const ctx = this.ctx;
      const source = ctx.createBufferSource();
      const gain = ctx.createGain();
      source.buffer = buffer;
      source.playbackRate.value = clamp(rate, 0.45, 2.2);
      gain.gain.value = clamp(volume, 0, 1.2);
      source.connect(gain);
      gain.connect(this.master);
      source.start(0);
      source.onended = () => {
        try {
          source.disconnect();
          gain.disconnect();
        } catch {
          // no-op
        }
      };
    }
  }

  class ChaosArena {
    constructor({ socket, roomId, getSelfId, getPlayerName, onEvent } = {}) {
      this.socket = socket;
      this.roomId = roomId;
      this.getSelfId = typeof getSelfId === "function" ? getSelfId : () => "";
      this.getPlayerName = typeof getPlayerName === "function" ? getPlayerName : () => "Guest";
      this.onEvent = typeof onEvent === "function" ? onEvent : () => {};

      this.wrap = null;
      this.canvas = null;
      this.ctx = null;
      this.mounted = false;
      this.paused = false;
      this.socketBound = false;

      this.width = 960;
      this.height = 460;
      this.dpr = 1;

      this.players = new Map();
      this.meId = "";
      this.ownerId = "";

      this.active = false;
      this.countdownStartAt = 0;
      this.startedAt = 0;
      this.shrinkAt = 0;
      this.winnerId = "";
      this.modeEndAt = 0;
      this.objectiveWinSent = false;

      this.selectedMapId = "spinnerMayhem";
      this.selectedModeId = "survival";
      this.modeModifierId = "";
      this.modeModifierEndsAt = 0;
      this.modeBannerText = "";
      this.modeBannerUntil = 0;
      this.nextChaosModifierAt = 0;

      this.physics = {
        accel: 2.35,
        friction: 2.85,
        maxSpeed: 1.05,
        dashSpeed: 1.95,
        dashCooldownMs: 3_000,
        playerRadius: 0.06,
        collisionCooldownMs: 140,
        baseKnockback: 0.95,
        syncIntervalMs: 80
      };

      this.renderState = {
        arenaScale: 1,
        centerX: 0,
        centerY: 0,
        circleRadius: 1,
        squareHalf: 1,
        shape: "circle",
        shrinking: false,
        lavaTop: 1
      };

      this.inputUp = false;
      this.inputDown = false;
      this.inputLeft = false;
      this.inputRight = false;

      this.rafId = 0;
      this.lastFrameAt = 0;
      this.lastSyncAt = 0;
      this.lastHitSoundAt = 0;
      this.lastCountdownTick = -1;
      this.lastDashAt = 0;
      this.goPlayed = false;

      this.seed = ((Date.now() ^ Math.floor(Math.random() * 1e9)) >>> 0) || 1;
      this.shakePower = 0;
      this.slowMoUntil = 0;

      this.obstacles = [];
      this.tileGrid = 0;
      this.tileState = null;
      this.tileCrackAt = null;
      this.risingPlatforms = [];
      this.lavaTop = 1;

      this.bgParticles = new Array(80);
      for (let i = 0; i < this.bgParticles.length; i += 1) {
        this.bgParticles[i] = {
          x: this.rand(),
          y: this.rand(),
          vx: lerp(-0.005, 0.005, this.rand()),
          vy: lerp(0.01, 0.04, this.rand()),
          size: lerp(0.6, 2.2, this.rand()),
          alpha: lerp(0.12, 0.5, this.rand())
        };
      }

      this.impactBursts = new Array(24);
      for (let i = 0; i < this.impactBursts.length; i += 1) {
        this.impactBursts[i] = {
          active: false,
          x: 0,
          y: 0,
          life: 0,
          maxLife: 0.28,
          size: 0.05,
          hue: 340
        };
      }
      this.impactCursor = 0;

      this.sounds = new ChaosArenaSoundBank();

      this.prevRenderToText = null;
      this.prevAdvanceTime = null;
      this.boundRenderToText = () => this.renderGameToText();
      this.boundAdvanceTime = (ms) => this.advanceTime(ms);

      this.onResizeBound = () => this.resizeCanvas();
      this.onKeyDownBound = (event) => this.onKeyDown(event);
      this.onKeyUpBound = (event) => this.onKeyUp(event);

      this.onStateBound = ({ chaosArena }) => this.onState(chaosArena || {});
      this.onStartedBound = (payload) => this.onStarted(payload || {});
      this.onStoppedBound = () => this.onStopped();
      this.onPlayerUpdateBound = (payload) => this.onPlayerUpdate(payload || {});
      this.onDashBound = (payload) => this.onDash(payload || {});
      this.onEliminatedBound = (payload) => this.onPlayerEliminated(payload || {});
      this.onWinnerBound = (payload) => this.onWinner(payload || {});
      this.onModeStateBound = (payload) => this.onModeState(payload || {});
    }

    rand() {
      this.seed = (this.seed * 1664525 + 1013904223) >>> 0;
      return this.seed / 4294967296;
    }

    currentMap() {
      return MAP_CONFIGS[this.selectedMapId] || MAP_CONFIGS.spinnerMayhem;
    }

    currentMode() {
      return MODE_CONFIGS[this.selectedModeId] || MODE_CONFIGS.survival;
    }

    sanitizeMapId(id) {
      const value = String(id || "").trim();
      return MAP_CONFIGS[value] ? value : "spinnerMayhem";
    }

    sanitizeModeId(id) {
      const value = String(id || "").trim();
      return MODE_CONFIGS[value] ? value : "survival";
    }

    sanitizeModifierId(id) {
      const value = String(id || "").trim();
      return CHAOS_MODIFIER_LIST.some((entry) => entry.id === value) ? value : "";
    }

    modifierLabel(id) {
      const key = this.sanitizeModifierId(id);
      const found = CHAOS_MODIFIER_LIST.find((entry) => entry.id === key);
      return found ? found.label : "";
    }

    isAuthority() {
      return Boolean(this.meId && this.ownerId && this.meId === this.ownerId);
    }

    mount(target) {
      if (!target || this.mounted) return;
      this.mounted = true;
      this.wrap = document.createElement("div");
      this.wrap.className = "chaos-arena-wrap";

      this.canvas = document.createElement("canvas");
      this.canvas.className = "chaos-arena-canvas";
      this.wrap.appendChild(this.canvas);

      target.innerHTML = "";
      target.appendChild(this.wrap);
      this.ctx = this.canvas.getContext("2d", { alpha: false, desynchronized: true });

      this.resizeCanvas();
      this.exposeTestingHooks();

      window.addEventListener("resize", this.onResizeBound);
      window.addEventListener("keydown", this.onKeyDownBound);
      window.addEventListener("keyup", this.onKeyUpBound);

      this.attachSocketListeners();
      this.socket?.emit("chaos-arena:request-state");

      this.lastFrameAt = performance.now();
      this.rafId = requestAnimationFrame((ts) => this.frame(ts));
    }

    unmount() {
      if (!this.mounted) return;
      this.mounted = false;
      cancelAnimationFrame(this.rafId);
      this.rafId = 0;

      window.removeEventListener("resize", this.onResizeBound);
      window.removeEventListener("keydown", this.onKeyDownBound);
      window.removeEventListener("keyup", this.onKeyUpBound);

      this.detachSocketListeners();
      this.restoreTestingHooks();
      this.sounds.stop();

      if (this.wrap?.isConnected) this.wrap.remove();
      this.wrap = null;
      this.canvas = null;
      this.ctx = null;
    }

    destroy() {
      this.detachSocketListeners();
      this.unmount();
    }

    exposeTestingHooks() {
      this.prevRenderToText = window.render_game_to_text;
      this.prevAdvanceTime = window.advanceTime;
      window.render_game_to_text = this.boundRenderToText;
      window.advanceTime = this.boundAdvanceTime;
    }

    restoreTestingHooks() {
      if (window.render_game_to_text === this.boundRenderToText) {
        window.render_game_to_text = this.prevRenderToText || null;
      }
      if (window.advanceTime === this.boundAdvanceTime) {
        window.advanceTime = this.prevAdvanceTime || null;
      }
      this.prevRenderToText = null;
      this.prevAdvanceTime = null;
    }

    setPaused(paused) {
      this.paused = Boolean(paused);
    }

    isMatchActive() {
      return this.active;
    }

    getStatusLine() {
      if (!this.active) {
        return `${this.currentMap().label} • ${this.currentMode().label}`;
      }
      const now = Date.now();
      if (this.startedAt && now < this.startedAt) {
        return `${this.currentMap().label} • ${this.currentMode().label} • starts in ${Math.max(1, Math.ceil((this.startedAt - now) / 1000))}s`;
      }

      const alive = this.countAlivePlayers();
      const mode = this.currentMode();
      if (mode.id === "kingOfRing") {
        const left = this.modeEndAt > now ? Math.max(0, Math.ceil((this.modeEndAt - now) / 1000)) : 0;
        return `${mode.label} • ${alive} alive • ${left}s left`;
      }
      if (mode.id === "chaos") {
        const next = this.nextChaosModifierAt > now ? Math.max(0, Math.ceil((this.nextChaosModifierAt - now) / 1000)) : 0;
        return `${mode.label} • ${alive} alive • next modifier ${next}s`;
      }
      const shrink = this.shrinkAt > now ? Math.max(0, Math.ceil((this.shrinkAt - now) / 1000)) : 0;
      return `${mode.label} • ${alive} alive • shrink ${shrink}s`;
    }

    cycleMap(delta = 1) {
      if (this.active) return;
      const idx = MAP_ORDER.indexOf(this.selectedMapId);
      const nextIndex = (idx + MAP_ORDER.length + delta) % MAP_ORDER.length;
      this.selectedMapId = MAP_ORDER[nextIndex];
      this.socket?.emit("chaos-arena:set-config", { map: this.selectedMapId, mode: this.selectedModeId });
      this.onEvent(`Map set to ${this.currentMap().label}.`);
    }

    cycleMode(delta = 1) {
      if (this.active) return;
      const idx = MODE_ORDER.indexOf(this.selectedModeId);
      const nextIndex = (idx + MODE_ORDER.length + delta) % MODE_ORDER.length;
      this.selectedModeId = MODE_ORDER[nextIndex];
      this.socket?.emit("chaos-arena:set-config", { map: this.selectedMapId, mode: this.selectedModeId });
      this.onEvent(`Mode set to ${this.currentMode().label}.`);
    }

    startMatch() {
      this.sounds.ensureReady();
      this.socket?.emit("chaos-arena:start", {
        map: this.selectedMapId,
        mode: this.selectedModeId
      });
    }

    stopMatch() {
      this.socket?.emit("chaos-arena:stop");
    }

    attachSocketListeners() {
      if (!this.socket || this.socketBound) return;
      this.socketBound = true;
      this.socket.on("chaos-arena:state", this.onStateBound);
      this.socket.on("chaos-arena:started", this.onStartedBound);
      this.socket.on("chaos-arena:stopped", this.onStoppedBound);
      this.socket.on("chaos-arena:player-update", this.onPlayerUpdateBound);
      this.socket.on("chaos-arena:dash", this.onDashBound);
      this.socket.on("chaos-arena:player-eliminated", this.onEliminatedBound);
      this.socket.on("chaos-arena:winner", this.onWinnerBound);
      this.socket.on("chaos-arena:mode-state", this.onModeStateBound);
    }

    detachSocketListeners() {
      if (!this.socket || !this.socketBound) return;
      this.socketBound = false;
      this.socket.off("chaos-arena:state", this.onStateBound);
      this.socket.off("chaos-arena:started", this.onStartedBound);
      this.socket.off("chaos-arena:stopped", this.onStoppedBound);
      this.socket.off("chaos-arena:player-update", this.onPlayerUpdateBound);
      this.socket.off("chaos-arena:dash", this.onDashBound);
      this.socket.off("chaos-arena:player-eliminated", this.onEliminatedBound);
      this.socket.off("chaos-arena:winner", this.onWinnerBound);
      this.socket.off("chaos-arena:mode-state", this.onModeStateBound);
    }

    resizeCanvas() {
      if (!this.wrap || !this.canvas) return;
      const rect = this.wrap.getBoundingClientRect();
      this.width = Math.max(320, Math.floor(rect.width));
      this.height = Math.max(260, Math.floor(rect.height));
      this.dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));

      this.canvas.width = Math.floor(this.width * this.dpr);
      this.canvas.height = Math.floor(this.height * this.dpr);
      this.canvas.style.width = `${this.width}px`;
      this.canvas.style.height = `${this.height}px`;
      if (this.ctx) {
        this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      }
    }

    colorForPlayer(id) {
      const text = String(id || "");
      let hash = 0;
      for (let i = 0; i < text.length; i += 1) {
        hash = ((hash << 5) - hash + text.charCodeAt(i)) | 0;
      }
      const hue = Math.abs(hash) % 360;
      return `hsl(${hue} 88% 62%)`;
    }

    ensurePlayer(id) {
      const key = String(id || "");
      if (!key) return null;
      let player = this.players.get(key);
      if (!player) {
        player = {
          id: key,
          name: this.getPlayerName(key) || "Guest",
          x: 0,
          y: 0,
          vx: 0,
          vy: 0,
          tx: 0,
          ty: 0,
          tvx: 0,
          tvy: 0,
          eliminated: false,
          eliminatedAt: 0,
          color: this.colorForPlayer(key),
          dashFxUntil: 0,
          hitUntil: 0,
          trailX: new Float32Array(10),
          trailY: new Float32Array(10),
          trailHead: 0,
          trailCount: 0,
          score: 0
        };
        this.players.set(key, player);
      }
      return player;
    }

    resetMapState() {
      const map = this.currentMap();
      this.obstacles.length = 0;
      this.tileGrid = 0;
      this.tileState = null;
      this.tileCrackAt = null;
      this.risingPlatforms.length = 0;
      this.lavaTop = map.half || 1;

      if (map.id === "spinnerMayhem") {
        this.obstacles.push({
          type: "rotBar",
          angle: 0,
          speed: 1.1,
          length: 0.75,
          halfWidth: 0.019,
          enabledAt: this.startedAt,
          dir: 1,
          reverseAt: this.startedAt + 6_000
        });
        this.obstacles.push({
          type: "rotBar",
          angle: Math.PI * 0.5,
          speed: 0.92,
          length: 0.67,
          halfWidth: 0.016,
          enabledAt: this.startedAt + 20_000,
          dir: -1,
          reverseAt: this.startedAt + 24_000
        });
      } else if (map.id === "wobbleTiles") {
        const total = map.tileGrid * map.tileGrid;
        this.tileGrid = map.tileGrid;
        this.tileState = new Uint8Array(total);
        this.tileCrackAt = new Float64Array(total);
      } else if (map.id === "risingLava") {
        for (let i = 0; i < 7; i += 1) {
          const row = Math.floor(i / 3);
          const col = i % 3;
          this.risingPlatforms.push({
            x: -0.58 + col * 0.58,
            y: -0.45 + row * 0.38,
            w: 0.34,
            h: 0.11,
            phase: this.rand() * 8,
            cycle: 7.2 + this.rand() * 2.8,
            onWindow: 4.3 + this.rand() * 1.2
          });
        }
      } else if (map.id === "iceChaos") {
        for (let i = 0; i < 4; i += 1) {
          this.obstacles.push({
            type: "bumper",
            orbit: 0.31 + i * 0.09,
            radius: 0.05,
            angle: (i / 4) * TAU,
            speed: 0.72 + i * 0.14,
            x: 0,
            y: 0
          });
        }
      }
    }

    resetMatchState() {
      this.objectiveWinSent = false;
      this.modeModifierId = "";
      this.modeModifierEndsAt = 0;
      this.modeBannerText = "";
      this.modeBannerUntil = 0;
      this.lastCountdownTick = -1;
      this.goPlayed = false;

      const mode = this.currentMode();
      this.modeEndAt = mode.durationMs > 0 ? this.startedAt + mode.durationMs : 0;
      this.nextChaosModifierAt = mode.id === "chaos" ? this.startedAt + mode.modifierEveryMs : 0;

      this.players.forEach((player) => {
        player.eliminated = false;
        player.eliminatedAt = 0;
        player.hitUntil = 0;
        player.dashFxUntil = 0;
        player.score = 0;
        player.trailHead = 0;
        player.trailCount = 0;
        for (let i = 0; i < player.trailX.length; i += 1) {
          player.trailX[i] = player.x;
          player.trailY[i] = player.y;
        }
      });

      this.resetMapState();
    }

    onState(payload) {
      this.active = Boolean(payload?.active);
      this.countdownStartAt = Number(payload?.countdownStartAt) || 0;
      this.startedAt = Number(payload?.startedAt) || 0;
      this.shrinkAt = Number(payload?.shrinkAt) || 0;
      this.winnerId = String(payload?.winnerId || "");
      this.ownerId = String(payload?.ownerId || "");

      this.selectedMapId = this.sanitizeMapId(payload?.map);
      this.selectedModeId = this.sanitizeModeId(payload?.mode);
      this.modeModifierId = this.sanitizeModifierId(payload?.modifierId);
      this.modeModifierEndsAt = Number(payload?.modifierUntil) || 0;

      const mode = this.currentMode();
      this.modeEndAt = mode.durationMs > 0 ? this.startedAt + mode.durationMs : 0;
      if (mode.id === "chaos") {
        this.nextChaosModifierAt = this.startedAt + mode.modifierEveryMs;
      }

      this.meId = String(this.getSelfId() || "");

      const incoming = payload?.players && typeof payload.players === "object" ? payload.players : {};
      Object.entries(incoming).forEach(([id, entry]) => {
        const player = this.ensurePlayer(id);
        if (!player) return;
        player.name = String(entry?.name || this.getPlayerName(id) || player.name || "Guest");
        player.x = Number(entry?.x) || 0;
        player.y = Number(entry?.y) || 0;
        player.vx = Number(entry?.vx) || 0;
        player.vy = Number(entry?.vy) || 0;
        player.tx = player.x;
        player.ty = player.y;
        player.tvx = player.vx;
        player.tvy = player.vy;
        player.eliminated = Boolean(entry?.eliminated);
        player.eliminatedAt = Number(entry?.eliminatedAt) || 0;
        if (Number.isFinite(Number(entry?.score))) {
          player.score = Number(entry.score);
        }
      });

      this.players.forEach((_, id) => {
        if (!incoming[id]) {
          this.players.delete(id);
        }
      });

      if (!this.active) {
        this.lastCountdownTick = -1;
      }
    }

    onStarted(payload) {
      this.active = true;
      this.winnerId = "";
      this.ownerId = String(payload?.ownerId || this.ownerId || "");
      this.countdownStartAt = Number(payload?.countdownStartAt) || Date.now();
      this.startedAt = Number(payload?.startedAt) || Date.now() + 3_000;
      this.shrinkAt = Number(payload?.shrinkAt) || this.startedAt + 40_000;

      this.selectedMapId = this.sanitizeMapId(payload?.map || this.selectedMapId);
      this.selectedModeId = this.sanitizeModeId(payload?.mode || this.selectedModeId);

      this.resetMatchState();
      this.onEvent(`Chaos Arena started on ${this.currentMap().label} (${this.currentMode().label}).`);
    }

    onStopped() {
      this.active = false;
      this.winnerId = "";
      this.modeModifierId = "";
      this.modeModifierEndsAt = 0;
      this.modeBannerUntil = 0;
      this.lastCountdownTick = -1;
      this.onEvent("Chaos Arena stopped.");
    }

    onPlayerUpdate(payload) {
      const id = String(payload?.id || "");
      if (!id || id === this.meId) return;
      const player = this.ensurePlayer(id);
      if (!player || player.eliminated) return;
      player.tx = Number(payload?.x) || 0;
      player.ty = Number(payload?.y) || 0;
      player.tvx = Number(payload?.vx) || 0;
      player.tvy = Number(payload?.vy) || 0;
    }

    onDash(payload) {
      const id = String(payload?.id || "");
      if (!id) return;
      const player = this.ensurePlayer(id);
      if (!player) return;
      player.x = Number(payload?.x) || player.x;
      player.y = Number(payload?.y) || player.y;
      player.tx = player.x;
      player.ty = player.y;
      player.dashFxUntil = performance.now() + 180;
      if (id !== this.meId) {
        this.sounds.play("dash", 0.75);
      }
    }

    onPlayerEliminated(payload) {
      const id = String(payload?.id || "");
      if (!id) return;
      const player = this.ensurePlayer(id);
      if (!player) return;

      player.eliminated = true;
      player.eliminatedAt = Number(payload?.t) || Date.now();
      player.x = Number(payload?.x) || player.x;
      player.y = Number(payload?.y) || player.y;
      player.tx = player.x;
      player.ty = player.y;
      this.spawnImpact(player.x, player.y, 0.09, 8);
      this.shakePower = Math.max(this.shakePower, 0.75);
      this.sounds.play("eliminate", 0.95);

      const alive = this.countAlivePlayers();
      if (alive <= 1) {
        this.slowMoUntil = performance.now() + 900;
      }

      if (id === this.meId) {
        this.onEvent("You were eliminated.");
      }
    }

    onWinner(payload) {
      this.active = false;
      this.winnerId = String(payload?.winnerId || "");
      const winnerName = this.winnerId ? (this.getPlayerName(this.winnerId) || "Player") : "No one";
      this.onEvent(`${winnerName} won Chaos Arena.`);
    }

    onModeState(payload) {
      const modifierId = this.sanitizeModifierId(payload?.modifierId);
      this.modeModifierId = modifierId;
      this.modeModifierEndsAt = Number(payload?.until) || 0;
      if (modifierId) {
        this.modeBannerText = `CHAOS: ${this.modifierLabel(modifierId)}`;
        this.modeBannerUntil = performance.now() + 1700;
      } else {
        this.modeBannerText = "";
        this.modeBannerUntil = 0;
      }
    }

    onKeyDown(event) {
      if (!this.mounted || this.paused) return;
      const code = event.code;
      if (code === "ArrowUp") {
        this.inputUp = true;
      } else if (code === "ArrowDown") {
        this.inputDown = true;
      } else if (code === "ArrowLeft") {
        this.inputLeft = true;
      } else if (code === "ArrowRight") {
        this.inputRight = true;
      } else if (code === "Space") {
        this.tryDash();
      } else if (code === "Enter") {
        if (!this.active) this.startMatch();
      } else if (code === "KeyM") {
        this.cycleMap(1);
      } else if (code === "KeyN") {
        this.cycleMode(1);
      } else {
        return;
      }
      event.preventDefault();
      this.sounds.ensureReady();
    }

    onKeyUp(event) {
      const code = event.code;
      if (code === "ArrowUp") {
        this.inputUp = false;
      } else if (code === "ArrowDown") {
        this.inputDown = false;
      } else if (code === "ArrowLeft") {
        this.inputLeft = false;
      } else if (code === "ArrowRight") {
        this.inputRight = false;
      } else {
        return;
      }
      event.preventDefault();
    }

    countAlivePlayers() {
      let alive = 0;
      for (const player of this.players.values()) {
        if (!player.eliminated) alive += 1;
      }
      return alive;
    }

    getRuntimeModifiers() {
      const mode = this.currentMode();
      const map = this.currentMap();

      let accelMul = mode.accelMul;
      let maxSpeedMul = mode.maxSpeedMul;
      let frictionMul = mode.frictionMul * map.frictionMul;
      let knockbackMul = mode.knockbackMul * map.playerKnockbackMul;
      let obstacleSpeedMul = mode.obstacleSpeedMul * map.obstacleSpeedMul;
      let gravity = mode.gravity;
      let visibility = 1;

      if (this.modeModifierId === "reverseControls") {
        // handled in input mapping
      } else if (this.modeModifierId === "speedBoost") {
        accelMul *= 1.35;
        maxSpeedMul *= 1.24;
      } else if (this.modeModifierId === "lowGravity") {
        gravity -= 0.38;
        frictionMul *= 0.92;
      } else if (this.modeModifierId === "invisiblePlayers") {
        visibility = 0.2;
      } else if (this.modeModifierId === "doubleKnockback") {
        knockbackMul *= 2;
      }

      return {
        accelMul,
        maxSpeedMul,
        frictionMul,
        knockbackMul,
        obstacleSpeedMul,
        gravity,
        visibility,
        dashCooldownMs: mode.dashCooldownMs,
        shrinkSpeedMul: mode.shrinkSpeedMul
      };
    }

    getBoundary(nowMs, runtime) {
      const map = this.currentMap();
      const now = Number(nowMs) || Date.now();
      const result = {
        shape: map.shape,
        circleRadius: map.radius || 1,
        squareHalf: map.half || 1,
        shrinking: false
      };

      if (!this.active || now < this.shrinkAt || !map.supportsShrink) {
        return result;
      }

      const shrinkDuration = Math.max(8_000, (map.shrinkDurationMs || 22_000) / Math.max(0.4, runtime.shrinkSpeedMul));
      const p = clamp((now - this.shrinkAt) / shrinkDuration, 0, 1);
      result.shrinking = true;

      if (result.shape === "circle") {
        const minRadius = Number.isFinite(Number(map.minRadius)) ? map.minRadius : result.circleRadius;
        result.circleRadius = lerp(result.circleRadius, minRadius, easeOutCubic(p));
      } else {
        const minHalf = Number.isFinite(Number(map.minHalf)) ? map.minHalf : result.squareHalf;
        result.squareHalf = lerp(result.squareHalf, minHalf, easeOutCubic(p));
      }

      return result;
    }

    distancePointToSegment(px, py, ax, ay, bx, by) {
      const abx = bx - ax;
      const aby = by - ay;
      const apx = px - ax;
      const apy = py - ay;
      const abLenSq = abx * abx + aby * aby;
      let t = 0;
      if (abLenSq > 0.000001) {
        t = (apx * abx + apy * aby) / abLenSq;
      }
      if (t < 0) t = 0;
      else if (t > 1) t = 1;
      const cx = ax + abx * t;
      const cy = ay + aby * t;
      const dx = px - cx;
      const dy = py - cy;
      return {
        dist: Math.sqrt(dx * dx + dy * dy),
        cx,
        cy
      };
    }

    tryDash() {
      const now = performance.now();
      const runtime = this.getRuntimeModifiers();
      const dashCooldownMs = runtime.dashCooldownMs;
      if (!this.active || now < this.lastDashAt + dashCooldownMs) return;

      const me = this.ensurePlayer(this.meId);
      if (!me || me.eliminated) return;

      let dirX = me.vx;
      let dirY = me.vy;
      const reverse = this.modeModifierId === "reverseControls";
      const inputX = ((this.inputRight ? 1 : 0) - (this.inputLeft ? 1 : 0)) * (reverse ? -1 : 1);
      const inputY = ((this.inputDown ? 1 : 0) - (this.inputUp ? 1 : 0)) * (reverse ? -1 : 1);

      if (Math.abs(dirX) + Math.abs(dirY) < 0.001) {
        dirX = inputX;
        dirY = inputY;
      }

      let length = Math.hypot(dirX, dirY);
      if (length < 0.001) {
        dirX = 1;
        dirY = 0;
        length = 1;
      }

      dirX /= length;
      dirY /= length;

      me.vx += dirX * this.physics.dashSpeed;
      me.vy += dirY * this.physics.dashSpeed;
      me.dashFxUntil = now + 180;
      this.lastDashAt = now;
      this.spawnImpact(me.x, me.y, 0.08, 6);
      this.shakePower = Math.max(this.shakePower, 0.25);
      this.sounds.play("dash", 1);

      this.socket?.emit("chaos-arena:dash", {
        dx: Number(dirX.toFixed(3)),
        dy: Number(dirY.toFixed(3)),
        x: Number(me.x.toFixed(4)),
        y: Number(me.y.toFixed(4)),
        t: Date.now()
      });
    }

    eliminateMe() {
      const me = this.ensurePlayer(this.meId);
      if (!me || me.eliminated) return;
      me.eliminated = true;
      me.eliminatedAt = Date.now();
      this.sounds.play("eliminate", 0.95);
      this.socket?.emit("chaos-arena:eliminated", {
        x: Number(me.x.toFixed(4)),
        y: Number(me.y.toFixed(4)),
        t: me.eliminatedAt
      });
    }

    spawnImpact(x, y, size = 0.05, hue = 330) {
      const burst = this.impactBursts[this.impactCursor];
      this.impactCursor = (this.impactCursor + 1) % this.impactBursts.length;
      burst.active = true;
      burst.x = x;
      burst.y = y;
      burst.life = 0;
      burst.maxLife = 0.2 + this.rand() * 0.18;
      burst.size = size;
      burst.hue = hue;
    }

    pushTrail(player) {
      const index = player.trailHead;
      player.trailX[index] = player.x;
      player.trailY[index] = player.y;
      player.trailHead = (index + 1) % player.trailX.length;
      if (player.trailCount < player.trailX.length) player.trailCount += 1;
    }

    updateObstacleSystem(dt, now, runtime) {
      const modeSpeed = runtime.obstacleSpeedMul;

      for (let i = 0; i < this.obstacles.length; i += 1) {
        const obstacle = this.obstacles[i];
        if (obstacle.type === "rotBar") {
          if (now < obstacle.enabledAt) continue;
          obstacle.angle += obstacle.speed * obstacle.dir * modeSpeed * dt;
          if (now >= obstacle.reverseAt) {
            obstacle.dir *= -1;
            obstacle.reverseAt = now + 4_800 + this.rand() * 6_500;
          }
        } else if (obstacle.type === "bumper") {
          obstacle.angle += obstacle.speed * modeSpeed * dt;
          obstacle.x = Math.cos(obstacle.angle) * obstacle.orbit;
          obstacle.y = Math.sin(obstacle.angle) * obstacle.orbit;
        }
      }

      if (this.currentMap().id === "wobbleTiles" && this.tileState && this.tileCrackAt) {
        for (let i = 0; i < this.tileState.length; i += 1) {
          if (this.tileState[i] !== 1) continue;
          if (now - this.tileCrackAt[i] >= this.currentMap().tileDropDelayMs) {
            this.tileState[i] = 2;
          }
        }
      }

      if (this.currentMap().id === "risingLava") {
        const map = this.currentMap();
        const elapsed = Math.max(0, now - this.startedAt - map.lavaStartDelayMs);
        const p = clamp(elapsed / map.lavaRiseDurationMs, 0, 1);
        const startTop = map.half + 0.12;
        const endTop = -map.half * 0.72;
        this.lavaTop = lerp(startTop, endTop, easeOutCubic(p));
      }
    }

    crackTileAt(x, y, now) {
      if (!this.tileState || !this.tileCrackAt || !this.tileGrid) return;
      const map = this.currentMap();
      const half = map.half;
      const size = (half * 2) / this.tileGrid;
      const gx = Math.floor((x + half) / size);
      const gy = Math.floor((y + half) / size);
      if (gx < 0 || gy < 0 || gx >= this.tileGrid || gy >= this.tileGrid) return;
      const idx = gy * this.tileGrid + gx;
      if (this.tileState[idx] === 0) {
        this.tileState[idx] = 1;
        this.tileCrackAt[idx] = now;
      }
    }

    tileUnderPlayerState(x, y) {
      if (!this.tileState || !this.tileGrid) return 0;
      const map = this.currentMap();
      const half = map.half;
      const size = (half * 2) / this.tileGrid;
      const gx = Math.floor((x + half) / size);
      const gy = Math.floor((y + half) / size);
      if (gx < 0 || gy < 0 || gx >= this.tileGrid || gy >= this.tileGrid) return 2;
      return this.tileState[gy * this.tileGrid + gx];
    }

    insideRect(px, py, rx, ry, rw, rh) {
      return px >= rx - rw * 0.5 && px <= rx + rw * 0.5 && py >= ry - rh * 0.5 && py <= ry + rh * 0.5;
    }

    resolveObstacleCollision(me, now, runtime) {
      const pr = this.physics.playerRadius;
      const knockback = this.physics.baseKnockback * runtime.knockbackMul;

      for (let i = 0; i < this.obstacles.length; i += 1) {
        const obstacle = this.obstacles[i];
        if (obstacle.type === "rotBar") {
          if (now < obstacle.enabledAt) continue;
          const cos = Math.cos(obstacle.angle);
          const sin = Math.sin(obstacle.angle);
          const halfLength = obstacle.length;
          const ax = -cos * halfLength;
          const ay = -sin * halfLength;
          const bx = cos * halfLength;
          const by = sin * halfLength;
          const nearest = this.distancePointToSegment(me.x, me.y, ax, ay, bx, by);
          const hitRadius = pr + obstacle.halfWidth;

          if (nearest.dist <= hitRadius && now > me.hitUntil) {
            let nx = me.x - nearest.cx;
            let ny = me.y - nearest.cy;
            let nLen = Math.hypot(nx, ny);
            if (nLen < 0.0001) {
              nx = -sin;
              ny = cos;
              nLen = 1;
            }
            nx /= nLen;
            ny /= nLen;

            me.vx += nx * knockback;
            me.vy += ny * knockback;
            const push = hitRadius - nearest.dist + 0.004;
            me.x += nx * push;
            me.y += ny * push;
            me.hitUntil = now + this.physics.collisionCooldownMs;

            this.spawnImpact(me.x, me.y, 0.07, 352);
            this.shakePower = Math.max(this.shakePower, 0.28);
            if (now - this.lastHitSoundAt > 80) {
              this.lastHitSoundAt = now;
              this.sounds.play("hit", 0.65);
            }
          }
        } else if (obstacle.type === "bumper") {
          const dx = me.x - obstacle.x;
          const dy = me.y - obstacle.y;
          const d = Math.hypot(dx, dy);
          const hit = obstacle.radius + pr;
          if (d < hit && now > me.hitUntil) {
            const nx = d > 0.0001 ? dx / d : 1;
            const ny = d > 0.0001 ? dy / d : 0;
            const penetration = hit - d;
            me.x += nx * (penetration + 0.002);
            me.y += ny * (penetration + 0.002);
            me.vx += nx * knockback * 1.2;
            me.vy += ny * knockback * 1.2;
            me.hitUntil = now + this.physics.collisionCooldownMs;

            this.spawnImpact(me.x, me.y, 0.08, 190);
            this.shakePower = Math.max(this.shakePower, 0.32);
            if (now - this.lastHitSoundAt > 90) {
              this.lastHitSoundAt = now;
              this.sounds.play("hit", 0.62, 1.05);
            }
          }
        }
      }
    }

    resolvePlayerCollision(me, now, runtime) {
      const pr = this.physics.playerRadius;
      const myId = this.meId;
      if (!myId) return;

      for (const [id, other] of this.players.entries()) {
        if (id === myId || other.eliminated) continue;
        const dx = me.x - other.x;
        const dy = me.y - other.y;
        const dist = Math.hypot(dx, dy);
        const minDist = pr * 2;
        if (dist >= minDist || now <= me.hitUntil) continue;

        const nx = dist > 0.0001 ? dx / dist : (this.rand() > 0.5 ? 1 : -1);
        const ny = dist > 0.0001 ? dy / dist : 0;
        const penetration = minDist - dist;
        const knockback = this.physics.baseKnockback * runtime.knockbackMul;

        me.x += nx * (penetration * 0.7 + 0.002);
        me.y += ny * (penetration * 0.7 + 0.002);
        me.vx += nx * knockback;
        me.vy += ny * knockback;
        me.hitUntil = now + this.physics.collisionCooldownMs;

        this.spawnImpact((me.x + other.x) * 0.5, (me.y + other.y) * 0.5, 0.06, 280);
        this.shakePower = Math.max(this.shakePower, 0.22);
        if (now - this.lastHitSoundAt > 95) {
          this.lastHitSoundAt = now;
          this.sounds.play("hit", 0.55, 0.95);
        }
      }
    }

    checkMapHazards(me, now) {
      const map = this.currentMap();
      if (map.id === "wobbleTiles") {
        this.crackTileAt(me.x, me.y, now);
        const tileState = this.tileUnderPlayerState(me.x, me.y);
        if (tileState === 2) {
          this.eliminateMe();
          return;
        }
      } else if (map.id === "risingLava") {
        if (me.y + this.physics.playerRadius >= this.lavaTop) {
          this.eliminateMe();
          return;
        }
        const elapsedSec = Math.max(0, (now - this.startedAt) / 1000);
        for (let i = 0; i < this.risingPlatforms.length; i += 1) {
          const platform = this.risingPlatforms[i];
          const active = ((elapsedSec + platform.phase) % platform.cycle) <= platform.onWindow;
          if (!active && this.insideRect(me.x, me.y, platform.x, platform.y, platform.w, platform.h)) {
            this.eliminateMe();
            return;
          }
        }
      }
    }

    enforceBoundary(me, boundary) {
      const radius = this.physics.playerRadius;
      if (boundary.shape === "circle") {
        const d = Math.hypot(me.x, me.y);
        if (d > boundary.circleRadius + radius * 0.15) {
          this.eliminateMe();
        }
      } else {
        if (
          me.x < -boundary.squareHalf - radius * 0.12 ||
          me.x > boundary.squareHalf + radius * 0.12 ||
          me.y < -boundary.squareHalf - radius * 0.12 ||
          me.y > boundary.squareHalf + radius * 0.12
        ) {
          this.eliminateMe();
        }
      }
    }

    updateLocalPlayer(dt, now, runtime, boundary) {
      const me = this.ensurePlayer(this.meId);
      if (!me || me.eliminated) return;

      const reverse = this.modeModifierId === "reverseControls";
      const inputX = ((this.inputRight ? 1 : 0) - (this.inputLeft ? 1 : 0)) * (reverse ? -1 : 1);
      const inputY = ((this.inputDown ? 1 : 0) - (this.inputUp ? 1 : 0)) * (reverse ? -1 : 1);

      let dirX = inputX;
      let dirY = inputY;
      const dirLen = Math.hypot(dirX, dirY);
      if (dirLen > 0.0001) {
        dirX /= dirLen;
        dirY /= dirLen;
      }

      me.vx += dirX * this.physics.accel * runtime.accelMul * dt;
      me.vy += dirY * this.physics.accel * runtime.accelMul * dt;
      me.vy += runtime.gravity * dt;

      const friction = Math.max(0.2, this.physics.friction * runtime.frictionMul);
      const frictionMul = Math.max(0, 1 - friction * dt);
      me.vx *= frictionMul;
      me.vy *= frictionMul;

      const maxSpeed = this.physics.maxSpeed * runtime.maxSpeedMul;
      const speed = Math.hypot(me.vx, me.vy);
      if (speed > maxSpeed) {
        const ratio = maxSpeed / speed;
        me.vx *= ratio;
        me.vy *= ratio;
      }

      me.x += me.vx * dt;
      me.y += me.vy * dt;

      this.resolveObstacleCollision(me, now, runtime);
      this.resolvePlayerCollision(me, now, runtime);
      this.checkMapHazards(me, now);
      this.enforceBoundary(me, boundary);
      this.pushTrail(me);

      if (now - this.lastSyncAt >= this.physics.syncIntervalMs) {
        this.lastSyncAt = now;
        this.socket?.emit("chaos-arena:player-update", {
          x: Number(me.x.toFixed(4)),
          y: Number(me.y.toFixed(4)),
          vx: Number(me.vx.toFixed(4)),
          vy: Number(me.vy.toFixed(4)),
          t: Date.now()
        });
      }
    }

    updateRemotePlayers(dt) {
      const blend = Math.min(1, dt * 10.5);
      for (const [id, player] of this.players.entries()) {
        if (id === this.meId || player.eliminated) continue;
        player.x += (player.tx - player.x) * blend;
        player.y += (player.ty - player.y) * blend;
        player.vx += (player.tvx - player.vx) * blend;
        player.vy += (player.tvy - player.vy) * blend;
        this.pushTrail(player);
      }
    }

    pickChaosModifier() {
      if (CHAOS_MODIFIER_LIST.length <= 1) return CHAOS_MODIFIER_LIST[0]?.id || "";
      const current = this.modeModifierId;
      let picked = current;
      let safe = 0;
      while (picked === current && safe < 8) {
        safe += 1;
        const idx = Math.floor(this.rand() * CHAOS_MODIFIER_LIST.length);
        picked = CHAOS_MODIFIER_LIST[idx].id;
      }
      return picked;
    }

    broadcastModifier(modifierId, until) {
      this.socket?.emit("chaos-arena:mode-state", {
        modifierId,
        until,
        t: Date.now()
      });
    }

    maybeEmitObjectiveWinner(reason = "objective") {
      if (!this.isAuthority() || !this.active || this.objectiveWinSent) return;
      let winnerId = "";
      if (this.currentMode().id === "kingOfRing") {
        let bestScore = -Infinity;
        for (const [id, player] of this.players.entries()) {
          const score = Number(player.score) || 0;
          if (score > bestScore) {
            bestScore = score;
            winnerId = id;
          }
        }
      } else {
        let alive = null;
        for (const [id, player] of this.players.entries()) {
          if (!player.eliminated) {
            alive = id;
            break;
          }
        }
        winnerId = alive || "";
      }
      this.objectiveWinSent = true;
      this.socket?.emit("chaos-arena:objective-win", {
        winnerId,
        reason
      });
    }

    updateModeSystem(dt, now) {
      if (!this.active || now < this.startedAt) return;
      const mode = this.currentMode();

      if (mode.id === "kingOfRing") {
        const radius = mode.ringRadius;
        const rate = mode.scoreRate;
        for (const player of this.players.values()) {
          if (player.eliminated) continue;
          const inRing = Math.hypot(player.x, player.y) <= radius;
          if (inRing) {
            player.score += rate * dt;
          }
        }
      }

      if (mode.id === "chaos" && this.isAuthority()) {
        if (now >= this.nextChaosModifierAt) {
          this.nextChaosModifierAt = now + mode.modifierEveryMs;
          const modifierId = this.pickChaosModifier();
          const until = now + mode.modifierDurationMs;
          this.broadcastModifier(modifierId, until);
        }
        if (this.modeModifierId && now > this.modeModifierEndsAt + 100) {
          this.broadcastModifier("", 0);
        }
      }

      if (mode.durationMs > 0 && now >= this.modeEndAt) {
        this.maybeEmitObjectiveWinner("timer");
      }
    }

    updateEffects(dt) {
      if (this.shakePower > 0) {
        this.shakePower = Math.max(0, this.shakePower - dt * 1.8);
      }

      for (let i = 0; i < this.bgParticles.length; i += 1) {
        const p = this.bgParticles[i];
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        if (p.x < -0.06) p.x = 1.05;
        else if (p.x > 1.06) p.x = -0.05;
        if (p.y > 1.08) {
          p.y = -0.06;
          p.x = this.rand();
        }
      }

      for (let i = 0; i < this.impactBursts.length; i += 1) {
        const burst = this.impactBursts[i];
        if (!burst.active) continue;
        burst.life += dt;
        if (burst.life >= burst.maxLife) {
          burst.active = false;
        }
      }
    }

    worldToScreen(x, y) {
      return {
        x: this.renderState.centerX + x * this.renderState.arenaScale,
        y: this.renderState.centerY + y * this.renderState.arenaScale
      };
    }

    drawBackground(now) {
      const ctx = this.ctx;
      const width = this.width;
      const height = this.height;

      const time = now * 0.00035;
      const g = ctx.createLinearGradient(0, 0, width, height);
      g.addColorStop(0, `hsl(${220 + Math.sin(time) * 16} 62% 10%)`);
      g.addColorStop(0.5, `hsl(${242 + Math.cos(time * 0.9) * 24} 56% 14%)`);
      g.addColorStop(1, `hsl(${280 + Math.sin(time * 1.2) * 20} 50% 12%)`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, width, height);

      const haze = ctx.createRadialGradient(width * 0.5, height * 0.6, 30, width * 0.5, height * 0.6, Math.max(width, height) * 0.78);
      haze.addColorStop(0, "rgba(122,171,255,0.22)");
      haze.addColorStop(1, "rgba(4,9,18,0)");
      ctx.fillStyle = haze;
      ctx.fillRect(0, 0, width, height);

      for (let i = 0; i < this.bgParticles.length; i += 1) {
        const p = this.bgParticles[i];
        ctx.globalAlpha = p.alpha;
        ctx.fillStyle = "#d8ebff";
        ctx.beginPath();
        ctx.arc(p.x * width, p.y * height, p.size, 0, TAU);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }

    drawArena(boundary, now) {
      const ctx = this.ctx;
      const map = this.currentMap();
      const cx = this.width * 0.5;
      const cy = this.height * 0.56;
      const scale = Math.min(this.width, this.height) * 0.34;

      this.renderState.centerX = cx;
      this.renderState.centerY = cy;
      this.renderState.arenaScale = scale;
      this.renderState.shape = boundary.shape;
      this.renderState.circleRadius = boundary.circleRadius;
      this.renderState.squareHalf = boundary.squareHalf;
      this.renderState.shrinking = boundary.shrinking;
      this.renderState.lavaTop = this.lavaTop;

      if (boundary.shape === "circle") {
        ctx.beginPath();
        ctx.arc(cx, cy, scale * boundary.circleRadius * 1.03, 0, TAU);
        ctx.fillStyle = "rgba(12,20,38,0.9)";
        ctx.fill();
      } else {
        const halfPx = scale * boundary.squareHalf;
        ctx.fillStyle = "rgba(12,20,38,0.9)";
        ctx.fillRect(cx - halfPx, cy - halfPx, halfPx * 2, halfPx * 2);
      }

      if (map.id === "wobbleTiles" && this.tileState && this.tileGrid) {
        const half = map.half;
        const tileSize = (half * 2) / this.tileGrid;
        const pxSize = tileSize * scale;

        for (let gy = 0; gy < this.tileGrid; gy += 1) {
          for (let gx = 0; gx < this.tileGrid; gx += 1) {
            const idx = gy * this.tileGrid + gx;
            const state = this.tileState[idx];
            if (state === 2) continue;

            const x = -half + gx * tileSize + tileSize * 0.5;
            const y = -half + gy * tileSize + tileSize * 0.5;
            const pos = this.worldToScreen(x, y);

            let shakeX = 0;
            let shakeY = 0;
            if (state === 1) {
              const t = (now - this.tileCrackAt[idx]) / map.tileDropDelayMs;
              const amp = (0.4 + t * 0.9) * 1.2;
              shakeX = Math.sin((now * 0.03) + idx) * amp;
              shakeY = Math.cos((now * 0.028) + idx * 0.6) * amp;
            }

            ctx.fillStyle = state === 1 ? "rgba(255,126,168,0.5)" : "rgba(122,188,255,0.26)";
            ctx.fillRect(pos.x - pxSize * 0.5 + shakeX, pos.y - pxSize * 0.5 + shakeY, pxSize - 2, pxSize - 2);
          }
        }
      }

      if (map.id === "risingLava") {
        const halfPx = scale * boundary.squareHalf;
        const lavaTopPx = cy + this.lavaTop * scale;
        const lavaHeight = (cy + halfPx) - lavaTopPx;
        if (lavaHeight > 0) {
          const lavaGradient = ctx.createLinearGradient(0, lavaTopPx, 0, cy + halfPx);
          lavaGradient.addColorStop(0, "rgba(255,98,58,0.42)");
          lavaGradient.addColorStop(1, "rgba(230,24,12,0.9)");
          ctx.fillStyle = lavaGradient;
          ctx.fillRect(cx - halfPx, lavaTopPx, halfPx * 2, lavaHeight);
        }

        const elapsedSec = Math.max(0, (now - this.startedAt) / 1000);
        for (let i = 0; i < this.risingPlatforms.length; i += 1) {
          const p = this.risingPlatforms[i];
          const active = ((elapsedSec + p.phase) % p.cycle) <= p.onWindow;
          const pos = this.worldToScreen(p.x, p.y);
          ctx.fillStyle = active ? "rgba(164,214,255,0.5)" : "rgba(245,88,78,0.26)";
          ctx.fillRect(pos.x - (p.w * scale) / 2, pos.y - (p.h * scale) / 2, p.w * scale, p.h * scale);
        }
      }

      if (map.id === "iceChaos") {
        ctx.fillStyle = "rgba(192,228,255,0.08)";
        ctx.beginPath();
        ctx.arc(cx, cy, scale * boundary.circleRadius * 0.98, 0, TAU);
        ctx.fill();
      }

      if (boundary.shape === "circle") {
        const pulse = boundary.shrinking ? (0.55 + Math.sin(now * 0.01) * 0.45) : 0;
        ctx.beginPath();
        ctx.arc(cx, cy, scale * boundary.circleRadius, 0, TAU);
        ctx.strokeStyle = boundary.shrinking ? `rgba(255,88,104,${0.5 + pulse * 0.45})` : "rgba(255,170,220,0.92)";
        ctx.shadowColor = boundary.shrinking ? "rgba(255,84,102,0.56)" : "rgba(255,120,198,0.42)";
        ctx.shadowBlur = boundary.shrinking ? 22 : 16;
        ctx.lineWidth = 3;
        ctx.stroke();
        ctx.shadowBlur = 0;
      } else {
        const pulse = boundary.shrinking ? (0.55 + Math.sin(now * 0.01) * 0.45) : 0;
        const halfPx = scale * boundary.squareHalf;
        ctx.strokeStyle = boundary.shrinking ? `rgba(255,88,104,${0.5 + pulse * 0.45})` : "rgba(255,170,220,0.9)";
        ctx.shadowColor = boundary.shrinking ? "rgba(255,84,102,0.56)" : "rgba(255,120,198,0.42)";
        ctx.shadowBlur = boundary.shrinking ? 22 : 16;
        ctx.lineWidth = 3;
        ctx.strokeRect(cx - halfPx, cy - halfPx, halfPx * 2, halfPx * 2);
        ctx.shadowBlur = 0;

        if (map.id === "risingLava") {
          const glow = ctx.createLinearGradient(0, this.height, 0, this.height * 0.58);
          glow.addColorStop(0, "rgba(255,48,32,0.24)");
          glow.addColorStop(1, "rgba(255,48,32,0)");
          ctx.fillStyle = glow;
          ctx.fillRect(0, this.height * 0.52, this.width, this.height * 0.48);
        }
      }
    }

    drawObstacles(now) {
      const ctx = this.ctx;
      const scale = this.renderState.arenaScale;
      const cx = this.renderState.centerX;
      const cy = this.renderState.centerY;

      for (let i = 0; i < this.obstacles.length; i += 1) {
        const obstacle = this.obstacles[i];
        if (obstacle.type === "rotBar") {
          if (now < obstacle.enabledAt) continue;
          const barLen = scale * obstacle.length;
          const halfW = scale * obstacle.halfWidth;
          ctx.save();
          ctx.translate(cx, cy);
          ctx.rotate(obstacle.angle);
          ctx.fillStyle = "rgba(255,112,160,0.9)";
          ctx.fillRect(-barLen, -halfW, barLen * 2, halfW * 2);
          ctx.fillStyle = "rgba(255,255,255,0.22)";
          ctx.fillRect(-barLen, -halfW * 0.22, barLen * 2, halfW * 0.44);
          ctx.restore();
        } else if (obstacle.type === "bumper") {
          const pos = this.worldToScreen(obstacle.x, obstacle.y);
          const pr = obstacle.radius * scale;
          ctx.beginPath();
          ctx.arc(pos.x, pos.y, pr * 1.2, 0, TAU);
          ctx.fillStyle = "rgba(146,210,255,0.24)";
          ctx.fill();

          ctx.beginPath();
          ctx.arc(pos.x, pos.y, pr, 0, TAU);
          ctx.fillStyle = "rgba(126,198,255,0.9)";
          ctx.fill();
          ctx.strokeStyle = "rgba(230,247,255,0.85)";
          ctx.lineWidth = 2;
          ctx.stroke();
        }
      }
    }

    drawPlayers(now, runtime) {
      const ctx = this.ctx;
      const scale = this.renderState.arenaScale;
      const meId = this.meId;

      for (const [id, player] of this.players.entries()) {
        const pos = this.worldToScreen(player.x, player.y);
        const pr = this.physics.playerRadius * scale;
        const isMe = id === meId;

        if (player.trailCount > 1) {
          const count = player.trailCount;
          for (let i = 0; i < count - 1; i += 1) {
            const idxA = (player.trailHead - 1 - i + player.trailX.length) % player.trailX.length;
            const idxB = (player.trailHead - 2 - i + player.trailX.length) % player.trailX.length;
            const pa = this.worldToScreen(player.trailX[idxA], player.trailY[idxA]);
            const pb = this.worldToScreen(player.trailX[idxB], player.trailY[idxB]);
            const alpha = (1 - i / count) * (isMe ? 0.28 : 0.18);
            ctx.strokeStyle = isMe ? `rgba(126,228,255,${alpha})` : `rgba(255,255,255,${alpha * 0.75})`;
            ctx.lineWidth = Math.max(1, pr * 0.24 * (1 - i / count));
            ctx.beginPath();
            ctx.moveTo(pa.x, pa.y);
            ctx.lineTo(pb.x, pb.y);
            ctx.stroke();
          }
        }

        ctx.globalAlpha = (!isMe && this.modeModifierId === "invisiblePlayers") ? runtime.visibility : 1;

        ctx.fillStyle = "rgba(7,12,22,0.35)";
        ctx.beginPath();
        ctx.ellipse(pos.x, pos.y + pr * 1.15, pr * 0.95, pr * 0.46, 0, 0, TAU);
        ctx.fill();

        if (player.dashFxUntil > now) {
          const pulse = (player.dashFxUntil - now) / 180;
          ctx.beginPath();
          ctx.arc(pos.x, pos.y, pr * (1.8 + (1 - pulse) * 0.6), 0, TAU);
          ctx.strokeStyle = "rgba(125,226,255,0.6)";
          ctx.lineWidth = 2;
          ctx.stroke();
        }

        ctx.beginPath();
        ctx.arc(pos.x, pos.y, pr, 0, TAU);
        ctx.fillStyle = player.eliminated ? "rgba(144,151,169,0.52)" : (isMe ? "#7ee4ff" : player.color);
        ctx.fill();

        ctx.lineWidth = isMe ? 2.5 : 1.6;
        ctx.strokeStyle = isMe ? "#d2f6ff" : "rgba(255,255,255,0.58)";
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(pos.x, pos.y, pr * 1.38, 0, TAU);
        ctx.strokeStyle = isMe ? "rgba(126,228,255,0.26)" : "rgba(255,255,255,0.16)";
        ctx.lineWidth = 1.2;
        ctx.stroke();

        if (player.eliminated) {
          ctx.beginPath();
          ctx.moveTo(pos.x - pr * 0.52, pos.y - pr * 0.52);
          ctx.lineTo(pos.x + pr * 0.52, pos.y + pr * 0.52);
          ctx.moveTo(pos.x + pr * 0.52, pos.y - pr * 0.52);
          ctx.lineTo(pos.x - pr * 0.52, pos.y + pr * 0.52);
          ctx.strokeStyle = "rgba(24,32,52,0.9)";
          ctx.lineWidth = 2;
          ctx.stroke();
        }

        ctx.globalAlpha = 1;
      }
    }

    drawImpacts() {
      const ctx = this.ctx;
      const scale = this.renderState.arenaScale;

      for (let i = 0; i < this.impactBursts.length; i += 1) {
        const burst = this.impactBursts[i];
        if (!burst.active) continue;
        const p = burst.life / burst.maxLife;
        const alpha = 1 - p;
        const r = scale * burst.size * (0.5 + p * 1.9);
        const pos = this.worldToScreen(burst.x, burst.y);

        ctx.strokeStyle = `hsla(${burst.hue} 90% 62% / ${alpha * 0.9})`;
        ctx.lineWidth = Math.max(1.2, 3 - p * 2.1);
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, r, 0, TAU);
        ctx.stroke();
      }
    }

    drawModeOverlays(now) {
      const ctx = this.ctx;
      const mode = this.currentMode();

      if (mode.id === "kingOfRing") {
        const radius = mode.ringRadius * this.renderState.arenaScale;
        const x = this.renderState.centerX;
        const y = this.renderState.centerY;
        const pulse = 0.45 + Math.sin(now * 0.01) * 0.2;
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, TAU);
        ctx.fillStyle = `rgba(255,216,132,${0.14 + pulse * 0.12})`;
        ctx.fill();
        ctx.strokeStyle = "rgba(255,232,170,0.72)";
        ctx.lineWidth = 2;
        ctx.stroke();
      }

      if (this.modeBannerText && performance.now() < this.modeBannerUntil) {
        const t = 1 - clamp((performance.now() - (this.modeBannerUntil - 1700)) / 1700, 0, 1);
        ctx.textAlign = "center";
        ctx.font = "900 34px Outfit, sans-serif";
        ctx.fillStyle = `rgba(255,255,255,${0.2 + t * 0.8})`;
        ctx.fillText(this.modeBannerText, this.width * 0.5, this.height * 0.17);
      }
    }

    drawHud(now, runtime) {
      const ctx = this.ctx;
      const mode = this.currentMode();
      const map = this.currentMap();

      ctx.textAlign = "left";
      ctx.fillStyle = "#d7e8ff";
      ctx.font = "700 13px Outfit, sans-serif";
      ctx.fillText(`${map.label}  |  ${mode.label}`, 18, 24);
      ctx.fillStyle = "rgba(214,228,255,0.84)";
      ctx.font = "600 11px Nunito, sans-serif";
      ctx.fillText("Move: Arrow keys  Dash: Space  Map: M  Mode: N", 18, 41);

      const dashReady = Math.max(0, this.lastDashAt + runtime.dashCooldownMs - now);
      const ratio = dashReady <= 0 ? 1 : 1 - dashReady / runtime.dashCooldownMs;
      const barX = 18;
      const barY = 49;
      const barW = 190;
      const barH = 8;

      ctx.fillStyle = "rgba(255,255,255,0.14)";
      ctx.fillRect(barX, barY, barW, barH);
      ctx.fillStyle = dashReady <= 0 ? "#7efbb2" : "#74c6ff";
      ctx.fillRect(barX, barY, barW * ratio, barH);

      ctx.fillStyle = "rgba(213,228,255,0.92)";
      ctx.font = "600 11px Nunito, sans-serif";
      ctx.fillText(dashReady <= 0 ? "Dash ready" : `Dash ${(dashReady / 1000).toFixed(1)}s`, barX, barY + 17);

      let aliveCount = 0;
      for (const player of this.players.values()) {
        if (!player.eliminated) aliveCount += 1;
      }
      ctx.textAlign = "right";
      ctx.fillStyle = "#c4dbff";
      ctx.font = "700 12px Nunito, sans-serif";
      ctx.fillText(`Alive: ${aliveCount}`, this.width - 18, 24);

      if (mode.id === "kingOfRing") {
        const me = this.players.get(this.meId);
        const partner = Array.from(this.players.entries()).find(([id]) => id !== this.meId)?.[1];
        const left = this.modeEndAt > Date.now() ? Math.max(0, Math.ceil((this.modeEndAt - Date.now()) / 1000)) : 0;
        ctx.fillStyle = "rgba(255,234,176,0.95)";
        ctx.fillText(`Ring score: ${Math.floor(me?.score || 0)} / ${Math.floor(partner?.score || 0)} • ${left}s`, this.width - 18, 42);
      }

      if (mode.id === "chaos") {
        const next = this.nextChaosModifierAt > Date.now() ? Math.max(0, Math.ceil((this.nextChaosModifierAt - Date.now()) / 1000)) : 0;
        ctx.fillStyle = "rgba(255,190,235,0.95)";
        const modifierLabel = this.modeModifierId ? this.modifierLabel(this.modeModifierId) : "none";
        ctx.fillText(`Modifier: ${modifierLabel} • next ${next}s`, this.width - 18, 42);
      }

      if (this.active && now < this.startedAt) {
        const remain = Math.max(0, this.startedAt - now);
        const count = Math.max(1, Math.ceil(remain / 1000));
        if (count !== this.lastCountdownTick && count <= 3) {
          this.lastCountdownTick = count;
          this.sounds.play("countdown", 0.72, 1 + (3 - count) * 0.08);
        }

        const pulse = 0.92 + Math.sin(now * 0.012) * 0.08;
        ctx.textAlign = "center";
        ctx.font = `900 ${Math.floor(52 * pulse)}px Outfit, sans-serif`;
        ctx.fillStyle = "rgba(255,255,255,0.98)";
        ctx.fillText(String(count), this.width * 0.5, this.height * 0.44);
        ctx.font = "700 14px Nunito, sans-serif";
        ctx.fillStyle = "rgba(205,230,255,0.95)";
        ctx.fillText("Get ready", this.width * 0.5, this.height * 0.49);
      } else if (this.active && now >= this.startedAt && now < this.startedAt + 760) {
        if (!this.goPlayed) {
          this.goPlayed = true;
          this.sounds.play("go", 0.9);
        }
        const goT = 1 - clamp((now - this.startedAt) / 760, 0, 1);
        ctx.textAlign = "center";
        ctx.font = `900 ${Math.floor(64 + goT * 16)}px Outfit, sans-serif`;
        ctx.fillStyle = `rgba(255,245,195,${goT})`;
        ctx.fillText("GO!", this.width * 0.5, this.height * 0.44);
      }

      if (this.winnerId) {
        const winnerName = this.getPlayerName(this.winnerId) || "Winner";
        ctx.textAlign = "center";
        ctx.fillStyle = "rgba(255,236,148,0.98)";
        ctx.font = "900 30px Outfit, sans-serif";
        ctx.fillText(`${winnerName} wins`, this.width * 0.5, this.height - 26);
      }
    }

    drawScene(now, boundary, runtime) {
      if (!this.ctx) return;
      const ctx = this.ctx;

      ctx.save();
      const shake = this.shakePower;
      if (shake > 0.001) {
        const offset = shake * 8;
        const sx = (this.rand() * 2 - 1) * offset;
        const sy = (this.rand() * 2 - 1) * offset;
        ctx.translate(sx, sy);
      }

      this.drawBackground(now);
      this.drawArena(boundary, now);
      this.drawObstacles(now);
      this.drawModeOverlays(now);
      this.drawPlayers(now, runtime);
      this.drawImpacts();
      this.drawHud(now, runtime);

      ctx.restore();
    }

    frame(timestamp) {
      if (!this.mounted) return;
      const now = Number(timestamp) || performance.now();
      const rawDt = Math.min(MAX_DT, Math.max(0.001, (now - this.lastFrameAt) / 1000));
      this.lastFrameAt = now;
      const scaledDt = rawDt * (now < this.slowMoUntil ? 0.45 : 1);

      this.meId = String(this.getSelfId() || this.meId || "");
      const runtime = this.getRuntimeModifiers();
      const boundary = this.getBoundary(Date.now(), runtime);

      if (!this.paused) {
        this.updateObstacleSystem(scaledDt, Date.now(), runtime);
        this.updateModeSystem(scaledDt, Date.now());
        this.updateRemotePlayers(scaledDt);
        if (this.active && this.startedAt && Date.now() >= this.startedAt) {
          this.updateLocalPlayer(scaledDt, performance.now(), runtime, boundary);
        }
        this.updateEffects(scaledDt);
      }

      this.drawScene(performance.now(), boundary, runtime);
      this.rafId = requestAnimationFrame((ts) => this.frame(ts));
    }

    advanceTime(ms) {
      if (!this.mounted || this.paused) return Promise.resolve();
      const total = Math.max(1, Math.round((Number(ms) || 16) / (1000 / 60)));
      let now = performance.now();
      for (let i = 0; i < total; i += 1) {
        now += FIXED_STEP * 1000;
        const runtime = this.getRuntimeModifiers();
        const boundary = this.getBoundary(Date.now(), runtime);
        this.updateObstacleSystem(FIXED_STEP, Date.now(), runtime);
        this.updateModeSystem(FIXED_STEP, Date.now());
        this.updateRemotePlayers(FIXED_STEP);
        if (this.active && this.startedAt && Date.now() >= this.startedAt) {
          this.updateLocalPlayer(FIXED_STEP, now, runtime, boundary);
        }
        this.updateEffects(FIXED_STEP);
        this.drawScene(now, boundary, runtime);
      }
      return Promise.resolve();
    }

    renderGameToText() {
      const mode = this.currentMode();
      const map = this.currentMap();
      const me = this.players.get(this.meId) || null;
      const others = [];
      for (const [id, player] of this.players.entries()) {
        if (id === this.meId) continue;
        others.push({
          id,
          x: Number(player.x.toFixed(3)),
          y: Number(player.y.toFixed(3)),
          eliminated: Boolean(player.eliminated),
          score: Number((player.score || 0).toFixed(1))
        });
      }

      const payload = {
        mode: mode.id,
        map: map.id,
        active: this.active,
        winnerId: this.winnerId,
        modifier: this.modeModifierId,
        coordSystem: "center-origin; +x right; +y down; world range approx -1..1",
        me: me
          ? {
              id: this.meId,
              x: Number(me.x.toFixed(3)),
              y: Number(me.y.toFixed(3)),
              vx: Number(me.vx.toFixed(3)),
              vy: Number(me.vy.toFixed(3)),
              eliminated: Boolean(me.eliminated),
              dashReady: this.lastDashAt + this.getRuntimeModifiers().dashCooldownMs <= performance.now(),
              score: Number((me.score || 0).toFixed(1))
            }
          : null,
        others,
        boundary: this.renderState.shape === "circle"
          ? { shape: "circle", radius: Number(this.renderState.circleRadius.toFixed(3)) }
          : { shape: "square", half: Number(this.renderState.squareHalf.toFixed(3)) },
        lavaTop: Number(this.lavaTop.toFixed(3)),
        obstacles: this.obstacles.map((obstacle) => {
          if (obstacle.type === "rotBar") {
            return {
              type: "rotBar",
              angle: Number(obstacle.angle.toFixed(3)),
              enabled: Date.now() >= obstacle.enabledAt
            };
          }
          return {
            type: obstacle.type,
            x: Number(obstacle.x.toFixed(3)),
            y: Number(obstacle.y.toFixed(3))
          };
        })
      };
      return JSON.stringify(payload);
    }
  }

  window.ChaosArena = ChaosArena;
})();
