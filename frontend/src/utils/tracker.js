import { STABILIZER_DELAY_MS, STABILIZER_TOLERANCE, MAX_TRACKS, MISS_LIMIT } from "../config";

let _nextId = 1;

class Track {
  constructor(box) {
    this.id          = _nextId++;
    // first seen position, used as anchor for distance matching
    const cx         = (box.x1 + box.x2) / 2;
    const cy         = (box.y1 + box.y2) / 2;
    this.anchorCx    = cx;
    this.anchorCy    = cy;
    this.latestBox   = box;
    this.stableSince = Date.now();
    this.missCount   = 0;
    this.fired       = false;
    this.result      = null; // null = pending, object = OCR done
  }

  // euclidean distance from anchor to new box center
  distanceTo(box) {
    const cx = (box.x1 + box.x2) / 2;
    const cy = (box.y1 + box.y2) / 2;
    return Math.hypot(cx - this.anchorCx, cy - this.anchorCy);
  }

  refresh(box) {
    this.latestBox = box;
    this.missCount = 0;
    // slide anchor after OCR so a moving plate stays tracked
    if (this.result) {
      this.anchorCx = (box.x1 + box.x2) / 2;
      this.anchorCy = (box.y1 + box.y2) / 2;
    }
  }
}

export class Tracker {
  constructor(onStable, delayMs = STABILIZER_DELAY_MS, tolerance = STABILIZER_TOLERANCE) {
    this.onStable  = onStable;
    this.delayMs   = delayMs;
    this.tolerance = tolerance;
    this._tracks   = [];
  }

  update(boxes) {
    const matched = new Set();

    // match each detection to the nearest existing track
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
        // no match, new plate entered the frame
        this._tracks.push(new Track(box));
      }
    }

    // age out tracks that were not seen this frame
    for (const track of this._tracks) {
      if (!matched.has(track)) track.missCount++;
    }
    this._tracks = this._tracks.filter(t => t.missCount < MISS_LIMIT);

    // too many tracks, likely noise
    if (this._tracks.length > MAX_TRACKS) {
      this._tracks = [];
      return;
    }

    // fire OCR for stable tracks
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
