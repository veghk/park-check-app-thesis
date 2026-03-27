import { STABILIZER_DELAY_MS, STABILIZER_TOLERANCE } from "../config";

// How many consecutive missed frames before the stabilizer resets.
// Prevents a single dropped detection frame from restarting the hold timer.
const MISS_TOLERANCE = 4;

export class Stabilizer {
  constructor(onStable, delayMs = STABILIZER_DELAY_MS, moveTolerance = STABILIZER_TOLERANCE) {
    this.onStable = onStable;
    this.delayMs = delayMs;
    this.moveTolerance = moveTolerance;
    this._anchorCx = null;
    this._anchorCy = null;
    this._latestBox = null;
    this._stableSince = null;
    this._fired = false;
    this._missCount = 0;
  }

  update(box) {
    if (!box) {
      this._missCount++;
      if (this._missCount >= MISS_TOLERANCE) this._reset();
      return;
    }

    this._missCount = 0;
    const cx = (box.x1 + box.x2) / 2;
    const cy = (box.y1 + box.y2) / 2;

    if (
      this._anchorCx !== null &&
      Math.abs(cx - this._anchorCx) < this.moveTolerance &&
      Math.abs(cy - this._anchorCy) < this.moveTolerance
    ) {
      // Same detection — keep corners fresh but don't reset the timer
      this._latestBox = box;
      const elapsed = Date.now() - this._stableSince;
      console.log(`[Stabilizer] stable ${elapsed}ms / ${this.delayMs}ms, center=(${cx.toFixed(0)},${cy.toFixed(0)})`);
      if (!this._fired && elapsed >= this.delayMs) {
        console.log("[Stabilizer] FIRING OCR");
        this._fired = true;
        this.onStable(this._latestBox);
      }
    } else {
      console.log(`[Stabilizer] new anchor (${cx.toFixed(0)},${cy.toFixed(0)})`);
      // New detection — anchor to this center and restart timer
      this._anchorCx = cx;
      this._anchorCy = cy;
      this._latestBox = box;
      this._stableSince = Date.now();
      this._fired = false;
    }
  }

  reset() {
    this._reset();
  }

  _reset() {
    this._anchorCx = null;
    this._anchorCy = null;
    this._latestBox = null;
    this._stableSince = null;
    this._fired = false;
    this._missCount = 0;
  }
}
