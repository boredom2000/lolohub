// Multiplayer seam (offline-only today).
//
// How the game is built so multiplayer can be added later without a rewrite:
//  1. A race is fully described by a plain, serialisable RaceSetup:
//       { trackId, laps, seed, entrants: [{ driverId, kind: 'local'|'ai'|'remote', playerId }] }
//     A lobby only has to agree on this object; LK.Race(setup) builds the identical race everywhere.
//  2. The simulation (race.js / physics.js) is fixed-step (LK.SIM_DT), uses a seeded RNG, and only
//     reads per-kart inputs { throttle, brake, steer }. No DOM, no rendering, no Math.random.
//  3. Inputs come from controllers (controllers.js). A remote human is a RemoteController whose
//     input is pushed in by this module when a packet arrives.
//  4. race.snapshot() / race.applySnapshot() serialise the whole race state for host-authoritative
//     correction (host sends snapshots ~10/s, clients keep simulating locally in between).
//
// Planned message protocol (JSON over WebSocket / WebRTC data channel):
//   { t: 'hello', playerId, name }                    client -> host
//   { t: 'lobby', players: [...], setup? }            host -> all  (driver picks, track vote)
//   { t: 'start', setup }                             host -> all  (everyone builds LK.Race(setup))
//   { t: 'input', playerId, tick, input }             client -> host, host -> others
//   { t: 'snap', snapshot }                           host -> all
//   { t: 'leave', playerId }
//
// To go online: implement a Transport with send(msg) + onMessage(cb), call LK.Net.connect(transport),
// build the setup with kind:'remote' for the other humans, and wire LK.Net.remote(playerId) as their controller.
'use strict';
(function (LK) {
  const remotes = new Map();
  LK.Net = {
    online: false,
    transport: null,
    playerId: 'local',
    connect(transport) {
      this.transport = transport;
      this.online = true;
      transport.onMessage((m) => this.receive(m));
    },
    remote(playerId) {
      if (!remotes.has(playerId)) remotes.set(playerId, new LK.RemoteController(playerId));
      return remotes.get(playerId);
    },
    sendInput(tick, input) {
      if (this.online) this.transport.send({ t: 'input', playerId: this.playerId, tick, input });
    },
    receive(m) {
      if (m.t === 'input' && remotes.has(m.playerId)) remotes.get(m.playerId).push(m.input);
      if (m.t === 'snap' && this.onSnapshot) this.onSnapshot(m.snapshot);
    },
    onSnapshot: null,
  };
})(window.LK);
