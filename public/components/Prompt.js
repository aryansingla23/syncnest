(function initPromptComponent() {
  class Prompt {
    constructor({ mountEl }) {
      this.mountEl = mountEl;
      this.prompts = [
        "What made you smile today?",
        "If we could travel anywhere right now, where would we go?",
        "Coffee or ice cream date?",
        "What song matches your mood right now?",
        "What tiny win are you proud of today?",
        "What is one thing you want to do together this month?",
        "What calms you down the fastest?",
        "What is your dream weekend with me?",
        "Which movie should we watch on our next break?",
        "What is one thing I do that comforts you?",
        "If today had a color, what would it be?",
        "What place reminds you of us?",
        "What snack are you craving right now?",
        "What is one memory you keep replaying lately?"
      ];
      this.currentPrompt = this.pickRandom();
      this.render();
    }

    pickRandom() {
      return this.prompts[Math.floor(Math.random() * this.prompts.length)];
    }

    nextPrompt() {
      let next = this.pickRandom();
      let tries = 0;
      while (next === this.currentPrompt && tries < 10) {
        next = this.pickRandom();
        tries += 1;
      }
      this.currentPrompt = next;
      this.render();
      return next;
    }

    render() {
      if (!this.mountEl) return;
      this.mountEl.innerHTML = `
        <div class="break-panel-card">
          <div class="break-panel-head">
            <h4>Conversation Prompt</h4>
            <button class="btn btn-secondary prompt-next-btn" type="button">Another prompt</button>
          </div>
          <p class="prompt-question">${this.currentPrompt}</p>
        </div>
      `;

      const nextBtn = this.mountEl.querySelector(".prompt-next-btn");
      if (nextBtn) {
        nextBtn.addEventListener("click", () => this.nextPrompt());
      }
    }
  }

  window.Prompt = Prompt;
})();
