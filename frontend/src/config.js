// Run detection every N frames
export const FRAME_SKIP = 6;

// How long to show the result before going back to scanning (ms)
export const RESULT_DISPLAY_MS = 3000;

// Requested camera resolution
export const CAMERA_WIDTH  = 1280;
export const CAMERA_HEIGHT = 720;

// How long plate should stay in place for detection (ms)
export const STABILIZER_DELAY_MS  = 1000;

// How many pixels the box can drift and still count as "stable"
export const STABILIZER_TOLERANCE = 10;

// Detections below this confidence are thrown away
export const DETECTION_THRESHOLD = 0.4;

// Two overlapping boxes are merged if they overlap more than this
export const NMS_IOU_THRESHOLD = 0.45;
