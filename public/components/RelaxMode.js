(function initRelaxModeComponent() {
  function normalizeLink(value) {
    const trimmed = String(value || "").trim();
    if (!trimmed) return "";
    if (/^https?:\/\//i.test(trimmed)) return trimmed;
    return `https://${trimmed}`;
  }

  function extractYouTubeId(url) {
    try {
      const parsed = new URL(url);
      if (parsed.hostname.includes("youtube.com")) {
        return parsed.searchParams.get("v") || null;
      }
      if (parsed.hostname.includes("youtu.be")) {
        return parsed.pathname.replace("/", "") || null;
      }
    } catch {
      // ignore
    }
    return null;
  }

  function toEmbedUrl(url) {
    try {
      const parsed = new URL(url);
      const ytId = extractYouTubeId(url);
      if (ytId) return `https://www.youtube.com/embed/${ytId}`;
      return parsed.toString();
    } catch {
      return "";
    }
  }

  function formatTime(seconds) {
    const s = Math.max(0, Math.floor(seconds));
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${String(sec).padStart(2, "0")}`;
  }

  function readStorageWithLegacy(primaryKey, legacyKey = "") {
    const primaryValue = localStorage.getItem(primaryKey);
    if (primaryValue !== null) return primaryValue;
    if (!legacyKey) return null;
    return localStorage.getItem(legacyKey);
  }

  function writeStorageWithLegacy(primaryKey, value, legacyKey = "") {
    localStorage.setItem(primaryKey, value);
    if (legacyKey) localStorage.setItem(legacyKey, value);
  }

  class RelaxMode {
    constructor({ ui, socket, getPartner, launchReaction, copyInviteLink }) {
      this.ui = ui;
      this.socket = socket;
      this.getPartner = getPartner;
      this.launchReaction = launchReaction;
      this.copyInviteLink = copyInviteLink;
      this.timerInterval = null;
      this.partnerSyncInterval = null;
      this.ytSyncInterval = null;
      this.breakEndsAt = null;
      this.currentScene = "rain";
      this.partnerMaximized = false;
      this.memories = [];
      this.memoryKey = `syncnest_break_memories_${window.location.pathname}`;
      this.memoryLegacyKey = `pulseroom_break_memories_${window.location.pathname}`;
      this.handleFullscreenChange = () => this.updateFullscreenButton();
      this.ytPlayer = null;
      this.ytReady = false;
      this.currentYtId = null;
      this.isSyncingYT = false;

      // Our Song state
      this.ourSong = { url: "", title: "" };
      this.ourSongKey = `syncnest_our_song_${window.location.pathname}`;
      this.ourSongLegacyKey = `pulseroom_our_song_${window.location.pathname}`;

      this.prompt = new window.Prompt({ mountEl: ui.breakPromptPanel });
      this.drawingBoard = new window.DrawingBoard({
        mountEl: ui.breakDrawingPanel,
        onStroke: (stroke) => this.socket.emit("break-drawing-event", { stroke }),
        onClear: () => this.socket.emit("break-clear-drawing")
      });
      this.breathingInterval = null;
      this.breathingActive = false;
      this.bindUI();
      this.loadMemories();
      this.loadOurSong();
      this.renderPartnerCard();
      this.setScene("rain", false);
      document.addEventListener("fullscreenchange", this.handleFullscreenChange);
      this.updateFullscreenButton();

      // Our Song socket listener
      this.socket.on("break-our-song-updated", ({ url, title }) => {
        this.ourSong = { url: String(url || ""), title: String(title || "") };
        this._persistOurSong();
        this.renderOurSong();
      });

      // Load YouTube IFrame API if not already loaded
      this._loadYTApi();
    }

    _loadYTApi() {
      if (window.YT && window.YT.Player) {
        // Already loaded
        return;
      }
      if (!document.getElementById("yt-iframe-api-script")) {
        const tag = document.createElement("script");
        tag.id = "yt-iframe-api-script";
        tag.src = "https://www.youtube.com/iframe_api";
        document.head.appendChild(tag);
      }
      // YT API calls onYouTubeIframeAPIReady when ready
      const prev = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => {
        if (typeof prev === "function") prev();
        // If we have a pending video to load, do it now
        if (this.currentYtId) {
          this._createYTPlayer(this.currentYtId);
        }
      };
    }

    _createYTPlayer(videoId) {
      if (!window.YT || !window.YT.Player) {
        this.currentYtId = videoId;
        return;
      }
      const container = document.getElementById("breakYTPlayer");
      if (!container) return;

      // Destroy existing player
      if (this.ytPlayer) {
        try { this.ytPlayer.destroy(); } catch { /* ignore */ }
        this.ytPlayer = null;
        this.ytReady = false;
      }

      this.ytPlayer = new window.YT.Player("breakYTPlayer", {
        videoId,
        playerVars: {
          autoplay: 0,
          controls: 0,
          rel: 0,
          modestbranding: 1,
          enablejsapi: 1
        },
        events: {
          onReady: () => {
            this.ytReady = true;
            this._startYTSyncLoop();
          },
          onStateChange: (event) => {
            // Only emit if user triggered (not from our own sync)
            if (this.isSyncingYT) return;
            if (event.data === window.YT.PlayerState.PLAYING) {
              const t = this.ytPlayer.getCurrentTime();
              this.socket.emit("timeline-action", { action: "play", time: t, playbackRate: 1 });
            } else if (event.data === window.YT.PlayerState.PAUSED) {
              const t = this.ytPlayer.getCurrentTime();
              this.socket.emit("timeline-action", { action: "pause", time: t, playbackRate: 1 });
            }
          }
        }
      });
    }

    _startYTSyncLoop() {
      if (this.ytSyncInterval) window.clearInterval(this.ytSyncInterval);
      this.ytSyncInterval = window.setInterval(() => {
        this._updateYTSeekBar();
      }, 1000);
    }

    _stopYTSyncLoop() {
      if (this.ytSyncInterval) {
        window.clearInterval(this.ytSyncInterval);
        this.ytSyncInterval = null;
      }
    }

    _updateYTSeekBar() {
      if (!this.ytPlayer || !this.ytReady) return;
      try {
        const current = this.ytPlayer.getCurrentTime() || 0;
        const duration = this.ytPlayer.getDuration() || 0;
        const seekSlider = document.getElementById("breakSeekSlider");
        const timeLabel = document.getElementById("breakSyncTime");
        if (seekSlider) {
          seekSlider.max = String(Math.ceil(duration));
          seekSlider.value = String(Math.floor(current));
        }
        if (timeLabel) {
          timeLabel.textContent = `${formatTime(current)} / ${formatTime(duration)}`;
        }
      } catch { /* ignore */ }
    }

    applyTimelineToYT(timeline) {
      if (!this.ytPlayer || !this.ytReady) return;
      try {
        this.isSyncingYT = true;
        const targetTime = timeline.currentTime || 0;
        const currentTime = this.ytPlayer.getCurrentTime() || 0;
        if (Math.abs(currentTime - targetTime) > 2) {
          this.ytPlayer.seekTo(targetTime, true);
        }
        if (timeline.playing) {
          this.ytPlayer.playVideo();
        } else {
          this.ytPlayer.pauseVideo();
        }
        window.setTimeout(() => { this.isSyncingYT = false; }, 300);
      } catch { /* ignore */ }
    }

    bindUI() {
      const {
        breakStart5Btn,
        breakStart10Btn,
        breakPlayTogetherBtn,
        breakMediaLinkInput,
        breakSceneButtons,
        breakMoodSetBtn,
        breakMoodSelect,
        breakMaximizePartnerBtn,
        breakPartnerMinimizeBtn,
        breakReactionButtons,
        breakToolbarShareBtn,
        breakToolbarFullscreenBtn,
        breakToolbarReactionsBtn,
        breakToolbarSceneBtn,
        breakToolbarDrawingBtn,
        breakToolbarPromptBtn,
        breakToolbarFullscreenVideoBtn,
        breakToolbarSaveMomentBtn,
        breakShowMomentsBtn,
        breakToolbarEndBtn,
        btnToggleWellness
      } = this.ui;

      btnToggleWellness?.addEventListener("click", () => this.toggleBreathingGuide());

      // Our Song bindings
      document.getElementById("ourSongSaveBtn")?.addEventListener("click", () => this.saveOurSong());
      document.getElementById("ourSongPlayBtn")?.addEventListener("click", () => this.playOurSong());

      document.querySelectorAll(".preset-btn").forEach(btn => {
        btn.addEventListener("click", () => this.applyVibePreset(btn.dataset.preset));
      });

      breakStart5Btn?.addEventListener("click", () => this.startBreak(5 * 60));
      breakStart10Btn?.addEventListener("click", () => this.startBreak(10 * 60));
      breakPlayTogetherBtn?.addEventListener("click", () => {
        const link = normalizeLink(breakMediaLinkInput?.value || "");
        this.setMedia(link, true);
      });

      // Sync play/pause buttons
      document.getElementById("breakSyncPlayBtn")?.addEventListener("click", () => {
        if (this.ytPlayer && this.ytReady) {
          const t = this.ytPlayer.getCurrentTime() || 0;
          this.socket.emit("timeline-action", { action: "play", time: t, playbackRate: 1 });
        }
      });
      document.getElementById("breakSyncPauseBtn")?.addEventListener("click", () => {
        if (this.ytPlayer && this.ytReady) {
          const t = this.ytPlayer.getCurrentTime() || 0;
          this.socket.emit("timeline-action", { action: "pause", time: t, playbackRate: 1 });
        }
      });

      // Seek slider
      const seekSlider = document.getElementById("breakSeekSlider");
      if (seekSlider) {
        seekSlider.addEventListener("change", () => {
          const t = Number(seekSlider.value);
          this.socket.emit("timeline-action", { action: "seek", time: t, playbackRate: 1 });
          if (this.ytPlayer && this.ytReady) {
            this.isSyncingYT = true;
            this.ytPlayer.seekTo(t, true);
            window.setTimeout(() => { this.isSyncingYT = false; }, 300);
          }
        });
      }

      // Fullscreen button for YouTube player
      document.getElementById("breakYTFullscreenBtn")?.addEventListener("click", () => {
        this.toggleYTFullscreen();
      });
      // Update button text on fullscreen change
      document.addEventListener("fullscreenchange", () => {
        const btn = document.getElementById("breakYTFullscreenBtn");
        if (btn) btn.textContent = document.fullscreenElement ? "✕ Exit" : "⛶";
      });

      breakSceneButtons.forEach((btn) => {
        btn.addEventListener("click", () => {
          const scene = btn.dataset.scene || "rain";
          this.setScene(scene, true);
        });
      });

      breakMoodSetBtn?.addEventListener("click", () => {
        const mood = String(breakMoodSelect?.value || "").trim();
        if (!mood) return;
        this.socket.emit("set-mood", { mood });
      });

      breakReactionButtons.forEach((btn) => {
        btn.addEventListener("click", () => {
          const emoji = btn.dataset.emoji || "❤️";
          this.socket.emit("quick-reaction", { emoji });
          if (typeof this.launchReaction === "function") this.launchReaction(emoji);
        });
      });

      breakToolbarShareBtn?.addEventListener("click", () => {
        if (typeof this.copyInviteLink === "function") this.copyInviteLink();
      });

      breakToolbarFullscreenBtn?.addEventListener("click", () => {
        this.toggleFullscreen();
      });
      breakToolbarFullscreenVideoBtn?.addEventListener("click", () => {
        this.toggleFullscreenVideo();
      });

      breakToolbarReactionsBtn?.addEventListener("click", () => {
        if (breakReactionButtons[0]) breakReactionButtons[0].focus();
      });

      breakToolbarSceneBtn?.addEventListener("click", () => {
        if (breakSceneButtons[0]) breakSceneButtons[0].focus();
      });

      this.ui.breakMaximizePartnerBtn?.addEventListener("click", () => {
        this.setPartnerMaximized(true);
      });

      this.ui.breakPartnerMinimizeBtn?.addEventListener("click", () => {
        this.setPartnerMaximized(false);
      });

      breakToolbarDrawingBtn?.addEventListener("click", () => {
        this.ui.breakDrawingPanel?.classList.toggle("hidden");
        breakToolbarDrawingBtn.classList.toggle("active", !this.ui.breakDrawingPanel?.classList.contains("hidden"));
      });

      breakToolbarPromptBtn?.addEventListener("click", () => {
        this.ui.breakPromptPanel?.classList.toggle("hidden");
        breakToolbarPromptBtn.classList.toggle("active", !this.ui.breakPromptPanel?.classList.contains("hidden"));
      });

      breakToolbarSaveMomentBtn?.addEventListener("click", () => {
        const memory = this.createMemory();
        this.addMemory(memory);
        this.socket.emit("break-memory-save", { memory });
        this.ui.breakMomentsPanel?.classList.remove("hidden");

        // Visual feedback
        const originalText = breakToolbarSaveMomentBtn.textContent;
        breakToolbarSaveMomentBtn.textContent = "✅";
        setTimeout(() => breakToolbarSaveMomentBtn.textContent = originalText, 1000);
      });

      breakShowMomentsBtn?.addEventListener("click", () => {
        this.ui.breakMomentsPanel?.classList.toggle("hidden");
        breakShowMomentsBtn.classList.toggle("active", !this.ui.breakMomentsPanel?.classList.contains("hidden"));
      });

      breakToolbarEndBtn?.addEventListener("click", () => {
        this.stopTimer();
        this.ui.breakOverNotice?.classList.add("hidden");
        this.socket.emit("set-room-mode", { mode: "study" });
      });

      breakMaximizePartnerBtn?.addEventListener("click", () => {
        this.togglePartnerMaximized();
      });

      breakPartnerMinimizeBtn?.addEventListener("click", () => {
        this.setPartnerMaximized(false);
      });
    }

    enter() {
      if (!this.breakEndsAt) {
        this.startBreak(10 * 60);
      } else {
        this.startTimerLoop();
      }
      this.renderPartnerCard();
      this.startPartnerSync();
      this.syncPartnerVideo();
    }

    leave() {
      this.stopTimer();
      this.stopPartnerSync();
      this._stopYTSyncLoop();
      this.stopBreathingGuide();
      this.setPartnerMaximized(false);
      if (
        document.fullscreenElement &&
        (
          document.fullscreenElement === this.ui.breakPanel ||
          document.fullscreenElement === this.ui.breakMediaStage ||
          document.fullscreenElement === document.documentElement
        )
      ) {
        document.exitFullscreen().catch(() => null);
      }
    }

    startBreak(duration) {
      const safeDuration = Number(duration) > 0 ? Number(duration) : 10 * 60;
      this.socket.emit("break-session-start", { duration: safeDuration });
    }

    syncBreakSession(payload) {
      this.breakEndsAt = Number(payload?.endsAt) || null;
      this.startTimerLoop();
      this.ui.breakOverNotice?.classList.add("hidden");
    }

    startTimerLoop() {
      this.stopTimer();
      this.renderTimer();
      this.timerInterval = window.setInterval(() => this.renderTimer(), 1000);
    }

    stopTimer() {
      if (this.timerInterval) {
        window.clearInterval(this.timerInterval);
        this.timerInterval = null;
      }
    }

    renderTimer() {
      if (!this.ui.breakTimerDisplay) return;
      if (!this.breakEndsAt) {
        this.ui.breakTimerDisplay.textContent = "10:00";
        return;
      }
      const diff = Math.max(0, Math.floor((this.breakEndsAt - Date.now()) / 1000));
      const mins = String(Math.floor(diff / 60)).padStart(2, "0");
      const secs = String(diff % 60).padStart(2, "0");
      this.ui.breakTimerDisplay.textContent = `${mins}:${secs}`;
      if (diff === 0) {
        this.stopTimer();
        this.ui.breakOverNotice?.classList.remove("hidden");
      }
    }

    setMedia(link, emit) {
      const iframe = this.ui.breakMediaIframe;
      const sceneEl = this.ui.breakAmbientScene;
      const ytWrap = document.getElementById("breakYTPlayerWrap");

      if (this.ui.breakMediaLinkInput) {
        this.ui.breakMediaLinkInput.value = link || "";
      }

      if (!link) {
        // Clear everything, show scene
        if (iframe) { iframe.src = ""; iframe.classList.add("hidden"); }
        ytWrap?.classList.add("hidden");
        sceneEl?.classList.remove("hidden");
        this._stopYTSyncLoop();
        if (emit) this.socket.emit("break-media-set", { url: "" });
        return;
      }

      const ytId = extractYouTubeId(link);
      if (ytId) {
        // Use YouTube IFrame API
        if (iframe) { iframe.src = ""; iframe.classList.add("hidden"); }
        sceneEl?.classList.add("hidden");
        ytWrap?.classList.remove("hidden");
        this.currentYtId = ytId;
        this._createYTPlayer(ytId);
      } else {
        // Non-YouTube: use iframe fallback
        ytWrap?.classList.add("hidden");
        this._stopYTSyncLoop();
        const embed = toEmbedUrl(link);
        if (embed && iframe) {
          iframe.src = embed;
          iframe.classList.remove("hidden");
          sceneEl?.classList.add("hidden");
        } else {
          if (iframe) { iframe.src = ""; iframe.classList.add("hidden"); }
          sceneEl?.classList.remove("hidden");
        }
      }

      if (emit) {
        this.socket.emit("break-media-set", { url: link || "" });
      }
    }

    setScene(scene, emit) {
      this.currentScene = scene || "rain";
      this.ui.breakSceneButtons.forEach((btn) => {
        btn.classList.toggle("active", btn.dataset.scene === this.currentScene);
      });
      this.ui.breakAmbientScene?.setAttribute("data-scene", this.currentScene);
      this.ui.breakAmbientScene?.classList.remove("scene-rain", "scene-beach", "scene-night-city", "scene-campfire");
      this.ui.breakAmbientScene?.classList.add(`scene-${this.currentScene}`);
      if (emit) {
        this.socket.emit("break-scene-set", { scene: this.currentScene });
      }
    }

    renderPartnerCard() {
      const partner = typeof this.getPartner === "function" ? this.getPartner() : null;
      if (this.ui.breakPartnerName) {
        this.ui.breakPartnerName.textContent = partner?.name || "Waiting for partner";
      }
      if (this.ui.breakPartnerMood) {
        this.ui.breakPartnerMood.textContent = `Mood: ${partner?.mood || "-"}`;
      }
      if (this.ui.breakPartnerVideoLabel) {
        this.ui.breakPartnerVideoLabel.textContent = partner?.name || "Partner";
      }
      this.syncPartnerVideo();
    }

    startPartnerSync() {
      this.stopPartnerSync();
      this.partnerSyncInterval = window.setInterval(() => this.syncPartnerVideo(), 1500);
    }

    stopPartnerSync() {
      if (this.partnerSyncInterval) {
        window.clearInterval(this.partnerSyncInterval);
        this.partnerSyncInterval = null;
      }
    }

    getRemoteVideoElement() {
      return document.querySelector("#remoteVideos video");
    }

    syncPartnerVideo() {
      const remoteVideo = this.getRemoteVideoElement();
      const previewVideo = this.ui.breakPartnerVideo;
      const maximizeBtn = this.ui.breakMaximizePartnerBtn;

      if (!previewVideo) return;

      if (!remoteVideo || !remoteVideo.srcObject) {
        previewVideo.srcObject = null;
        this.ui.breakPartnerVideoWrap?.classList.add("hidden");
        if (maximizeBtn) {
          maximizeBtn.disabled = true;
          maximizeBtn.textContent = "Partner video unavailable";
        }
        this.partnerMaximized = false;
        this.ui.breakMediaStage?.classList.remove("partner-video-focus");
        return;
      }

      if (previewVideo.srcObject !== remoteVideo.srcObject) {
        previewVideo.srcObject = remoteVideo.srcObject;
      }

      if (maximizeBtn) {
        maximizeBtn.disabled = false;
        maximizeBtn.textContent = this.partnerMaximized ? "Minimize partner" : "Maximize partner";
      }

      this.ui.breakPartnerVideoWrap?.classList.toggle("hidden", !this.partnerMaximized);
      this.ui.breakMediaStage?.classList.toggle("partner-video-focus", this.partnerMaximized);
    }

    togglePartnerMaximized() {
      this.setPartnerMaximized(!this.partnerMaximized);
    }

    async toggleYTFullscreen() {
      const target = document.getElementById("breakYTPlayerWrap");
      if (!target) return;
      try {
        if (document.fullscreenElement) {
          await document.exitFullscreen();
        } else {
          await target.requestFullscreen();
        }
      } catch {
        // ignore browser restrictions
      }
    }

    async toggleFullscreen() {
      const target = document.documentElement;
      if (!target) return;
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
        // ignore browser restrictions
      }
      this.updateFullscreenButton();
    }

    setPartnerMaximized(max) {
      this.partnerMaximized = Boolean(max);
      this.ui.breakPartnerVideoWrap?.classList.toggle("maximized", this.partnerMaximized);
      if (this.ui.breakMaximizePartnerBtn) this.ui.breakMaximizePartnerBtn.classList.toggle("hidden", this.partnerMaximized);
      if (this.ui.breakPartnerMinimizeBtn) this.ui.breakPartnerMinimizeBtn.classList.toggle("hidden", !this.partnerMaximized);
      this.syncPartnerVideo();
    }

    async toggleFullscreenVideo() {
      const target = this.ui.breakPartnerVideoWrap;
      if (!target || target.classList.contains("hidden")) {
        this.setPartnerMaximized(true);
        await new Promise(r => setTimeout(r, 50));
      }

      const realTarget = this.ui.breakPartnerVideoWrap;
      if (!realTarget) return;

      try {
        if (document.fullscreenElement) {
          await document.exitFullscreen();
        } else {
          await realTarget.requestFullscreen();
        }
      } catch {
        // ignore browser restrictions
      }
    }

    updateFullscreenButton() {
      const btn = this.ui.breakToolbarFullscreenBtn;
      if (!btn) return;
      const isFullscreen = document.fullscreenElement === document.documentElement;
      btn.textContent = isFullscreen ? "Exit Fullscreen" : "Fullscreen";
    }

    createMemory() {
      return {
        createdAt: Date.now(),
        scene: this.currentScene,
        mediaLink: this.ui.breakMediaLinkInput?.value || "",
        text: `Saved in ${this.currentScene} scene`
      };
    }

    addMemory(memory) {
      this.memories.push(memory);
      this.memories = this.memories.slice(-20);
      this.persistMemories();
      if (!this.ui.breakMemoriesList) return;
      this.ui.breakMemoriesList.innerHTML = "";
      this.memories
        .slice()
        .reverse()
        .forEach((item) => {
          const li = document.createElement("li");
          const time = new Date(item.createdAt || Date.now()).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
          li.textContent = `${time} • ${item.text || "Break moment"}`;
          this.ui.breakMemoriesList.appendChild(li);
        });
    }

    loadMemories() {
      try {
        const raw = readStorageWithLegacy(this.memoryKey, this.memoryLegacyKey);
        const parsed = raw ? JSON.parse(raw) : [];
        if (Array.isArray(parsed)) {
          parsed.forEach((memory) => this.addMemory(memory));
        }
      } catch {
        this.memories = [];
      }
    }

    persistMemories() {
      try {
        writeStorageWithLegacy(this.memoryKey, JSON.stringify(this.memories.slice(-20)), this.memoryLegacyKey);
      } catch {
        // ignore storage failures
      }
    }

    startBreathingGuide() {
      const el = this.ui.breathingGuide;
      const text = this.ui.breathingText;
      const toggleBtn = this.ui.btnToggleWellness;
      if (!el || !text) return;
      this.stopBreathingGuide();
      this.breathingActive = true;
      el.classList.remove("hidden");
      text.textContent = "Inhale...";
      toggleBtn?.classList.add("active");
      let phase = 0; // 0=inhale, 1=exhale
      this.breathingInterval = window.setInterval(() => {
        phase = 1 - phase;
        text.textContent = phase === 0 ? "Inhale..." : "Exhale...";
      }, 4000);
    }

    stopBreathingGuide() {
      const el = this.ui.breathingGuide;
      const toggleBtn = this.ui.btnToggleWellness;
      this.breathingActive = false;
      if (this.breathingInterval) {
        window.clearInterval(this.breathingInterval);
        this.breathingInterval = null;
      }
      el?.classList.add("hidden");
      toggleBtn?.classList.remove("active");
    }

    toggleBreathingGuide() {
      if (this.breathingActive) {
        this.stopBreathingGuide();
      } else {
        this.startBreathingGuide();
      }
    }

    applyVibePreset(type) {
      const presets = {
        lofi: "https://www.youtube.com/watch?v=jfKfPfyJRdk",
        cafe: "https://www.youtube.com/watch?v=h2S7YI3iR7Q",
        cyber: "https://www.youtube.com/watch?v=680X_6AihfE"
      };

      if (presets[type]) {
        this.ui.breakMediaLinkInput.value = presets[type];
        this.socket.emit("break-media-set", { url: presets[type] });
      }
    }

    triggerBurst(emoji) {
      const container = this.ui.burstContainer;
      if (!container) return;

      const count = 12;
      for (let i = 0; i < count; i++) {
        const span = document.createElement("span");
        span.className = "burst-emoji";
        span.textContent = emoji;

        const x = 40 + Math.random() * 20;
        const y = 40 + Math.random() * 20;

        span.style.left = `${x}%`;
        span.style.top = `${y}%`;

        const angle = Math.random() * Math.PI * 2;
        const dist = 150 + Math.random() * 250;
        const tx = Math.cos(angle) * dist;
        const ty = Math.sin(angle) * dist;

        span.style.setProperty("--tx", `${tx}px`);
        span.style.setProperty("--ty", `${ty}px`);

        container.appendChild(span);
        setTimeout(() => span.remove(), 1600);
      }
    }

    // --- Our Song ---
    saveOurSong() {
      const input = document.getElementById("ourSongInput");
      const rawUrl = String(input?.value || "").trim();
      if (!rawUrl) return;
      const url = normalizeLink(rawUrl);
      if (!url) return;

      // Derive a friendly title from the URL
      let title = url;
      try {
        const parsed = new URL(url);
        if (parsed.hostname.includes("youtube.com") || parsed.hostname.includes("youtu.be")) {
          const videoId = extractYouTubeId(url);
          title = videoId ? `YouTube · ${videoId}` : "YouTube Song";
        } else {
          title = parsed.hostname.replace(/^www\./, "");
        }
      } catch { /* ignore */ }

      this.ourSong = { url, title };
      this._persistOurSong();
      this.socket.emit("break-our-song-set", { url, title });
      this.renderOurSong();

      // Visual feedback on save button
      const saveBtn = document.getElementById("ourSongSaveBtn");
      if (saveBtn) {
        const orig = saveBtn.textContent;
        saveBtn.textContent = "✅ Saved!";
        setTimeout(() => { saveBtn.textContent = orig; }, 1500);
      }
    }

    playOurSong() {
      if (!this.ourSong.url) return;
      this.setMedia(this.ourSong.url, true);
      // Burst music notes to celebrate
      this.triggerBurst("🎵");
    }

    renderOurSong() {
      const titleEl = document.getElementById("ourSongTitle");
      const playBtn = document.getElementById("ourSongPlayBtn");
      const input = document.getElementById("ourSongInput");
      const hasSong = Boolean(this.ourSong.url);

      if (titleEl) titleEl.textContent = hasSong ? this.ourSong.title : "No song saved yet";
      if (playBtn) playBtn.disabled = !hasSong;
      if (input && hasSong) input.value = this.ourSong.url;
    }

    loadOurSong() {
      try {
        const raw = readStorageWithLegacy(this.ourSongKey, this.ourSongLegacyKey);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed && parsed.url) {
            this.ourSong = { url: String(parsed.url), title: String(parsed.title || parsed.url) };
          }
        }
      } catch { /* ignore */ }
      this.renderOurSong();
    }

    _persistOurSong() {
      try {
        writeStorageWithLegacy(this.ourSongKey, JSON.stringify(this.ourSong), this.ourSongLegacyKey);
      } catch { /* ignore */ }
    }
  }

  window.RelaxMode = RelaxMode;
})();
