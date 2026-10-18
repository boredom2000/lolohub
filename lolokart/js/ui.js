// DOM side: driver cards + gauges, track cards, HUD, results. No game logic here.
'use strict';
(function (LK) {
  const $ = (id) => document.getElementById(id);
  const hex = (c) => '#' + c.toString(16).padStart(6, '0');

  const UI = {
    $,
    // one-off renders of each kart for the driver cards
    makeThumbnails() {
      const out = {};
      let r;
      try {
        r = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
      } catch (e) { return out; }
      r.setSize(240, 180, false);
      const cam = new THREE.PerspectiveCamera(32, 240 / 180, 0.1, 100);
      cam.position.set(5.2, 3.6, 7.2);
      cam.lookAt(0, 1.1, 0);
      for (const d of LK.DRIVERS) {
        const sc = new THREE.Scene();
        sc.add(new THREE.HemisphereLight(0xffffff, 0x664488, 0.9));
        const l = new THREE.DirectionalLight(0xffffff, 0.8); l.position.set(4, 8, 6); sc.add(l);
        const k = LK.buildKart(d);
        k.rotation.y = 0.35;
        k.userData.flames.forEach((f) => (f.visible = false));
        sc.add(k);
        r.render(sc, cam);
        out[d.id] = r.domElement.toDataURL();
      }
      r.dispose();
      if (r.forceContextLoss) r.forceContextLoss();
      return out;
    },

    buildDriverGrid(onPick, onConfirm) {
      const thumbs = this.makeThumbnails();
      const grid = $('driverGrid');
      grid.innerHTML = '';
      LK.DRIVERS.forEach((d, i) => {
        const b = document.createElement('button');
        b.className = 'card';
        b.style.borderBottomColor = hex(d.color);
        b.innerHTML = `${thumbs[d.id] ? `<img src="${thumbs[d.id]}" alt="">` : ''}${d.name}<span class="tag">${LK.CLASSES[d.cls].label}</span>`;
        b.addEventListener('click', () => { if (b.classList.contains('sel')) onConfirm(); else onPick(i); });
        grid.appendChild(b);
      });
      const gs = $('gauges');
      gs.innerHTML = '';
      for (const [key, label, c] of [['speed', 'SPEED', '#ff2fd6'], ['accel', 'ACCEL', '#7dff2f'], ['handling', 'HANDLING', '#19f7ff'], ['weight', 'WEIGHT', '#ffb21a']]) {
        const row = document.createElement('div');
        row.className = 'gauge';
        row.style.setProperty('--c', c);
        row.innerHTML = `<span>${label}</span><div class="bar" data-k="${key}">${'<i></i>'.repeat(10)}</div>`;
        gs.appendChild(row);
      }
    },

    showDriver(i) {
      const d = LK.DRIVERS[i];
      [...$('driverGrid').children].forEach((c, j) => c.classList.toggle('sel', j === i));
      $('dName').textContent = d.name;
      $('dName').style.color = hex(d.color === 0x222230 ? 0xff2f4a : d.color);
      $('dClass').textContent = LK.CLASSES[d.cls].label;
      const st = LK.gaugeStats(d);
      document.querySelectorAll('#gauges .bar').forEach((bar) => {
        const v = st[bar.dataset.k];
        [...bar.children].forEach((seg, j) => seg.classList.toggle('on', j < v));
      });
    },

    buildTrackGrid(onPick) {
      const grid = $('trackGrid');
      grid.innerHTML = '';
      const colors = ['#2a7dff', '#ff2fd6', '#19c8ff', '#ff5a1a'];
      LK.tracks.forEach((t, i) => {
        const b = document.createElement('button');
        b.className = 'tcard';
        b.style.setProperty('--tc', colors[i % colors.length]);
        const best = LK.store.get('best.' + t.id, null);
        b.innerHTML = `<canvas width="320" height="200"></canvas><div class="tname">${t.name}</div>
          <div class="tmeta"><span class="stars">${'&#9733;'.repeat(t.difficulty)}${'&#9734;'.repeat(3 - t.difficulty)}</span><span>${best ? 'BEST ' + LK.fmtTime(best) : t.blurb}</span></div>`;
        b.addEventListener('click', () => onPick(i));
        grid.appendChild(b);
        const cv = b.querySelector('canvas');
        LK.getTrack(t.id).drawMap(cv.getContext('2d'), cv.width, cv.height, { heightColors: true, line: 7, outline: 13, pad: 18, start: 7 });
      });
      for (const L of LK.lockedTracks) {
        const b = document.createElement('div');
        b.className = 'tcard locked';
        b.style.setProperty('--tc', L.color);
        b.innerHTML = `<div class="soon">SOON</div><div class="lock">&#x1F512;</div><div class="tname">${L.name}</div><div class="tmeta"><span>${L.hint}</span></div>`;
        grid.appendChild(b);
      }
    },
    selectTrack(i) { [...$('trackGrid').children].forEach((c, j) => c.classList.toggle('sel', j === i)); },

    // ---------- HUD
    initMinimap(track) {
      const c = document.createElement('canvas');
      c.width = c.height = 180;
      this.mapMapper = track.drawMap(c.getContext('2d'), 180, 180, { line: 5, outline: 10, color: '#ffffff', pad: 12 });
      this.mapBase = c;
    },
    drawMinimap(race, me) {
      const g = $('minimap').getContext('2d');
      g.clearRect(0, 0, 180, 180);
      g.drawImage(this.mapBase, 0, 0);
      const draw = (k, r, col, stroke) => {
        const p = this.mapMapper(k.x, k.z);
        g.fillStyle = col; g.beginPath(); g.arc(p[0], p[1], r, 0, Math.PI * 2); g.fill();
        g.lineWidth = 2; g.strokeStyle = stroke; g.stroke();
      };
      for (const k of race.karts) if (k !== me) draw(k, 4.5, hex(LK.DRIVERS.find((d) => d.id === k.driverId).color), '#000');
      draw(me, 7, '#ffe81a', '#ff2fd6');
    },
    hud(race, me) {
      const lap = Math.min(race.laps, Math.max(1, me.lap));
      $('lapVal').textContent = `${lap}/${race.laps}`;
      $('lapBox').classList.toggle('final', lap === race.laps && !me.finished);
      $('timeVal').textContent = LK.fmtTime(me.finished ? me.finishTime : race.time);
      $('lapTimeVal').textContent = me.lapTimes.length ? 'LAST ' + LK.fmtTime(me.lapTimes[me.lapTimes.length - 1]) : '';
      const pos = race.placeOf(me);
      if (pos !== this.lastPos) {
        $('posVal').textContent = pos;
        $('posSuf').textContent = LK.ordinal(pos).slice(String(pos).length);
        const pb = $('posBox');
        pb.classList.remove('pop'); void pb.offsetWidth; pb.classList.add('pop');
        this.lastPos = pos;
      }
      $('speedVal').textContent = Math.round(Math.abs(me.fs) * 3.6 * 1.2);
      $('wrongWay').classList.toggle('on', me.wrongWayT > 0.8 && !me.finished);
      this.drawMinimap(race, me);
    },
    countdown(text, go) {
      const el = $('countdown');
      el.textContent = text;
      el.classList.toggle('go', !!go);
      el.classList.remove('anim'); void el.offsetWidth; el.classList.add('anim');
    },
    banner(text, stay) {
      const el = $('banner');
      el.textContent = text;
      el.classList.remove('show', 'stay'); void el.offsetWidth;
      el.classList.add(stay ? 'stay' : 'show');
    },
    clearBanner() { $('banner').classList.remove('show', 'stay'); $('countdown').classList.remove('anim'); $('countdown').textContent = ''; },

    showResults(race, meId) {
      const res = race.results();
      const me = res.find((r) => r.id === meId);
      $('resTitle').textContent = me.place === 1 ? 'YOU WIN!' : me.place <= 3 ? 'PODIUM! ' + LK.ordinal(me.place).toUpperCase() : LK.ordinal(me.place).toUpperCase() + ' PLACE';
      $('resTrack').textContent = race.track.def.name;
      const list = $('resList');
      list.innerHTML = '';
      res.forEach((r, i) => {
        const d = LK.DRIVERS.find((x) => x.id === r.driverId);
        const li = document.createElement('li');
        if (r.id === meId) li.className = 'me';
        li.style.animationDelay = i * 0.08 + 's';
        li.innerHTML = `<span class="pl">${LK.ordinal(r.place)}</span><span class="chip" style="background:${hex(d.color)}"></span><span>${d.name}${r.id === meId ? ' (YOU)' : ''}</span><span class="tm">${r.estimated ? '~' : ''}${LK.fmtTime(r.time)}</span>`;
        list.appendChild(li);
      });
      $('results').classList.remove('hidden');
      return me;
    },
  };
  LK.UI = UI;
})(window.LK);
