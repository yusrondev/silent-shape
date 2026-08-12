/**
 * HUD.js — Minimalist Heads-Up Display Controller
 *
 * Manages all DOM-based HUD elements:
 *  - Region name display
 *  - Signal bars
 *  - Interaction prompt (contextual)
 *  - Transmit progress ring
 *  - Story log popup
 *  - Status messages
 *  - Debug info (FPS, coords, chunks)
 */

const TRANSMIT_CIRCUMFERENCE = 150.8; // 2π × 24 (SVG circle radius=24)

export class HUD {
  constructor() {
    this._regionName    = document.getElementById('region-name');
    this._signalBars    = document.querySelectorAll('.signal-bar');
    this._statusMsg     = document.getElementById('hud-status-msg');
    this._interactPrompt = document.getElementById('interact-prompt');
    this._interactText  = document.getElementById('interact-text');
    this._transmitHud   = document.getElementById('transmit-hud');
    this._transmitRing  = document.getElementById('transmit-progress-ring');
    this._storyLog      = document.getElementById('story-log');
    this._storyArtId    = document.getElementById('artifact-id');
    this._storyText     = document.getElementById('story-text');
    this._storyClose    = document.getElementById('story-close');
    this._debugFPS      = document.getElementById('debug-fps');
    this._debugPos      = document.getElementById('debug-pos');
    this._debugChunks   = document.getElementById('debug-chunks');

    this._statusTimeout = null;
    this._currentSignal = 0;

    // Story close button
    if (this._storyClose) {
      this._storyClose.addEventListener('click', () => this.hideStoryLog());
      this._storyClose.addEventListener('touchend', (e) => {
        e.preventDefault();
        this.hideStoryLog();
      });
    }
  }

  /**
   * Show the HUD (called after game finishes loading).
   */
  show() {
    const hud = document.getElementById('hud');
    if (hud) hud.hidden = false;
  }

  /**
   * Set the current region name.
   * @param {string} name
   */
  setRegion(name) {
    if (this._regionName) {
      this._regionName.textContent = name.toUpperCase();
      this._regionName.classList.add('region-unlock');
      setTimeout(() => this._regionName.classList.remove('region-unlock'), 1200);
    }
  }

  /**
   * Update signal bar visualization (0–5).
   * @param {number} level — 0..5
   */
  setSignalLevel(level) {
    this._currentSignal = Math.max(0, Math.min(5, Math.round(level)));
    this._signalBars.forEach((bar) => {
      const barLevel = parseInt(bar.dataset.level, 10);
      bar.classList.toggle('active', barLevel <= this._currentSignal);
    });
  }

  /**
   * Show/hide contextual interaction prompt.
   * @param {boolean} visible
   * @param {string} text — prompt label
   */
  setInteractPrompt(visible, text = 'Interact') {
    if (!this._interactPrompt) return;
    this._interactPrompt.hidden = !visible;
    if (this._interactText && text) {
      this._interactText.textContent = text;
    }
  }

  /**
   * Update transmit progress ring (0..1).
   * @param {number} progress — 0..1
   * @param {boolean} visible
   */
  setTransmitProgress(progress, visible) {
    if (!this._transmitHud) return;
    this._transmitHud.hidden = !visible;

    if (visible && this._transmitRing) {
      const offset = TRANSMIT_CIRCUMFERENCE * (1 - progress);
      this._transmitRing.style.strokeDashoffset = offset;
    }
  }

  /**
   * Show artefact story log.
   * @param {string} artefactId
   * @param {string} text
   */
  showStoryLog(artefactId, text) {
    if (!this._storyLog) return;
    if (this._storyArtId) this._storyArtId.textContent = artefactId.toUpperCase();
    if (this._storyText)  this._storyText.textContent  = `"${text}"`;
    this._storyLog.hidden = false;
  }

  hideStoryLog() {
    if (this._storyLog) this._storyLog.hidden = true;
  }

  /**
   * Show a temporary status message in the center-top HUD area.
   * @param {string} msg
   * @param {number} durationMs
   */
  showStatus(msg, durationMs = 3000) {
    if (!this._statusMsg) return;
    this._statusMsg.textContent = msg;
    this._statusMsg.classList.add('visible');

    clearTimeout(this._statusTimeout);
    this._statusTimeout = setTimeout(() => {
      this._statusMsg.classList.remove('visible');
    }, durationMs);
  }

  /**
   * Update debug HUD (call each frame in dev mode).
   * @param {number} fps
   * @param {THREE.Vector3} pos
   * @param {number} chunkCount
   */
  updateDebug(fps, pos, chunkCount) {
    if (this._debugFPS)    this._debugFPS.textContent    = `FPS: ${fps}`;
    if (this._debugPos)    this._debugPos.textContent    = `x:${pos.x.toFixed(0)} z:${pos.z.toFixed(0)}`;
    if (this._debugChunks) this._debugChunks.textContent = `chunks: ${chunkCount}`;
  }
}
