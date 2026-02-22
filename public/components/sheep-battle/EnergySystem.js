(function initSheepPushBattleEnergy(global) {
  class SheepPushBattleEnergySystem {
    constructor(container) {
      this.container = container;
      this.max = 100;
      this.value = 0;

      this.node = document.createElement("div");
      this.node.className = "spb-energy";
      this.node.innerHTML = `
        <div class="spb-energy-top">
          <span class="spb-energy-label">Energy</span>
          <span class="spb-energy-value">0 / 100</span>
        </div>
        <div class="spb-energy-bar">
          <span class="spb-energy-fill"></span>
        </div>
      `;

      this.valueEl = this.node.querySelector(".spb-energy-value");
      this.fillEl = this.node.querySelector(".spb-energy-fill");
      this.container?.appendChild(this.node);
    }

    update(current, max) {
      this.max = Math.max(1, Number(max) || 100);
      this.value = Math.max(0, Math.min(this.max, Number(current) || 0));
      const pct = (this.value / this.max) * 100;
      this.fillEl.style.width = `${pct.toFixed(2)}%`;
      this.valueEl.textContent = `${Math.round(this.value)} / ${Math.round(this.max)}`;
      this.node.classList.toggle("spb-energy--low", pct < 22);
    }

    destroy() {
      this.node.remove();
    }
  }

  global.SheepPushBattleEnergySystem = SheepPushBattleEnergySystem;
})(window);
