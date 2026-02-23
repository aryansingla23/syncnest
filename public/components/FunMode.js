/**
 * FunMode.js
 * Fully wires Fun Room controls, mini games, reactions, and score sync.
 */

function readLocalWithLegacy(primaryKey, legacyKey = "") {
  const primary = localStorage.getItem(primaryKey);
  if (primary !== null) return primary;
  if (!legacyKey) return null;
  return localStorage.getItem(legacyKey);
}

function writeLocalWithLegacy(primaryKey, value, legacyKey = "") {
  localStorage.setItem(primaryKey, value);
  if (legacyKey) localStorage.setItem(legacyKey, value);
}

class FunMode {
  constructor(configOrSocket, maybeRoomId) {
    if (configOrSocket && typeof configOrSocket === "object" && configOrSocket.socket) {
      this.socket = configOrSocket.socket;
      this.roomId = configOrSocket.roomId;
      this.setMode = typeof configOrSocket.setMode === "function" ? configOrSocket.setMode : () => { };
      this.addSystemMessage = typeof configOrSocket.addSystemMessage === "function" ? configOrSocket.addSystemMessage : () => { };
    } else {
      this.socket = configOrSocket;
      this.roomId = maybeRoomId;
      this.setMode = () => window.SyncNest?.setMode?.("study") || window.PulseRoom?.setMode?.("study");
      this.addSystemMessage = () => { };
    }

    this.points = 0;
    this.scores = { p1: 0, p2: 0 };
    this.streak = 0;
    this.activeGame = null;
    this.participants = [];
    this.meId = "";
    this.challengeTimer = null;
    this.currentChallengeSeconds = 0;
    this.bound = false;

    this.panel = document.getElementById("funPanel");
    this.gameArea = document.getElementById("funGameArea");
    this.playerList = document.getElementById("funPlayerList");
    this.pointsDisplay = document.getElementById("funPoints");
    this.streakDisplay = document.getElementById("winStreak");
    this.p1ScoreDisplay = document.getElementById("p1Score");
    this.p2ScoreDisplay = document.getElementById("p2Score");
    this.scoreLabels = Array.from(document.querySelectorAll(".fun-score .score-label"));
    this.challengeText = document.getElementById("challengeText");
    this.challengeTimerEl = document.getElementById("challengeTimer");
    this.moodIndicator = document.getElementById("funMoodIndicator");
    this.teleportFxLayer = document.getElementById("teleportFxLayer");
    this.cinematicLayer = document.getElementById("cinematicEventLayer");
    this.crowdLayer = document.getElementById("funCrowdLayer");
    this.hugLayer = document.getElementById("funHugLayer");
    this.thoughtLayer = document.getElementById("funThoughtLayer");
    this.confessionLayer = document.getElementById("funConfessionLayer");
    this.teleportFullscreenBtn = document.getElementById("btnTeleportFullscreen");
    this.cinematicEventBtn = document.getElementById("btnCinematicEvent");
    this.cinematicEventHeroBtn = document.getElementById("btnCinematicEventHero");
    this.teleportFullscreenBtn = document.getElementById("btnTeleportFullscreen");
    this.teleportAudioBtn = document.getElementById("btnTeleportAudio");
    this.sendHugBtn = document.getElementById("btnSendHug");
    this.thoughtModeBtn = document.getElementById("btnThoughtMode");
    this.nightConfessionBtn = document.getElementById("btnNightConfession");
    this.funToolbarViewport = document.getElementById("funToolbarViewport");
    this.funToolbarSlider = document.getElementById("funToolbarSlider");
    this.funToolbarPrev = document.getElementById("funToolbarPrev");
    this.funToolbarNext = document.getElementById("funToolbarNext");
    this.currentUniverse = null;
    this.defaultMoodIndicatorHtml = this.moodIndicator?.innerHTML || "<span class=\"mood-dot\"></span> Vibe: Energetic";
    this.audioContext = null;
    this.universeNodes = [];
    this.universeIntervals = [];
    this.universeTimeouts = [];
    this.remixNodes = [];
    this.remixTimeouts = [];
    this.latestAiRoast = null;
    this.storyPending = [];
    this.storyNeeded = 2;
    this.latestAiStory = null;
    this.latestMoodRemix = null;
    this.sharedMediaLink = "";
    this.sharedTimeline = {
      playing: false,
      currentTime: 0,
      playbackRate: 1,
      updatedAt: Date.now()
    };
    this.watchPlayerKind = "none";
    this.watchSyncing = false;
    this.watchInterval = null;
    this.watchLoadedLink = "";
    this.watchYtPlayer = null;
    this.watchYtReady = false;
    this.watchPendingYtId = "";
    this.activeCinematicEvent = null;
    this.cinematicTimeout = null;
    this.cinematicCountdownInterval = null;
    this.cinematicNodes = [];
    this.cinematicIntervals = [];
    this.cinematicTimeouts = [];
    this.cinematicThemes = [
      { id: "neon-rave", label: "Neon Rave Room" },
      { id: "rain-zoom", label: "Rain Slow Zoom" },
      { id: "dramatic-countdown", label: "Dramatic Countdown" },
      { id: "award-ceremony", label: "Award Ceremony" }
    ];
    this.crowdEffectTimeouts = [];
    this.crowdNodes = [];
    this.lastCrowdEmitAt = 0;
    this.crowdCheerMessages = [
      "You two are unstoppable!",
      "Virtual crowd goes wild!",
      "The room is cheering for you two!",
      "Audience applause unlocked!",
      "This duo is on fire!"
    ];
    this.hugHoldTimer = null;
    this.hugHoldStartedAt = 0;
    this.hugHoldTriggered = false;
    this.lastHugEmitAt = 0;
    this.thoughtComposer = null;
    this.thoughtTimeouts = [];
    this.confessionActive = false;
    this.confessionPromptIdx = 0;
    this.confessionPromptTimer = null;
    this.confessionTimeouts = [];
    this.confessionNodes = [];
    this.confessionPrompts = [
      "What truth have you been carrying quietly?",
      "What part of me feels safest to you?",
      "What do you need from love this week?",
      "What fear do you want us to heal together?",
      "What do you miss most when we are apart?",
      "What would make tonight unforgettable for you?",
      "What are you scared to ask, but want to?",
      "What promise should we make before sleep?"
    ];
    this.toolbarScrollBound = false;
    this.toolbarScrollRaf = 0;
    this.handleToolbarResize = () => this.syncToolbarScrollUI();
    this.universeAudioKey = "syncnest_universe_audio_muted";
    this.universeAudioLegacyKey = "pulseroom_universe_audio_muted";
    this.universeFullscreenKey = "syncnest_universe_fullscreen";
    this.universeFullscreenLegacyKey = "pulseroom_universe_fullscreen";
    this.universeAudioMuted = readLocalWithLegacy(this.universeAudioKey, this.universeAudioLegacyKey) === "1";
    this.universeFullscreenEnabled = readLocalWithLegacy(this.universeFullscreenKey, this.universeFullscreenLegacyKey) === "1";
    this.fallbackFullscreenActive = false;
    this.handleFullscreenChange = () => {
      if (document.fullscreenElement) {
        this.fallbackFullscreenActive = false;
        document.body.classList.remove("teleport-fallback-fullscreen");
        document.body.classList.add("teleport-immersive");
        return;
      }
      if (this.fallbackFullscreenActive) {
        document.body.classList.add("teleport-immersive");
        return;
      }
      document.body.classList.remove("teleport-immersive");
      if (this.universeFullscreenEnabled) {
        this.universeFullscreenEnabled = false;
        writeLocalWithLegacy(this.universeFullscreenKey, "0", this.universeFullscreenLegacyKey);
        this.updateTeleportFullscreenUI();
      }
    };

    this.challengePool = [
      "Say one thing you appreciate about your partner right now.",
      "Do 20-second dance cam challenge.",
      "Take turns telling one fun memory in 30 seconds.",
      "Emoji-only chat for 1 minute.",
      "Rapid fire: 5 favorite things in 20 seconds."
    ];

    this.reactionPool = ["😂", "🔥", "💀", "🎉", "💥", "😭", "❤️", "✨"];
    this.gamePool = ["quiz", "draw", "song", "thisthat", "memory", "tapspeed", "watchparty"];
    this.universeScenes = [
      { id: "space-station", label: "Space Station", emoji: "🛰️", mood: "Cosmic Focus" },
      { id: "underwater-world", label: "Underwater World", emoji: "🌊", mood: "Deep Calm" },
      { id: "retro-arcade", label: "90s Retro Arcade", emoji: "🕹️", mood: "Pixel Party" },
      { id: "haunted-house", label: "Haunted House", emoji: "👻", mood: "Spooky Thrill" },
      { id: "cozy-snow-cabin", label: "Cozy Cabin in Snow", emoji: "❄️", mood: "Warm & Cozy" }
    ];

    this.setupEventListeners();
    this.setupSocketListeners();
    this.updateTeleportFullscreenUI();
    this.updateTeleportAudioUI();
    this.updateUniverseControlsUI();
    this.updateCinematicCountdown();
    this.updateConfessionButtonUI();
    this.setupToolbarScroller();
    window.addEventListener("resize", this.handleToolbarResize);
    document.addEventListener("fullscreenchange", this.handleFullscreenChange);
  }

  enter() {
    this.isActive = true;
    this.closeAllSubmenus();
    this.renderPlayers();
    this.restoreTeleportLayer();
    this.restoreCinematicLayer();
    this.restoreCrowdLayer();
    this.restoreHugLayer();
    this.restoreThoughtLayer();
    this.restoreConfessionLayer();
    if (this.currentUniverse) {
      this.applyUniverse(this.currentUniverse, false);
    }
    this.updateUniverseControlsUI();
    this.updateTeleportAudioUI();
    this.updateConfessionButtonUI();
    if (this.activeCinematicEvent) {
      this.renderCinematicEventLayer(this.activeCinematicEvent);
      this.updateCinematicCountdown();
    }
    this.queueToolbarScrollSync();
  }

  leave() {
    this.isActive = false;
    this.closeAllSubmenus();
    this.stopChallengeTimer();
    this.stopUniverseSound();
    this.stopMoodRemix();
    this.stopCinematicEvent({ silent: true });
    this.stopConfessionMode({ silent: true });
    this.cancelHugHold();
    this.closeThoughtComposer();
    this.clearThoughtBubbles();
    this.clearHugEffects();
    this.clearCrowdEffects();
    this.stopWatchLoop();
    this.destroyWatchYouTubePlayer();
    if (document.fullscreenElement === this.panel) {
      document.exitFullscreen().catch(() => null);
    }
    this.disableFallbackFullscreen();
    document.body.classList.remove("teleport-immersive");
  }

  syncFromRoom(roomFun) {
    if (!roomFun || typeof roomFun !== "object") return;
    this.activeGame = roomFun.activeGame || this.activeGame;
    this.points = Number(roomFun.totalPoints) || this.points;
    if (this.pointsDisplay) this.pointsDisplay.textContent = String(this.points);

    const sorted = Object.values(roomFun.scores || {}).sort((a, b) => Number(b) - Number(a));
    this.syncPoints({
      p1: Number(sorted[0]) || 0,
      p2: Number(sorted[1]) || 0,
      total: Number(roomFun.totalPoints) || 0
    });

    const initialUniverse = String(roomFun?.universe?.scene || "").trim();
    if (initialUniverse) {
      this.applyUniverse(initialUniverse, false);
    } else {
      this.clearUniverseMode({ announce: false, silent: true });
    }

    this.latestAiRoast = roomFun?.ai?.lastRoast || null;
    this.storyPending = Array.isArray(roomFun?.ai?.story?.pending)
      ? roomFun.ai.story.pending
      : Object.values(roomFun?.ai?.story?.pending || {});
    this.latestAiStory = roomFun?.ai?.story?.lastResult || null;
    this.latestMoodRemix = roomFun?.ai?.moodRemix || null;
    const cinematic = roomFun?.cinematic;
    if (cinematic?.active && Number(cinematic.endsAt) > Date.now()) {
      this.startCinematicEvent({
        theme: cinematic.theme,
        startedAt: Number(cinematic.startedAt) || Date.now(),
        endsAt: Number(cinematic.endsAt) || Date.now() + 60_000,
        funniestName: cinematic.funniestName || null,
        by: null
      }, { announce: false });
    } else {
      this.stopCinematicEvent({ silent: true });
    }

    const confession = roomFun?.confession;
    if (confession?.active) {
      this.startConfessionMode({
        startedAt: Number(confession.startedAt) || Date.now(),
        by: null
      }, { announce: false });
    } else {
      this.stopConfessionMode({ silent: true, announce: false });
    }
  }

  setParticipants(participants, meId) {
    this.participants = Array.isArray(participants) ? participants.slice() : [];
    this.meId = String(meId || "");
    this.renderPlayers();
  }

  syncWatchState({ url, timeline } = {}) {
    if (url !== undefined) {
      this.sharedMediaLink = String(url || "").trim();
    }
    if (timeline && typeof timeline === "object") {
      this.sharedTimeline = this.normalizeTimelinePayload(timeline);
    }
    if (this.activeGame !== "watchparty") return;
    this.loadSharedMediaIntoWatch(this.sharedMediaLink, false);
    this.applyWatchTimeline();
    this.renderWatchTimeline();
  }

  handleSharedMediaUpdate(url) {
    this.sharedMediaLink = String(url || "").trim();
    if (this.activeGame === "watchparty") {
      this.loadSharedMediaIntoWatch(this.sharedMediaLink, false);
    }
  }

  handleSharedTimelineUpdate(timeline) {
    if (!timeline || typeof timeline !== "object") return;
    this.sharedTimeline = this.normalizeTimelinePayload(timeline);
    if (this.activeGame !== "watchparty") return;
    this.applyWatchTimeline();
    this.renderWatchTimeline();
  }

  setupToolbarScroller() {
    if (this.toolbarScrollBound) return;
    if (!this.funToolbarViewport || !this.funToolbarSlider) return;
    this.toolbarScrollBound = true;

    this.funToolbarViewport.addEventListener("scroll", () => this.queueToolbarScrollSync());
    this.funToolbarViewport.addEventListener("wheel", (event) => {
      if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;
      event.preventDefault();
      this.funToolbarViewport.scrollLeft += event.deltaY;
      this.queueToolbarScrollSync();
    }, { passive: false });

    this.funToolbarSlider.addEventListener("input", () => {
      const maxScroll = Math.max(0, this.funToolbarViewport.scrollWidth - this.funToolbarViewport.clientWidth);
      if (maxScroll <= 1) return;
      const pct = Math.max(0, Math.min(100, Number(this.funToolbarSlider.value) || 0));
      this.funToolbarViewport.scrollLeft = (pct / 100) * maxScroll;
      this.queueToolbarScrollSync();
    });

    this.funToolbarPrev?.addEventListener("click", () => {
      const distance = Math.max(220, this.funToolbarViewport.clientWidth * 0.45);
      this.funToolbarViewport.scrollBy({ left: -distance, behavior: "smooth" });
      this.queueToolbarScrollSync();
    });

    this.funToolbarNext?.addEventListener("click", () => {
      const distance = Math.max(220, this.funToolbarViewport.clientWidth * 0.45);
      this.funToolbarViewport.scrollBy({ left: distance, behavior: "smooth" });
      this.queueToolbarScrollSync();
    });

    this.syncToolbarScrollUI();
  }

  queueToolbarScrollSync() {
    if (this.toolbarScrollRaf) return;
    this.toolbarScrollRaf = window.requestAnimationFrame(() => {
      this.toolbarScrollRaf = 0;
      this.syncToolbarScrollUI();
    });
  }

  syncToolbarScrollUI() {
    if (!this.funToolbarViewport || !this.funToolbarSlider) return;
    const maxScroll = Math.max(0, this.funToolbarViewport.scrollWidth - this.funToolbarViewport.clientWidth);
    const current = Math.max(0, Math.min(maxScroll, this.funToolbarViewport.scrollLeft));
    const pct = maxScroll > 0 ? Math.round((current / maxScroll) * 100) : 0;
    this.funToolbarSlider.value = String(pct);
    this.funToolbarSlider.disabled = maxScroll <= 2;

    if (this.funToolbarPrev) this.funToolbarPrev.disabled = maxScroll <= 2 || current <= 2;
    if (this.funToolbarNext) this.funToolbarNext.disabled = maxScroll <= 2 || current >= maxScroll - 2;
  }

  setupEventListeners() {
    if (this.bound) return;
    this.bound = true;

    const openWatchParty = () => {
      this.socket.emit("fun:start-game", { roomId: this.roomId, game: "watchparty" });
      this.closeAllSubmenus();
    };
    const openMiniPlayyard = () => this.setMode("playyard");
    const openDateLounge = () => this.setMode("date");

    document.getElementById("btnOpenGames")?.addEventListener("click", () => this.toggleSubmenu("funGamesSubmenu"));
    document.getElementById("btnOpenWatchParty")?.addEventListener("click", openWatchParty);
    document.getElementById("btnOpenWatchPartyHero")?.addEventListener("click", openWatchParty);
    document.getElementById("btnOpenMiniPlayyard")?.addEventListener("click", openMiniPlayyard);
    document.getElementById("btnOpenMiniPlayyardHero")?.addEventListener("click", openMiniPlayyard);
    document.getElementById("btnOpenDateLounge")?.addEventListener("click", openDateLounge);
    document.getElementById("btnOpenDateLoungeHero")?.addEventListener("click", openDateLounge);
    document.getElementById("btnOpenReactions")?.addEventListener("click", () => this.toggleSubmenu("funReactionsSubmenu"));
    document.getElementById("btnOpenAiLab")?.addEventListener("click", () => this.toggleSubmenu("funAiSubmenu"));
    document.getElementById("btnOpenChallenges")?.addEventListener("click", () => this.startRandomChallenge());
    document.getElementById("btnOpenUnlocks")?.addEventListener("click", () => this.showUnlocks());
    document.getElementById("btnChaos")?.addEventListener("click", () => this.triggerChaos());
    this.cinematicEventBtn?.addEventListener("click", () => {
      if (this.activeCinematicEvent) {
        this.requestStopCinematicEvent();
      } else {
        this.triggerCinematicEvent();
      }
    });
    this.cinematicEventHeroBtn?.addEventListener("click", () => {
      if (this.activeCinematicEvent) {
        this.requestStopCinematicEvent();
      } else {
        this.triggerCinematicEvent();
      }
    });
    document.getElementById("btnTeleport")?.addEventListener("click", () => {
      if (this.teleportActive) {
        this.requestStopTeleport();
      } else {
        this.triggerTeleport();
      }
    });
    this.teleportFullscreenBtn?.addEventListener("click", () => this.toggleTeleportFullscreen());
    this.teleportAudioBtn?.addEventListener("click", () => this.toggleTeleportAudioMute());
    this.thoughtModeBtn?.addEventListener("click", () => this.openThoughtComposer());
    this.nightConfessionBtn?.addEventListener("click", () => this.toggleNightConfessionMode());
    this.sendHugBtn?.addEventListener("pointerdown", (event) => this.startHugHold(event));
    this.sendHugBtn?.addEventListener("pointerup", () => this.cancelHugHold());
    this.sendHugBtn?.addEventListener("pointerleave", () => this.cancelHugHold());
    this.sendHugBtn?.addEventListener("pointercancel", () => this.cancelHugHold());
    this.sendHugBtn?.addEventListener("click", () => {
      if (this.hugHoldTriggered) return;
      this.emitHug();
    });
    document.getElementById("btnSurpriseUs")?.addEventListener("click", () => this.startRandomGame());
    document.getElementById("btnExitFun")?.addEventListener("click", () => this.setMode("study"));

    document.querySelectorAll(".sub-game-btn").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        const game = String(e.currentTarget?.dataset?.game || "").trim();
        if (!game) return;
        if (game === "miniplayyard") {
          this.setMode("playyard");
          this.closeAllSubmenus();
          return;
        }
        this.socket.emit("fun:start-game", { roomId: this.roomId, game });
        this.closeAllSubmenus();
      });
    });

    document.querySelectorAll(".close-submenu").forEach((btn) => {
      btn.addEventListener("click", () => this.closeAllSubmenus());
    });

    document.querySelectorAll(".spam-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const emoji = String(btn.textContent || "🎉").trim();
        this.socket.emit("fun:reaction", { roomId: this.roomId, emoji });
        this.emitCrowdHype({ reason: "reaction", strength: 1 });
      });
    });

    document.getElementById("btnReactionStorm")?.addEventListener("click", () => this.triggerReactionStorm());
  }

  setupSocketListeners() {
    this.socket.on("fun:game-started", ({ game, startedBy }) => {
      this.loadGame(game);
      if (startedBy) {
        this.playCrowdEnergy({
          reason: "challenge",
          strength: game === "watchparty" ? 2 : 1,
          by: startedBy
        });
      }
    });
    this.socket.on("fun:points-update", (payload) => this.syncPoints(payload));
    this.socket.on("fun:chaos-trigger", () => this.applyChaosEffect());
    this.socket.on("fun:reaction", ({ emoji }) => this.showReaction(emoji));
    this.socket.on("fun:crowd-hype", (payload) => this.playCrowdEnergy(payload));
    this.socket.on("fun:hug", (payload) => this.showHugExperience(payload));
    this.socket.on("fun:thought", (payload) => this.showThoughtBubble(payload));
    this.socket.on("fun:confession-state", (payload) => this.handleConfessionState(payload));
    this.socket.on("fun:teleported", ({ scene, by }) => {
      if (!scene) return;
      if (scene === this.currentUniverse && by === this.socket.id) return;
      this.teleportToScene(scene, { announce: by !== this.socket.id, animated: true });
    });
    this.socket.on("fun:teleport-cleared", ({ by }) => {
      const hadUniverse = Boolean(this.currentUniverse);
      this.clearUniverseMode({ announce: false, silent: true });
      if (!hadUniverse) return;
      if (by === this.socket.id) {
        this.addSystemMessage("Teleport mode stopped.");
      } else {
        this.addSystemMessage("Teleport mode was stopped.");
      }
    });
    this.socket.on("fun:ai-roast", (payload) => this.handleAiRoast(payload));
    this.socket.on("fun:story-progress", (payload) => this.handleStoryProgress(payload));
    this.socket.on("fun:story-ready", (payload) => this.handleStoryReady(payload));
    this.socket.on("fun:mood-remix", (payload) => this.handleMoodRemix(payload));
    this.socket.on("fun:cinematic-start", (payload) => this.startCinematicEvent(payload));
    this.socket.on("fun:cinematic-stop", ({ by }) => {
      const hadEvent = Boolean(this.activeCinematicEvent);
      this.stopCinematicEvent({ silent: true });
      if (!hadEvent) return;
      if (by === this.socket.id) {
        this.addSystemMessage("Cinematic Event stopped.");
      } else {
        this.addSystemMessage("Cinematic Event was stopped.");
      }
    });
  }

  renderPlayers() {
    if (!this.playerList) return;

    this.playerList.innerHTML = "";
    const ordered = this.participants.slice().sort((a, b) => {
      if (a.id === this.meId) return -1;
      if (b.id === this.meId) return 1;
      return String(a.name || "").localeCompare(String(b.name || ""));
    });

    if (ordered.length === 0) {
      this.playerList.innerHTML = "<p class=\"fun-empty\">Waiting for players...</p>";
    } else {
      ordered.forEach((p) => {
        const chip = document.createElement("div");
        chip.className = "fun-player-chip";
        chip.textContent = `${p.name || "Guest"}${p.id === this.meId ? " (you)" : ""}`;
        this.playerList.appendChild(chip);
      });
    }

    if (this.scoreLabels[0]) this.scoreLabels[0].textContent = ordered[0]?.name || "Player 1";
    if (this.scoreLabels[1]) this.scoreLabels[1].textContent = ordered[1]?.name || "Player 2";
  }

  toggleSubmenu(id) {
    const target = document.getElementById(id);
    if (!target) return;
    const shouldOpen = target.classList.contains("hidden");
    this.closeAllSubmenus();
    if (shouldOpen) target.classList.remove("hidden");
  }

  closeAllSubmenus() {
    document.querySelectorAll(".fun-submenu").forEach((el) => el.classList.add("hidden"));
  }

  startRandomGame() {
    const game = this.gamePool[Math.floor(Math.random() * this.gamePool.length)];
    this.socket.emit("fun:start-game", { roomId: this.roomId, game });
  }

  showGameInstructions(title, instructions, onStart) {
    if (!this.gameArea) return;
    this.gameArea.innerHTML = `
      <div class="game-instruction-panel game-fade-in">
        <h2>${title}</h2>
        <p>${instructions}</p>
        <button id="btnStartActualGame" class="btn-start-game">Start Game</button>
      </div>
    `;
    const btn = document.getElementById("btnStartActualGame");
    if (btn) {
      btn.addEventListener("click", () => {
        const panel = this.gameArea.querySelector(".game-instruction-panel");
        if (panel) {
          panel.classList.remove("game-fade-in");
          panel.classList.add("game-fade-out");
          window.setTimeout(() => {
            if (this.gameArea) this.gameArea.innerHTML = "";
            onStart();
          }, 300);
        } else {
          if (this.gameArea) this.gameArea.innerHTML = "";
          onStart();
        }
      });
    }
  }

  loadGame(gameType) {
    const nextGame = String(gameType || "");
    if (this.activeGame === "watchparty") {
      this.stopWatchLoop();
      this.destroyWatchYouTubePlayer();
    }
    this.activeGame = nextGame;
    if (!this.gameArea) return;
    this.closeThoughtComposer();
    this.gameArea.innerHTML = "";

    const runGameInit = () => {
      switch (this.activeGame) {
        case "tapspeed":
          this.initTapSpeed();
          break;
        case "quiz":
          this.initQuiz();
          break;
        case "draw":
          this.initDraw();
          break;
        case "song":
          this.initGuessSong();
          break;
        case "thisthat":
          this.initThisOrThat();
          break;
        case "memory":
          this.initMemoryFlash();
          break;
        case "watchparty":
          this.initFunWatchParty();
          break;
        case "miniplayyard":
          this.initMiniPlayyard();
          break;
        case "airoast":
          this.initAiRoast();
          break;
        case "aistory":
          this.initAiStoryBuilder();
          break;
        case "aimood":
          this.initAiMoodRemix();
          break;
        default:
          this.gameArea.innerHTML = "<h2>Pick a game from the menu 🎮</h2>";
      }
    };

    const instructionsMap = {
      "tapspeed": { title: "Tap Speed Race 🚀", desc: "Tap the button as fast as you can. You have 10 seconds. More taps = More points!" },
      "quiz": { title: "Rapid Quiz ⚡", desc: "Read the question and pick the right answer quickly. +10 points per correct answer." },
      "draw": { title: "Guess Draw 🎨", desc: "Draw something fun on the canvas. When you're done, claim your points!" },
      "song": { title: "Guess The Song 🎵", desc: "Listen carefully (or guess the vibe) and pick the most likely lyric mood." },
      "thisthat": { title: "This or That ⚖️", desc: "Pick your preference fast. No overthinking allowed!" },
      "memory": { title: "Memory Flash 🎴", desc: "Memorize the sequence of emojis shown, then confirm you remember it." }
    };

    if (instructionsMap[this.activeGame]) {
      this.showGameInstructions(
        instructionsMap[this.activeGame].title,
        instructionsMap[this.activeGame].desc,
        runGameInit
      );
    } else {
      runGameInit();
    }

    this.restoreTeleportLayer();
    this.restoreCinematicLayer();
    this.restoreCrowdLayer();
    this.restoreHugLayer();
    this.restoreThoughtLayer();
    this.restoreConfessionLayer();
    if (this.activeCinematicEvent) {
      this.renderCinematicEventLayer(this.activeCinematicEvent);
      this.updateCinematicCountdown();
    }
    if (this.confessionActive) {
      this.renderConfessionPrompt(this.confessionPrompts[this.confessionPromptIdx % this.confessionPrompts.length]);
      this.updateConfessionButtonUI();
    }
    this.queueToolbarScrollSync();
  }

  initTapSpeed() {
    this.gameArea.innerHTML = `
      <div class="tap-challenge">
        <h2>TAP SPEED RACE 🚀</h2>
        <div id="tapTimer" class="tap-timer">10</div>
        <button id="btnTap" class="tap-big-btn">TAP!</button>
        <div id="myTaps" class="tap-count">0 taps</div>
      </div>
    `;

    let taps = 0;
    let timeLeft = 10;
    const btnTap = document.getElementById("btnTap");
    const tapTimer = document.getElementById("tapTimer");
    const myTaps = document.getElementById("myTaps");

    const timer = window.setInterval(() => {
      timeLeft -= 1;
      if (tapTimer) tapTimer.textContent = String(timeLeft);
      if (timeLeft <= 0) {
        window.clearInterval(timer);
        if (btnTap) btnTap.disabled = true;
        this.addPoints(taps);
        if (myTaps) myTaps.textContent = `${taps} taps • +${taps} points`;
      }
    }, 1000);

    btnTap?.addEventListener("click", () => {
      taps += 1;
      if (myTaps) myTaps.textContent = `${taps} taps`;
    });
  }

  initQuiz() {
    const questions = [
      { q: "Who sent the first message today?", a: ["Me", "You", "Both", "No idea"], c: 2 },
      { q: "Best break snack?", a: ["Fries", "Ice Cream", "Fruit", "Chocolate"], c: 1 },
      { q: "Which vibe is peak?", a: ["Rain", "Beach", "City", "Campfire"], c: 0 }
    ];
    let idx = 0;

    const render = () => {
      const q = questions[idx];
      this.gameArea.innerHTML = `
        <div class="quiz-container game-fade-in" style="animation-duration: 0.3s">
          <h3>Question ${idx + 1}/${questions.length}</h3>
          <p class="quiz-text">${q.q}</p>
          <div class="quiz-options">
            ${q.a.map((opt, i) => `<button class="quiz-opt" data-idx="${i}">${opt}</button>`).join("")}
          </div>
        </div>
      `;

      const options = document.querySelectorAll(".quiz-opt");
      options.forEach((btn) => {
        btn.addEventListener("click", () => {
          // Prevent multiple clicks
          options.forEach(b => b.disabled = true);

          const picked = Number(btn.getAttribute("data-idx"));
          if (picked === q.c) {
            this.addPoints(10);
            btn.style.backgroundColor = "rgba(40, 200, 100, 0.8)";
            btn.style.borderColor = "rgba(40, 200, 100, 1)";
          } else {
            btn.style.backgroundColor = "rgba(220, 50, 70, 0.8)";
            btn.style.borderColor = "rgba(220, 50, 70, 1)";
            // Highlight the correct one too
            options[q.c].style.backgroundColor = "rgba(40, 200, 100, 0.5)";
            options[q.c].style.borderColor = "rgba(40, 200, 100, 0.8)";
          }

          idx += 1;
          window.setTimeout(() => {
            const container = this.gameArea.querySelector(".quiz-container");
            if (container) {
              container.classList.remove("game-fade-in");
              container.classList.add("game-fade-out");
              window.setTimeout(() => {
                if (idx < questions.length) {
                  render();
                } else {
                  this.gameArea.innerHTML = "<h2 class='game-fade-in'>Quiz done! +10 per correct answer.</h2>";
                }
              }, 250);
            }
          }, 1000);
        });
      });
    };

    render();
  }

  initDraw() {
    this.gameArea.innerHTML = `
      <div class="draw-container">
        <canvas id="funCanvas" width="420" height="280" style="background:#fff;border-radius:10px;"></canvas>
        <div class="draw-controls">
          <button id="btnClearCanvas">Clear</button>
          <button id="btnDrawDone">Done +5</button>
        </div>
      </div>
    `;

    const canvas = document.getElementById("funCanvas");
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    let drawing = false;
    canvas.addEventListener("mousedown", () => { drawing = true; });
    canvas.addEventListener("mouseup", () => { drawing = false; });
    canvas.addEventListener("mouseleave", () => { drawing = false; });
    canvas.addEventListener("mousemove", (e) => {
      if (!drawing) return;
      ctx.fillStyle = "#111";
      ctx.beginPath();
      ctx.arc(e.offsetX, e.offsetY, 3, 0, Math.PI * 2);
      ctx.fill();
    });

    document.getElementById("btnClearCanvas")?.addEventListener("click", () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    });
    document.getElementById("btnDrawDone")?.addEventListener("click", () => this.addPoints(5));
  }

  initGuessSong() {
    this.gameArea.innerHTML = `
      <div class="song-game">
        <h2>Guess The Song</h2>
        <p>Pick the most likely lyric mood:</p>
        <div class="quiz-options">
          <button class="song-opt" data-points="8">Romantic</button>
          <button class="song-opt" data-points="5">Chill</button>
          <button class="song-opt" data-points="3">Party</button>
        </div>
      </div>
    `;
    document.querySelectorAll(".song-opt").forEach((btn) => {
      btn.addEventListener("click", () => this.addPoints(Number(btn.getAttribute("data-points")) || 0));
    });
  }

  initThisOrThat() {
    this.gameArea.innerHTML = `
      <div class="this-that">
        <h2>This or That</h2>
        <p>Pick fast. No overthinking.</p>
        <div class="quiz-options">
          <button class="tt-opt">Sunrise Date</button>
          <button class="tt-opt">Midnight Drive</button>
        </div>
      </div>
    `;
    document.querySelectorAll(".tt-opt").forEach((btn) => {
      btn.addEventListener("click", () => this.addPoints(4));
    });
  }

  initMemoryFlash() {
    const items = ["🌙", "☕", "🎧", "📚", "🌧️"];
    this.gameArea.innerHTML = `
      <div class="memory-game">
        <h2>Memory Flash</h2>
        <p>Remember this sequence:</p>
        <div class="memory-seq">${items.join(" ")}</div>
        <button id="btnMemoryDone">I remembered it +6</button>
      </div>
    `;
    document.getElementById("btnMemoryDone")?.addEventListener("click", () => this.addPoints(6));
  }

  initMiniPlayyard() {
    this.gameArea.innerHTML = `
      <section class="mini-playyard-shell">
        <div class="mini-playyard-bg">
          <span class="mini-star s1"></span>
          <span class="mini-star s2"></span>
          <span class="mini-star s3"></span>
          <span class="mini-star s4"></span>
        </div>

        <header class="mini-playyard-header">
          <h2>Mini Playyard</h2>
          <p>Neon 3D arena unlocked. Enter the vibe and level up the room.</p>
        </header>

        <div class="mini-playyard-stage">
          <div class="mini-grid-floor"></div>
          <div class="mini-energy-ring ring-a"></div>
          <div class="mini-energy-ring ring-b"></div>
          <div class="mini-energy-ring ring-c"></div>

          <div class="mini-cube-wrap">
            <div class="mini-cube">
              <span class="mini-face front">PLAY</span>
              <span class="mini-face back">YARD</span>
              <span class="mini-face right">SYNC</span>
              <span class="mini-face left">VIBE</span>
              <span class="mini-face top">GG</span>
              <span class="mini-face bottom">XP</span>
            </div>
          </div>

          <div class="mini-glow-pill mini-pill-a"></div>
          <div class="mini-glow-pill mini-pill-b"></div>
        </div>

        <div class="mini-playyard-controls">
          <button id="btnMiniPlayyardWarp" class="toolbar-icon-btn mini-playyard-action">⚡ Hyper Warp</button>
          <button id="btnMiniPlayyardBoost" class="toolbar-icon-btn mini-playyard-action alt">🏁 Claim +7 XP</button>
        </div>
      </section>
    `;

    const shell = this.gameArea.querySelector(".mini-playyard-shell");
    const warpBtn = document.getElementById("btnMiniPlayyardWarp");
    const boostBtn = document.getElementById("btnMiniPlayyardBoost");

    warpBtn?.addEventListener("click", () => {
      if (!shell) return;
      shell.classList.remove("warp-active");
      void shell.offsetWidth;
      shell.classList.add("warp-active");
      this.emitCrowdHype({ reason: "chaos", strength: 2, force: true });
      window.setTimeout(() => shell.classList.remove("warp-active"), 2000);
    });

    boostBtn?.addEventListener("click", () => {
      this.addPoints(7);
      this.emitCrowdHype({ reason: "score", strength: 2, force: true });
    });
  }

  startRandomChallenge() {
    const text = this.challengePool[Math.floor(Math.random() * this.challengePool.length)];
    if (this.challengeText) this.challengeText.textContent = text;
    this.startChallengeTimer(45);
    this.emitCrowdHype({ reason: "challenge", strength: 1 });
  }

  startChallengeTimer(seconds) {
    this.stopChallengeTimer();
    this.currentChallengeSeconds = Math.max(1, Number(seconds) || 45);
    if (this.challengeTimerEl) this.challengeTimerEl.classList.remove("hidden");
    this.renderChallengeTimer();

    this.challengeTimer = window.setInterval(() => {
      this.currentChallengeSeconds -= 1;
      this.renderChallengeTimer();
      if (this.currentChallengeSeconds <= 0) {
        this.stopChallengeTimer();
        this.addPoints(12);
        this.addSystemMessage("Challenge complete! +12 points awarded.");
      }
    }, 1000);
  }

  renderChallengeTimer() {
    if (!this.challengeTimerEl) return;
    const sec = Math.max(0, this.currentChallengeSeconds);
    const mm = String(Math.floor(sec / 60)).padStart(2, "0");
    const ss = String(sec % 60).padStart(2, "0");
    this.challengeTimerEl.textContent = `${mm}:${ss}`;
  }

  stopChallengeTimer() {
    if (this.challengeTimer) {
      window.clearInterval(this.challengeTimer);
      this.challengeTimer = null;
    }
    if (this.challengeTimerEl) this.challengeTimerEl.classList.add("hidden");
  }

  showUnlocks() {
    if (!this.gameArea) return;
    this.gameArea.innerHTML = `
      <div class="unlock-store">
        <h2>Unlocks Shop 🔓</h2>
        <p>Current shared points: ${this.points}</p>
        <ul>
          <li>250 pts: Neon Theme</li>
          <li>500 pts: Chaos Storm+</li>
          <li>800 pts: Double Points Mode</li>
        </ul>
      </div>
    `;
  }

  triggerCinematicEvent(themeId = "") {
    const requested = String(themeId || "").trim();
    const chosen = this.cinematicThemes.some((theme) => theme.id === requested) ? requested : "";
    this.socket.emit("fun:cinematic-trigger", { roomId: this.roomId, theme: chosen });
    this.emitCrowdHype({ reason: "cinematic", strength: 2, force: true });
  }

  requestStopCinematicEvent() {
    if (!this.activeCinematicEvent) return;
    this.socket.emit("fun:cinematic-stop", { roomId: this.roomId });
  }

  getCinematicThemeMeta(themeId) {
    const byId = {
      "neon-rave": {
        title: "Neon Rave Room",
        subtitle: "Bass drops, laser haze, and endless pink-blue glow."
      },
      "rain-zoom": {
        title: "Rain + Slow Zoom",
        subtitle: "Soft rainfall, cozy ambience, and dreamy camera drift."
      },
      "dramatic-countdown": {
        title: "Dramatic Countdown",
        subtitle: "Suspense builds every second. Hold your breath."
      },
      "award-ceremony": {
        title: "Award Ceremony",
        subtitle: "The spotlight finds tonight's funniest icon."
      }
    };
    return byId[themeId] || {
      title: "Cinematic Event",
      subtitle: "Fun Room transformed for the next 60 seconds."
    };
  }

  getCinematicClassList() {
    return this.cinematicThemes.map((entry) => `cinematic-theme-${entry.id}`);
  }

  startCinematicEvent(payload = {}, options = {}) {
    const announce = options.announce !== false;
    const requestedTheme = String(payload?.theme || "").trim();
    const fallbackTheme = this.cinematicThemes[0]?.id || "neon-rave";
    const theme = this.cinematicThemes.some((entry) => entry.id === requestedTheme)
      ? requestedTheme
      : fallbackTheme;
    const startedAt = Number(payload?.startedAt) || Date.now();
    const endsAt = Number(payload?.endsAt) || startedAt + 60_000;
    const funniestName = payload?.funniestName ? String(payload.funniestName) : null;

    if (endsAt <= Date.now()) {
      this.stopCinematicEvent({ silent: true });
      return;
    }

    this.stopCinematicEvent({ silent: true });
    this.activeCinematicEvent = {
      theme,
      startedAt,
      endsAt,
      funniestName
    };

    const themeClasses = this.getCinematicClassList();
    this.panel?.classList.remove(...themeClasses);
    this.panel?.classList.add("cinematic-active", `cinematic-theme-${theme}`);
    this.renderCinematicEventLayer(this.activeCinematicEvent);
    this.startCinematicSound(theme);
    this.updateCinematicCountdown();
    this.cinematicCountdownInterval = window.setInterval(() => this.updateCinematicCountdown(), 250);

    const endsIn = Math.max(240, endsAt - Date.now());
    this.cinematicTimeout = window.setTimeout(() => {
      this.stopCinematicEvent();
    }, endsIn);

    if (announce) {
      const isSelf = payload?.by && payload.by === this.socket.id;
      const meta = this.getCinematicThemeMeta(theme);
      if (isSelf) {
        this.addSystemMessage(`Cinematic Event started: ${meta.title}.`);
      } else {
        this.addSystemMessage(`Cinematic Event live now: ${meta.title}.`);
      }
    }
  }

  clearCinematicTimers() {
    this.cinematicIntervals.forEach((id) => window.clearInterval(id));
    this.cinematicTimeouts.forEach((id) => window.clearTimeout(id));
    this.cinematicIntervals = [];
    this.cinematicTimeouts = [];
  }

  stopCinematicSound() {
    this.clearCinematicTimers();
    this.cinematicNodes.forEach((node) => {
      try {
        if (typeof node.stop === "function") node.stop();
      } catch {
        // ignore stop failures
      }
      try {
        if (typeof node.disconnect === "function") node.disconnect();
      } catch {
        // ignore disconnect failures
      }
    });
    this.cinematicNodes = [];
  }

  createCinematicTone(ctx, { type, frequency, gain = 0.02 }) {
    const osc = ctx.createOscillator();
    const amp = ctx.createGain();
    osc.type = type;
    osc.frequency.value = frequency;
    amp.gain.value = gain;
    osc.connect(amp).connect(ctx.destination);
    osc.start();
    this.cinematicNodes.push(osc, amp);
    return { osc, amp };
  }

  startCinematicSound(theme) {
    const ctx = this.ensureAudioContext();
    if (!ctx) return;
    ctx.resume().catch(() => null);
    this.stopCinematicSound();

    const addInterval = (fn, ms) => {
      const id = window.setInterval(fn, ms);
      this.cinematicIntervals.push(id);
      return id;
    };
    const addTimeout = (fn, ms) => {
      const id = window.setTimeout(fn, ms);
      this.cinematicTimeouts.push(id);
      return id;
    };

    if (theme === "neon-rave") {
      const bass = this.createCinematicTone(ctx, { type: "sawtooth", frequency: 98, gain: 0.015 });
      const lead = this.createCinematicTone(ctx, { type: "triangle", frequency: 294, gain: 0.012 });
      const notes = [247, 294, 330, 392, 440, 523];
      addInterval(() => {
        lead.osc.frequency.setTargetAtTime(notes[Math.floor(Math.random() * notes.length)], ctx.currentTime, 0.04);
      }, 150);
      addInterval(() => {
        bass.osc.frequency.setTargetAtTime(82 + Math.random() * 30, ctx.currentTime, 0.2);
      }, 600);
    } else if (theme === "rain-zoom") {
      const noise = this.createNoiseSource(ctx);
      const filter = ctx.createBiquadFilter();
      const gain = ctx.createGain();
      filter.type = "lowpass";
      filter.frequency.value = 980;
      gain.gain.value = 0.02;
      noise.connect(filter).connect(gain).connect(ctx.destination);
      noise.start();
      this.cinematicNodes.push(noise, filter, gain);

      const pad = this.createCinematicTone(ctx, { type: "sine", frequency: 176, gain: 0.01 });
      const lfo = ctx.createOscillator();
      const lfoGain = ctx.createGain();
      lfo.type = "sine";
      lfo.frequency.value = 0.14;
      lfoGain.gain.value = 8;
      lfo.connect(lfoGain).connect(pad.osc.frequency);
      lfo.start();
      this.cinematicNodes.push(lfo, lfoGain);
    } else if (theme === "dramatic-countdown") {
      const drone = this.createCinematicTone(ctx, { type: "sawtooth", frequency: 68, gain: 0.01 });
      const tension = this.createCinematicTone(ctx, { type: "triangle", frequency: 138, gain: 0.006 });
      addInterval(() => {
        const pulse = this.createCinematicTone(ctx, { type: "square", frequency: 220 + Math.random() * 45, gain: 0.0028 });
        addTimeout(() => {
          try { pulse.osc.stop(); } catch { }
        }, 180);
      }, 1000);
      addInterval(() => {
        tension.osc.frequency.setTargetAtTime(130 + Math.random() * 26, ctx.currentTime, 0.24);
        drone.osc.frequency.setTargetAtTime(62 + Math.random() * 14, ctx.currentTime, 0.36);
      }, 800);
    } else if (theme === "award-ceremony") {
      const brass = this.createCinematicTone(ctx, { type: "triangle", frequency: 262, gain: 0.011 });
      const choir = this.createCinematicTone(ctx, { type: "sine", frequency: 523, gain: 0.0048 });
      const progression = [262, 330, 392, 523, 659];
      let index = 0;
      addInterval(() => {
        const note = progression[index % progression.length];
        brass.osc.frequency.setTargetAtTime(note, ctx.currentTime, 0.05);
        choir.osc.frequency.setTargetAtTime(note * 2, ctx.currentTime, 0.08);
        index += 1;
      }, 430);
    }
  }

  stopCinematicEvent({ silent = false } = {}) {
    if (this.cinematicTimeout) {
      window.clearTimeout(this.cinematicTimeout);
      this.cinematicTimeout = null;
    }
    if (this.cinematicCountdownInterval) {
      window.clearInterval(this.cinematicCountdownInterval);
      this.cinematicCountdownInterval = null;
    }

    this.stopCinematicSound();
    this.activeCinematicEvent = null;

    const themeClasses = this.getCinematicClassList();
    this.panel?.classList.remove("cinematic-active", ...themeClasses);
    if (this.cinematicLayer) {
      this.cinematicLayer.classList.remove("active");
      this.cinematicLayer.className = "cinematic-event-layer";
      this.cinematicLayer.innerHTML = "";
    }
    this.updateCinematicCountdown();

    if (!silent) {
      this.addSystemMessage("Cinematic Event ended. Back to regular Fun Room.");
    }
  }

  updateCinematicCountdown() {
    if (!this.activeCinematicEvent) {
      if (this.cinematicEventBtn) this.cinematicEventBtn.innerHTML = "🎥 Event";
      if (this.cinematicEventHeroBtn) this.cinematicEventHeroBtn.innerHTML = "🎥 Cinematic Event";
      this.cinematicEventBtn?.classList.remove("active");
      this.cinematicEventHeroBtn?.classList.remove("active");
      this.queueToolbarScrollSync();
      return;
    }

    const remainingMs = Math.max(0, Number(this.activeCinematicEvent.endsAt) - Date.now());
    const remaining = Math.ceil(remainingMs / 1000);
    if (this.cinematicLayer) {
      this.cinematicLayer.querySelectorAll("[data-cinematic-remaining]").forEach((node) => {
        node.textContent = `${remaining}s`;
      });
      const progress = Math.max(0, Math.min(1, remainingMs / 60_000));
      const track = this.cinematicLayer.querySelector("[data-cinematic-progress]");
      if (track) {
        track.style.setProperty("--event-progress", String(progress));
      }
    }
    if (this.cinematicEventBtn) this.cinematicEventBtn.innerHTML = `🛑 Stop Event (${remaining}s)`;
    if (this.cinematicEventHeroBtn) this.cinematicEventHeroBtn.innerHTML = `🛑 Stop Event (${remaining}s)`;
    this.cinematicEventBtn?.classList.add("active");
    this.cinematicEventHeroBtn?.classList.add("active");
    this.queueToolbarScrollSync();
  }

  renderCinematicEventLayer(eventData) {
    if (!eventData) return;
    const layer = this.restoreCinematicLayer();
    if (!layer) return;

    const meta = this.getCinematicThemeMeta(eventData.theme);
    const awardLine = eventData.theme === "award-ceremony"
      ? `<div class="cinematic-winner">🏆 Funniest Person: <strong>${String(eventData.funniestName || "Guest").replace(/</g, "&lt;").replace(/>/g, "&gt;")}</strong></div>`
      : "";

    layer.className = `cinematic-event-layer active theme-${eventData.theme}`;
    layer.innerHTML = `
      <div class="cinematic-layer-backdrop"></div>
      <div class="cinematic-layer-grid"></div>
      <div class="cinematic-layer-vignette"></div>
      <div class="cinematic-title-card">
        <div class="cinematic-kicker">Cinematic Event</div>
        <h3>${meta.title}</h3>
        <p>${meta.subtitle}</p>
        <div class="cinematic-meta-row">
          <span class="cinematic-remaining" data-cinematic-remaining>60s</span>
          <span class="cinematic-progress-track" data-cinematic-progress></span>
        </div>
        ${awardLine}
      </div>
      <div class="cinematic-foreground"></div>
    `;

    const foreground = layer.querySelector(".cinematic-foreground");
    if (foreground) {
      const particleCount = eventData.theme === "rain-zoom" ? 42 : eventData.theme === "neon-rave" ? 34 : 26;
      for (let i = 0; i < particleCount; i += 1) {
        const node = document.createElement("span");
        node.className = "cinematic-particle";
        node.style.setProperty("--x", `${Math.random() * 100}%`);
        node.style.setProperty("--delay", `${Math.random() * 2.8}s`);
        node.style.setProperty("--dur", `${eventData.theme === "rain-zoom" ? 2.4 + Math.random() * 2.2 : 2.8 + Math.random() * 3.8}s`);
        node.style.setProperty("--size", `${eventData.theme === "rain-zoom" ? 2 + Math.random() * 2 : 3 + Math.random() * 6}px`);
        foreground.appendChild(node);
      }
    }
  }

  triggerTeleport() {
    if (!Array.isArray(this.universeScenes) || this.universeScenes.length === 0) return;
    const options = this.universeScenes.filter((entry) => entry.id !== this.currentUniverse);
    const pool = options.length > 0 ? options : this.universeScenes;
    const next = pool[Math.floor(Math.random() * pool.length)];
    if (!next?.id) return;

    this.teleportToScene(next.id, { announce: false, animated: true });
    this.ensureUniverseFullscreen();
    this.socket.emit("fun:teleport", { roomId: this.roomId, scene: next.id });
    this.emitCrowdHype({ reason: "teleport", strength: 2, force: true });
  }

  requestStopTeleport() {
    if (!this.currentUniverse) return;
    this.socket.emit("fun:teleport-stop", { roomId: this.roomId });
  }

  teleportToScene(sceneId, { announce = true, animated = true } = {}) {
    if (animated) {
      this.playTeleportTransition(sceneId);
      window.setTimeout(() => this.applyUniverse(sceneId, announce), 260);
      return;
    }
    this.applyUniverse(sceneId, announce);
  }

  getUniverseClassList() {
    return [
      "universe-space-station",
      "universe-underwater-world",
      "universe-retro-arcade",
      "universe-haunted-house",
      "universe-cozy-snow-cabin"
    ];
  }

  applyUniverse(sceneId, announce = true) {
    const scene = this.universeScenes.find((entry) => entry.id === sceneId);
    if (!scene) return;

    this.currentUniverse = scene.id;
    this.panel?.classList.remove(...this.getUniverseClassList());
    this.panel?.classList.add(`universe-${scene.id}`);

    if (this.moodIndicator) {
      this.moodIndicator.innerHTML = `<span class="mood-dot"></span> Vibe: ${scene.mood}`;
    }

    this.renderUniverseBanner(scene);
    this.updateUniverseControlsUI();
    if (this.isActive) {
      this.startUniverseSound(scene.id);
    }

    if (announce) {
      this.addSystemMessage(`Teleported to ${scene.label}.`);
    }
  }

  clearUniverseMode({ announce = true, silent = false } = {}) {
    if (!this.currentUniverse) {
      this.updateUniverseControlsUI();
      return;
    }

    this.currentUniverse = null;
    this.panel?.classList.remove(...this.getUniverseClassList());
    this.stopUniverseSound();
    if (this.moodIndicator) {
      this.moodIndicator.innerHTML = this.defaultMoodIndicatorHtml;
    }
    this.updateUniverseControlsUI();
    if (!silent && announce) {
      this.addSystemMessage("Returned from teleport mode.");
    }
  }

  renderUniverseBanner(scene) {
    if (!this.gameArea) return;
    const existing = this.gameArea.querySelector(".universe-banner");
    if (existing) existing.remove();
    const banner = document.createElement("div");
    banner.className = "universe-banner";
    banner.textContent = `${scene.emoji} Universe Mode: ${scene.label}`;
    this.gameArea.prepend(banner);
    window.setTimeout(() => banner.remove(), 2200);
  }

  playTeleportTransition(sceneId) {
    if (!this.teleportFxLayer) return;
    this.teleportFxLayer.innerHTML = "";
    this.teleportFxLayer.dataset.scene = sceneId;

    const warp = document.createElement("div");
    warp.className = "teleport-warp";
    this.teleportFxLayer.appendChild(warp);

    const count = 32;
    for (let i = 0; i < count; i += 1) {
      const particle = document.createElement("span");
      particle.className = "teleport-particle";
      particle.style.setProperty("--tx", `${(Math.random() - 0.5) * 1600}px`);
      particle.style.setProperty("--ty", `${(Math.random() - 0.5) * 900}px`);
      particle.style.setProperty("--delay", `${Math.random() * 120}ms`);
      particle.style.left = `${50 + (Math.random() - 0.5) * 10}%`;
      particle.style.top = `${50 + (Math.random() - 0.5) * 10}%`;
      particle.style.width = `${Math.random() * 6 + 2}px`;
      particle.style.height = particle.style.width;
      this.teleportFxLayer.appendChild(particle);
    }

    this.teleportFxLayer.classList.remove("active");
    // Force reflow so repeated teleports always replay animation.
    void this.teleportFxLayer.offsetWidth;
    this.teleportFxLayer.classList.add("active");
    window.setTimeout(() => {
      this.teleportFxLayer?.classList.remove("active");
      if (this.teleportFxLayer) {
        this.teleportFxLayer.innerHTML = "";
      }
    }, 980);
  }

  updateTeleportFullscreenUI() {
    if (!this.teleportFullscreenBtn) return;
    this.teleportFullscreenBtn.textContent = this.universeFullscreenEnabled ? "⛶ Fullscreen On" : "⛶ Fullscreen Off";
    this.teleportFullscreenBtn.classList.toggle("active", this.universeFullscreenEnabled);
  }

  updateTeleportAudioUI() {
    if (!this.teleportAudioBtn) return;
    const muted = Boolean(this.universeAudioMuted);
    this.teleportAudioBtn.textContent = muted ? "🔇 Teleport Audio Off" : "🔊 Teleport Audio On";
    this.teleportAudioBtn.classList.toggle("active", !muted);
  }

  updateUniverseControlsUI() {
    const hasUniverse = Boolean(this.currentUniverse);
    const teleportBtn = document.getElementById("btnTeleport");
    if (teleportBtn) {
      if (hasUniverse) {
        teleportBtn.innerHTML = "🧭 Stop Teleport";
        teleportBtn.classList.add("active");
      } else {
        teleportBtn.innerHTML = "🌠 Teleport";
        teleportBtn.classList.remove("active");
      }
    }
    if (this.teleportAudioBtn) {
      this.teleportAudioBtn.disabled = !hasUniverse;
      this.teleportAudioBtn.classList.toggle("inactive", !hasUniverse);
    }
    this.updateTeleportAudioUI();
    this.queueToolbarScrollSync();
  }

  toggleTeleportAudioMute() {
    if (!this.currentUniverse) return;
    this.universeAudioMuted = !this.universeAudioMuted;
    writeLocalWithLegacy(this.universeAudioKey, this.universeAudioMuted ? "1" : "0", this.universeAudioLegacyKey);
    this.updateTeleportAudioUI();
    if (this.universeAudioMuted) {
      this.stopUniverseSound();
      this.addSystemMessage("Teleport mode audio muted.");
      return;
    }
    if (this.isActive && this.currentUniverse) {
      this.startUniverseSound(this.currentUniverse);
    }
    this.addSystemMessage("Teleport mode audio unmuted.");
  }

  enableFallbackFullscreen() {
    this.fallbackFullscreenActive = true;
    document.body.classList.add("teleport-fallback-fullscreen");
    document.body.classList.add("teleport-immersive");
  }

  disableFallbackFullscreen() {
    this.fallbackFullscreenActive = false;
    document.body.classList.remove("teleport-fallback-fullscreen");
  }

  async toggleTeleportFullscreen() {
    this.universeFullscreenEnabled = !this.universeFullscreenEnabled;
    writeLocalWithLegacy(this.universeFullscreenKey, this.universeFullscreenEnabled ? "1" : "0", this.universeFullscreenLegacyKey);
    this.updateTeleportFullscreenUI();

    if (this.universeFullscreenEnabled) {
      await this.ensureUniverseFullscreen();
    } else {
      this.disableFallbackFullscreen();
      document.body.classList.remove("teleport-immersive");
      if (document.fullscreenElement) {
        document.exitFullscreen().catch(() => null);
      }
    }
  }

  async ensureUniverseFullscreen() {
    if (!this.universeFullscreenEnabled) return;
    if (document.fullscreenElement) {
      document.body.classList.add("teleport-immersive");
      this.disableFallbackFullscreen();
      return;
    }
    const target = this.panel || document.documentElement;
    if (typeof target?.requestFullscreen !== "function") {
      this.enableFallbackFullscreen();
      return;
    }
    try {
      await target.requestFullscreen();
      document.body.classList.add("teleport-immersive");
      this.disableFallbackFullscreen();
    } catch {
      this.enableFallbackFullscreen();
    }
  }

  ensureAudioContext() {
    if (this.audioContext) return this.audioContext;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return null;
    this.audioContext = new Ctx();
    return this.audioContext;
  }

  clearUniverseTimers() {
    this.universeIntervals.forEach((id) => window.clearInterval(id));
    this.universeTimeouts.forEach((id) => window.clearTimeout(id));
    this.universeIntervals = [];
    this.universeTimeouts = [];
  }

  stopUniverseSound() {
    this.clearUniverseTimers();
    this.universeNodes.forEach((node) => {
      try {
        if (typeof node.stop === "function") node.stop();
      } catch {
        // ignore stop failures
      }
      try {
        if (typeof node.disconnect === "function") node.disconnect();
      } catch {
        // ignore disconnect failures
      }
    });
    this.universeNodes = [];
  }

  createNoiseSource(ctx) {
    const buffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i += 1) {
      data[i] = Math.random() * 2 - 1;
    }
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    return source;
  }

  createOscillator(ctx, type, frequency, gainValue = 0.02) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.value = frequency;
    gain.gain.value = gainValue;
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    this.universeNodes.push(osc, gain);
    return { osc, gain };
  }

  startUniverseSound(sceneId) {
    const ctx = this.ensureAudioContext();
    if (!ctx) return;
    if (this.universeAudioMuted) {
      this.stopUniverseSound();
      return;
    }

    ctx.resume().catch(() => null);
    this.stopUniverseSound();

    const addInterval = (fn, ms) => {
      const id = window.setInterval(fn, ms);
      this.universeIntervals.push(id);
    };
    const addTimeout = (fn, ms) => {
      const id = window.setTimeout(fn, ms);
      this.universeTimeouts.push(id);
    };

    if (sceneId === "space-station") {
      const base = this.createOscillator(ctx, "sine", 92, 0.018);
      const hum = this.createOscillator(ctx, "triangle", 184, 0.01);
      const lfo = ctx.createOscillator();
      const lfoGain = ctx.createGain();
      lfo.frequency.value = 0.2;
      lfoGain.gain.value = 24;
      lfo.connect(lfoGain).connect(base.osc.frequency);
      lfo.start();
      this.universeNodes.push(lfo, lfoGain);
      hum.gain.gain.setValueAtTime(0.006, ctx.currentTime);
    } else if (sceneId === "underwater-world") {
      this.createOscillator(ctx, "sine", 110, 0.012);
      const noise = this.createNoiseSource(ctx);
      const filter = ctx.createBiquadFilter();
      const gain = ctx.createGain();
      filter.type = "lowpass";
      filter.frequency.value = 520;
      gain.gain.value = 0.014;
      noise.connect(filter).connect(gain).connect(ctx.destination);
      noise.start();
      this.universeNodes.push(noise, filter, gain);
    } else if (sceneId === "retro-arcade") {
      const lead = this.createOscillator(ctx, "square", 220, 0.016);
      const notes = [220, 277, 330, 440, 554, 660];
      addInterval(() => {
        const next = notes[Math.floor(Math.random() * notes.length)];
        lead.osc.frequency.setTargetAtTime(next, ctx.currentTime, 0.03);
      }, 200);
    } else if (sceneId === "haunted-house") {
      const droneA = this.createOscillator(ctx, "sawtooth", 72, 0.009);
      const droneB = this.createOscillator(ctx, "sine", 77, 0.007);
      addInterval(() => {
        droneB.osc.frequency.setTargetAtTime(72 + Math.random() * 16, ctx.currentTime, 0.2);
      }, 900);
      addInterval(() => {
        const burst = this.createOscillator(ctx, "triangle", 280 + Math.random() * 220, 0.004);
        addTimeout(() => {
          try { burst.osc.stop(); } catch { }
        }, 420);
      }, 2500);
      droneA.gain.gain.value = 0.01;
    } else if (sceneId === "cozy-snow-cabin") {
      this.createOscillator(ctx, "sine", 146, 0.01);
      const noise = this.createNoiseSource(ctx);
      const filter = ctx.createBiquadFilter();
      const gain = ctx.createGain();
      filter.type = "bandpass";
      filter.frequency.value = 420;
      filter.Q.value = 0.6;
      gain.gain.value = 0.008;
      noise.connect(filter).connect(gain).connect(ctx.destination);
      noise.start();
      this.universeNodes.push(noise, filter, gain);
      addInterval(() => {
        const crackle = this.createOscillator(ctx, "square", 780 + Math.random() * 260, 0.002);
        addTimeout(() => {
          try { crackle.osc.stop(); } catch { }
        }, 120);
      }, 700);
    }
  }

  restoreTeleportLayer() {
    if (!this.gameArea) return;
    let layer = this.gameArea.querySelector("#teleportFxLayer");
    if (!layer) {
      layer = document.createElement("div");
      layer.id = "teleportFxLayer";
      layer.className = "teleport-fx-layer";
      layer.setAttribute("aria-hidden", "true");
      this.gameArea.appendChild(layer);
    }
    this.teleportFxLayer = layer;
  }

  restoreCinematicLayer() {
    if (!this.gameArea) return null;
    let layer = this.gameArea.querySelector("#cinematicEventLayer");
    if (!layer) {
      layer = document.createElement("div");
      layer.id = "cinematicEventLayer";
      layer.className = "cinematic-event-layer";
      layer.setAttribute("aria-hidden", "true");
      this.gameArea.appendChild(layer);
    }
    this.cinematicLayer = layer;
    return layer;
  }

  restoreCrowdLayer() {
    if (!this.gameArea) return null;
    let layer = this.gameArea.querySelector("#funCrowdLayer");
    if (!layer) {
      layer = document.createElement("div");
      layer.id = "funCrowdLayer";
      layer.className = "fun-crowd-layer";
      layer.setAttribute("aria-hidden", "true");
      this.gameArea.appendChild(layer);
    }
    this.crowdLayer = layer;
    return layer;
  }

  clearCrowdEffects() {
    this.crowdEffectTimeouts.forEach((id) => window.clearTimeout(id));
    this.crowdEffectTimeouts = [];

    this.crowdNodes.forEach((node) => {
      try {
        if (typeof node.stop === "function") node.stop();
      } catch {
        // ignore stop failures
      }
      try {
        if (typeof node.disconnect === "function") node.disconnect();
      } catch {
        // ignore disconnect failures
      }
    });
    this.crowdNodes = [];

    if (this.crowdLayer) {
      this.crowdLayer.innerHTML = "";
      this.crowdLayer.classList.remove("active");
    }
  }

  restoreHugLayer() {
    if (!this.gameArea) return null;
    let layer = this.gameArea.querySelector("#funHugLayer");
    if (!layer) {
      layer = document.createElement("div");
      layer.id = "funHugLayer";
      layer.className = "fun-hug-layer";
      layer.setAttribute("aria-hidden", "true");
      this.gameArea.appendChild(layer);
    }
    this.hugLayer = layer;
    return layer;
  }

  restoreThoughtLayer() {
    if (!this.gameArea) return null;
    let layer = this.gameArea.querySelector("#funThoughtLayer");
    if (!layer) {
      layer = document.createElement("div");
      layer.id = "funThoughtLayer";
      layer.className = "fun-thought-layer";
      layer.setAttribute("aria-hidden", "true");
      this.gameArea.appendChild(layer);
    }
    this.thoughtLayer = layer;
    return layer;
  }

  restoreConfessionLayer() {
    if (!this.gameArea) return null;
    let layer = this.gameArea.querySelector("#funConfessionLayer");
    if (!layer) {
      layer = document.createElement("div");
      layer.id = "funConfessionLayer";
      layer.className = "fun-confession-layer";
      layer.setAttribute("aria-hidden", "true");
      this.gameArea.appendChild(layer);
    }
    this.confessionLayer = layer;
    return layer;
  }

  getDisplayNameById(participantId, fallback = "Guest") {
    const found = this.participants.find((p) => String(p?.id || "") === String(participantId || ""));
    const safe = String(found?.name || fallback || "Guest").trim();
    return safe || "Guest";
  }

  startHugHold(event) {
    if (event?.button !== undefined && event.button !== 0) return;
    this.cancelHugHold();
    this.hugHoldStartedAt = Date.now();
    this.hugHoldTriggered = false;
    if (this.sendHugBtn) {
      this.sendHugBtn.classList.add("holding");
      this.sendHugBtn.innerHTML = "🫶 <span>Hold...</span>";
    }

    this.hugHoldTimer = window.setTimeout(() => {
      this.hugHoldTriggered = true;
      this.cancelHugHold({ keepText: false });
      this.emitHug({ force: true });
    }, 520);
  }

  cancelHugHold({ keepText = false } = {}) {
    if (this.hugHoldTimer) {
      window.clearTimeout(this.hugHoldTimer);
      this.hugHoldTimer = null;
    }
    if (this.sendHugBtn) {
      this.sendHugBtn.classList.remove("holding");
      if (!keepText) {
        this.sendHugBtn.innerHTML = "🫶 <span>Send Hug</span>";
      }
    }
  }

  clearHugEffects() {
    if (!this.hugLayer) return;
    this.hugLayer.classList.remove("active", "immersive");
    this.hugLayer.innerHTML = "";
  }

  emitHug({ force = false } = {}) {
    const now = Date.now();
    if (!force && now - Number(this.lastHugEmitAt || 0) < 320) return;
    this.lastHugEmitAt = now;
    const me = this.getDisplayNameById(this.meId, "You");
    this.socket.emit("fun:hug", {
      roomId: this.roomId,
      fromId: this.meId,
      fromName: me
    });
    this.emitCrowdHype({ reason: "reaction", strength: 1, force: true });
  }

  showHugExperience(payload = {}) {
    const layer = this.restoreHugLayer();
    if (!layer) return;

    const fromId = String(payload?.fromId || "");
    const fromName = String(payload?.fromName || this.getDisplayNameById(fromId, "You"));
    const meName = this.getDisplayNameById(this.meId, "You");
    const partner = this.participants.find((p) => String(p?.id || "") !== String(fromId))
      || this.participants.find((p) => String(p?.id || "") !== String(this.meId))
      || null;
    const partnerName = String(partner?.name || (fromId === this.meId ? "Partner" : meName));
    const left = fromId === this.meId ? meName : fromName;
    const right = fromId === this.meId ? partnerName : meName;
    const escapeHtml = (value) => String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\"/g, "&quot;")
      .replace(/'/g, "&#39;");

    layer.classList.remove("active", "immersive");
    void layer.offsetWidth;
    layer.classList.add("active", "immersive");
    layer.innerHTML = `
      <div class="hug-backdrop"></div>
      <div class="hug-stage-glow"></div>
      <div class="hug-orbit"></div>
      <div class="hug-hearts">
        <span>💖</span><span>✨</span><span>💞</span><span>🫶</span><span>💗</span><span>🌸</span><span>💫</span>
      </div>
      <div class="hug-card hug-card--immersive">
        <div class="hug-avatar left"><span>${escapeHtml(left.charAt(0).toUpperCase())}</span><small>${escapeHtml(left)}</small></div>
        <div class="hug-wrap">
          <span class="hug-band left"></span>
          <div class="hug-center">🫂</div>
          <span class="hug-band right"></span>
        </div>
        <div class="hug-avatar right"><span>${escapeHtml(right.charAt(0).toUpperCase())}</span><small>${escapeHtml(right)}</small></div>
      </div>
      <div class="hug-message">${escapeHtml(fromName)} sent a warm hug</div>
    `;
    window.setTimeout(() => {
      layer.classList.remove("active", "immersive");
      layer.innerHTML = "";
    }, 2900);
  }

  openThoughtComposer() {
    const layer = this.restoreThoughtLayer();
    if (this.thoughtComposer && !this.thoughtComposer.isConnected) {
      this.thoughtComposer = null;
    }
    if (!layer || this.thoughtComposer) return;
    const wrap = document.createElement("div");
    wrap.className = "thought-compose-card";
    wrap.innerHTML = `
      <p>Send a floating thought</p>
      <form id="thoughtComposerForm">
        <input id="thoughtComposerInput" type="text" maxlength="140" placeholder="Type a thought..." required />
        <button type="submit">Send</button>
        <button type="button" id="thoughtComposerCancel">Cancel</button>
      </form>
    `;
    layer.appendChild(wrap);
    this.thoughtComposer = wrap;
    const input = wrap.querySelector("#thoughtComposerInput");
    input?.focus();

    wrap.querySelector("#thoughtComposerCancel")?.addEventListener("click", () => this.closeThoughtComposer());
    wrap.querySelector("#thoughtComposerForm")?.addEventListener("submit", (event) => {
      event.preventDefault();
      const text = String(input?.value || "").trim();
      if (!text) return;
      const fromName = this.getDisplayNameById(this.meId, "You");
      this.socket.emit("fun:thought", {
        roomId: this.roomId,
        fromId: this.meId,
        fromName,
        text
      });
      this.closeThoughtComposer();
    });
  }

  closeThoughtComposer() {
    if (!this.thoughtComposer) return;
    this.thoughtComposer.remove();
    this.thoughtComposer = null;
  }

  clearThoughtBubbles() {
    this.thoughtTimeouts.forEach((id) => window.clearTimeout(id));
    this.thoughtTimeouts = [];
    if (this.thoughtLayer) {
      this.thoughtLayer.querySelectorAll(".thought-bubble").forEach((node) => node.remove());
    }
  }

  showThoughtBubble(payload = {}) {
    const layer = this.restoreThoughtLayer();
    if (!layer) return;
    const text = String(payload?.text || "").trim();
    if (!text) return;
    const name = String(payload?.fromName || this.getDisplayNameById(payload?.fromId || "", "Guest"));
    const bubble = document.createElement("div");
    bubble.className = "thought-bubble";
    bubble.style.left = `${12 + Math.random() * 72}%`;
    bubble.innerHTML = `<div class="thought-author">💭 ${name}</div><div>${text.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</div>`;
    layer.appendChild(bubble);
    this.thoughtTimeouts.push(window.setTimeout(() => bubble.remove(), 5600));
  }

  toggleNightConfessionMode() {
    const next = !this.confessionActive;
    this.socket.emit("fun:confession-toggle", {
      roomId: this.roomId,
      active: next
    });
  }

  handleConfessionState(payload = {}) {
    if (payload?.active) {
      this.startConfessionMode(payload);
    } else {
      this.stopConfessionMode({ announce: true, by: payload?.by });
    }
  }

  startConfessionMode(payload = {}, options = {}) {
    const announce = options.announce !== false;
    this.stopConfessionMode({ silent: true, announce: false });
    this.confessionActive = true;
    this.panel?.classList.add("confession-mode-active");
    this.confessionPromptIdx = Math.floor(Math.random() * this.confessionPrompts.length);
    this.updateConfessionButtonUI();
    this.renderConfessionPrompt(this.confessionPrompts[this.confessionPromptIdx]);
    this.startConfessionPromptLoop();
    this.startConfessionSound();
    this.emitCrowdHype({ reason: "cinematic", strength: 1, force: true });

    if (announce) {
      if (payload?.by && payload.by === this.socket.id) {
        this.addSystemMessage("Night Confession Mode is live.");
      } else {
        this.addSystemMessage("Night Confession Mode started.");
      }
    }
  }

  updateConfessionButtonUI() {
    if (!this.nightConfessionBtn) return;
    this.nightConfessionBtn.classList.toggle("active", this.confessionActive);
    this.nightConfessionBtn.innerHTML = this.confessionActive
      ? "🌙 <span>Confession On</span>"
      : "🌙 <span>Night Confession</span>";
    this.queueToolbarScrollSync();
  }

  startConfessionPromptLoop() {
    if (this.confessionPromptTimer) {
      window.clearInterval(this.confessionPromptTimer);
      this.confessionPromptTimer = null;
    }
    this.confessionPromptTimer = window.setInterval(() => {
      this.confessionPromptIdx = (this.confessionPromptIdx + 1) % this.confessionPrompts.length;
      this.renderConfessionPrompt(this.confessionPrompts[this.confessionPromptIdx]);
    }, 9000);
  }

  renderConfessionPrompt(promptText) {
    const layer = this.restoreConfessionLayer();
    if (!layer || !this.confessionActive) return;
    const card = document.createElement("div");
    card.className = "confession-prompt-card";
    card.innerHTML = `<div class="confession-kicker">Night Confession</div><p>${String(promptText || "").replace(/</g, "&lt;").replace(/>/g, "&gt;")}</p>`;
    layer.innerHTML = "";
    layer.appendChild(card);
  }

  stopConfessionSound() {
    this.confessionTimeouts.forEach((id) => window.clearTimeout(id));
    this.confessionTimeouts = [];
    this.confessionNodes.forEach((node) => {
      try {
        if (typeof node.stop === "function") node.stop();
      } catch {
        // ignore stop failures
      }
      try {
        if (typeof node.disconnect === "function") node.disconnect();
      } catch {
        // ignore disconnect failures
      }
    });
    this.confessionNodes = [];
  }

  startConfessionSound() {
    const ctx = this.ensureAudioContext();
    if (!ctx) return;
    ctx.resume().catch(() => null);
    this.stopConfessionSound();

    const pad = ctx.createOscillator();
    const padGain = ctx.createGain();
    pad.type = "sine";
    pad.frequency.value = 164;
    padGain.gain.value = 0.007;
    pad.connect(padGain).connect(ctx.destination);
    pad.start();
    this.confessionNodes.push(pad, padGain);

    const warm = ctx.createOscillator();
    const warmGain = ctx.createGain();
    warm.type = "triangle";
    warm.frequency.value = 246;
    warmGain.gain.value = 0.003;
    warm.connect(warmGain).connect(ctx.destination);
    warm.start();
    this.confessionNodes.push(warm, warmGain);

    const lfo = ctx.createOscillator();
    const lfoGain = ctx.createGain();
    lfo.type = "sine";
    lfo.frequency.value = 0.11;
    lfoGain.gain.value = 18;
    lfo.connect(lfoGain).connect(pad.frequency);
    lfo.start();
    this.confessionNodes.push(lfo, lfoGain);
  }

  stopConfessionMode({ silent = false, announce = true, by = null } = {}) {
    if (this.confessionPromptTimer) {
      window.clearInterval(this.confessionPromptTimer);
      this.confessionPromptTimer = null;
    }
    this.stopConfessionSound();
    this.confessionActive = false;
    this.panel?.classList.remove("confession-mode-active");
    if (this.confessionLayer) {
      this.confessionLayer.innerHTML = "";
    }
    this.updateConfessionButtonUI();
    if (!silent && announce) {
      if (by && by === this.socket.id) {
        this.addSystemMessage("Night Confession Mode ended.");
      } else {
        this.addSystemMessage("Night Confession Mode closed.");
      }
    }
  }

  emitCrowdHype({ reason = "score", strength = 1, force = false } = {}) {
    const now = Date.now();
    if (!force && now - this.lastCrowdEmitAt < 1200) return;
    this.lastCrowdEmitAt = now;

    const safeStrength = Math.max(1, Math.min(3, Number(strength) || 1));
    this.socket.emit("fun:crowd-hype", {
      roomId: this.roomId,
      reason,
      strength: safeStrength
    });
  }

  scheduleCrowdAudioNodeCleanup(node, gainNode, delayMs = 1200) {
    const cleanupId = window.setTimeout(() => {
      try { node?.disconnect?.(); } catch { /* ignore */ }
      try { gainNode?.disconnect?.(); } catch { /* ignore */ }
      this.crowdNodes = this.crowdNodes.filter((entry) => entry !== node && entry !== gainNode);
    }, delayMs);
    this.crowdEffectTimeouts.push(cleanupId);
  }

  playCrowdApplause(reason = "score", strength = 1) {
    if (reason === "teleport" && this.universeAudioMuted) return;

    const ctx = this.ensureAudioContext();
    if (!ctx) return;
    ctx.resume().catch(() => null);

    const baseGain = 0.008 + (Math.max(1, Math.min(3, Number(strength) || 1)) - 1) * 0.004;
    const now = ctx.currentTime + 0.01;
    const clapCount = 6 + Math.max(1, Math.min(3, Number(strength) || 1)) * 4;

    for (let i = 0; i < clapCount; i += 1) {
      const source = this.createNoiseSource(ctx);
      const filter = ctx.createBiquadFilter();
      const gain = ctx.createGain();
      filter.type = "bandpass";
      filter.frequency.value = 860 + Math.random() * 920;
      filter.Q.value = 1.1 + Math.random() * 2.4;

      const startAt = now + i * (0.04 + Math.random() * 0.05);
      const duration = 0.05 + Math.random() * 0.08;
      gain.gain.setValueAtTime(0.0001, startAt);
      gain.gain.exponentialRampToValueAtTime(baseGain + Math.random() * 0.005, startAt + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, startAt + duration);

      source.connect(filter).connect(gain).connect(ctx.destination);
      source.start(startAt);
      source.stop(startAt + duration + 0.02);
      this.crowdNodes.push(source, filter, gain);
      this.scheduleCrowdAudioNodeCleanup(source, gain, 1800);
      this.scheduleCrowdAudioNodeCleanup(filter, gain, 1800);
    }

    const cheer = ctx.createOscillator();
    const cheerGain = ctx.createGain();
    cheer.type = "triangle";
    cheer.frequency.setValueAtTime(220 + Math.random() * 70, now);
    cheer.frequency.exponentialRampToValueAtTime(420 + Math.random() * 120, now + 0.24);
    cheerGain.gain.setValueAtTime(0.0001, now);
    cheerGain.gain.exponentialRampToValueAtTime(0.014 + baseGain * 0.8, now + 0.08);
    cheerGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.48);
    cheer.connect(cheerGain).connect(ctx.destination);
    cheer.start(now);
    cheer.stop(now + 0.52);
    this.crowdNodes.push(cheer, cheerGain);
    this.scheduleCrowdAudioNodeCleanup(cheer, cheerGain, 1200);
  }

  pickCrowdLine(reason = "score") {
    const byReason = {
      score: [
        "You two are unstoppable!",
        "Crowd goes wild for that score!",
        "Audience is chanting your names!"
      ],
      chaos: [
        "The arena LOVES this chaos!",
        "Crowd energy just exploded!",
        "You two are unstoppable!"
      ],
      teleport: [
        "The crowd is cheering your jump!",
        "Dimensional crowd roar activated!",
        "You two are unstoppable!"
      ],
      cinematic: [
        "Standing ovation for this moment!",
        "Audience applause unlocked!",
        "You two are unstoppable!"
      ],
      reaction: [
        "Crowd is loving these reactions!",
        "Audience burst of applause!",
        "You two are unstoppable!"
      ],
      challenge: [
        "New round, huge crowd energy!",
        "Crowd hype: ready for action!",
        "You two are unstoppable!"
      ]
    };
    const list = byReason[reason] || this.crowdCheerMessages;
    return list[Math.floor(Math.random() * list.length)];
  }

  playCrowdEnergy(payload = {}) {
    if (!this.isActive || this.panel?.classList.contains("hidden")) return;

    const reason = String(payload?.reason || "score").trim();
    const strength = Math.max(1, Math.min(3, Number(payload?.strength) || 1));
    const layer = this.restoreCrowdLayer();
    if (!layer) return;

    layer.classList.remove("active");
    void layer.offsetWidth;
    layer.classList.add("active");

    const msg = this.pickCrowdLine(reason);
    const banner = document.createElement("div");
    banner.className = "crowd-hype-banner";
    banner.textContent = msg;
    layer.appendChild(banner);
    this.crowdEffectTimeouts.push(window.setTimeout(() => banner.remove(), 2100));

    const wave = document.createElement("div");
    wave.className = "crowd-audience-wave";
    layer.appendChild(wave);
    this.crowdEffectTimeouts.push(window.setTimeout(() => wave.remove(), 1250));

    const pieceCount = 22 + strength * 10;
    for (let i = 0; i < pieceCount; i += 1) {
      const piece = document.createElement("span");
      piece.className = "crowd-confetti-piece";
      piece.style.setProperty("--x", `${Math.random() * 100}%`);
      piece.style.setProperty("--dx", `${(Math.random() - 0.5) * 180}px`);
      piece.style.setProperty("--rot", `${Math.random() * 560}deg`);
      piece.style.setProperty("--delay", `${Math.random() * 0.28}s`);
      piece.style.setProperty("--dur", `${1.5 + Math.random() * 1.1}s`);
      piece.style.setProperty("--h", `${Math.floor(Math.random() * 360)}deg`);
      layer.appendChild(piece);
      this.crowdEffectTimeouts.push(window.setTimeout(() => piece.remove(), 2700));
    }

    this.crowdEffectTimeouts.push(window.setTimeout(() => layer.classList.remove("active"), 1500));
    this.playCrowdApplause(reason, strength);
  }

  normalizeSharedLink(value) {
    const trimmed = String(value || "").trim();
    if (!trimmed) return "";
    if (/^https?:\/\//i.test(trimmed)) return trimmed;
    return `https://${trimmed}`;
  }

  extractYouTubeId(url) {
    try {
      const parsed = new URL(url);
      if (parsed.hostname.includes("youtube.com")) {
        return parsed.searchParams.get("v") || null;
      }
      if (parsed.hostname.includes("youtu.be")) {
        return parsed.pathname.replace("/", "") || null;
      }
    } catch {
      // ignore parse errors
    }
    return null;
  }

  isLikelyDirectMediaLink(url) {
    return /\.(mp4|webm|m4v|mov|mp3|ogg|wav|m3u8)(\?.*)?$/i.test(String(url || ""));
  }

  normalizeTimelinePayload(payload) {
    const safe = payload || {};
    return {
      playing: Boolean(safe.playing),
      currentTime: Number(safe.currentTime) || 0,
      playbackRate: Math.max(0.25, Math.min(2, Number(safe.playbackRate) || 1)),
      updatedAt: Number(safe.updatedAt) || Date.now()
    };
  }

  formatWatchClock(totalSeconds) {
    const safe = Math.max(0, Math.floor(Number(totalSeconds) || 0));
    const m = Math.floor(safe / 60);
    const s = safe % 60;
    return `${m}:${String(s).padStart(2, "0")}`;
  }

  getLiveSharedTimelineTime() {
    if (!this.sharedTimeline.playing) {
      return Math.max(0, Number(this.sharedTimeline.currentTime) || 0);
    }
    const elapsed = (Date.now() - (Number(this.sharedTimeline.updatedAt) || Date.now())) / 1000;
    return Math.max(0, (Number(this.sharedTimeline.currentTime) || 0) + elapsed * (Number(this.sharedTimeline.playbackRate) || 1));
  }

  getWatchElements() {
    return {
      stage: document.getElementById("funWatchStage"),
      empty: document.getElementById("funWatchEmpty"),
      video: document.getElementById("funWatchVideo"),
      ytWrap: document.getElementById("funWatchYTWrap"),
      ytMount: document.getElementById("funWatchYTPlayer"),
      iframe: document.getElementById("funWatchIframe"),
      linkInput: document.getElementById("funWatchLinkInput"),
      status: document.getElementById("funWatchStatus"),
      playBtn: document.getElementById("funWatchPlayBtn"),
      pauseBtn: document.getElementById("funWatchPauseBtn"),
      syncBtn: document.getElementById("funWatchSyncBtn"),
      seek: document.getElementById("funWatchSeek"),
      rate: document.getElementById("funWatchRate"),
      clock: document.getElementById("funWatchClock")
    };
  }

  setWatchStatus(text) {
    const status = document.getElementById("funWatchStatus");
    if (status) status.textContent = String(text || "");
  }

  setWatchControlsDisabled(disabled) {
    const { playBtn, pauseBtn, syncBtn, seek, rate } = this.getWatchElements();
    [playBtn, pauseBtn, syncBtn, seek, rate].forEach((el) => {
      if (el) el.disabled = Boolean(disabled);
    });
  }

  initFunWatchParty() {
    this.gameArea.innerHTML = `
      <section class="fun-watch-shell">
        <div id="funWatchStage" class="fun-watch-stage">
          <div id="funWatchEmpty" class="fun-watch-empty">Paste any media link and press Sync Play.</div>
          <video id="funWatchVideo" class="fun-watch-video hidden" playsinline controls></video>
          <div id="funWatchYTWrap" class="fun-watch-yt-wrap hidden"><div id="funWatchYTPlayer"></div></div>
          <iframe id="funWatchIframe" class="fun-watch-iframe hidden" allow="autoplay; encrypted-media; picture-in-picture; fullscreen"></iframe>
        </div>
        <div class="fun-watch-controls">
          <div class="fun-watch-input-row">
            <input id="funWatchLinkInput" type="url" placeholder="Paste YouTube/direct media link..." />
            <button id="funWatchSetLinkBtn" class="lp-btn-primary">Sync Play</button>
            <button id="funWatchOpenLinkBtn" class="toolbar-icon-btn">Open</button>
          </div>
          <div class="fun-watch-timeline-row">
            <button id="funWatchPlayBtn" class="toolbar-icon-btn" title="Play for everyone">▶</button>
            <button id="funWatchPauseBtn" class="toolbar-icon-btn" title="Pause for everyone">⏸</button>
            <button id="funWatchSyncBtn" class="btn-sync" title="Sync to host timeline">Sync</button>
            <span id="funWatchClock" class="fun-watch-clock">0:00</span>
            <input id="funWatchSeek" type="range" min="0" max="0" step="1" value="0" />
            <select id="funWatchRate" class="speed-select">
              <option value="0.75">0.75x</option>
              <option value="1" selected>1x</option>
              <option value="1.25">1.25x</option>
              <option value="1.5">1.5x</option>
            </select>
            <button id="funWatchFullscreenBtn" class="toolbar-icon-btn" title="Fullscreen media">⛶</button>
          </div>
          <div id="funWatchStatus" class="fun-watch-status"></div>
        </div>
      </section>
    `;

    const { linkInput, video } = this.getWatchElements();
    if (linkInput) {
      linkInput.value = this.sharedMediaLink || "";
      linkInput.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          document.getElementById("funWatchSetLinkBtn")?.click();
        }
      });
    }

    video?.addEventListener("play", () => {
      if (!this.watchSyncing && this.watchPlayerKind === "video") {
        this.emitWatchTimelineAction("play", Number(video.currentTime));
      }
    });
    video?.addEventListener("pause", () => {
      if (!this.watchSyncing && this.watchPlayerKind === "video") {
        this.emitWatchTimelineAction("pause", Number(video.currentTime));
      }
    });
    video?.addEventListener("seeked", () => {
      if (!this.watchSyncing && this.watchPlayerKind === "video") {
        this.emitWatchTimelineAction("seek", Number(video.currentTime));
      }
    });
    video?.addEventListener("ratechange", () => {
      if (!this.watchSyncing && this.watchPlayerKind === "video") {
        this.emitWatchTimelineAction("rate", Number(video.currentTime));
      }
    });
    video?.addEventListener("loadedmetadata", () => this.renderWatchTimeline());

    document.getElementById("funWatchSetLinkBtn")?.addEventListener("click", () => {
      const raw = this.getWatchElements().linkInput?.value || "";
      const link = this.normalizeSharedLink(raw);
      this.sharedMediaLink = link;
      this.watchLoadedLink = "";
      this.loadSharedMediaIntoWatch(link, true);
    });

    document.getElementById("funWatchOpenLinkBtn")?.addEventListener("click", () => {
      if (!this.sharedMediaLink) return;
      window.open(this.sharedMediaLink, "_blank", "noopener,noreferrer");
    });

    document.getElementById("funWatchPlayBtn")?.addEventListener("click", () => this.emitWatchTimelineAction("play"));
    document.getElementById("funWatchPauseBtn")?.addEventListener("click", () => this.emitWatchTimelineAction("pause"));
    document.getElementById("funWatchSyncBtn")?.addEventListener("click", () => this.emitWatchTimelineAction("seek", this.getLiveSharedTimelineTime()));
    document.getElementById("funWatchSeek")?.addEventListener("change", (event) => {
      this.emitWatchTimelineAction("seek", Number(event.target?.value));
    });
    document.getElementById("funWatchRate")?.addEventListener("change", () => this.emitWatchTimelineAction("rate"));
    document.getElementById("funWatchFullscreenBtn")?.addEventListener("click", () => this.toggleWatchFullscreen());

    this.loadSharedMediaIntoWatch(this.sharedMediaLink, false);
    this.renderWatchTimeline();
    this.applyWatchTimeline();
    this.startWatchLoop();
  }

  loadSharedMediaIntoWatch(link, emit) {
    const cleanLink = this.normalizeSharedLink(link);
    this.sharedMediaLink = cleanLink;
    const { empty, video, ytWrap, iframe, linkInput } = this.getWatchElements();
    if (!empty || !video || !ytWrap || !iframe) return;

    if (linkInput) linkInput.value = cleanLink;
    if (!cleanLink) {
      this.watchPlayerKind = "none";
      this.watchLoadedLink = "";
      this.destroyWatchYouTubePlayer();
      video.pause();
      video.removeAttribute("src");
      video.load();
      iframe.src = "";
      empty.classList.remove("hidden");
      video.classList.add("hidden");
      ytWrap.classList.add("hidden");
      iframe.classList.add("hidden");
      this.setWatchControlsDisabled(true);
      this.setWatchStatus("No link set yet.");
      if (emit) this.socket.emit("set-media-link", { url: "" });
      return;
    }

    if (!emit && cleanLink === this.watchLoadedLink && this.watchPlayerKind !== "none") {
      this.renderWatchTimeline();
      return;
    }

    this.watchLoadedLink = cleanLink;
    empty.classList.add("hidden");
    video.classList.add("hidden");
    ytWrap.classList.add("hidden");
    iframe.classList.add("hidden");
    iframe.src = "";
    this.destroyWatchYouTubePlayer();

    const ytId = this.extractYouTubeId(cleanLink);
    if (ytId) {
      this.watchPlayerKind = "youtube";
      ytWrap.classList.remove("hidden");
      this.setWatchControlsDisabled(false);
      this.setWatchStatus("YouTube sync active.");
      this.createWatchYouTubePlayer(ytId);
    } else {
      this.watchPlayerKind = "video";
      video.classList.remove("hidden");
      this.setWatchControlsDisabled(false);
      this.setWatchStatus("Direct media sync active.");

      const fallbackToIframe = () => {
        if (this.watchPlayerKind !== "video") return;
        this.watchPlayerKind = "iframe";
        video.classList.add("hidden");
        iframe.classList.remove("hidden");
        iframe.src = cleanLink;
        this.setWatchControlsDisabled(true);
        this.setWatchStatus("Opened as embedded page. Playback sync works best for YouTube/direct media links.");
      };

      video.onerror = () => fallbackToIframe();
      video.src = cleanLink;
      video.load();

      if (!this.isLikelyDirectMediaLink(cleanLink)) {
        window.setTimeout(() => {
          const failed = video.error || !video.currentSrc;
          if (failed && this.watchPlayerKind === "video") {
            fallbackToIframe();
          }
        }, 1400);
      }
    }

    if (emit) {
      this.socket.emit("set-media-link", { url: cleanLink });
    }
  }

  loadWatchYouTubeApi() {
    if (window.YT && window.YT.Player) {
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      window.__funWatchYTResolvers = window.__funWatchYTResolvers || [];
      window.__funWatchYTResolvers.push(resolve);

      if (!window.__funWatchYTBound) {
        const previous = window.onYouTubeIframeAPIReady;
        window.onYouTubeIframeAPIReady = () => {
          if (typeof previous === "function") previous();
          const resolvers = window.__funWatchYTResolvers || [];
          window.__funWatchYTResolvers = [];
          resolvers.forEach((fn) => {
            try { fn(); } catch { /* ignore */ }
          });
        };
        window.__funWatchYTBound = true;
      }

      if (!document.getElementById("fun-watch-yt-api")) {
        const script = document.createElement("script");
        script.id = "fun-watch-yt-api";
        script.src = "https://www.youtube.com/iframe_api";
        document.head.appendChild(script);
      }
    });
  }

  async createWatchYouTubePlayer(videoId) {
    this.watchPendingYtId = videoId;
    await this.loadWatchYouTubeApi();
    const mount = document.getElementById("funWatchYTPlayer");
    if (!mount || !window.YT || !window.YT.Player) return;

    this.destroyWatchYouTubePlayer();
    this.watchYtReady = false;
    this.watchYtPlayer = new window.YT.Player("funWatchYTPlayer", {
      videoId,
      playerVars: {
        autoplay: 0,
        controls: 1,
        rel: 0,
        modestbranding: 1,
        enablejsapi: 1
      },
      events: {
        onReady: () => {
          this.watchYtReady = true;
          this.renderWatchTimeline();
          this.applyWatchTimeline();
        },
        onStateChange: (event) => {
          if (this.watchSyncing) return;
          if (event.data === window.YT.PlayerState.PLAYING) {
            this.emitWatchTimelineAction("play", Number(this.watchYtPlayer?.getCurrentTime?.() || 0));
          } else if (event.data === window.YT.PlayerState.PAUSED) {
            this.emitWatchTimelineAction("pause", Number(this.watchYtPlayer?.getCurrentTime?.() || 0));
          }
        }
      }
    });
  }

  destroyWatchYouTubePlayer() {
    if (this.watchYtPlayer) {
      try { this.watchYtPlayer.destroy(); } catch { /* ignore */ }
    }
    this.watchYtPlayer = null;
    this.watchYtReady = false;
  }

  getCurrentWatchTime() {
    const { video } = this.getWatchElements();
    if (this.watchPlayerKind === "video" && video) {
      return Number(video.currentTime) || 0;
    }
    if (this.watchPlayerKind === "youtube" && this.watchYtPlayer && this.watchYtReady) {
      try {
        return Number(this.watchYtPlayer.getCurrentTime()) || 0;
      } catch {
        return 0;
      }
    }
    return this.getLiveSharedTimelineTime();
  }

  getWatchDuration() {
    const { video } = this.getWatchElements();
    if (this.watchPlayerKind === "video" && video && Number.isFinite(video.duration)) {
      return Number(video.duration) || 0;
    }
    if (this.watchPlayerKind === "youtube" && this.watchYtPlayer && this.watchYtReady) {
      try {
        return Number(this.watchYtPlayer.getDuration()) || 0;
      } catch {
        return 0;
      }
    }
    return 0;
  }

  emitWatchTimelineAction(action, explicitTime) {
    if (this.watchPlayerKind === "none") {
      this.setWatchStatus("Add a media link first.");
      return;
    }
    if (this.watchPlayerKind === "iframe") {
      this.setWatchStatus("This embedded link does not expose synced playback controls.");
      return;
    }

    const { rate } = this.getWatchElements();
    const playbackRate = Math.max(0.25, Math.min(2, Number(rate?.value) || 1));
    const time = Number.isFinite(explicitTime) ? Number(explicitTime) : this.getCurrentWatchTime();
    const now = Date.now();
    const optimistic = {
      ...this.sharedTimeline,
      updatedAt: now,
      playbackRate
    };
    if (action === "play") {
      optimistic.playing = true;
      optimistic.currentTime = time;
    } else if (action === "pause") {
      optimistic.playing = false;
      optimistic.currentTime = time;
    } else if (action === "seek") {
      optimistic.currentTime = time;
    } else if (action === "rate") {
      optimistic.currentTime = time;
    }
    this.sharedTimeline = this.normalizeTimelinePayload(optimistic);
    this.renderWatchTimeline();
    this.applyWatchTimeline();

    this.socket.emit("timeline-action", {
      action,
      time,
      playbackRate
    });
  }

  renderWatchTimeline() {
    if (this.activeGame !== "watchparty") return;
    const { seek, clock, rate } = this.getWatchElements();
    if (!seek || !clock) return;

    const live = this.getLiveSharedTimelineTime();
    const duration = this.getWatchDuration();
    const max = duration > 0 ? Math.ceil(duration) : Math.max(7200, Math.ceil(live + 180));
    seek.max = String(max);
    if (!seek.matches(":active")) {
      seek.value = String(Math.min(max, Math.max(0, live)));
    }
    clock.textContent = duration > 0
      ? `${this.formatWatchClock(live)} / ${this.formatWatchClock(duration)}`
      : this.formatWatchClock(live);
    if (rate) rate.value = String(this.sharedTimeline.playbackRate || 1);
  }

  applyWatchTimeline() {
    if (this.activeGame !== "watchparty") return;
    const timeline = this.sharedTimeline;
    const targetTime = this.getLiveSharedTimelineTime();
    const { video } = this.getWatchElements();

    if (this.watchPlayerKind === "video" && video && video.src) {
      this.watchSyncing = true;
      if (Math.abs((Number(video.currentTime) || 0) - targetTime) > 1.3) {
        video.currentTime = targetTime;
      }
      if (Math.abs((Number(video.playbackRate) || 1) - timeline.playbackRate) > 0.01) {
        video.playbackRate = timeline.playbackRate;
      }
      if (timeline.playing && video.paused) {
        video.play().catch(() => null);
      } else if (!timeline.playing && !video.paused) {
        video.pause();
      }
      window.setTimeout(() => { this.watchSyncing = false; }, 140);
      return;
    }

    if (this.watchPlayerKind === "youtube" && this.watchYtPlayer && this.watchYtReady) {
      try {
        this.watchSyncing = true;
        const now = Number(this.watchYtPlayer.getCurrentTime()) || 0;
        if (Math.abs(now - targetTime) > 1.8) {
          this.watchYtPlayer.seekTo(targetTime, true);
        }
        const rates = this.watchYtPlayer.getAvailablePlaybackRates?.() || [];
        if (rates.includes(timeline.playbackRate)) {
          this.watchYtPlayer.setPlaybackRate(timeline.playbackRate);
        }
        if (timeline.playing) {
          this.watchYtPlayer.playVideo();
        } else {
          this.watchYtPlayer.pauseVideo();
        }
      } catch {
        // ignore sync failures
      }
      window.setTimeout(() => { this.watchSyncing = false; }, 240);
    }
  }

  startWatchLoop() {
    this.stopWatchLoop();
    this.watchInterval = window.setInterval(() => {
      this.renderWatchTimeline();
      this.applyWatchTimeline();
    }, 420);
  }

  stopWatchLoop() {
    if (this.watchInterval) {
      window.clearInterval(this.watchInterval);
      this.watchInterval = null;
    }
  }

  async toggleWatchFullscreen() {
    const { stage } = this.getWatchElements();
    if (!stage) return;
    try {
      if (document.fullscreenElement === stage) {
        await document.exitFullscreen();
      } else if (typeof stage.requestFullscreen === "function") {
        await stage.requestFullscreen();
      }
    } catch {
      // ignore browser restrictions
    }
  }

  initAiRoast() {
    const options = this.participants
      .map((participant) => {
        const safeName = String(participant?.name || "Guest").replace(/</g, "&lt;").replace(/>/g, "&gt;");
        const selected = participant.id === this.meId ? "selected" : "";
        return `<option value="${participant.id}" ${selected}>${safeName}</option>`;
      })
      .join("");

    this.gameArea.innerHTML = `
      <div class="ai-lab-shell ai-roast-shell">
        <h2>🎤 AI Roast Mode</h2>
        <p class="ai-lab-sub">Light playful roast generator with safe, friendly humor.</p>
        <div class="ai-lab-controls">
          <label for="aiRoastTarget">Roast target</label>
          <select id="aiRoastTarget">${options || `<option value="${this.meId}">You</option>`}</select>
          <button id="btnAiRoastGenerate" class="lp-btn-primary">Generate Roast</button>
        </div>
        <div id="aiRoastOutput" class="ai-output-card">${this.latestAiRoast ? this.formatRoastHtml(this.latestAiRoast) : "Tap generate to start the banter."}</div>
      </div>
    `;

    document.getElementById("btnAiRoastGenerate")?.addEventListener("click", () => {
      const targetId = document.getElementById("aiRoastTarget")?.value || this.meId;
      this.socket.emit("fun:ai-roast-request", { roomId: this.roomId, targetId });
    });
  }

  formatRoastHtml(payload) {
    const safeText = String(payload?.text || "Roast loading...")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
    const safeTarget = String(payload?.targetName || "friend")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
    return `
      <div class="ai-roast-line">${safeText}</div>
      <div class="ai-roast-meta">Target: ${safeTarget}</div>
    `;
  }

  handleAiRoast(payload) {
    if (!payload) return;
    this.latestAiRoast = payload;
    if (this.activeGame !== "airoast") {
      this.addSystemMessage(`AI Roast dropped for ${payload.targetName || "your squad"}.`);
      return;
    }

    const output = document.getElementById("aiRoastOutput");
    if (!output) return;
    output.classList.remove("cinematic-pop");
    // Force reflow for replay animation.
    void output.offsetWidth;
    output.classList.add("cinematic-pop");
    output.innerHTML = this.formatRoastHtml(payload);
  }

  initAiStoryBuilder() {
    this.gameArea.innerHTML = `
      <div class="ai-lab-shell ai-story-shell">
        <h2>📝 AI Story Builder</h2>
        <p class="ai-lab-sub">Both users type one sentence each, then AI continues dramatically.</p>
        <form id="aiStoryForm" class="ai-story-form">
          <input id="aiStoryInput" type="text" maxlength="180" placeholder="Write one cinematic sentence..." required />
          <button type="submit" class="lp-btn-primary">Submit Sentence</button>
          <button id="btnStoryReset" type="button" class="toolbar-icon-btn">Reset Round</button>
        </form>
        <div id="aiStoryStatus" class="ai-story-status"></div>
        <div id="aiStoryPending" class="ai-story-pending"></div>
        <div id="aiStoryResult" class="ai-story-stage"></div>
      </div>
    `;

    document.getElementById("aiStoryForm")?.addEventListener("submit", (event) => {
      event.preventDefault();
      const input = document.getElementById("aiStoryInput");
      const sentence = String(input?.value || "").trim();
      if (!sentence) return;
      this.socket.emit("fun:story-submit", { roomId: this.roomId, sentence });
      if (input) input.value = "";
    });

    document.getElementById("btnStoryReset")?.addEventListener("click", () => {
      this.socket.emit("fun:story-reset", { roomId: this.roomId });
    });

    this.renderStoryProgress();
    this.renderStoryResult();
  }

  handleStoryProgress(payload) {
    this.storyPending = Array.isArray(payload?.pending) ? payload.pending : [];
    this.storyNeeded = Math.max(1, Number(payload?.needed) || 2);
    if (this.activeGame === "aistory") {
      this.renderStoryProgress();
    }
  }

  handleStoryReady(payload) {
    if (!payload) return;
    this.latestAiStory = payload;
    this.storyPending = [];
    if (this.activeGame !== "aistory") {
      this.addSystemMessage("New cinematic story is ready in AI Story Builder.");
      return;
    }
    this.renderStoryProgress();
    this.renderStoryResult(true);
  }

  renderStoryProgress() {
    const statusNode = document.getElementById("aiStoryStatus");
    const pendingNode = document.getElementById("aiStoryPending");
    if (!statusNode || !pendingNode) return;

    const count = Array.isArray(this.storyPending) ? this.storyPending.length : 0;
    statusNode.textContent = `Story queue: ${count}/${this.storyNeeded} sentence${this.storyNeeded > 1 ? "s" : ""}.`;
    pendingNode.innerHTML = (this.storyPending || [])
      .map((entry) => {
        const safeName = String(entry?.name || "Guest").replace(/</g, "&lt;").replace(/>/g, "&gt;");
        const safeSentence = String(entry?.sentence || "").replace(/</g, "&lt;").replace(/>/g, "&gt;");
        return `<div class="pending-line"><strong>${safeName}:</strong> ${safeSentence}</div>`;
      })
      .join("");
  }

  renderStoryResult(animate = false) {
    const storyNode = document.getElementById("aiStoryResult");
    if (!storyNode) return;
    if (!this.latestAiStory) {
      storyNode.innerHTML = "No story generated yet.";
      return;
    }

    const lines = Array.isArray(this.latestAiStory.lines) ? this.latestAiStory.lines : [];
    const lineHtml = lines
      .map((entry) => {
        const safeName = String(entry?.name || "Guest").replace(/</g, "&lt;").replace(/>/g, "&gt;");
        const safeSentence = String(entry?.sentence || "").replace(/</g, "&lt;").replace(/>/g, "&gt;");
        return `<p><span class="story-speaker">${safeName}</span> ${safeSentence}</p>`;
      })
      .join("");
    const continuation = String(this.latestAiStory.continuation || "")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");

    storyNode.innerHTML = `
      <div class="story-title">${this.latestAiStory.title || "Cinematic Story Drop"}</div>
      ${lineHtml}
      <p class="story-ai-line">🎬 ${continuation}</p>
    `;
    if (animate) {
      storyNode.classList.remove("cinematic-reveal");
      void storyNode.offsetWidth;
      storyNode.classList.add("cinematic-reveal");
    }
  }

  initAiMoodRemix() {
    this.gameArea.innerHTML = `
      <div class="ai-lab-shell ai-remix-shell">
        <h2>🎵 AI Mood Remix</h2>
        <p class="ai-lab-sub">AI generates a short playful tune based on both moods.</p>
        <div class="ai-lab-controls">
          <button id="btnGenerateMoodRemix" class="lp-btn-primary">Generate Remix</button>
          <button id="btnReplayMoodRemix" class="toolbar-icon-btn">Replay Tune</button>
        </div>
        <div id="aiMoodRemixOutput" class="ai-output-card">${this.latestMoodRemix ? this.renderMoodRemixHtml(this.latestMoodRemix) : "Generate a remix to begin."}</div>
        <div class="remix-bars" aria-hidden="true">
          <span></span><span></span><span></span><span></span><span></span><span></span>
        </div>
      </div>
    `;

    document.getElementById("btnGenerateMoodRemix")?.addEventListener("click", () => {
      this.socket.emit("fun:mood-remix-request", { roomId: this.roomId });
    });

    document.getElementById("btnReplayMoodRemix")?.addEventListener("click", () => {
      if (this.latestMoodRemix) this.playMoodRemix(this.latestMoodRemix);
    });
  }

  renderMoodRemixHtml(payload) {
    const safeTitle = String(payload?.title || "Mood Remix").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const safeVibe = String(payload?.vibe || "Playful").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const safeKey = String(payload?.key || "C major").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const moods = (payload?.moods || []).map((mood) => String(mood || "").replace(/</g, "&lt;").replace(/>/g, "&gt;"));
    return `
      <div class="remix-title">${safeTitle}</div>
      <div class="remix-meta">Vibe: ${safeVibe} • ${payload?.bpm || 90} BPM • Key: ${safeKey}</div>
      <div class="remix-moods">Mood Inputs: ${moods.join(" / ") || "N/A"}</div>
    `;
  }

  handleMoodRemix(payload) {
    if (!payload) return;
    this.latestMoodRemix = payload;
    if (this.activeGame === "aimood") {
      const output = document.getElementById("aiMoodRemixOutput");
      if (output) {
        output.classList.remove("cinematic-pop");
        void output.offsetWidth;
        output.classList.add("cinematic-pop");
        output.innerHTML = this.renderMoodRemixHtml(payload);
      }
    } else {
      this.addSystemMessage(`Mood remix generated: ${payload.title || "New track"}.`);
    }
    this.playMoodRemix(payload);
  }

  stopMoodRemix() {
    this.remixTimeouts.forEach((id) => window.clearTimeout(id));
    this.remixTimeouts = [];

    this.remixNodes.forEach((node) => {
      try {
        if (typeof node.stop === "function") node.stop();
      } catch {
        // ignore stop errors
      }
      try {
        if (typeof node.disconnect === "function") node.disconnect();
      } catch {
        // ignore disconnect errors
      }
    });
    this.remixNodes = [];
  }

  playMoodRemix(payload) {
    const notes = Array.isArray(payload?.notes) ? payload.notes : [];
    if (notes.length === 0) return;

    const ctx = this.ensureAudioContext();
    if (!ctx) return;
    ctx.resume().catch(() => null);

    this.stopMoodRemix();

    const bpm = Math.max(70, Math.min(140, Number(payload?.bpm) || 92));
    const beat = 60 / bpm;
    const start = ctx.currentTime + 0.04;
    const isEnergetic = bpm >= 100;
    const waveform = isEnergetic ? "triangle" : "sine";

    notes.forEach((frequency, index) => {
      const safeFrequency = Math.max(90, Math.min(1400, Number(frequency) || 220));
      const noteStart = start + index * (beat * 0.55);
      const noteEnd = noteStart + beat * 0.48;

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = waveform;
      osc.frequency.value = safeFrequency;

      gain.gain.setValueAtTime(0.0001, noteStart);
      gain.gain.exponentialRampToValueAtTime(isEnergetic ? 0.048 : 0.034, noteStart + 0.04);
      gain.gain.exponentialRampToValueAtTime(0.0001, noteEnd);

      osc.connect(gain).connect(ctx.destination);
      osc.start(noteStart);
      osc.stop(noteEnd + 0.02);
      this.remixNodes.push(osc, gain);
    });

    const cleanupDelay = Math.round((notes.length * beat * 0.65 + 0.2) * 1000);
    const cleanupId = window.setTimeout(() => this.stopMoodRemix(), cleanupDelay);
    this.remixTimeouts.push(cleanupId);
  }

  addPoints(amt) {
    const safe = Math.max(0, Number(amt) || 0);
    if (!safe) return;

    this.points += safe;
    this.streak += 1;
    if (this.pointsDisplay) this.pointsDisplay.textContent = String(this.points);
    if (this.streakDisplay) this.streakDisplay.textContent = String(this.streak);
    this.socket.emit("fun:add-points", { roomId: this.roomId, points: safe });
    if (safe >= 4) {
      const level = safe >= 10 ? 3 : safe >= 6 ? 2 : 1;
      this.emitCrowdHype({ reason: "score", strength: level });
    }
  }

  syncPoints(payload) {
    const p1 = Number(payload?.p1) || 0;
    const p2 = Number(payload?.p2) || 0;
    const total = Number(payload?.total) || 0;
    this.scores = { p1, p2 };

    if (this.p1ScoreDisplay) this.p1ScoreDisplay.textContent = String(p1);
    if (this.p2ScoreDisplay) this.p2ScoreDisplay.textContent = String(p2);
    if (this.pointsDisplay) this.pointsDisplay.textContent = String(total);
  }

  triggerChaos() {
    this.socket.emit("fun:trigger-chaos", { roomId: this.roomId });
    this.emitCrowdHype({ reason: "chaos", strength: 3, force: true });
  }

  applyChaosEffect() {
    const effects = ["chaos-disco", "chaos-shake"];
    const effect = effects[Math.floor(Math.random() * effects.length)];
    document.body.classList.add(effect);
    window.setTimeout(() => document.body.classList.remove(effect), 1800);
  }

  triggerReactionStorm() {
    const count = 12;
    this.emitCrowdHype({ reason: "reaction", strength: 2, force: true });
    for (let i = 0; i < count; i += 1) {
      window.setTimeout(() => {
        const emoji = this.reactionPool[Math.floor(Math.random() * this.reactionPool.length)];
        this.socket.emit("fun:reaction", { roomId: this.roomId, emoji });
      }, i * 80);
    }
  }

  showReaction(emoji) {
    const token = document.createElement("div");
    token.className = "floating-reaction";
    token.textContent = emoji || "🎉";
    token.style.left = `${Math.random() * 80 + 10}%`;
    document.body.appendChild(token);
    window.setTimeout(() => token.remove(), 1800);
  }
}

window.FunMode = FunMode;
