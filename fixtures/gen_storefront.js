// Generates fixtures/storefront_en.json and storefront_de.json: static
// data for the recipe's store image. Runs the real serverless function
// against a synthetic Kp 9 storm with the clock frozen at 22:30 Munich
// time on 19 January 2026 (modeled on that night's real storm, which
// peaked around Kp 8; tonight's forecast is nudged to Kp 9 because at
// Munich's magnetic latitude only Kp 9 clears the viewline, and anything
// less makes the forecast strip contradict the headline).
// Usage: node fixtures/gen_storefront.js
const fs = require('fs');
const src = fs.readFileSync('' + __dirname + '/../serverless.js.txt', 'utf8');

// ---- frozen moment: 19 Jan 2026, 22:30 in Munich (21:30 UTC) ----
const NOW = Date.parse('2026-01-19T21:30:00Z');
const RealDate = Date;
global.Date = class extends RealDate {
  constructor(...a) { if (a.length === 0) super(NOW); else super(...a); }
  static now() { return NOW; }
};
global.Date.parse = RealDate.parse; global.Date.UTC = RealDate.UTC;

// ---- seeded RNG so the output is reproducible ----
let seed = 20260119;
function rnd() { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; }

// ---- mocked NOAA endpoints: Kp nowcast and 3-day forecast ----
const H = 3600e3;
function kpAt(t) {                       // storm peaks tonight, decays over the next two nights
  const h = (t - NOW) / H;
  if (h < 12) return 9.0;
  if (h < 36) return 6.33;
  return 4.0;
}
global.fetch = async (url) => {
  url = String(url);
  if (url.includes('k-index-forecast')) {
    const rows = [['time_tag', 'kp', 'observed', 'noaa_scale']];
    for (let t = NOW - 6 * H; t <= NOW + 78 * H; t += 3 * H)
      rows.push([new RealDate(t).toISOString().slice(0, 19).replace('T', ' '), kpAt(t).toFixed(2), 'predicted', '']);
    return { ok: true, json: async () => rows };
  }
  if (url.includes('planetary_k_index_1m'))
    return { ok: true, json: async () => [{ time_tag: new RealDate(NOW).toISOString(), estimated_kp: 8.0 }] };
  return { ok: false, status: 503 };
};

eval(src + ';global.run=run;global.geomagLat=geomagLat;global.mlt=mlt;');

// ---- synthetic OVATION grid: a storm-expanded oval ----
// Intensity follows magnetic latitude (oval pushed south to Kp 8 strength),
// is strongest on the night side around magnetic midnight, and gets
// curtain-like structure plus noise so it doesn't look computer-perfect.
function stormGrid(peakMlat, width, amp) {
  const out = [];
  for (let lo = 0; lo < 360; lo++) {
    const lon = lo > 180 ? lo - 360 : lo;
    const m = mlt(NOW, 60, lon);                           // MLT for this meridian
    const night = 0.35 + 0.65 * Math.pow((1 + Math.cos(m / 24 * 2 * Math.PI)) / 2, 1.5);
    const curtain = 0.82 + 0.18 * Math.sin(lo * 0.21) * Math.cos(lo * 0.07);
    for (let la = -90; la <= 90; la++) {
      const ml = Math.abs(geomagLat(la, lon));
      const w = ml < peakMlat ? width : width * 1.6;       // sharper equatorward edge, softer poleward
      let v = amp * Math.exp(-Math.pow((ml - peakMlat) / w, 2)) * night * curtain;
      if (ml > 76) v *= Math.max(0, 1 - (ml - 76) / 6);    // quiet polar cap
      v += v > 3 ? (rnd() - 0.5) * 14 : 0;
      out.push([lo, la, Math.max(0, Math.min(100, Math.round(v)))]);
    }
  }
  return out;
}

(async () => {
  const coords = stormGrid(57, 6.5, 100);
  const results = {};
  for (const [lang, voice] of [['en', 'astrophysicist'], ['de', 'astrophysicist']]) {
    const out = await run({
      coordinates: coords,
      'Forecast Time': new RealDate(NOW - 20 * 60e3).toISOString(),
      trmnl: { user: { time_zone_iana: 'Europe/Berlin' } },
      custom_fields_values: { lat_lon: '48.1351,11.5820', location_name: lang === 'de' ? 'München' : 'Munich', language: lang, voice },
    });
    results[lang] = out;
  }
  const pin = {
    en: { verdict: 'This is big!', look: 'Face north and scan low over the horizon' },
    de: { verdict: 'Das ist riesig!', look: 'Schau Richtung Norden, tief am Horizont' },
  };
  for (const l of ['en', 'de']) {
    Object.assign(results[l].aurora, pin[l]);
    fs.writeFileSync(__dirname + '/storefront_' + l + '.json', JSON.stringify(results[l]));
    const a = results[l].aurora;
    console.log(l, '|', a.verdict, '|', a.line, '|', a.look, '|',
      a.forecast.map(n => n.label + '=' + n.verdict).join(', '));
  }
})();
