// run detection every N frames
// loop throttles itself via await
export const FRAME_SKIP = 2;

// Requested camera resolution
export const CAMERA_WIDTH  = 1280;
export const CAMERA_HEIGHT = 720;

// How long a plate must stay in place before triggering detection
export const STABILIZER_DELAY_MS  = 600;

// How many pixels the detection center can drift
// and still count as "stable"
export const STABILIZER_TOLERANCE = 60;

// Detections below this confidence are thrown away
export const DETECTION_THRESHOLD = 0.4;

// Two overlapping boxes are merged
// if they overlap more than this
export const NMS_IOU_THRESHOLD = 0.45;

// YOLO model input size
// must be multiple of 32, trained at 416
export const INPUT_SIZE = 416;

// warped plate canvas size
// European plate aspect ~4:1
export const PLATE_W = 280;
export const PLATE_H = 70;
