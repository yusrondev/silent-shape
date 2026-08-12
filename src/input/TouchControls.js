/**
 * TouchControls.js — Nipple.js Joystick + Arc Action Buttons + Camera Drag
 *
 * Architecture (reliable multi-touch routing):
 *   - Nipple.js listens on #joystick-zone for joystick
 *   - Buttons have their own touchstart/end listeners (with stopPropagation)
 *   - Camera drag uses window-level touchstart and tracks touch IDs:
 *       * Touch that started in joystick area → skip (nipplejs handles it)
 *       * Touch that started on a button → skip
 *       * Any other touch → camera drag
 *   This avoids ALL z-index / pointer-event competition.
 */
import nipplejs from 'nipplejs';

export class TouchControls {
  constructor(inputManager) {
    this.input = inputManager;

    this._joystick = null;

    // Camera drag state
    this._camTouchId  = null;   // ID of finger doing camera drag
    this._camLastX    = 0;
    this._camLastY    = 0;

    // Button hold tracking
    this._jumpHeld     = false;
    this._toolHeld     = false;
    this._interactHeld = false;

    this._init();
  }

  _init() {
    this._initJoystick();
    this._initActionButtons();
    this._initCameraDrag();
  }

  /* ─────────────────────────────────────────────────────────────
     1. NIPPLE.JS VIRTUAL JOYSTICK
     ───────────────────────────────────────────────────────────── */
  _initJoystick() {
    const zone = document.getElementById('joystick-zone');
    if (!zone) return;

    this._joystick = nipplejs.create({
      zone,
      mode:         'dynamic',   // floating — appears where thumb lands
      dynamicPage:  true,        // handles zone position changes (orientation, scroll)
      restOpacity:  0,
      color:        '#e8c547',
      size:         140,
      threshold:    0.04,
      fadeTime:     200,
    });

    this._joystick.on('move', (_e, data) => {
      if (!data?.vector) return;
      this.input.move.x      = data.vector.x;
      this.input.move.y      = data.vector.y;   // +y = forward (nipple default)
      const maxDist = 70;                        // half of size=140
      this.input.moveIntensity = Math.min((data.distance ?? 0) / maxDist, 1);
    });

    this._joystick.on('end', () => {
      this.input.move.x       = 0;
      this.input.move.y       = 0;
      this.input.moveIntensity = 0;
    });
  }

  /* ─────────────────────────────────────────────────────────────
     2. ARC ACTION BUTTONS
     ───────────────────────────────────────────────────────────── */
  _initActionButtons() {
    this._bindButton('btn-fire',     'fire');
    this._bindButton('btn-interact', 'interact');
    this._bindButton('btn-tool',     'tool');
  }

  _bindButton(id, key) {
    const btn = document.getElementById(id);
    if (!btn) return;

    const downKey = `${key}Down`;
    const upKey   = `${key}Up`;
    const heldKey = `_${key}Held`;

    btn.addEventListener('touchstart', (e) => {
      e.preventDefault();
      e.stopPropagation();   // prevent this touch from reaching camera drag
      if (this[heldKey]) return;
      this[heldKey]       = true;
      this.input[key]     = true;
      this.input[downKey] = true;
      btn.classList.add('pressed');
    }, { passive: false });

    btn.addEventListener('touchend', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this[heldKey]   = false;
      this.input[key] = false;
      if (upKey in this.input) this.input[upKey] = true;
      btn.classList.remove('pressed');
    }, { passive: false });

    btn.addEventListener('touchcancel', () => {
      this[heldKey]   = false;
      this.input[key] = false;
      btn.classList.remove('pressed');
    });

    // Mouse support for desktop testing
    btn.addEventListener('mousedown', (e) => {
      e.preventDefault();
      if (this[heldKey]) return;
      this[heldKey]       = true;
      this.input[key]     = true;
      this.input[downKey] = true;
      btn.classList.add('pressed');
    });

    btn.addEventListener('mouseup', (e) => {
      e.preventDefault();
      this[heldKey]   = false;
      this.input[key] = false;
      if (upKey in this.input) this.input[upKey] = true;
      btn.classList.remove('pressed');
    });

    btn.addEventListener('mouseleave', () => {
      if (this[heldKey]) {
        this[heldKey]   = false;
        this.input[key] = false;
        btn.classList.remove('pressed');
      }
    });
  }

  /* ─────────────────────────────────────────────────────────────
     3. CAMERA DRAG — Window-level, touch-ID based routing
     ───────────────────────────────────────────────────────────── */
  _initCameraDrag() {
    /**
     * Returns true if a client coordinate falls inside an element.
     */
    const hitTest = (el, cx, cy) => {
      if (!el) return false;
      const r = el.getBoundingClientRect();
      return cx >= r.left && cx <= r.right && cy >= r.top && cy <= r.bottom;
    };

    /**
     * Returns true if the touch is inside the joystick zone.
     * We use a generous area (the whole left third) to avoid edge misses.
     */
    const inJoystickArea = (cx, cy) => {
      // Primary check: actual element bounds
      const zone = document.getElementById('joystick-zone');
      if (hitTest(zone, cx, cy)) return true;
      // Secondary: any nipplejs injected element
      const joystickEl = document.querySelector('.nipple, .front, .back');
      if (joystickEl && hitTest(joystickEl.parentElement, cx, cy)) return true;
      return false;
    };

    /**
     * Returns true if the touch is on any action button.
     */
    const onButton = (cx, cy) => {
      const el = document.elementFromPoint(cx, cy);
      return !!el?.closest('.action-btn');
    };

    // ── Listen on WINDOW so we see all touches regardless of z-index ──
    window.addEventListener('touchstart', (e) => {
      // Only accept one camera-drag touch at a time
      if (this._camTouchId !== null) return;

      for (const touch of e.changedTouches) {
        const { clientX: cx, clientY: cy, identifier } = touch;

        // Skip joystick area and buttons
        if (inJoystickArea(cx, cy)) continue;
        if (onButton(cx, cy))       continue;

        // This touch is the camera drag touch
        this._camTouchId = identifier;
        this._camLastX   = cx;
        this._camLastY   = cy;
        break;
      }
    }, { passive: true });

    window.addEventListener('touchmove', (e) => {
      if (this._camTouchId === null) return;

      for (const touch of e.changedTouches) {
        if (touch.identifier !== this._camTouchId) continue;

        this.input.cameraDelta.x += touch.clientX - this._camLastX;
        this.input.cameraDelta.y += touch.clientY - this._camLastY;
        this._camLastX = touch.clientX;
        this._camLastY = touch.clientY;
        break;
      }
    }, { passive: true });

    const endCam = (e) => {
      if (this._camTouchId === null) return;
      for (const touch of e.changedTouches) {
        if (touch.identifier === this._camTouchId) {
          this._camTouchId = null;
          break;
        }
      }
    };

    window.addEventListener('touchend',    endCam, { passive: true });
    window.addEventListener('touchcancel', endCam, { passive: true });
  }

  /* ─────────────────────────────────────────────────────────────
     4. CONTEXTUAL BUTTON VISIBILITY
     ───────────────────────────────────────────────────────────── */
  setInteractVisible(visible, label = 'Interact') {
    const btn      = document.getElementById('btn-interact');
    const promptEl = document.getElementById('interact-prompt');
    const promptTx = document.getElementById('interact-text');

    if (btn)      btn.hidden      = !visible;
    if (promptEl) promptEl.hidden = !visible;
    if (promptTx && label) promptTx.textContent = label;
  }

  destroy() {
    if (this._joystick) {
      this._joystick.destroy();
      this._joystick = null;
    }
  }
}
