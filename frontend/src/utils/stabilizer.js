import { STABILIZER_DELAY_MS, STABILIZER_TOLERANCE } from "../config";

export class Stabilizer {
  constructor(onStable, delayMs = STABILIZER_DELAY_MS, moveTolerance = STABILIZER_TOLERANCE) {
    this.onStable = onStable;
    this.delayMs = delayMs;
    this.moveTolerance = moveTolerance;
    this._stableBox = null;
    this._stableSince = null;
    this._fired = false;
  }

  update(box) {
    if (!box) {
      this._reset();
      return;
    }

    if (this._isSameBox(box)) {
      if (!this._fired && Date.now() - this._stableSince >= this.delayMs) {
        this._fired = true;
        this.onStable(box);
      }
    } else {
      this._stableBox = box;
      this._stableSince = Date.now();
      this._fired = false;
    }
  }

  reset() {
    this._reset();
  }

  _reset() {
    this._stableBox = null;
    this._stableSince = null;
    this._fired = false;
  }

  _isSameBox(box) {
    if (!this._stableBox) return false;
    const t = this.moveTolerance;
    return (
      Math.abs(box.x1 - this._stableBox.x1) < t &&
      Math.abs(box.y1 - this._stableBox.y1) < t &&
      Math.abs(box.x2 - this._stableBox.x2) < t &&
      Math.abs(box.y2 - this._stableBox.y2) < t
    );
  }
}
