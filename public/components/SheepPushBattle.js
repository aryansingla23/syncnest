(function initSheepPushBattle(global) {
  const TYPE_META = {
    small: { label: "Small Sheep", emoji: "🐑", cost: 20 },
    medium: { label: "Medium Sheep", emoji: "🐏", cost: 32 },
    large: { label: "Large Sheep", emoji: "🐐", cost: 46 }
  };

  class SheepPushBattle {
    constructor(socket) {
      this.socket = socket;
      this.active = false;
      this.selectedLane = 0;
      this.state = null;
      this.lanes = [];
      this.energySystem = null;
      this.lastWinner = null;
      this.didRequestState = false;
      this.boundOnState = (payload) => this.handleState(payload?.battle || null);
      this.boundOnSpawnResult = (payload) => this.handleSpawnResult(payload || {});
      this.boundOnSpawned = (payload) => this.handleSpawned(payload || {});
      this.boundOnStopped = () => this.handleStopped();

      this.mount();
      this.bindSocket();
      this.startModeWatcher();
    }

    mount() {
      const shell = document.querySelector("#playyardPanel .playyard-full-shell");
      const gameRow = document.querySelector("#playyardPanel .playyard-games");
      if (!shell || !gameRow) return;

      this.shell = shell;
      this.gameRow = gameRow;

      this.openButton = document.createElement("button");
      this.openButton.type = "button";
      this.openButton.className = "playyard-game-btn spb-launch-btn";
      this.openButton.textContent = "🐑 Sheep Push Battle";
      this.gameRow.insertBefore(this.openButton, this.gameRow.querySelector("#playyardStartRoundBtn") || null);

      this.panel = document.createElement("section");
      this.panel.className = "spb-panel hidden";
      this.panel.innerHTML = `
        <header class="spb-top">
          <div class="spb-head-left">
            <h3>Sheep Push Battle</h3>
            <p>Capture 2 lanes or lead after 90s.</p>
          </div>
          <div class="spb-head-right">
            <div class="spb-timer" id="spbTimer">01:30</div>
            <button type="button" class="spb-fs-btn" id="spbFullscreenBtn">⛶ Fullscreen</button>
            <button type="button" class="spb-close-btn">✕ Exit</button>
          </div>
        </header>

        <section class="spb-scoreboard">
          <article class="spb-score-card spb-score-card--left">
            <h4 id="spbLeftName">Player A</h4>
            <strong id="spbLeftScore">0</strong>
          </article>
          <div class="spb-score-vs">VS</div>
          <article class="spb-score-card spb-score-card--right">
            <h4 id="spbRightName">Player B</h4>
            <strong id="spbRightScore">0</strong>
          </article>
        </section>

        <section class="spb-lanes" id="spbLanes"></section>

        <section class="spb-bottom">
          <div class="spb-controls-top">
            <div class="spb-next-card" id="spbNextCard">
              <span class="spb-next-label">Next Ready</span>
              <strong id="spbNextSheepText">🐑 Small Sheep (20)</strong>
            </div>
          </div>

          <div class="spb-lane-hint">Tap a lane to deploy the next random sheep.</div>

          <div class="spb-energy-wrap" id="spbEnergyWrap"></div>
          <div class="spb-status" id="spbStatus">Select Sheep Push Battle to begin.</div>
        </section>

        <div class="spb-win-burst" id="spbWinBurst" aria-hidden="true"></div>
      `;

      const miniCall = this.shell.querySelector("#playyardMiniCall");
      if (miniCall && miniCall.parentElement === this.shell) {
        this.shell.insertBefore(this.panel, miniCall);
      } else {
        this.shell.appendChild(this.panel);
      }

      this.timerEl = this.panel.querySelector("#spbTimer");
      this.leftNameEl = this.panel.querySelector("#spbLeftName");
      this.rightNameEl = this.panel.querySelector("#spbRightName");
      this.leftScoreEl = this.panel.querySelector("#spbLeftScore");
      this.rightScoreEl = this.panel.querySelector("#spbRightScore");
      this.lanesWrap = this.panel.querySelector("#spbLanes");
      this.nextSheepTextEl = this.panel.querySelector("#spbNextSheepText");
      this.statusEl = this.panel.querySelector("#spbStatus");
      this.fullscreenBtn = this.panel.querySelector("#spbFullscreenBtn");
      this.closeBtn = this.panel.querySelector(".spb-close-btn");
      this.winBurst = this.panel.querySelector("#spbWinBurst");

      this.energySystem = new global.SheepPushBattleEnergySystem(this.panel.querySelector("#spbEnergyWrap"));

      this.lanes = [0, 1, 2].map((index) => {
        const lane = new global.SheepPushBattleLane(index, (laneIdx) => this.handleLaneDeploy(laneIdx));
        this.lanesWrap.appendChild(lane.node);
        return lane;
      });

      this.openButton.addEventListener("click", () => this.enter({ autoFullscreen: true }));
      this.fullscreenBtn?.addEventListener("click", () => this.toggleFullscreen());
      this.closeBtn.addEventListener("click", () => this.exit());
      this.boundOnFullscreenChange = () => this.refreshFullscreenButton();
      document.addEventListener("fullscreenchange", this.boundOnFullscreenChange);

      this.setLane(0);
      this.render();
      this.refreshFullscreenButton();
    }

    bindSocket() {
      if (!this.socket) return;
      this.socket.on("sheep:state", this.boundOnState);
      this.socket.on("sheep:spawn-result", this.boundOnSpawnResult);
      this.socket.on("sheep:spawned", this.boundOnSpawned);
      this.socket.on("sheep:match-stopped", this.boundOnStopped);
    }

    startModeWatcher() {
      this.modeWatcher = window.setInterval(() => {
        const inPlayyardMode = document.body.classList.contains("playyard-room-active");

        if (inPlayyardMode && !this.didRequestState) {
          this.didRequestState = true;
          this.socket.emit("sheep:request-state");
        }

        if (!inPlayyardMode) {
          this.didRequestState = false;
          if (this.active) {
            this.exit(false);
          }
        }

        this.updateTimerOnly();
      }, 200);
    }

    setLane(index) {
      const safe = Math.max(0, Math.min(2, Number(index) || 0));
      this.selectedLane = safe;
      this.lanes.forEach((lane) => lane.setSelected(lane.index === safe));
    }

    handleLaneDeploy(laneIdx) {
      this.setLane(laneIdx);
      const battle = this.state || null;
      const status = String(battle?.status || "idle");
      if (status !== "running" && status !== "idle") {
        return;
      }

      this.socket.emit("sheep:spawn", { laneIndex: laneIdx });
    }

    enter({ autoFullscreen = false } = {}) {
      if (!this.shell || !this.panel) return;
      this.active = true;
      this.openButton.classList.add("active");
      this.panel.classList.remove("hidden");
      this.shell.classList.add("spb-active");
      this.socket.emit("sheep:request-state");
      this.statusEl.textContent = "Tap a lane to deploy your next random sheep.";
      if (autoFullscreen) {
        void this.ensureFullscreen();
      }
      this.refreshFullscreenButton();
      window.dispatchEvent(new CustomEvent("playyard:sheep-battle-visibility", { detail: { active: true } }));
    }

    exit(updateStatus = true) {
      if (!this.shell || !this.panel) return;
      this.active = false;
      this.openButton.classList.remove("active");
      this.panel.classList.add("hidden");
      this.shell.classList.remove("spb-active");
      if (updateStatus) {
        this.statusEl.textContent = "Sheep Push Battle paused.";
      }
      this.refreshFullscreenButton();
      window.dispatchEvent(new CustomEvent("playyard:sheep-battle-visibility", { detail: { active: false } }));
    }

    isFullscreenActive() {
      return Boolean(this.shell && document.fullscreenElement === this.shell);
    }

    refreshFullscreenButton() {
      if (!this.fullscreenBtn) return;
      const active = this.isFullscreenActive();
      this.fullscreenBtn.classList.toggle("active", active);
      this.fullscreenBtn.textContent = active ? "✕ Exit Fullscreen" : "⛶ Fullscreen";
      this.fullscreenBtn.setAttribute("aria-label", active ? "Exit fullscreen battle" : "Fullscreen battle");
    }

    async toggleFullscreen() {
      if (!this.shell || typeof this.shell.requestFullscreen !== "function") return;
      const active = this.isFullscreenActive();
      try {
        if (active && document.fullscreenElement) {
          await document.exitFullscreen();
        } else {
          if (document.fullscreenElement && document.fullscreenElement !== this.shell) {
            await document.exitFullscreen();
          }
          await this.shell.requestFullscreen();
        }
      } catch {
        // ignore browser fullscreen restrictions
      }
      this.refreshFullscreenButton();
    }

    async ensureFullscreen() {
      if (!this.shell || typeof this.shell.requestFullscreen !== "function") return;
      if (this.isFullscreenActive()) return;
      try {
        if (document.fullscreenElement && document.fullscreenElement !== this.shell) {
          await document.exitFullscreen();
        }
        await this.shell.requestFullscreen();
      } catch {
        // ignore browser fullscreen restrictions
      }
      this.refreshFullscreenButton();
    }

    handleStopped() {
      if (!this.active) return;
      this.statusEl.textContent = "Match stopped.";
    }

    handleSpawnResult(payload) {
      if (!this.active || !payload || payload.ok !== false) return;
      const reason = String(payload.reason || "");
      const nextType = String(this.state?.nextSheep || "small");
      const nextMeta = TYPE_META[nextType] || TYPE_META.small;
      if (reason === "low-energy") {
        this.statusEl.textContent = `Need ${nextMeta.cost} energy for ${nextMeta.label}.`;
      } else if (reason === "lane-captured") {
        this.statusEl.textContent = "That lane is captured. Tap another lane.";
      } else {
        this.statusEl.textContent = "Cannot spawn sheep right now.";
      }
    }

    handleSpawned(payload) {
      if (!this.active) return;
      const laneNum = Number(payload?.laneIndex);
      const laneLabel = Number.isInteger(laneNum) ? `Lane ${laneNum + 1}` : "selected lane";
      const sheepType = String(payload?.sheepType || "small");
      const nextMeta = TYPE_META[sheepType] || TYPE_META.small;
      this.statusEl.textContent = `${nextMeta.emoji} ${nextMeta.label} deployed in ${laneLabel}.`;
    }

    handleState(battle) {
      this.state = battle;
      this.render();
    }

    formatTime(ms) {
      const total = Math.max(0, Math.ceil(Number(ms || 0) / 1000));
      const minutes = Math.floor(total / 60);
      const seconds = total % 60;
      return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
    }

    updateTimerOnly() {
      if (!this.state || !this.timerEl) return;
      if (this.state.status === "running") {
        const nowRemaining = Math.max(0, Number(this.state.endsAt || 0) - Date.now());
        this.timerEl.textContent = this.formatTime(nowRemaining);
      }
    }

    renderWinnerBurst(winnerSide) {
      if (!this.winBurst || !winnerSide || winnerSide === this.lastWinner || winnerSide === "draw") return;
      this.lastWinner = winnerSide;
      this.winBurst.classList.remove("spb-win-burst--show");
      void this.winBurst.offsetWidth;
      this.winBurst.classList.add("spb-win-burst--show");
      window.setTimeout(() => {
        this.winBurst.classList.remove("spb-win-burst--show");
      }, 1600);
    }

    render() {
      if (!this.panel) return;
      const battle = this.state;
      if (!battle) {
        this.timerEl.textContent = "01:30";
        this.leftNameEl.textContent = "Player A";
        this.rightNameEl.textContent = "Player B";
        this.leftScoreEl.textContent = "0";
        this.rightScoreEl.textContent = "0";
        if (this.nextSheepTextEl) {
          this.nextSheepTextEl.textContent = "🐑 Small Sheep (20)";
        }
        this.energySystem?.update(0, 100);
        return;
      }

      this.leftNameEl.textContent = battle.players?.left?.name || "Left Base";
      this.rightNameEl.textContent = battle.players?.right?.name || "Right Base";
      this.leftScoreEl.textContent = String(Number(battle.score?.left || 0));
      this.rightScoreEl.textContent = String(Number(battle.score?.right || 0));

      if (battle.status === "running") {
        this.timerEl.textContent = this.formatTime(Math.max(0, Number(battle.endsAt || 0) - Date.now()));
      } else {
        this.timerEl.textContent = this.formatTime(battle.remainingMs || 0);
      }

      const status = String(battle.status || "idle");
      const youSide = String(battle.youSide || "");
      const youSideLabel = youSide ? `You are ${youSide.toUpperCase()}` : "Waiting for player slot";
      if (status === "ended") {
        if (battle.winnerSide === "draw") {
          this.statusEl.textContent = `${youSideLabel} • Draw match.`;
        } else {
          const won = battle.winnerSide === youSide;
          this.statusEl.textContent = won
            ? `${youSideLabel} • Victory! You captured the map.`
            : `${youSideLabel} • Defeat. Reload and push back.`;
          this.renderWinnerBurst(battle.winnerSide);
        }
      } else {
        this.statusEl.textContent = `${youSideLabel} • Tap a lane to deploy your next sheep.`;
      }

      const energyMax = Number(battle.energy?.max || 100);
      const yourEnergy = Number(battle.energy?.you || 0);
      this.energySystem?.update(yourEnergy, energyMax);
      const nextType = String(battle.nextSheep || "small");
      const nextMeta = TYPE_META[nextType] || TYPE_META.small;
      if (this.nextSheepTextEl) {
        this.nextSheepTextEl.textContent = `${nextMeta.emoji} ${nextMeta.label} (${nextMeta.cost})`;
      }
      if (status !== "ended") {
        this.statusEl.textContent = `${youSideLabel} • Next ready: ${nextMeta.emoji} ${nextMeta.label}. Tap a lane to deploy.`;
      }

      const now = Date.now();
      const lanes = Array.isArray(battle.lanes) ? battle.lanes : [];
      this.lanes.forEach((lane, idx) => {
        lane.setLaneData(lanes[idx], now);
      });
    }
  }

  function bootSheepPushBattle() {
    if (global.__sheepPushBattleInstance) return;
    if (!global.socket) {
      window.setTimeout(bootSheepPushBattle, 160);
      return;
    }
    if (!global.SheepPushBattleLane || !global.SheepPushBattleEnergySystem || !document.querySelector("#playyardPanel .playyard-full-shell")) {
      window.setTimeout(bootSheepPushBattle, 120);
      return;
    }

    global.__sheepPushBattleInstance = new SheepPushBattle(global.socket);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bootSheepPushBattle, { once: true });
  } else {
    bootSheepPushBattle();
  }
})(window);
