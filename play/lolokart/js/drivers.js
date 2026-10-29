// The 8 drivers. Stats are real physics numbers; the gauges on the select screen are derived from them.
// Classes (2 drivers each):
//   balanced - average everything
//   zippy    - quick acceleration, low top speed
//   heavy    - slow acceleration, high top speed, wins bumps
//   wild     - a bit faster than average, poor handling
'use strict';
(function (LK) {
  LK.CLASSES = {
    balanced: { label: 'ALL-ROUNDER', maxSpeed: 30,   accel: 15,  handling: 1.0,  weight: 1.0 },
    zippy:    { label: 'ZIPPY',       maxSpeed: 29.0, accel: 28,  handling: 1.15, weight: 0.75 },
    heavy:    { label: 'HEAVY',       maxSpeed: 32.2, accel: 8.5, handling: 0.92, weight: 1.45 },
    wild:     { label: 'WILD',        maxSpeed: 32.0, accel: 15.5, handling: 0.66, weight: 1.0 },
  };

  // body: kart model style (see kartmodel.js). colors: main / accent. skin/hat/extra drive the comic driver.
  LK.DRIVERS = [
    { id: 'lolo',  name: 'LOLO',  cls: 'balanced', body: 'classic', color: 0xff3b3b, accent: 0xffffff, skin: 0xffd2a6, hat: 'cap',     hatColor: 0xff3b3b, extra: 'mustache' },
    { id: 'momo',  name: 'MOMO',  cls: 'balanced', body: 'classic', color: 0x2fc94a, accent: 0xffe81a, skin: 0xf2b98a, hat: 'cap',     hatColor: 0x2fc94a, extra: 'freckles' },
    { id: 'pipi',  name: 'PIPI',  cls: 'zippy',    body: 'bubble',  color: 0xff6fd2, accent: 0xffffff, skin: 0xffe0c8, hat: 'bow',     hatColor: 0xff2f9a, extra: 'lashes' },
    { id: 'kiki',  name: 'KIKI',  cls: 'zippy',    body: 'bubble',  color: 0xffd21a, accent: 0x2a7dff, skin: 0x9be36a, hat: 'antenna', hatColor: 0x2a7dff, extra: 'none' },
    { id: 'bruno', name: 'BRUNO', cls: 'heavy',    body: 'truck',   color: 0x8a4dff, accent: 0xffb21a, skin: 0xc98a5a, hat: 'helmet',  hatColor: 0x333344, extra: 'beard' },
    { id: 'tanko', name: 'TANKO', cls: 'heavy',    body: 'truck',   color: 0x4a6b2f, accent: 0xd8d8a0, skin: 0xa8c0d8, hat: 'horns',   hatColor: 0xeeeeee, extra: 'teeth' },
    { id: 'zoom',  name: 'ZOOM',  cls: 'wild',     body: 'rocket',  color: 0x1ac8ff, accent: 0xff7a1a, skin: 0xffd2a6, hat: 'goggles', hatColor: 0xff7a1a, extra: 'grin' },
    { id: 'jinx',  name: 'JINX',  cls: 'wild',     body: 'rocket',  color: 0x222230, accent: 0xff2f4a, skin: 0xe8e8f0, hat: 'mohawk',  hatColor: 0xff2f4a, extra: 'grin' },
  ];

  LK.driverStats = (d) => LK.CLASSES[d.cls];

  // Pseudo stats for the gauges, 0..10.
  LK.gaugeStats = function (d) {
    const s = LK.driverStats(d);
    return {
      speed: LK.clamp(Math.round(4 + (s.maxSpeed - 29) * 1.8), 1, 10),
      accel: LK.clamp(Math.round(2 + (s.accel - 8.5) * 0.36), 1, 10),
      handling: LK.clamp(Math.round(s.handling * 7.6 - 1.6), 1, 10),
      weight: LK.clamp(Math.round(s.weight * 6), 1, 10),
    };
  };
})(window.LK);
