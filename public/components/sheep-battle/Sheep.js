(function initSheepPushBattleSheep(global) {
  const FACE_BY_TYPE = {
    small: "🐑",
    medium: "🐏",
    large: "🐐"
  };

  class SheepPushBattleSheep {
    constructor(unit) {
      this.unit = unit;
      this.node = document.createElement("div");
      this.node.className = "spb-sheep";
      this.node.innerHTML = '<span class="spb-sheep-shadow"></span><span class="spb-sheep-aura"></span><span class="spb-sheep-face">🐑</span><span class="spb-sheep-size"></span>';
      this.faceEl = this.node.querySelector(".spb-sheep-face");
      this.sizeEl = this.node.querySelector(".spb-sheep-size");
      this.node.style.setProperty("--spb-step-delay", `${(Math.random() * 0.6).toFixed(3)}s`);
      this.update(unit);
    }

    update(unit) {
      this.unit = { ...this.unit, ...unit };
      const side = this.unit.side === "right" ? "right" : "left";
      const type = ["small", "medium", "large"].includes(this.unit.type) ? this.unit.type : "small";
      this.node.className = `spb-sheep spb-sheep--${side} spb-sheep--${type}`;
      this.node.style.left = `${Math.max(-8, Math.min(108, Number(this.unit.x || 0) * 100))}%`;
      this.node.style.setProperty("--spb-size", String(Math.max(0.03, Number(this.unit.size || 0.05))));
      if (this.faceEl) {
        this.faceEl.textContent = FACE_BY_TYPE[type] || "🐑";
      }
      if (this.sizeEl) {
        this.sizeEl.textContent = type === "large" ? "L" : type === "medium" ? "M" : "S";
      }
    }

    pulse() {
      this.node.classList.remove("spb-sheep--pulse", "spb-sheep--spawned");
      void this.node.offsetWidth;
      this.node.classList.add("spb-sheep--pulse");
      this.node.classList.add("spb-sheep--spawned");
    }

    pushBounce(direction, impactStrength = 0) {
      const cls = direction >= 0 ? "spb-sheep--impact-left" : "spb-sheep--impact-right";
      this.node.classList.remove("spb-sheep--impact-left", "spb-sheep--impact-right", "spb-sheep--impact-heavy");
      void this.node.offsetWidth;
      this.node.classList.add(cls);
      if (Number(impactStrength) >= 0.012) {
        this.node.classList.add("spb-sheep--impact-heavy");
      }
    }

    destroy() {
      this.node.remove();
    }
  }

  global.SheepPushBattleSheep = SheepPushBattleSheep;
})(window);
