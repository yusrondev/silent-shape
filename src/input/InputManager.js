/**
 * InputManager.js — Unified Input State
 * Centralizes all input from TouchControls into one readable state object.
 * Game systems (Player, Camera) consume this state each frame.
 */
export class InputManager {
  constructor() {
    /** Joystick movement: { x: -1..1, y: -1..1 } — right/forward positive */
    this.move = { x: 0, y: 0 };

    /** Camera drag delta accumulated this frame */
    this.cameraDelta = { x: 0, y: 0 };

    /** Button states */
    this.jump      = false;  // true while held
    this.jumpDown  = false;  // true for 1 frame on press
    this.jumpUp    = false;  // true for 1 frame on release

    this.interact     = false;
    this.interactDown = false;

    this.tool     = false;
    this.toolDown = false;
    this.toolUp   = false;

    /** Intensity of joystick (0..1) — used for walk/run blend */
    this.moveIntensity = 0;

    // Keyboard fallbacks (Desktop testing)
    this.keys = {
      w: false,
      a: false,
      s: false,
      d: false,
      space: false,
      arrowup: false,
      arrowdown: false,
      arrowleft: false,
      arrowright: false,
    };

    this._initKeyboard();
  }

  _initKeyboard() {
    window.addEventListener('keydown', (e) => {
      const key = e.key.toLowerCase();
      if (key === ' ' || key === 'spacebar') {
        if (!this.keys.space) {
          this.jumpDown = true;
          this.jump = true;
        }
        this.keys.space = true;
      }
      if (['w', 'a', 's', 'd'].includes(key)) {
        this.keys[key] = true;
      }
      if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(key)) {
        this.keys[key] = true;
      }
    });

    window.addEventListener('keyup', (e) => {
      const key = e.key.toLowerCase();
      if (key === ' ' || key === 'spacebar') {
        this.jumpUp = true;
        this.jump = false;
        this.keys.space = false;
      }
      if (['w', 'a', 's', 'd'].includes(key)) {
        this.keys[key] = false;
      }
      if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(key)) {
        this.keys[key] = false;
      }
    });
  }

  /**
   * Called at the end of each frame to reset one-frame flags.
   */
  flush() {
    this.jumpDown    = false;
    this.jumpUp      = false;
    this.interactDown = false;
    this.toolDown    = false;
    this.toolUp      = false;
    this.cameraDelta.x = 0;
    this.cameraDelta.y = 0;
  }
}
