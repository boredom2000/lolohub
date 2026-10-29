// Local player input: keyboard (WASD / arrows) + touch (gas & brake buttons, draggable steering wheel).
// Pointer events with per-pointer tracking -> holding GAS while dragging the wheel works (multitouch).
'use strict';
(function (LK) {
  const keys = new Set();
  const WHEEL_MAX = 110;        // degrees of wheel rotation for full lock
  const WHEEL_PX = 0.95;        // degrees per pixel dragged
  const WHEEL_RETURN = 140;     // degrees per second back to centre when released

  const Input = {
    gas: false, brake: false,
    wheelAngle: 0, wheelPointer: null, wheelStartX: 0, wheelStartAngle: 0,
    touchMode: false,
    state: { throttle: 0, brake: 0, steer: 0 },

    init() {
      addEventListener('keydown', (e) => {
        if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) e.preventDefault();
        keys.add(e.code);
      });
      addEventListener('keyup', (e) => keys.delete(e.code));
      addEventListener('blur', () => keys.clear());

      const coarse = matchMedia && matchMedia('(pointer: coarse)').matches;
      if (coarse || navigator.maxTouchPoints > 1 && !matchMedia('(pointer: fine)').matches) this.setTouch(true);
      addEventListener('touchstart', () => this.setTouch(true), { passive: true });

      this.hold(document.getElementById('gasBtn'), 'gas');
      this.hold(document.getElementById('brakeBtn'), 'brake');
      const wheel = document.getElementById('wheel');
      this.wheelEl = wheel.querySelector('.wheel-img');
      wheel.addEventListener('pointerdown', (e) => {
        if (this.wheelPointer != null) return;
        e.preventDefault();
        try { wheel.setPointerCapture(e.pointerId); } catch (err) { /* synthetic pointer */ }
        this.wheelPointer = e.pointerId;
        this.wheelStartX = e.clientX;
        this.wheelStartAngle = this.wheelAngle;
        wheel.classList.add('held');
      });
      wheel.addEventListener('pointermove', (e) => {
        if (e.pointerId !== this.wheelPointer) return;
        this.wheelAngle = LK.clamp(this.wheelStartAngle + (e.clientX - this.wheelStartX) * WHEEL_PX, -WHEEL_MAX, WHEEL_MAX);
      });
      const up = (e) => {
        if (e.pointerId !== this.wheelPointer) return;
        this.wheelPointer = null;
        wheel.classList.remove('held');
      };
      wheel.addEventListener('pointerup', up);
      wheel.addEventListener('pointercancel', up);
      wheel.addEventListener('lostpointercapture', up);
    },

    setTouch(on) {
      if (this.touchMode === on) return;
      this.touchMode = on;
      document.body.classList.toggle('touch', on);
    },

    hold(el, prop) {
      const ids = new Set();
      const sync = () => { this[prop] = ids.size > 0; el.classList.toggle('down', ids.size > 0); };
      el.addEventListener('pointerdown', (e) => { e.preventDefault(); try { el.setPointerCapture(e.pointerId); } catch (err) { /* synthetic pointer */ } ids.add(e.pointerId); sync(); });
      const off = (e) => { ids.delete(e.pointerId); sync(); };
      el.addEventListener('pointerup', off);
      el.addEventListener('pointercancel', off);
      el.addEventListener('lostpointercapture', off);
      el.addEventListener('contextmenu', (e) => e.preventDefault());
    },

    // called once per rendered frame
    update(dt) {
      if (this.wheelPointer == null && this.wheelAngle !== 0) {
        const s = Math.sign(this.wheelAngle);
        this.wheelAngle -= s * Math.min(Math.abs(this.wheelAngle), WHEEL_RETURN * dt);
      }
      if (this.wheelEl) this.wheelEl.style.transform = `rotate(${this.wheelAngle.toFixed(1)}deg)`;
      const k = (c) => keys.has(c);
      const left = k('KeyA') || k('ArrowLeft'), right = k('KeyD') || k('ArrowRight');
      let steer = (right ? 1 : 0) - (left ? 1 : 0);
      if (!steer && this.wheelAngle) steer = this.wheelAngle / WHEEL_MAX;
      const st = this.state;
      st.throttle = k('KeyW') || k('ArrowUp') || this.gas ? 1 : 0;
      st.brake = k('KeyS') || k('ArrowDown') || k('Space') || this.brake ? 1 : 0;
      st.steer = LK.clamp(steer, -1, 1);
    },

    read() { return this.state; },
    pressed(code) { return keys.has(code); },
    reset() { this.wheelAngle = 0; this.gas = this.brake = false; keys.clear(); },
  };
  LK.Input = Input;
})(window.LK);
