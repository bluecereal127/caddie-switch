// Launching Dolphin for the harness: a self-contained user directory under
// tools/harness/state/user (Dolphin's -u), generated here, so the user's own
// %APPDATA%/Dolphin Emulator is never read or written. The disc image and its
// extraction are only ever read.
//
// What the generated config does, and why:
// - [General] GDBPort: Dolphin's GDB stub; the CPU waits at boot until
//   tools/harness/lib/gdb.mjs connects. [Interface] DebugModeEnabled turns on
//   the JIT's breakpoint checks (Jit64 compiles them in only in debug mode).
// - [Core] CPUThread = False (single core): the CPU and GPU interleave the
//   same way every run, part of "same savestate + same inputs = same result".
// - [Input] BackgroundInput: hotkeys and the Wii Remote read the DSU device
//   while the render window is not focused (the harness runs unattended).
// - DSUClient.ini: Dolphin's DSU client polls tools/harness/lib/dsu.mjs;
//   WiimoteNew.ini maps DSU slot 0 onto Wii Remote 1 (MotionPlus attached,
//   no extension), Hotkeys.ini maps DSU slot 1 onto savestate slots 1-8,
//   screenshot, pause and the speed limit.
// - No analytics prompt, no update check, no audio (the harness has no ears).

import fs from "node:fs";
import path from "node:path";
import { spawn, execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const HARNESS = path.resolve(HERE, "..");
export const STATE = path.join(HARNESS, "state");
// one user dir per instance (HARNESS_INSTANCE = 0, 1, ...), so several
// Dolphins can run side by side, each with its own GDB and DSU ports
export const INSTANCE = Number(process.env.HARNESS_INSTANCE || 0);
export const USER = path.join(STATE, INSTANCE ? `user${INSTANCE}` : "user");
// Ports below Windows' ephemeral range (49152-65535): fixed ports inside it
// collide with client sockets other programs hold (measured: 55022 and
// 55028 taken by another process's local connections, so Dolphin's GDB stub
// failed to bind). No Windows port exclusion covers 46000-47999 here
// (netsh interface ipv4 show excludedportrange).
export const portsFor = (i = INSTANCE) => ({ gdb: 47020 + i, dsu: 46020 + i });
export const DOLPHIN = process.env.HARNESS_DOLPHIN ||
  "C:/Users/Stephen/Downloads/dolphin-2609a-x64/Dolphin-x64/Dolphin.exe";
export const DISC = process.env.HARNESS_DISC ||
  "C:/Users/Stephen/Desktop/Wii Sports Resort (USA) (En,Fr,Es) (Rev 1).rvz";
export const GAME_ID = "RZTE01";

export const DSU_DEVICE = "Harness";            // DSUClient/<slot>/Harness
export const WIIMOTE_DEV = `DSUClient/0/${DSU_DEVICE}`;
export const HOTKEY_DEV = `DSUClient/1/${DSU_DEVICE}`;

// Wii Remote button -> DSU slot-0 input
export const WIIMOTE_MAP = {
  A: "Cross", B: "Circle", 1: "Square", 2: "Triangle", "-": "L1", "+": "R1", Home: "PS",
  Up: "Pad N", Down: "Pad S", Left: "Pad W", Right: "Pad E",
};
// Dolphin hotkey -> DSU slot-1 input
export const HOTKEY_MAP = {
  "Load State/Load State Slot 1": "Pad N", "Load State/Load State Slot 2": "Pad E",
  "Load State/Load State Slot 3": "Pad S", "Load State/Load State Slot 4": "Pad W",
  "Save State/Save State Slot 1": "Square", "Save State/Save State Slot 2": "Cross",
  "Save State/Save State Slot 3": "Circle", "Save State/Save State Slot 4": "Triangle",
  "General/Take Screenshot": "L1",
  "General/Toggle Pause": "R1",
  "Emulation Speed/Disable Emulation Speed Limit": "L2",
  "Frame Advance/Frame Advance": "R2",
};

const q = (s) => (/[^A-Za-z0-9]/.test(s) ? `\`${s}\`` : s);

function ini(sections) {
  let out = "";
  for (const [name, kv] of Object.entries(sections)) {
    out += `[${name}]\n`;
    for (const [k, v] of Object.entries(kv)) out += `${k} = ${v}\n`;
  }
  return out;
}

export function writeUserDir({
  gdbPort = portsFor().gdb, dsuPort = portsFor().dsu, backend = "D3D", speed = 1.0, cheats = false,
  cpuCore = 1, logTypes = ["GDB_STUB", "CI", "OSREPORT"], window = { x: 40, y: 40, w: 640, h: 480 },
} = {}) {
  const cfg = path.join(USER, "Config");
  fs.mkdirSync(cfg, { recursive: true });
  fs.writeFileSync(path.join(cfg, "Dolphin.ini"), ini({
    // HotkeysRequireFocus defaults to true: a click into another window
    // would silently drop the savestate hotkeys the batch runs depend on
    General: { GDBPort: gdbPort, ShowFrameCount: "True", HotkeysRequireFocus: "False" },
    Interface: {
      ConfirmStop: "False", UsePanicHandlers: "False", OnScreenDisplayMessages: "True",
      DebugModeEnabled: "True", PauseOnFocusLost: "False", ShowActiveTitle: "True", HotkeysRequireFocus: "False",
    },
    Analytics: { Enabled: "False", PermissionAsked: "True" },
    AutoUpdate: { UpdateTrack: "", HashOverride: "" },
    Core: {
      CPUThread: "False", CPUCore: cpuCore, EnableCheats: cheats ? "True" : "False",
      EmulationSpeed: speed.toFixed(6), GFXBackend: backend, SyncOnSkipIdle: "True",
      WiimoteContinuousScanning: "False", WiimoteEnableSpeaker: "False", WiiSDCard: "False",
      PauseOnFocusLost: "False",
    },
    Input: { BackgroundInput: "True" },
    Display: {
      Fullscreen: "False", RenderToMain: "False", RenderWindowAutoSize: "False", KeepWindowOnTop: "False",
      RenderWindowXPos: window.x, RenderWindowYPos: window.y, RenderWindowWidth: window.w, RenderWindowHeight: window.h,
    },
    DSP: { Backend: "No Audio Output", DSPHLE: "True", Volume: 0 },
    Movie: { ShowFrameCounter: "True" },
  }));
  fs.writeFileSync(path.join(cfg, "GFX.ini"), ini({
    Settings: { InternalResolution: 1, ShowFPS: "False", AspectRatio: 0, ShaderCompilationMode: 0, WaitForShadersBeforeStarting: "False" },
    Hardware: { VSync: "False" },
  }));
  fs.writeFileSync(path.join(cfg, "DSUClient.ini"), ini({
    Server: { Enabled: "True", Entries: `${DSU_DEVICE}:127.0.0.1:${dsuPort};` },
  }));
  const wm = { Device: WIIMOTE_DEV };
  for (const [btn, dsu] of Object.entries(WIIMOTE_MAP)) {
    const key = ["Up", "Down", "Left", "Right"].includes(btn) ? `D-Pad/${btn}` : `Buttons/${btn}`;
    wm[key] = q(dsu);
  }
  Object.assign(wm, {
    "IR/Up": q("Left Y+"), "IR/Down": q("Left Y-"), "IR/Left": q("Left X-"), "IR/Right": q("Left X+"),
    "IMUAccelerometer/Up": q("Accel Up"), "IMUAccelerometer/Down": q("Accel Down"),
    "IMUAccelerometer/Left": q("Accel Left"), "IMUAccelerometer/Right": q("Accel Right"),
    "IMUAccelerometer/Forward": q("Accel Forward"), "IMUAccelerometer/Backward": q("Accel Backward"),
    "IMUGyroscope/Pitch Up": q("Gyro Pitch Up"), "IMUGyroscope/Pitch Down": q("Gyro Pitch Down"),
    "IMUGyroscope/Roll Left": q("Gyro Roll Left"), "IMUGyroscope/Roll Right": q("Gyro Roll Right"),
    "IMUGyroscope/Yaw Left": q("Gyro Yaw Left"), "IMUGyroscope/Yaw Right": q("Gyro Yaw Right"),
    Extension: "None",
    "Extension/Attach MotionPlus": "True",
  });
  fs.writeFileSync(path.join(cfg, "WiimoteNew.ini"), ini({
    Wiimote1: wm,
    Wiimote2: { Device: "DSUClient/9/None" }, Wiimote3: { Device: "DSUClient/9/None" }, Wiimote4: { Device: "DSUClient/9/None" },
  }));
  const hk = { Device: HOTKEY_DEV };
  for (const [k, dsu] of Object.entries(HOTKEY_MAP)) hk[k] = q(dsu);
  fs.writeFileSync(path.join(cfg, "Hotkeys.ini"), ini({ Hotkeys: hk }));
  const logs = {};
  for (const t of logTypes) logs[t] = "True";
  fs.writeFileSync(path.join(cfg, "Logger.ini"), ini({
    Logs: logs, Options: { Verbosity: 4, WriteToFile: "True", WriteToConsole: "False", WriteToWindow: "False" },
  }));
  return USER;
}

export const stateSlotPath = (slot) => path.join(USER, "StateSaves", `${GAME_ID}.s${String(slot).padStart(2, "0")}`);
export const screenshotDir = () => path.join(USER, "ScreenShots", GAME_ID);
export const logPath = () => path.join(USER, "Logs", "dolphin.log");

export function launch({ saveState = null, batch = true, videoBackend = null, extraArgs = [] } = {}) {
  const args = ["-u", USER, "-e", DISC];
  if (batch) args.push("-b");
  if (saveState) args.push("-s", saveState);
  if (videoBackend) args.push("-v", videoBackend);
  args.push(...extraArgs);
  const child = spawn(DOLPHIN, args, { stdio: "ignore", detached: false, windowsHide: false });
  child.on("error", (e) => { child.launchError = e; });
  return child;
}

// stop the Dolphin this harness started (by pid: never another Dolphin)
export function kill(child) {
  if (!child || child.exitCode != null) return;
  try { execFileSync("taskkill", ["/F", "/T", "/PID", String(child.pid)], { stdio: "ignore" }); } catch { /* gone */ }
}
