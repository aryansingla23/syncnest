(function initDrawingBoardComponent() {
  class DrawingBoard {
    constructor({ mountEl, onStroke, onClear }) {
      this.mountEl = mountEl;
      this.onStroke = onStroke;
      this.onClear = onClear;
      this.isDrawing = false;
      this.currentColor = "#ff5ea8";
      this.currentWidth = 2;
      this.lastPoint = null;
      this.canvas = null;
      this.ctx = null;
      this.render();
      this.attachEvents();
    }

    render() {
      if (!this.mountEl) return;
      this.mountEl.innerHTML = `
        <div class="break-panel-card">
          <div class="break-panel-head">
            <h4>Shared Drawing Board</h4>
            <div class="draw-controls">
              <input class="draw-color" type="color" value="${this.currentColor}" aria-label="Pick color" />
              <button class="btn btn-secondary draw-clear-btn" type="button">Clear canvas</button>
            </div>
          </div>
          <canvas class="draw-canvas" width="640" height="260"></canvas>
        </div>
      `;
      this.canvas = this.mountEl.querySelector(".draw-canvas");
      this.ctx = this.canvas ? this.canvas.getContext("2d") : null;
      if (this.ctx) {
        this.ctx.lineCap = "round";
        this.ctx.lineJoin = "round";
      }
    }

    attachEvents() {
      if (!this.canvas || !this.ctx) return;
      const colorInput = this.mountEl.querySelector(".draw-color");
      const clearBtn = this.mountEl.querySelector(".draw-clear-btn");

      if (colorInput) {
        colorInput.addEventListener("input", () => {
          this.currentColor = colorInput.value || "#ff5ea8";
        });
      }

      if (clearBtn) {
        clearBtn.addEventListener("click", () => {
          this.clear(false);
          if (typeof this.onClear === "function") this.onClear();
        });
      }

      const getPoint = (evt) => {
        const rect = this.canvas.getBoundingClientRect();
        const source = evt.touches ? evt.touches[0] : evt;
        return {
          x: ((source.clientX - rect.left) / rect.width) * this.canvas.width,
          y: ((source.clientY - rect.top) / rect.height) * this.canvas.height
        };
      };

      const start = (evt) => {
        evt.preventDefault();
        this.isDrawing = true;
        this.lastPoint = getPoint(evt);
      };

      const move = (evt) => {
        if (!this.isDrawing || !this.lastPoint) return;
        evt.preventDefault();
        const next = getPoint(evt);
        const stroke = {
          x0: this.lastPoint.x,
          y0: this.lastPoint.y,
          x1: next.x,
          y1: next.y,
          color: this.currentColor,
          width: this.currentWidth
        };
        this.drawStroke(stroke);
        if (typeof this.onStroke === "function") this.onStroke(stroke);
        this.lastPoint = next;
      };

      const stop = () => {
        this.isDrawing = false;
        this.lastPoint = null;
      };

      this.canvas.addEventListener("mousedown", start);
      this.canvas.addEventListener("mousemove", move);
      window.addEventListener("mouseup", stop);
      this.canvas.addEventListener("touchstart", start, { passive: false });
      this.canvas.addEventListener("touchmove", move, { passive: false });
      window.addEventListener("touchend", stop);
    }

    drawStroke(stroke) {
      if (!this.ctx) return;
      this.ctx.strokeStyle = stroke.color || "#ff5ea8";
      this.ctx.lineWidth = Number(stroke.width) || 2;
      this.ctx.beginPath();
      this.ctx.moveTo(Number(stroke.x0) || 0, Number(stroke.y0) || 0);
      this.ctx.lineTo(Number(stroke.x1) || 0, Number(stroke.y1) || 0);
      this.ctx.stroke();
    }

    clear(remote) {
      if (!this.ctx || !this.canvas) return;
      this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
      if (remote && typeof this.onClear === "function") {
        this.onClear();
      }
    }
  }

  window.DrawingBoard = DrawingBoard;
})();
