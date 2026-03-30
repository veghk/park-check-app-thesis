# Park Check — Licence Plate Enforcement App

A Progressive Web App for parking enforcement officers. Point the phone camera at a vehicle; the app detects the licence plate in real time, reads the text on-device, and checks it against a registered-plates database — all without leaving the camera view. All inference runs in the browser (WebGPU → WebGL → WASM). The backend is only contacted for the final registration lookup.

---

## Dataflow

```mermaid
flowchart
    CAM[/"Camera stream\n(1280×720 @ environment-facing)"/]

    subgraph FRONTEND["Frontend — React PWA (browser)"]
        FRAME["Capture frame\nevery N=2 frames"]
        RESIZE["Resize to 640×640\nnormalise to [0,1]"]
        DET["YOLOv8n-seg ONNX\nPlate Detection\n(WebGPU → WebGL → WASM)"]
        NMS["NMS + confidence filter\nthreshold=0.4 / IoU=0.45"]
        TRACKER["Tracker\ncenter-based matching ±60 px\nstabilise 600 ms"]

        WARP["Perspective warp\n4-corner → 140×70 px crop\n(bilinear inverse-mapping)"]
        OCR["european-plates-mobile-vit-v2\nONNX — grayscale uint8\n9 slots × 37 chars → argmax"]
        DECODE["Decode plate text\nstrip padding '_'"]

        DRAW["Draw overlay on canvas\ncolour: grey / green / red"]
        PENDING[("localStorage\npending queue")]
    end

    subgraph BACKEND["Backend — Django REST API (port 8000)"]
        CHECKVIEW["POST /api/check/\nCheckView"]
        PLATEDB[("PostgreSQL\nPlate table")]
        RESP["JSON response\n{ registered, owner_name }"]
    end

    CAM --> FRAME
    FRAME --> RESIZE
    RESIZE --> DET
    DET --> NMS
    NMS --> TRACKER
    TRACKER -- "stable ≥600 ms\n(first time only)" --> WARP
    WARP --> OCR
    OCR --> DECODE

    DECODE -- "online" --> CHECKVIEW
    DECODE -- "offline" --> PENDING
    PENDING -- "back online" --> CHECKVIEW

    CHECKVIEW --> PLATEDB
    PLATEDB --> RESP
    RESP --> DRAW

    TRACKER -- "every frame" --> DRAW
```

---

## Object Diagram

```mermaid
classDiagram
    class User {
        +int id
        +str username
        +str password
        +str badge_number
        +bool is_staff
    }

    class Plate {
        +int id
        +str plate_number
        +str owner_name
        +str notes
        +bool is_active
        +datetime created_at
        +datetime updated_at
    }

    class Track {
        +int id
        +float anchorCx
        +float anchorCy
        +Box latestBox
        +int stableSince
        +int missCount
        +bool fired
        +object result
        +distanceTo(box) float
        +refresh(box) void
    }

    class Tracker {
        +function onStable
        +int delayMs
        +int tolerance
        -Track[] _tracks
        +update(boxes) void
        +activeBoxes() list
        +reset() void
    }

    class Box {
        +float x1
        +float y1
        +float x2
        +float y2
        +float conf
        +float[] corners
    }

    class CheckResult {
        +str plate_text
        +bool registered
        +str owner_name
    }

    User "1" --> "0..*" Plate : manages
    Tracker "1" --> "0..*" Track : owns
    Track "1" --> "1" Box : latestBox
    Track "1" --> "0..1" CheckResult : result
    Tracker ..> Track : creates on new detection
```
