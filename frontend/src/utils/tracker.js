import { STABILIZER_DELAY_MS, STABILIZER_TOLERANCE } from "../config";

let _nextId = 1;

class Track {
  constructor(box) {
    this.id          = _nextId++;
    const cx         = (box.x1 + box.x2) / 2;
    const cy         = (box.y1 + box.y2) / 2;
    this.anchorCx    = cx;
    this.anchorCy    = cy;
    this.latestBox   = box;
    this.stableSince = Date.now();
    this.missCount   = 0;
    this.fired       = false;
    this.result      = null; // null = no result yet, object = OCR/check done
  }

  distanceTo(box) {
    const cx = (box.x1 + box.x2) / 2;
    const cy = (box.y1 + box.y2) / 2;
    return Math.hypot(cx - this.anchorCx, cy - this.anchorCy);
  }

  refresh(box) {
    this.latestBox = box;
    this.missCount = 0;
    // Once we have a result, slide the anchor with the plate so it doesn't drift out of range
    if (this.result) {
      this.anchorCx = (box.x1 + box.x2) / 2;
      this.anchorCy = (box.y1 + box.y2) / 2;
    }
  }
}

// Tracks multiple plates across frames. The caller writes OCR results back onto
// the track object directly, which the draw loop picks up on the next frame.
export class Tracker {
  constructor(onStable, delayMs = STABILIZER_DELAY_MS, tolerance = STABILIZER_TOLERANCE) {
    this.onStable  = onStable;
    this.delayMs   = delayMs;
    this.tolerance = tolerance;
    this._tracks   = [];
  }

  update(boxes) {
    const matched = new Set();

    for (const box of boxes) {
      let closest = null, closestDist = Infinity;
      for (const track of this._tracks) {
        if (matched.has(track)) continue;
        const d = track.distanceTo(box);
        if (d < this.tolerance && d < closestDist) {
          closestDist = d;
          closest = track;
        }
      }

      if (closest) {
        closest.refresh(box);
        matched.add(closest);
      } else {
        this._tracks.push(new Track(box));
      }
    }

    for (const track of this._tracks) {
      if (!matched.has(track)) track.missCount++;
    }

    this._tracks = this._tracks.filter(t => t.missCount < 2);

    if (this._tracks.length > 6) {
      this._tracks = [];
      return;
    }

    const now = Date.now();
    for (const track of this._tracks) {
      if (!track.fired && now - track.stableSince >= this.delayMs) {
        track.fired = true;
        this.onStable(track);
      }
    }
  }

  activeBoxes() {
    return this._tracks.map(t => ({ box: t.latestBox, result: t.result }));
  }

  reset() {
    this._tracks = [];
  }
}
