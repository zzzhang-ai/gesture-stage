import {
  FilesetResolver,
  HandLandmarker,
} from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14";

const video = document.querySelector("#camera");
const cameraCard = document.querySelector(".camera-card");
const canvas = document.querySelector("#stage");
const ctx = canvas.getContext("2d");
const cameraStatus = document.querySelector("#cameraStatus");
const modelStatus = document.querySelector("#modelStatus");
const modeStatus = document.querySelector("#modeStatus");
const fpsStatus = document.querySelector("#fpsStatus");
const gestureName = document.querySelector("#gestureName");
const gestureHint = document.querySelector("#gestureHint");
const startButton = document.querySelector("#startButton");
const stopButton = document.querySelector("#stopButton");
const demoButton = document.querySelector("#demoButton");
const chips = [...document.querySelectorAll(".gesture-chip")];

const gestureLabels = {
  open_palm: "Open Palm",
  fist: "Fist",
  peace: "Peace",
  point: "Point",
  pinch: "Pinch",
  frame_drag: "Frame Drag",
  orb_charge: "Orb Charge",
  orb_flight: "Orb Flight",
  wave_left: "Wave Left",
  wave_right: "Wave Right",
  searching: "Searching",
  ready: "Ready",
  menu_open: "Menu",
};

const gestureHints = {
  open_palm: "Particles expand outward. Hold still to open the menu.",
  fist: "The stage tightens and freezes into a focused pulse.",
  peace: "Twin streams rise through the scene.",
  point: "A bright comet follows your index finger.",
  pinch: "A precise ring snaps into place.",
  frame_drag: "Move both hands to drag a glowing frame through the stage.",
  orb_charge: "Hold both hands close together to charge the energy ball.",
  orb_flight: "The charged orb is flying through the stage.",
  wave_left: "The scene switches color direction.",
  wave_right: "The scene switches color direction.",
  searching: "Show one hand clearly in front of the camera.",
  ready: "Start the camera, raise one hand, and let the stage react.",
};

const MODES = Object.freeze({
  IDLE: "idle",
  SEARCHING: "searching",
  GESTURE_TRIGGER: "gesture_trigger",
  FRAME_DRAG: "frame_drag",
  ORB_CHARGE: "orb_charge",
  ORB_FLIGHT: "orb_flight",
  MENU_OPEN: "menu_open",
  MENU_SELECT: "menu_select",
});

const modeLabels = {
  [MODES.IDLE]: "Idle",
  [MODES.SEARCHING]: "Searching",
  [MODES.GESTURE_TRIGGER]: "Gesture",
  [MODES.FRAME_DRAG]: "Frame Drag",
  [MODES.ORB_CHARGE]: "Orb Charge",
  [MODES.ORB_FLIGHT]: "Orb Flight",
  [MODES.MENU_OPEN]: "Menu Open",
  [MODES.MENU_SELECT]: "Menu Select",
};

const modeHints = {
  [MODES.IDLE]: gestureHints.ready,
  [MODES.SEARCHING]: gestureHints.searching,
  [MODES.GESTURE_TRIGGER]: "Gesture active. Effects respond to your hand position.",
  [MODES.FRAME_DRAG]: "Move both hands to drag the glowing frame. Pinch to release.",
  [MODES.ORB_CHARGE]: "Hold hands close to charge. Spread apart to launch the orb.",
  [MODES.ORB_FLIGHT]: "The orb bounces off edges and the frame. Watch it fly!",
  [MODES.MENU_OPEN]: "Move your palm over a sector to highlight it.",
  [MODES.MENU_SELECT]: "Hold on the item or pinch to confirm selection.",
};

const modePriority = {
  [MODES.IDLE]: 0,
  [MODES.SEARCHING]: 1,
  [MODES.GESTURE_TRIGGER]: 2,
  [MODES.FRAME_DRAG]: 3,
  [MODES.ORB_CHARGE]: 4,
  [MODES.ORB_FLIGHT]: 5,
  [MODES.MENU_OPEN]: 6,
  [MODES.MENU_SELECT]: 7,
};

// --- Tuning Constants ---
const MENU_DWELL_MS = 620;
const MENU_SELECT_HOLD_MS = 340;
const MENU_RADIUS = 130;
const MENU_INNER_RADIUS = 38;
const MENU_COOLDOWN_MS = 520;
const MENU_DRIFT_TOLERANCE = 120;
const ORB_MAX_FLYING = 4;
const ORB_START_DISTANCE_RATIO = 0.28;
const ORB_START_DISTANCE_MIN = 140;
const ORB_START_DISTANCE_MAX = 360;
const ORB_EXIT_DISTANCE_RATIO = 1.3;
const ORB_STABLE_MS = 300;
const ORB_LAUNCH_CHARGE_THRESHOLD = 0.28;
const ORB_LAUNCH_VELOCITY_THRESHOLD = 0.34;
const ORB_LAUNCH_DISTANCE_BONUS = 18;
const TRIGGER_COOLDOWN_WAVE = 900;
const TRIGGER_COOLDOWN_DEFAULT = 760;
const TRIGGER_LOCK_MS = 260;
const PINCH_DISTANCE_THRESHOLD = 0.055;
const WAVE_DX_THRESHOLD = 0.18;
const WAVE_DT_MIN = 70;
const WAVE_DT_MAX = 450;

// --- Mode Transition Log ---
const TRANSITION_LOG_MAX = 6;
const transitionLog = [];
const pageLoadAt = performance.now();

function logTransition(from, to, source) {
  transitionLog.push({ from, to, source, at: performance.now() });
  if (transitionLog.length > TRANSITION_LOG_MAX) transitionLog.shift();
}

function getTransitionLog() {
  return transitionLog.map((entry) => ({
    ...entry,
    secondsAgo: ((performance.now() - entry.at) / 1000).toFixed(1),
  }));
}

const themes = [
  { bg: "#05070a", a: "#30d5c8", b: "#ff4f9a", c: "#f7c948" },
  { bg: "#080b12", a: "#7dd3fc", b: "#fb7185", c: "#bef264" },
  { bg: "#09090b", a: "#f8fafc", b: "#22c55e", c: "#f59e0b" },
  { bg: "#06130f", a: "#2dd4bf", b: "#e879f9", c: "#fef08a" },
];

let themeIndex = 0;
let handLandmarker = null;
let stream = null;
let animationId = 0;
let lastVideoTime = -1;
let lastGesture = "ready";
let lastTriggerAt = 0;
let lastWrist = null;
let fpsFrames = 0;
let fpsLastAt = performance.now();
let pointer = { x: window.innerWidth * 0.5, y: window.innerHeight * 0.5, active: false };
let particles = [];
let ripples = [];
let currentLandmarks = [];
let currentHandedness = [];
let rays = [];
let activeFrame = null;
let frameTrails = [];
let activeOrb = null;
let flyingOrbs = [];
let orbProximitySince = 0;
let pointTrail = [];
let pointGlow = null;
let interaction = {
  mode: MODES.IDLE,
  gesture: "ready",
  source: "boot",
  startedAt: performance.now(),
  updatedAt: performance.now(),
  lockedUntil: 0,
};

const MENU_ITEMS = [
  { id: "theme", label: "Theme", icon: "TH" },
  { id: "clear", label: "Clear", icon: "*" },
  { id: "orb", label: "Orb", icon: "O" },
  { id: "frame", label: "Frame", icon: "[]" },
  { id: "close", label: "Close", icon: "X" },
];

let menuState = {
  open: false,
  center: { x: 0, y: 0 },
  openSince: 0,
  dwellTracking: false,
  dwellSince: 0,
  dwellCenter: { x: 0, y: 0 },
  highlighted: -1,
  selectHoldSince: 0,
  cooldownUntil: 0,
};

let modelStillLoadingTimer = window.setTimeout(() => {
  if (!handLandmarker) {
    setStatus(modelStatus, "Model still loading", "warn");
  }
}, 8000);

function setStatus(element, text, tone = "") {
  element.textContent = text;
  element.classList.remove("is-ok", "is-warn", "is-error");
  if (tone) element.classList.add(`is-${tone}`);
}

function setInteractionMode(mode, options = {}) {
  const now = performance.now();
  const force = Boolean(options.force);
  if (!force && now < interaction.lockedUntil && modePriority[mode] < modePriority[interaction.mode]) {
    return false;
  }

  const gesture = options.gesture || gestureForMode(mode);
  const hint = options.hint || gestureHints[gesture] || modeHints[mode] || gestureHints.ready;
  const modeChanged = interaction.mode !== mode;
  if (modeChanged) {
    logTransition(interaction.mode, mode, options.source || "gesture");
  }
  interaction = {
    mode,
    gesture,
    source: options.source || "gesture",
    startedAt: modeChanged ? now : interaction.startedAt,
    updatedAt: now,
    lockedUntil: options.lockMs ? now + options.lockMs : interaction.lockedUntil,
  };
  document.body.dataset.mode = mode;
  setStatus(modeStatus, `Mode ${modeLabels[mode] || mode}`);
  updateGesture(gesture, options.activateChip !== false, hint);
  return true;
}

function gestureForMode(mode) {
  if (mode === MODES.FRAME_DRAG) return "frame_drag";
  if (mode === MODES.ORB_CHARGE) return "orb_charge";
  if (mode === MODES.ORB_FLIGHT) return "orb_flight";
  if (mode === MODES.SEARCHING) return "searching";
  if (mode === MODES.IDLE) return "ready";
  if (mode === MODES.MENU_OPEN || mode === MODES.MENU_SELECT) return "menu_open";
  return interaction.gesture || "ready";
}

function resizeCanvas() {
  const ratio = window.devicePixelRatio || 1;
  canvas.width = Math.floor(window.innerWidth * ratio);
  canvas.height = Math.floor(window.innerHeight * ratio);
  canvas.style.width = `${window.innerWidth}px`;
  canvas.style.height = `${window.innerHeight}px`;
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
}

async function loadModel() {
  try {
    setStatus(modelStatus, "Model loading", "warn");
    const fileset = await FilesetResolver.forVisionTasks(
      "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm",
    );
    handLandmarker = await HandLandmarker.createFromOptions(fileset, {
      baseOptions: {
        modelAssetPath:
          "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",
        delegate: "GPU",
      },
      runningMode: "VIDEO",
      numHands: 2,
      minHandDetectionConfidence: 0.55,
      minHandPresenceConfidence: 0.55,
      minTrackingConfidence: 0.5,
    });
    window.clearTimeout(modelStillLoadingTimer);
    setStatus(modelStatus, "Model ready", "ok");
    if (stream) {
      setInteractionMode(MODES.SEARCHING, {
        gesture: "searching",
        activateChip: false,
        hint: "Gesture detection is ready. Show one hand clearly.",
        source: "model_ready",
      });
    }
  } catch (error) {
    console.error(error);
    window.clearTimeout(modelStillLoadingTimer);
    setStatus(modelStatus, "Model failed", "error");
    gestureHint.textContent = "Model loading failed. Demo effects still work.";
  }
}

async function startCamera() {
  if (stream) return;
  setStatus(cameraStatus, "Camera starting", "warn");
  startButton.disabled = true;
  gestureHint.textContent = handLandmarker
    ? "Opening camera preview..."
    : "Opening camera preview. Gesture detection will start when the model is ready.";
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: "user" },
      audio: false,
    });
    video.srcObject = stream;
    await video.play();
    cameraCard.classList.add("is-live");
    setStatus(cameraStatus, "Camera live", "ok");
    startButton.disabled = true;
    stopButton.disabled = false;
    pointer.active = true;
    setInteractionMode(MODES.SEARCHING, {
      gesture: "searching",
      activateChip: false,
      hint: handLandmarker
        ? "Show one hand clearly in front of the camera."
        : "Camera preview is live. Waiting for gesture model.",
      source: "camera_live",
    });
  } catch (error) {
    console.error(error);
    setStatus(cameraStatus, "Camera blocked", "error");
    startButton.disabled = false;
    stopButton.disabled = true;
    setInteractionMode(MODES.IDLE, {
      force: true,
      hint: "Camera permission is needed for live gesture control.",
      source: "camera_error",
    });
  }
}

function stopCamera() {
  if (stream) {
    stream.getTracks().forEach((track) => track.stop());
    stream = null;
  }
  video.srcObject = null;
  cameraCard.classList.remove("is-live");
  setStatus(cameraStatus, "Camera idle");
  startButton.disabled = false;
  stopButton.disabled = true;
  pointer.active = false;
  activeFrame = null;
  activeOrb = null;
  closeMenu();
  setInteractionMode(MODES.IDLE, { force: true, source: "camera_stop" });
}

function detectHands(now) {
  if (!handLandmarker || !stream || video.readyState < 2) return;
  if (video.currentTime === lastVideoTime) return;
  lastVideoTime = video.currentTime;

  const result = handLandmarker.detectForVideo(video, now);
  if (!result.landmarks || result.landmarks.length === 0) {
    pointer.active = false;
    activeFrame = null;
    activeOrb = null;
    closeMenu();
    setInteractionMode(MODES.SEARCHING, {
      gesture: "searching",
      activateChip: false,
      source: "detector",
    });
    return;
  }

  if (result.landmarks.length >= 2) {
    updateTwoHandInteraction(result.landmarks[0], result.landmarks[1]);
    return;
  }

  activeFrame = null;
  activeOrb = null;
  const landmarks = result.landmarks[0];
  const wrist = landmarks[0];
  pointer = {
    x: (1 - landmarks[9].x) * window.innerWidth,
    y: landmarks[9].y * window.innerHeight,
    active: true,
  };

  const classified = classifyGesture(landmarks);
  const wave = classifyWave(wrist);
  const gesture = wave || classified;

  if (handleMenuGesture(gesture, pointer.x, pointer.y, classified, now)) return;

  triggerGesture(gesture, pointer.x, pointer.y);
}

function updateTwoHandInteraction(firstHand, secondHand) {
  const energy = computeTwoHandEnergy(firstHand, secondHand);
  const startDist = orbStartDistance();
  const exitDist = startDist * ORB_EXIT_DISTANCE_RATIO;
  const now = performance.now();
  const frameGesture = isFrameGesture(firstHand) && isFrameGesture(secondHand);

  if (activeOrb) {
    if (energy.distance > exitDist) {
      activeOrb = null;
      orbProximitySince = 0;
      if (frameGesture) {
        updateTwoHandFrame(firstHand, secondHand);
      } else {
        activeFrame = null;
        setInteractionMode(MODES.SEARCHING, {
          gesture: "searching",
          activateChip: false,
          source: "two_hand",
        });
      }
      return;
    }
    updateEnergyOrb(energy);
    return;
  }

  if (energy.distance < startDist) {
    if (orbProximitySince === 0) {
      orbProximitySince = now;
    }
    if (now - orbProximitySince >= ORB_STABLE_MS) {
      updateEnergyOrb(energy);
      return;
    }
  } else {
    orbProximitySince = 0;
  }

  if (frameGesture) {
    updateTwoHandFrame(firstHand, secondHand);
  } else {
    activeFrame = null;
  }
}

function updateTwoHandFrame(firstHand, secondHand) {
  const nextFrame = computeFrame(firstHand, secondHand);
  if (!nextFrame) return;

  activeFrame = activeFrame ? smoothFrame(activeFrame, nextFrame, 0.28) : nextFrame;
  pointer = { x: activeFrame.cx, y: activeFrame.cy, active: true };
  frameTrails.push({ ...activeFrame, life: 1 });
  if (frameTrails.length > 42) frameTrails.shift();
  setInteractionMode(MODES.FRAME_DRAG, {
    gesture: "frame_drag",
    source: "two_hand",
  });
  lastGesture = "frame_drag";
}

function computeTwoHandEnergy(firstHand, secondHand) {
  const handA = toStagePoint(firstHand[9]);
  const handB = toStagePoint(secondHand[9]);
  const x = (handA.x + handB.x) * 0.5;
  const y = (handA.y + handB.y) * 0.5;
  const handDistance = Math.hypot(handA.x - handB.x, handA.y - handB.y);
  const now = performance.now();
  const previous = activeOrb;
  const dt = previous ? Math.max(16, now - previous.updatedAt) : 16;

  return {
    x,
    y,
    handA,
    handB,
    distance: handDistance,
    centerVx: previous ? (x - previous.x) / dt : 0,
    centerVy: previous ? (y - previous.y) / dt : 0,
    distVelocity: previous ? (handDistance - previous.distance) / dt : 0,
    dt,
    now,
  };
}

function updateEnergyOrb(energy) {
  const previous = activeOrb;
  const startDistance = orbStartDistance();
  const compression = clamp((startDistance - energy.distance) / Math.max(120, startDistance - 80), 0, 1);
  const charge = clamp(
    Math.max(previous ? previous.charge + (energy.dt / 1500) * (0.4 + compression) : 0.08, compression * 0.62),
    0,
    1,
  );
  const shouldLaunch = previous && previous.charge > ORB_LAUNCH_CHARGE_THRESHOLD && energy.distVelocity > ORB_LAUNCH_VELOCITY_THRESHOLD && energy.distance > previous.distance + ORB_LAUNCH_DISTANCE_BONUS;

  if (shouldLaunch) {
    launchEnergyOrb(energy, previous, charge);
    return;
  }

  activeOrb = {
    x: previous ? lerp(previous.x, energy.x, 0.34) : energy.x,
    y: previous ? lerp(previous.y, energy.y, 0.34) : energy.y,
    handA: energy.handA,
    handB: energy.handB,
    distance: energy.distance,
    charge,
    radius: 24 + charge * 34 + compression * 12,
    updatedAt: energy.now,
  };
  pointer = { x: activeOrb.x, y: activeOrb.y, active: true };
  spillOrbParticles(activeOrb, 1 + Math.round(charge * 3));
  setInteractionMode(MODES.ORB_CHARGE, {
    gesture: "orb_charge",
    source: "two_hand",
  });
  lastGesture = "orb_charge";
}

function launchEnergyOrb(energy, previous, charge) {
  const centerSpeed = Math.hypot(energy.centerVx, energy.centerVy);
  const fallbackX = (energy.x / window.innerWidth - 0.5) * 7;
  const vx = centerSpeed > 0.18 ? energy.centerVx * 20 : fallbackX;
  const vy = centerSpeed > 0.18 ? energy.centerVy * 20 : -7 - charge * 3.5;
  const orb = {
    x: energy.x,
    y: energy.y,
    vx: clamp(vx, -12, 12),
    vy: clamp(vy, -13, 10),
    radius: previous.radius,
    charge,
    life: 1,
    trail: [],
    frameCooldownUntil: 0,
  };

  flyingOrbs.push(orb);
  if (flyingOrbs.length > ORB_MAX_FLYING) flyingOrbs.shift();
  activeOrb = null;
  pointer = { x: orb.x, y: orb.y, active: true };
  ripples.push({ x: orb.x, y: orb.y, r: orb.radius, life: 1, color: activeTheme().c });
  burst(orb.x, orb.y, 34 + Math.round(charge * 34), 3.2 + charge * 2.4);
  setInteractionMode(MODES.ORB_FLIGHT, {
    gesture: "orb_flight",
    source: "two_hand",
    lockMs: 720,
  });
  lastGesture = "orb_flight";
}

function orbStartDistance() {
  return Math.min(ORB_START_DISTANCE_MAX, Math.max(ORB_START_DISTANCE_MIN, window.innerWidth * ORB_START_DISTANCE_RATIO));
}

function isFrameGesture(hand) {
  const thumbTip = hand[4];
  const thumbIp = hand[3];
  const indexTip = hand[8];
  const indexDip = hand[7];
  const indexPip = hand[6];
  const indexMcp = hand[5];
  const middleTip = hand[12];
  const middlePip = hand[10];
  const middleMcp = hand[9];
  const ringTip = hand[16];
  const ringPip = hand[14];
  const pinkyTip = hand[20];
  const pinkyPip = hand[18];
  const wrist = hand[0];

  const thumbIndexDist = distance(thumbTip, indexTip);
  const thumbOk = thumbIndexDist > 0.04 && thumbIndexDist < 0.12;
  const indexExtended = indexTip.y < indexPip.y - 0.04;
  const indexStraight = distance(indexTip, indexMcp) > distance(indexPip, indexMcp) * 1.3;
  const middleCurled = middleTip.y > middleMcp.y;
  const ringCurled = ringTip.y > ringPip.y + 0.01;
  const pinkyCurled = pinkyTip.y > pinkyPip.y + 0.01;
  const thumbUp = thumbTip.y < thumbIp.y - 0.02;

  return thumbOk && indexExtended && indexStraight && middleCurled && ringCurled && pinkyCurled && thumbUp;
}

function computeFrame(firstHand, secondHand) {
  if (!isFrameGesture(firstHand) || !isFrameGesture(secondHand)) return null;

  const anchors = [firstHand[4], firstHand[8], secondHand[4], secondHand[8]].map(toStagePoint);
  const xs = anchors.map((point) => point.x);
  const ys = anchors.map((point) => point.y);
  const left = Math.min(...xs);
  const right = Math.max(...xs);
  const top = Math.min(...ys);
  const bottom = Math.max(...ys);
  const width = Math.max(90, right - left);
  const height = Math.max(64, bottom - top);
  const cx = (left + right) * 0.5;
  const cy = (top + bottom) * 0.5;
  return {
    cx,
    cy,
    w: Math.min(width * 1.18, window.innerWidth * 0.82),
    h: Math.min(height * 1.18, window.innerHeight * 0.72),
  };
}

function smoothFrame(current, next, amount) {
  return {
    cx: lerp(current.cx, next.cx, amount),
    cy: lerp(current.cy, next.cy, amount),
    w: lerp(current.w, next.w, amount),
    h: lerp(current.h, next.h, amount),
  };
}

function toStagePoint(point) {
  return {
    x: (1 - point.x) * window.innerWidth,
    y: point.y * window.innerHeight,
  };
}

function lerp(a, b, amount) {
  return a + (b - a) * amount;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function classifyGesture(points) {
  const fingers = {
    thumb: isThumbOpen(points),
    index: isFingerOpen(points, 8, 6),
    middle: isFingerOpen(points, 12, 10),
    ring: isFingerOpen(points, 16, 14),
    pinky: isFingerOpen(points, 20, 18),
  };
  const openCount = Object.values(fingers).filter(Boolean).length;
  const pinchDistance = distance(points[4], points[8]);

  if (pinchDistance < PINCH_DISTANCE_THRESHOLD) return "pinch";
  if (openCount >= 4) return "open_palm";
  if (openCount <= 1 && !fingers.index) return "fist";
  if (fingers.index && fingers.middle && !fingers.ring && !fingers.pinky) return "peace";
  if (fingers.index && !fingers.middle && !fingers.ring && !fingers.pinky) return "point";
  return "searching";
}

function classifyWave(wrist) {
  const now = performance.now();
  const mirroredX = 1 - wrist.x;
  let gesture = null;
  if (lastWrist) {
    const dx = mirroredX - lastWrist.x;
    const dt = now - lastWrist.t;
    if (dt > WAVE_DT_MIN && dt < WAVE_DT_MAX && Math.abs(dx) > WAVE_DX_THRESHOLD) {
      gesture = dx > 0 ? "wave_right" : "wave_left";
    }
  }
  lastWrist = { x: mirroredX, t: now };
  return gesture;
}

function isFingerOpen(points, tipIndex, pipIndex) {
  return points[tipIndex].y < points[pipIndex].y - 0.025;
}

function isThumbOpen(points) {
  return Math.abs(points[4].x - points[2].x) > 0.075;
}

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function triggerGesture(gesture, x, y) {
  const now = performance.now();
  const cooldown = gesture.startsWith("wave") ? TRIGGER_COOLDOWN_WAVE : TRIGGER_COOLDOWN_DEFAULT;
  setInteractionMode(MODES.GESTURE_TRIGGER, {
    gesture,
    source: "one_hand",
    lockMs: TRIGGER_LOCK_MS,
  });
  if (gesture === "searching") return;
  if (gesture === lastGesture && now - lastTriggerAt < cooldown) return;

  lastGesture = gesture;
  lastTriggerAt = now;
  runEffect(gesture, x, y);
}

function handleMenuGesture(gesture, x, y, classified, now) {
  if (now < menuState.cooldownUntil) {
    if (menuState.open) closeMenu();
    return false;
  }

  if (menuState.open) {
    if (classified !== "open_palm" && classified !== "pinch") {
      closeMenu();
      return false;
    }
    return handleMenuOpen(x, y, classified, now);
  }

  if (classified === "open_palm" && gesture !== "wave_left" && gesture !== "wave_right") {
    return startMenuDwell(x, y, now);
  }

  return false;
}

function startMenuDwell(x, y, now) {
  if (!menuState.dwellTracking) {
    menuState.dwellTracking = true;
    menuState.dwellSince = now;
    menuState.dwellCenter = { x, y };
    setInteractionMode(MODES.GESTURE_TRIGGER, {
      gesture: "open_palm",
      source: "one_hand",
      lockMs: TRIGGER_LOCK_MS,
    });
    return true;
  }

  const drift = Math.hypot(x - menuState.dwellCenter.x, y - menuState.dwellCenter.y);
  if (drift > MENU_DRIFT_TOLERANCE) {
    menuState.dwellSince = now;
    menuState.dwellCenter = { x, y };
    return true;
  }

  if (now - menuState.dwellSince >= MENU_DWELL_MS) {
    openMenu(menuState.dwellCenter.x, menuState.dwellCenter.y, now);
    return true;
  }

  setInteractionMode(MODES.GESTURE_TRIGGER, {
    gesture: "open_palm",
    source: "one_hand",
    lockMs: TRIGGER_LOCK_MS,
  });
  return true;
}

function openMenu(x, y, now) {
  menuState.open = true;
  menuState.center = { x, y };
  menuState.openSince = now;
  menuState.highlighted = -1;
  menuState.selectHoldSince = 0;
  menuState.dwellTracking = false;
  setInteractionMode(MODES.MENU_OPEN, {
    gesture: "menu_open",
    source: "one_hand",
    lockMs: 0,
    force: true,
  });
}

function closeMenu() {
  if (!menuState.open && !menuState.dwellTracking) return;
  menuState.open = false;
  menuState.dwellTracking = false;
  menuState.highlighted = -1;
  menuState.selectHoldSince = 0;
  menuState.cooldownUntil = performance.now() + MENU_COOLDOWN_MS;
}

function handleMenuOpen(x, y, classified, now) {
  const dx = x - menuState.center.x;
  const dy = y - menuState.center.y;
  const dist = Math.hypot(dx, dy);

  if (dist < MENU_INNER_RADIUS) {
    menuState.highlighted = -1;
    menuState.selectHoldSince = 0;
    setInteractionMode(MODES.MENU_OPEN, {
      gesture: "menu_open",
      source: "one_hand",
      force: true,
    });
    return true;
  }

  if (dist > MENU_RADIUS + 50) {
    closeMenu();
    return false;
  }

  const angle = Math.atan2(dy, dx);
  const sectorCount = MENU_ITEMS.length;
  const sectorAngle = (Math.PI * 2) / sectorCount;
  let best = -1;
  let bestDiff = Infinity;
  for (let i = 0; i < sectorCount; i += 1) {
    const center = -Math.PI / 2 + i * sectorAngle;
    let diff = Math.abs(angle - center);
    if (diff > Math.PI) diff = Math.PI * 2 - diff;
    if (diff < bestDiff) {
      bestDiff = diff;
      best = i;
    }
  }

  if (dist > MENU_RADIUS * 0.42) {
    menuState.highlighted = best;
  } else {
    menuState.highlighted = -1;
  }

  if (menuState.highlighted >= 0) {
    const isConfirming = classified === "pinch" || dist > MENU_RADIUS * 0.82;
    if (menuState.selectHoldSince === 0) {
      menuState.selectHoldSince = now;
    }
    const holdDuration = now - menuState.selectHoldSince;
    const shouldConfirm = classified === "pinch" ? holdDuration > 80 : holdDuration >= MENU_SELECT_HOLD_MS;

    if (shouldConfirm) {
      executeMenuItem(MENU_ITEMS[menuState.highlighted]);
      closeMenu();
      return true;
    }

    setInteractionMode(MODES.MENU_SELECT, {
      gesture: "menu_open",
      source: "one_hand",
      force: true,
    });
  } else {
    menuState.selectHoldSince = 0;
    setInteractionMode(MODES.MENU_OPEN, {
      gesture: "menu_open",
      source: "one_hand",
      force: true,
    });
  }

  return true;
}

function executeMenuItem(item) {
  const cx = window.innerWidth * 0.5;
  const cy = window.innerHeight * 0.48;
  if (item.id === "theme") {
    switchTheme("wave_right");
  } else if (item.id === "clear") {
    particles = [];
    ripples = [];
    rays = [];
    frameTrails = [];
    flyingOrbs = [];
    activeOrb = null;
    activeFrame = null;
    ripples.push({ x: cx, y: cy, r: 20, life: 1, color: activeTheme().a });
  } else if (item.id === "orb") {
    demoEnergyOrb(cx, cy);
  } else if (item.id === "frame") {
    demoFrame();
  } else if (item.id === "close") {
    burst(cx, cy, 40, 3);
  }
}

function drawDwellProgress(now) {
  if (!menuState.dwellTracking) return;
  const elapsed = now - menuState.dwellSince;
  const progress = Math.min(1, elapsed / MENU_DWELL_MS);
  if (progress < 0.02) return;

  const theme = activeTheme();
  const { dwellCenter } = menuState;
  const radius = 42;

  ctx.save();
  ctx.globalCompositeOperation = "lighter";

  ctx.globalAlpha = 0.3 * progress;
  ctx.shadowBlur = 18 * progress;
  ctx.shadowColor = theme.a;
  ctx.beginPath();
  ctx.arc(dwellCenter.x, dwellCenter.y, radius + 6, 0, Math.PI * 2);
  ctx.strokeStyle = theme.a;
  ctx.lineWidth = 2;
  ctx.stroke();

  const startAngle = -Math.PI / 2;
  const endAngle = startAngle + Math.PI * 2 * progress;
  ctx.globalAlpha = 0.85 * progress;
  ctx.shadowBlur = 14;
  ctx.shadowColor = theme.c;
  ctx.beginPath();
  ctx.arc(dwellCenter.x, dwellCenter.y, radius, startAngle, endAngle);
  ctx.strokeStyle = theme.c;
  ctx.lineWidth = 3.5;
  ctx.stroke();

  const pulse = 0.5 + 0.5 * Math.sin(now * 0.008);
  ctx.globalAlpha = (0.4 + 0.4 * progress) * pulse;
  ctx.beginPath();
  ctx.arc(dwellCenter.x, dwellCenter.y, 6 + progress * 4, 0, Math.PI * 2);
  ctx.fillStyle = theme.a;
  ctx.fill();

  ctx.restore();
}

function drawSpatialMenu(now) {
  if (!menuState.open) return;

  const theme = activeTheme();
  const { center, highlighted } = menuState;
  const sectorCount = MENU_ITEMS.length;
  const sectorAngle = (Math.PI * 2) / sectorCount;

  const elapsed = now - menuState.openSince;
  const openProgress = Math.min(1, elapsed / 220);
  const eased = 1 - Math.pow(1 - openProgress, 3);

  ctx.save();
  ctx.globalCompositeOperation = "lighter";

  ctx.globalAlpha = 0.18 * eased;
  ctx.beginPath();
  ctx.arc(center.x, center.y, MENU_RADIUS * eased, 0, Math.PI * 2);
  ctx.fillStyle = theme.bg;
  ctx.fill();

  ctx.globalAlpha = 0.55 * eased;
  ctx.shadowBlur = 22;
  ctx.shadowColor = theme.a;
  ctx.beginPath();
  ctx.arc(center.x, center.y, MENU_RADIUS * eased, 0, Math.PI * 2);
  ctx.strokeStyle = theme.a;
  ctx.lineWidth = 1.8;
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(center.x, center.y, MENU_INNER_RADIUS * eased, 0, Math.PI * 2);
  ctx.strokeStyle = theme.b;
  ctx.lineWidth = 1.4;
  ctx.stroke();

  for (let i = 0; i < sectorCount; i += 1) {
    const startAngle = -Math.PI / 2 + i * sectorAngle - sectorAngle / 2;
    const endAngle = startAngle + sectorAngle;
    const isHighlighted = i === highlighted;

    if (isHighlighted) {
      ctx.globalAlpha = 0.35 * eased;
      ctx.beginPath();
      ctx.moveTo(center.x, center.y);
      ctx.arc(center.x, center.y, MENU_RADIUS * eased, startAngle, endAngle);
      ctx.closePath();
      ctx.fillStyle = theme.a;
      ctx.fill();

      ctx.globalAlpha = 0.7 * eased;
      ctx.shadowBlur = 10;
      ctx.shadowColor = theme.a;
      ctx.beginPath();
      ctx.arc(center.x, center.y, MENU_RADIUS * eased, startAngle, endAngle);
      ctx.strokeStyle = theme.a;
      ctx.lineWidth = 2.5;
      ctx.stroke();
      ctx.shadowBlur = 0;
    }

    ctx.globalAlpha = 0.3 * eased;
    ctx.beginPath();
    ctx.moveTo(
      center.x + Math.cos(startAngle) * MENU_INNER_RADIUS * eased,
      center.y + Math.sin(startAngle) * MENU_INNER_RADIUS * eased,
    );
    ctx.lineTo(
      center.x + Math.cos(startAngle) * MENU_RADIUS * eased,
      center.y + Math.sin(startAngle) * MENU_RADIUS * eased,
    );
    ctx.strokeStyle = theme.c;
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  ctx.shadowBlur = 0;
  const labelRadius = (MENU_INNER_RADIUS + MENU_RADIUS) * 0.55;
  for (let i = 0; i < sectorCount; i += 1) {
    const angle = -Math.PI / 2 + i * sectorAngle;
    const lx = center.x + Math.cos(angle) * labelRadius * eased;
    const ly = center.y + Math.sin(angle) * labelRadius * eased;
    const isHighlighted = i === highlighted;

    ctx.globalAlpha = (isHighlighted ? 1 : 0.62) * eased;
    ctx.fillStyle = isHighlighted ? "#ffffff" : theme.a;
    ctx.font = `${isHighlighted ? "bold " : ""}${Math.round(13 * eased)}px Inter, system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(MENU_ITEMS[i].label, lx, ly - 7 * eased);

    ctx.globalAlpha = (isHighlighted ? 0.95 : 0.5) * eased;
    ctx.font = `${Math.round(18 * eased)}px Inter, system-ui, sans-serif`;
    ctx.fillText(MENU_ITEMS[i].icon, lx, ly + 11 * eased);
  }

  if (menuState.highlighted >= 0 && menuState.selectHoldSince > 0) {
    const holdDuration = now - menuState.selectHoldSince;
    const threshold = MENU_SELECT_HOLD_MS;
    const progress = Math.min(1, holdDuration / threshold);
    if (progress > 0.02) {
      const startAngle = -Math.PI / 2;
      const endAngle = startAngle + Math.PI * 2 * progress;

      ctx.globalAlpha = 0.9 * eased;
      ctx.beginPath();
      ctx.arc(center.x, center.y, MENU_RADIUS * eased + 8, startAngle, endAngle);
      ctx.strokeStyle = theme.c;
      ctx.lineWidth = 4;
      ctx.shadowBlur = 16;
      ctx.shadowColor = theme.c;
      ctx.stroke();

      ctx.globalAlpha = 0.5 * eased;
      ctx.beginPath();
      ctx.arc(center.x, center.y, MENU_RADIUS * eased + 4, startAngle, endAngle);
      ctx.strokeStyle = theme.a;
      ctx.lineWidth = 2;
      ctx.shadowBlur = 8;
      ctx.shadowColor = theme.a;
      ctx.stroke();

      const tipAngle = endAngle;
      const tipX = center.x + Math.cos(tipAngle) * (MENU_RADIUS * eased + 8);
      const tipY = center.y + Math.sin(tipAngle) * (MENU_RADIUS * eased + 8);
      const pulse = 0.6 + 0.4 * Math.sin(now * 0.01);
      ctx.globalAlpha = 0.8 * eased * pulse;
      ctx.beginPath();
      ctx.arc(tipX, tipY, 5, 0, Math.PI * 2);
      ctx.fillStyle = theme.c;
      ctx.fill();
    }
  }

  ctx.restore();
}

function updateGesture(gesture, activateChip = true, hintOverride = null) {
  gestureName.textContent = gestureLabels[gesture] || "Ready";
  gestureHint.textContent = hintOverride || gestureHints[gesture] || gestureHints.ready;
  if (!activateChip) return;
  chips.forEach((chip) => {
    chip.classList.toggle("is-active", chip.dataset.demo === normalizeChipGesture(gesture));
  });
}

function normalizeChipGesture(gesture) {
  if (gesture === "wave_left" || gesture === "wave_right") return "open_palm";
  return gesture;
}

function runEffect(gesture, x, y) {
  if (gesture === "open_palm") burst(x, y, 120, 5.8);
  if (gesture === "fist") implode(x, y);
  if (gesture === "peace") twinStreams(x, y);
  if (gesture === "point") comet(x, y);
  if (gesture === "pinch") ring(x, y);
  if (gesture === "frame_drag") demoFrame();
  if (gesture === "orb_charge" || gesture === "orb_flight") demoEnergyOrb(x, y);
  if (gesture === "wave_left" || gesture === "wave_right") switchTheme(gesture);
}

function burst(x, y, count, speed) {
  for (let i = 0; i < count; i += 1) {
    const angle = Math.random() * Math.PI * 2;
    const velocity = speed * (0.35 + Math.random());
    particles.push(makeParticle(x, y, Math.cos(angle) * velocity, Math.sin(angle) * velocity, 1));
  }
  ripples.push({ x, y, r: 18, life: 1, color: activeTheme().a });
}

function implode(x, y) {
  for (let i = 0; i < 110; i += 1) {
    const edge = Math.random() < 0.5 ? 0 : window.innerWidth;
    const px = Math.random() < 0.5 ? edge : Math.random() * window.innerWidth;
    const py = edge === px ? Math.random() * window.innerHeight : Math.random() * window.innerHeight;
    particles.push(makeParticle(px, py, (x - px) * 0.018, (y - py) * 0.018, 0.92, activeTheme().c));
  }
  ripples.push({ x, y, r: 120, life: 1, color: activeTheme().c, inward: true });
}

function twinStreams(x, y) {
  for (let side of [-1, 1]) {
    for (let i = 0; i < 70; i += 1) {
      particles.push(
        makeParticle(
          x + side * 36,
          y + Math.random() * 30,
          side * (0.4 + Math.random() * 0.8),
          -3.5 - Math.random() * 2.5,
          1,
          side > 0 ? activeTheme().a : activeTheme().b,
        ),
      );
    }
  }
}

function comet(x, y) {
  rays.push({ x, y, life: 1, angle: Math.random() * Math.PI * 2 });
  for (let i = 0; i < 36; i += 1) {
    particles.push(makeParticle(x, y, -2 - Math.random() * 4, (Math.random() - 0.5) * 2, 1, activeTheme().a));
  }
}

function ring(x, y) {
  ripples.push({ x, y, r: 10, life: 1, color: activeTheme().b });
  for (let i = 0; i < 80; i += 1) {
    const angle = (i / 80) * Math.PI * 2;
    particles.push(makeParticle(x + Math.cos(angle) * 44, y + Math.sin(angle) * 44, 0, 0, 0.88, activeTheme().b));
  }
}

function switchTheme(gesture) {
  themeIndex = gesture === "wave_right"
    ? (themeIndex + 1) % themes.length
    : (themeIndex - 1 + themes.length) % themes.length;
  const x = window.innerWidth * 0.5;
  const y = window.innerHeight * 0.5;
  ripples.push({ x, y, r: 20, life: 1, color: activeTheme().a });
  burst(x, y, 80, 4.2);
}

function demoFrame() {
  const frame = {
    cx: window.innerWidth * (0.42 + Math.random() * 0.16),
    cy: window.innerHeight * (0.4 + Math.random() * 0.12),
    w: Math.min(window.innerWidth * 0.42, 520),
    h: Math.min(window.innerHeight * 0.32, 300),
  };
  activeFrame = activeFrame ? smoothFrame(activeFrame, frame, 0.7) : frame;
  for (let i = 0; i < 18; i += 1) {
    frameTrails.push({
      cx: frame.cx - i * 10,
      cy: frame.cy + Math.sin(i * 0.5) * 16,
      w: frame.w,
      h: frame.h,
      life: Math.max(0.1, 1 - i * 0.05),
    });
  }
  if (frameTrails.length > 48) frameTrails = frameTrails.slice(-48);
}

function demoEnergyOrb(x, y) {
  const charge = 0.86;
  const orb = {
    x,
    y,
    vx: 7.4,
    vy: -5.6,
    radius: 54,
    charge,
    life: 1,
    trail: [],
    frameCooldownUntil: 0,
  };
  activeOrb = null;
  flyingOrbs.push(orb);
  if (flyingOrbs.length > ORB_MAX_FLYING) flyingOrbs.shift();
  ripples.push({ x, y, r: 42, life: 1, color: activeTheme().c });
  spillOrbParticles(orb, 18);
}

function spillOrbParticles(orb, count) {
  for (let i = 0; i < count; i += 1) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 0.4 + Math.random() * (1.8 + orb.charge * 1.4);
    particles.push(
      makeParticle(
        orb.x + Math.cos(angle) * orb.radius * 0.42,
        orb.y + Math.sin(angle) * orb.radius * 0.42,
        Math.cos(angle) * speed,
        Math.sin(angle) * speed,
        0.62,
        Math.random() > 0.5 ? activeTheme().a : activeTheme().c,
      ),
    );
  }
}

function makeParticle(x, y, vx, vy, life, color = randomThemeColor()) {
  return {
    x,
    y,
    vx,
    vy,
    life,
    size: 1.5 + Math.random() * 4.5,
    color,
  };
}

function activeTheme() {
  return themes[themeIndex];
}

function randomThemeColor() {
  const theme = activeTheme();
  return [theme.a, theme.b, theme.c, "#ffffff"][Math.floor(Math.random() * 4)];
}

function draw(now) {
  animationId = requestAnimationFrame(draw);
  detectHands(now);
  updateFps(now);

  const theme = activeTheme();
  ctx.globalCompositeOperation = "source-over";
  ctx.fillStyle = theme.bg;
  ctx.fillRect(0, 0, window.innerWidth, window.innerHeight);
  drawBackdrop(theme);
  updateFrameTrails();
  drawActiveFrame();
  updateEnergyOrbs();
  drawDwellProgress(now);
  drawSpatialMenu(now);
  drawPointer();
  drawPointTrail();
  updateParticles();
  updateRipples();
  updateRays();

  if (debugVisible) {
    drawLandmarkOverlay();
  }
}

function drawPointTrail() {
  const theme = activeTheme();
  const now = performance.now();

  pointTrail = pointTrail.filter(p => p.life > 0.02);
  const len = pointTrail.length;

  for (let i = 0; i < len; i++) {
    const p = pointTrail[i];
    p.life -= 0.018;

    const t = i / len;
    const alpha = p.life * (0.4 + t * 0.5);
    const baseSize = 3 + p.life * 5;
    const wave = Math.sin(now * 0.005 + i * 0.3) * 4 * p.life;

    const mixRatio = t;
    const r1 = parseInt(theme.a.slice(1, 3), 16);
    const g1 = parseInt(theme.a.slice(3, 5), 16);
    const b1 = parseInt(theme.a.slice(5, 7), 16);
    const r2 = parseInt(theme.b.slice(1, 3), 16);
    const g2 = parseInt(theme.b.slice(3, 5), 16);
    const b2 = parseInt(theme.b.slice(5, 7), 16);
    const r = Math.round(r1 + (r2 - r1) * mixRatio);
    const g = Math.round(g1 + (g2 - g1) * mixRatio);
    const b = Math.round(b1 + (b2 - b1) * mixRatio);
    const color = `rgb(${r},${g},${b})`;

    if (i > 0) {
      const prev = pointTrail[i - 1];
      ctx.beginPath();
      ctx.moveTo(prev.x, prev.y + wave);
      ctx.lineTo(p.x, p.y + wave);
      ctx.strokeStyle = color;
      ctx.globalAlpha = alpha * 0.5;
      ctx.lineWidth = baseSize;
      ctx.stroke();
    }

    ctx.beginPath();
    ctx.arc(p.x, p.y + wave, baseSize, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.globalAlpha = alpha * 0.8;
    ctx.fill();

    const emojiSize = 10 + p.life * 10;
    ctx.font = `${emojiSize}px serif`;
    ctx.globalAlpha = alpha;
    if (i % 2 === 0) {
      ctx.fillText("💗", p.x - emojiSize * 0.5, p.y + wave + emojiSize * 0.35);
    } else {
      ctx.fillText("✨", p.x - emojiSize * 0.45, p.y + wave + emojiSize * 0.3);
    }
  }

  if (pointGlow && pointGlow.life > 0) {
    pointGlow.life -= 0.02;
    const glowAlpha = pointGlow.life;
    const pulse = 1 + Math.sin(now * 0.008) * 0.2;

    const outerSize = (25 + (1 - pointGlow.life) * 20) * pulse;
    ctx.beginPath();
    ctx.arc(pointGlow.x, pointGlow.y, outerSize, 0, Math.PI * 2);
    ctx.fillStyle = theme.b;
    ctx.globalAlpha = glowAlpha * 0.08;
    ctx.fill();

    const midSize = (15 + (1 - pointGlow.life) * 10) * pulse;
    ctx.beginPath();
    ctx.arc(pointGlow.x, pointGlow.y, midSize, 0, Math.PI * 2);
    ctx.fillStyle = theme.a;
    ctx.globalAlpha = glowAlpha * 0.2;
    ctx.fill();

    const innerSize = 8 * pulse;
    ctx.beginPath();
    ctx.arc(pointGlow.x, pointGlow.y, innerSize, 0, Math.PI * 2);
    ctx.fillStyle = "#ffffff";
    ctx.globalAlpha = glowAlpha * 0.95;
    ctx.fill();

    ctx.beginPath();
    ctx.arc(pointGlow.x, pointGlow.y, innerSize * 0.5, 0, Math.PI * 2);
    ctx.fillStyle = "#ffffff";
    ctx.globalAlpha = glowAlpha;
    ctx.fill();

    const emojiCount = 4;
    for (let s = 0; s < emojiCount; s++) {
      const angle = (now * 0.003 + s * (Math.PI * 2 / emojiCount)) % (Math.PI * 2);
      const dist = 20 + Math.sin(now * 0.004 + s) * 8;
      const ex = pointGlow.x + Math.cos(angle) * dist;
      const ey = pointGlow.y + Math.sin(angle) * dist;
      const emojiAlpha = (0.6 + Math.sin(now * 0.012 + s * 2) * 0.3) * glowAlpha;

      ctx.font = "14px serif";
      ctx.globalAlpha = emojiAlpha;
      if (s % 2 === 0) {
        ctx.fillText("💗", ex - 7, ey + 5);
      } else {
        ctx.fillText("✨", ex - 6, ey + 4);
      }
    }

    if (pointGlow.life <= 0) pointGlow = null;
  }

  ctx.globalAlpha = 1;
}

function drawLandmarkOverlay() {
  if (!currentLandmarks || currentLandmarks.length === 0) return;

  const theme = activeTheme();
  ctx.globalCompositeOperation = "source-over";

  for (const landmarks of currentLandmarks) {
    // Draw wrist (landmark 0)
    const wrist = landmarks[0];
    const wx = (1 - wrist.x) * window.innerWidth;
    const wy = wrist.y * window.innerHeight;
    ctx.beginPath();
    ctx.arc(wx, wy, 6, 0, Math.PI * 2);
    ctx.fillStyle = theme.a;
    ctx.globalAlpha = 0.5;
    ctx.fill();

    // Draw fingertips (landmarks 4, 8, 12, 16, 20)
    const fingertips = [4, 8, 12, 16, 20];
    for (const idx of fingertips) {
      const point = landmarks[idx];
      const px = (1 - point.x) * window.innerWidth;
      const py = point.y * window.innerHeight;
      ctx.beginPath();
      ctx.arc(px, py, 4, 0, Math.PI * 2);
      ctx.fillStyle = theme.b;
      ctx.globalAlpha = 0.4;
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
}

function updateFrameTrails() {
  frameTrails = frameTrails.filter((frame) => frame.life > 0.03);
  ctx.globalCompositeOperation = "lighter";
  for (const frame of frameTrails) {
    frame.life *= 0.925;
    drawFrame(frame, frame.life * 0.42, 1.4, false);
  }
  ctx.globalAlpha = 1;
}

function drawActiveFrame() {
  if (!activeFrame) return;
  ctx.globalCompositeOperation = "lighter";
  drawFrame(activeFrame, 0.95, 3, true);
  ctx.globalAlpha = 1;
}

function updateEnergyOrbs() {
  drawActiveOrb();
  updateFlyingOrbs();
}

function drawActiveOrb() {
  if (!activeOrb) return;
  const theme = activeTheme();
  const charge = activeOrb.charge;

  ctx.save();
  ctx.globalCompositeOperation = "lighter";

  ctx.lineWidth = 2 + charge * 3;
  ctx.strokeStyle = theme.a;
  ctx.shadowBlur = 18 + charge * 18;
  ctx.shadowColor = theme.a;
  ctx.globalAlpha = 0.62 + charge * 0.28;
  ctx.beginPath();
  ctx.moveTo(activeOrb.handA.x, activeOrb.handA.y);
  ctx.quadraticCurveTo(activeOrb.x, activeOrb.y - activeOrb.radius * 0.5, activeOrb.handB.x, activeOrb.handB.y);
  ctx.stroke();

  const ringCount = 3;
  for (let i = 0; i < ringCount; i += 1) {
    const ringCharge = clamp((charge - i * 0.33) / 0.33, 0, 1);
    if (ringCharge < 0.05) continue;
    const ringRadius = activeOrb.radius + 10 + i * 8;
    const startAngle = -Math.PI / 2;
    const endAngle = startAngle + Math.PI * 2 * ringCharge;
    ctx.globalAlpha = (0.3 + 0.4 * ringCharge) * (0.7 + 0.3 * Math.sin(performance.now() * 0.006 + i));
    ctx.lineWidth = 2.5;
    ctx.shadowBlur = 10 + charge * 8;
    ctx.shadowColor = i === 0 ? theme.a : i === 1 ? theme.c : theme.b;
    ctx.strokeStyle = i === 0 ? theme.a : i === 1 ? theme.c : theme.b;
    ctx.beginPath();
    ctx.arc(activeOrb.x, activeOrb.y, ringRadius, startAngle, endAngle);
    ctx.stroke();
  }

  if (charge > 0.7) {
    const pulse = 0.5 + 0.5 * Math.sin(performance.now() * 0.01);
    ctx.globalAlpha = (charge - 0.7) * 2 * pulse;
    ctx.shadowBlur = 24;
    ctx.shadowColor = theme.c;
    ctx.beginPath();
    ctx.arc(activeOrb.x, activeOrb.y, activeOrb.radius + 24, 0, Math.PI * 2);
    ctx.strokeStyle = theme.c;
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  drawOrbCore(activeOrb, 0.95);
  ctx.restore();
}

function updateFlyingOrbs() {
  ctx.globalCompositeOperation = "lighter";
  flyingOrbs = flyingOrbs.filter((orb) => orb.life > 0.04);
  for (const orb of flyingOrbs) {
    orb.trail.push({ x: orb.x, y: orb.y, r: orb.radius, life: 1 });
    if (orb.trail.length > 22) orb.trail.shift();

    orb.x += orb.vx;
    orb.y += orb.vy;
    orb.vx *= 0.996;
    orb.vy *= 0.996;
    orb.life *= 0.994;

    bounceOrbOnScreen(orb);
    bounceOrbOnFrame(orb);
    drawOrbTrail(orb);
    drawOrbCore(orb, orb.life);
  }
  ctx.globalAlpha = 1;
}

function bounceOrbOnScreen(orb) {
  let bounced = false;
  if (orb.x < orb.radius) {
    orb.x = orb.radius;
    orb.vx = Math.abs(orb.vx) * 0.92;
    bounced = true;
  }
  if (orb.x > window.innerWidth - orb.radius) {
    orb.x = window.innerWidth - orb.radius;
    orb.vx = -Math.abs(orb.vx) * 0.92;
    bounced = true;
  }
  if (orb.y < orb.radius) {
    orb.y = orb.radius;
    orb.vy = Math.abs(orb.vy) * 0.92;
    bounced = true;
  }
  if (orb.y > window.innerHeight - orb.radius) {
    orb.y = window.innerHeight - orb.radius;
    orb.vy = -Math.abs(orb.vy) * 0.92;
    bounced = true;
  }
  if (bounced) {
    spillOrbParticles(orb, 12);
    ripples.push({ x: orb.x, y: orb.y, r: orb.radius * 0.7, life: 0.8, color: activeTheme().a });
    ripples.push({ x: orb.x, y: orb.y, r: orb.radius * 0.4, life: 0.6, color: activeTheme().c });
  }
}

function bounceOrbOnFrame(orb) {
  if (!activeFrame || performance.now() < orb.frameCooldownUntil) return;
  const x = activeFrame.cx - activeFrame.w / 2;
  const y = activeFrame.cy - activeFrame.h / 2;
  const right = x + activeFrame.w;
  const bottom = y + activeFrame.h;
  const insideBand = orb.x > x - orb.radius && orb.x < right + orb.radius && orb.y > y - orb.radius && orb.y < bottom + orb.radius;
  if (!insideBand) return;

  const distances = [
    { side: "left", value: Math.abs(orb.x - x) },
    { side: "right", value: Math.abs(orb.x - right) },
    { side: "top", value: Math.abs(orb.y - y) },
    { side: "bottom", value: Math.abs(orb.y - bottom) },
  ].sort((a, b) => a.value - b.value);
  if (distances[0].value > orb.radius + 8) return;

  if (distances[0].side === "left" || distances[0].side === "right") {
    orb.vx *= -0.96;
    orb.x += orb.vx > 0 ? 10 : -10;
  } else {
    orb.vy *= -0.96;
    orb.y += orb.vy > 0 ? 10 : -10;
  }
  orb.frameCooldownUntil = performance.now() + 220;
  frameTrails.push({ ...activeFrame, life: 0.85 });
  ripples.push({ x: orb.x, y: orb.y, r: orb.radius, life: 0.85, color: activeTheme().c });
  ripples.push({ x: orb.x, y: orb.y, r: orb.radius * 0.6, life: 0.65, color: activeTheme().a });
  spillOrbParticles(orb, 16);
}

function drawOrbTrail(orb) {
  for (const mark of orb.trail) {
    mark.life *= 0.9;
    ctx.beginPath();
    ctx.arc(mark.x, mark.y, mark.r * mark.life * 0.8, 0, Math.PI * 2);
    ctx.fillStyle = activeTheme().b;
    ctx.globalAlpha = mark.life * 0.18;
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function drawOrbCore(orb, alpha) {
  const gradient = ctx.createRadialGradient(orb.x, orb.y, 2, orb.x, orb.y, orb.radius);
  gradient.addColorStop(0, "#ffffff");
  gradient.addColorStop(0.36, activeTheme().c);
  gradient.addColorStop(0.72, activeTheme().a);
  gradient.addColorStop(1, "rgba(255,255,255,0)");
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.shadowBlur = 24 + orb.charge * 34;
  ctx.shadowColor = activeTheme().c;
  ctx.beginPath();
  ctx.arc(orb.x, orb.y, orb.radius, 0, Math.PI * 2);
  ctx.fillStyle = gradient;
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = activeTheme().a;
  ctx.globalAlpha = alpha * (0.55 + orb.charge * 0.35);
  ctx.stroke();
  ctx.restore();
}

function drawFrame(frame, alpha, lineWidth, showCorners) {
  const theme = activeTheme();
  const x = frame.cx - frame.w / 2;
  const y = frame.cy - frame.h / 2;
  const radius = Math.min(22, frame.w * 0.08, frame.h * 0.12);

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.shadowBlur = showCorners ? 28 : 12;
  ctx.shadowColor = theme.a;
  ctx.strokeStyle = showCorners ? theme.a : theme.b;
  ctx.lineWidth = lineWidth;
  roundedRectPath(x, y, frame.w, frame.h, radius);
  ctx.stroke();

  if (showCorners) {
    ctx.shadowBlur = 18;
    ctx.strokeStyle = theme.c;
    ctx.lineWidth = 4;
    drawCornerMarks(x, y, frame.w, frame.h);
  }
  ctx.restore();
}

function roundedRectPath(x, y, width, height, radius) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
}

function drawCornerMarks(x, y, width, height) {
  const length = Math.min(46, width * 0.14, height * 0.2);
  const corners = [
    [x, y, 1, 1],
    [x + width, y, -1, 1],
    [x + width, y + height, -1, -1],
    [x, y + height, 1, -1],
  ];
  for (const [cx, cy, sx, sy] of corners) {
    ctx.beginPath();
    ctx.moveTo(cx, cy + sy * length);
    ctx.lineTo(cx, cy);
    ctx.lineTo(cx + sx * length, cy);
    ctx.stroke();
  }
}

function drawBackdrop(theme) {
  const gradient = ctx.createRadialGradient(
    window.innerWidth * 0.5,
    window.innerHeight * 0.46,
    0,
    window.innerWidth * 0.5,
    window.innerHeight * 0.46,
    Math.max(window.innerWidth, window.innerHeight) * 0.75,
  );
  gradient.addColorStop(0, `${theme.a}20`);
  gradient.addColorStop(0.48, `${theme.b}10`);
  gradient.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, window.innerWidth, window.innerHeight);
}

function drawPointer() {
  if (!pointer.active) return;
  ctx.globalCompositeOperation = "lighter";
  ctx.beginPath();
  ctx.arc(pointer.x, pointer.y, 12, 0, Math.PI * 2);
  ctx.fillStyle = activeTheme().a;
  ctx.shadowBlur = 24;
  ctx.shadowColor = activeTheme().a;
  ctx.fill();
  ctx.shadowBlur = 0;
}

function updateParticles() {
  ctx.globalCompositeOperation = "lighter";
  particles = particles.filter((particle) => particle.life > 0.02);
  for (const particle of particles) {
    particle.x += particle.vx;
    particle.y += particle.vy;
    particle.vx *= 0.985;
    particle.vy = particle.vy * 0.985 + 0.018;
    particle.life *= 0.973;

    ctx.beginPath();
    ctx.arc(particle.x, particle.y, particle.size * particle.life, 0, Math.PI * 2);
    ctx.fillStyle = particle.color;
    ctx.globalAlpha = Math.max(0, particle.life);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function updateRipples() {
  ctx.globalCompositeOperation = "lighter";
  ripples = ripples.filter((ripple) => ripple.life > 0.02);
  for (const ripple of ripples) {
    ripple.r += ripple.inward ? -2.8 : 5.4;
    ripple.life *= 0.945;
    ctx.beginPath();
    ctx.arc(ripple.x, ripple.y, Math.max(2, ripple.r), 0, Math.PI * 2);
    ctx.strokeStyle = ripple.color;
    ctx.globalAlpha = ripple.life;
    ctx.lineWidth = 2.5;
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

function updateRays() {
  ctx.globalCompositeOperation = "lighter";
  rays = rays.filter((ray) => ray.life > 0.02);
  for (const ray of rays) {
    ray.life *= 0.94;
    ray.angle += 0.035;
    ctx.save();
    ctx.translate(ray.x, ray.y);
    ctx.rotate(ray.angle);
    ctx.globalAlpha = ray.life * 0.8;
    ctx.fillStyle = activeTheme().a;
    ctx.fillRect(-12, -1, 220, 2);
    ctx.restore();
  }
  ctx.globalAlpha = 1;
}

function updateFps(now) {
  fpsFrames += 1;
  if (now - fpsLastAt > 800) {
    const fps = Math.round((fpsFrames * 1000) / (now - fpsLastAt));
    fpsStatus.textContent = `${fps} FPS`;
    fpsFrames = 0;
    fpsLastAt = now;
  }
}

function demoPulse() {
  const demos = ["open_palm", "fist", "peace", "point", "pinch", "frame_drag", "orb_flight", "wave_right"];
  const gesture = demos[Math.floor(Math.random() * demos.length)];
  const x = window.innerWidth * (0.35 + Math.random() * 0.3);
  const y = window.innerHeight * (0.34 + Math.random() * 0.28);
  runDemoGesture(gesture, x, y);
}

function runDemoGesture(gesture, x, y) {
  if (gesture === "menu_open") {
    demoMenuDwell(x, y);
    return;
  }
  const mode = gesture === "frame_drag"
    ? MODES.FRAME_DRAG
    : gesture === "orb_charge" || gesture === "orb_flight"
      ? MODES.ORB_FLIGHT
      : MODES.GESTURE_TRIGGER;
  setInteractionMode(mode, {
    gesture,
    source: "demo",
    lockMs: gesture === "frame_drag" ? 0 : 320,
  });
  runEffect(gesture, x, y);
}

function demoMenuDwell(x, y) {
  const now = performance.now();
  menuState.dwellTracking = true;
  menuState.dwellSince = now;
  menuState.dwellCenter = { x, y };
  setInteractionMode(MODES.GESTURE_TRIGGER, {
    gesture: "open_palm",
    source: "demo",
    lockMs: MENU_DWELL_MS + 200,
  });

  setTimeout(() => {
    if (menuState.dwellTracking && !menuState.open) {
      openMenu(x, y, performance.now());
    }
  }, MENU_DWELL_MS + 50);
}

window.addEventListener("resize", resizeCanvas);
startButton.addEventListener("click", startCamera);
stopButton.addEventListener("click", stopCamera);
demoButton.addEventListener("click", demoPulse);
chips.forEach((chip) => {
  chip.addEventListener("click", () => {
    if (menuState.open) closeMenu();
    const gesture = chip.dataset.demo;
    runDemoGesture(gesture, window.innerWidth * 0.5, window.innerHeight * 0.48);
  });
});

// --- Debug HUD ---
const debugHud = document.querySelector("#debugHud");
const debugMode = document.querySelector("#debugMode");
const debugGesture = document.querySelector("#debugGesture");
const debugHands = document.querySelector("#debugHands");
const debugConfidence = document.querySelector("#debugConfidence");
const debugDwell = document.querySelector("#debugDwell");
const debugMenuItem = document.querySelector("#debugMenuItem");
const debugOrbCharge = document.querySelector("#debugOrbCharge");
const debugOrbDistance = document.querySelector("#debugOrbDistance");
const debugCooldown = document.querySelector("#debugCooldown");
const debugLastTransition = document.querySelector("#debugLastTransition");
const debugTransitionLog = document.querySelector("#debugTransitionLog");

let debugVisible = false;
let lastDetectedHandCount = 0;

function toggleDebug() {
  debugVisible = !debugVisible;
  debugHud.hidden = !debugVisible;
}

function updateDebugHud() {
  if (!debugVisible) return;

  debugMode.textContent = modeLabels[interaction.mode] || interaction.mode;
  debugGesture.textContent = gestureLabels[interaction.gesture] || interaction.gesture;
  debugHands.textContent = lastDetectedHandCount;

  // Confidence
  if (currentHandedness.length > 0) {
    const scores = currentHandedness.map(h => h[0]?.score || 0);
    const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
    debugConfidence.textContent = `${Math.round(avg * 100)}%`;
  } else {
    debugConfidence.textContent = "--";
  }

  // Menu dwell progress
  if (menuState.dwellTracking && !menuState.open) {
    const elapsed = performance.now() - menuState.dwellSince;
    const progress = Math.min(100, Math.round((elapsed / MENU_DWELL_MS) * 100));
    debugDwell.textContent = `${progress}%`;
  } else if (menuState.open) {
    debugDwell.textContent = "open";
  } else {
    debugDwell.textContent = "--";
  }

  // Menu item
  debugMenuItem.textContent = menuState.highlighted >= 0 ? MENU_ITEMS[menuState.highlighted].label : "--";

  // Orb state
  if (activeOrb) {
    debugOrbCharge.textContent = `${Math.round(activeOrb.charge * 100)}%`;
    debugOrbDistance.textContent = `${Math.round(activeOrb.distance)}px`;
  } else {
    debugOrbCharge.textContent = "--";
    debugOrbDistance.textContent = "--";
  }

  // Cooldown
  const cooldownRemaining = menuState.cooldownUntil - performance.now();
  debugCooldown.textContent = cooldownRemaining > 0 ? `${Math.round(cooldownRemaining)}ms` : "--";

  // Last transition
  const log = getTransitionLog();
  if (log.length > 0) {
    const last = log[log.length - 1];
    debugLastTransition.textContent = `${modeLabels[last.from] || last.from} -> ${modeLabels[last.to] || last.to}`;
  } else {
    debugLastTransition.textContent = "--";
  }

  // Transition log
  debugTransitionLog.innerHTML = log
    .slice()
    .reverse()
    .map((entry) => {
      const fromLabel = modeLabels[entry.from] || entry.from;
      const toLabel = modeLabels[entry.to] || entry.to;
      return `<div class="debug-log-entry"><span>${fromLabel}->${toLabel}</span><span>${entry.secondsAgo}s</span></div>`;
    })
    .join("");
}

// Keyboard shortcut
window.addEventListener("keydown", (e) => {
  if (e.key === "d" || e.key === "D") {
    toggleDebug();
  }
});

// Update hand count in detectHands
const originalDetectHands = detectHands;
detectHands = function (now) {
  if (!handLandmarker || !stream || video.readyState < 2) return;
  if (video.currentTime === lastVideoTime) return;
  lastVideoTime = video.currentTime;

  const result = handLandmarker.detectForVideo(video, now);
  lastDetectedHandCount = result.landmarks ? result.landmarks.length : 0;
  currentLandmarks = result.landmarks || [];
  currentHandedness = result.handedness || [];

  if (!result.landmarks || result.landmarks.length === 0) {
    pointer.active = false;
    activeFrame = null;
    activeOrb = null;
    closeMenu();
    setInteractionMode(MODES.SEARCHING, {
      gesture: "searching",
      activateChip: false,
      source: "detector",
    });
    return;
  }

  if (result.landmarks.length >= 2) {
    updateTwoHandInteraction(result.landmarks[0], result.landmarks[1]);
    return;
  }

  activeFrame = null;
  activeOrb = null;
  const landmarks = result.landmarks[0];
  const wrist = landmarks[0];
  const classified = classifyGesture(landmarks);
  const wave = classifyWave(wrist);
  const gesture = wave || classified;

  if (classified === "point") {
    const indexTip = toStagePoint(landmarks[8]);
    pointer = { x: indexTip.x, y: indexTip.y, active: true };
    pointTrail.push({ x: indexTip.x, y: indexTip.y, life: 1 });
    if (pointTrail.length > 50) pointTrail.shift();
    pointGlow = { x: indexTip.x, y: indexTip.y, life: 1 };
  } else {
    pointer = {
      x: (1 - landmarks[9].x) * window.innerWidth,
      y: landmarks[9].y * window.innerHeight,
      active: true,
    };
  }

  if (handleMenuGesture(gesture, pointer.x, pointer.y, classified, now)) return;

  triggerGesture(gesture, pointer.x, pointer.y);
};

// Update draw function to include debug HUD
const originalDraw = draw;
draw = function (now) {
  originalDraw(now);
  updateDebugHud();
};

resizeCanvas();
setInteractionMode(MODES.IDLE, { force: true, source: "boot" });
loadModel();
burst(window.innerWidth * 0.5, window.innerHeight * 0.45, 90, 4.4);
draw(performance.now());
