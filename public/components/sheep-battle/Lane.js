(function initSheepPushBattleLane(global) {
  class SheepPushBattleLane {
    constructor(index, onSelect) {
      this.index = index;
      this.onSelect = typeof onSelect === "function" ? onSelect : null;
      this.sheepNodes = new Map();
      this.lastImpactAt = 0;

      this.node = document.createElement("article");
      this.node.className = "spb-lane";
      this.node.dataset.lane = String(index);
      this.node.innerHTML = `
        <button type="button" class="spb-lane-hitbox" aria-label="Select lane ${index + 1}"></button>
        <div class="spb-lane-base spb-lane-base--left"></div>
        <div class="spb-lane-track"></div>
        <div class="spb-lane-base spb-lane-base--right"></div>
        <div class="spb-lane-overlay">
          <span class="spb-lane-title">Lane ${index + 1}</span>
          <span class="spb-lane-capture">Contested</span>
        </div>
      `;

      this.hitbox = this.node.querySelector(".spb-lane-hitbox");
      this.track = this.node.querySelector(".spb-lane-track");
      this.captureLabel = this.node.querySelector(".spb-lane-capture");

      this.hitbox?.addEventListener("click", () => {
        this.onSelect?.(this.index);
      });
    }

    setSelected(isSelected) {
      this.node.classList.toggle("spb-lane--selected", Boolean(isSelected));
    }

    setLaneData(lane, now = Date.now()) {
      if (!lane) return;
      const capturedBy = lane.capturedBy === "left" ? "left" : lane.capturedBy === "right" ? "right" : null;
      this.node.classList.toggle("spb-lane--captured-left", capturedBy === "left");
      this.node.classList.toggle("spb-lane--captured-right", capturedBy === "right");

      if (capturedBy === "left") {
        this.captureLabel.textContent = "Captured by Left";
      } else if (capturedBy === "right") {
        this.captureLabel.textContent = "Captured by Right";
      } else {
        this.captureLabel.textContent = "Contested";
      }

      const impactAt = Number(lane.impactAt || 0);
      if (impactAt > this.lastImpactAt && now - impactAt < 650) {
        this.lastImpactAt = impactAt;
        this.node.classList.remove("spb-lane--impact-left", "spb-lane--impact-right");
        void this.node.offsetWidth;
        const pushDirection = Number(lane.pushDirection || 0);
        const impactClass = pushDirection >= 0 ? "spb-lane--impact-left" : "spb-lane--impact-right";
        this.node.classList.add(impactClass);
        this.sheepNodes.forEach((view) => view.pushBounce(pushDirection));
      }

      const units = Array.isArray(lane.sheep) ? lane.sheep : [];
      const nextIds = new Set();
      units.forEach((unit) => {
        const id = String(unit.id || "");
        if (!id) return;
        nextIds.add(id);

        let view = this.sheepNodes.get(id);
        if (!view) {
          view = new global.SheepPushBattleSheep(unit);
          this.sheepNodes.set(id, view);
          this.track.appendChild(view.node);
          view.pulse();
        }
        view.update(unit);
      });

      this.sheepNodes.forEach((view, id) => {
        if (!nextIds.has(id)) {
          view.destroy();
          this.sheepNodes.delete(id);
        }
      });
    }

    destroy() {
      this.sheepNodes.forEach((view) => view.destroy());
      this.sheepNodes.clear();
      this.node.remove();
    }
  }

  global.SheepPushBattleLane = SheepPushBattleLane;
})(window);
