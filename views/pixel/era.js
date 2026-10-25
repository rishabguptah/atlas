// Era- and region-aware sprite choice for the pixel map: legions in Rome's day, junks off China, mosques after 622.
// Wraps PIXEL_SPRITE_LIBRARY.pick (sprites-library.js); falls back to the starter sprites (sprites.js) without it.
//   PixelEra.region(lon, lat)            -> "europe" | "mediterranean" | "middle_east" | ... (the library's regions)
//   PixelEra.culture(lon, lat, year)     -> building tradition for cities: region or islamic, near_east, sahel, deccan, meso, andes
//   PixelEra.place(entry, year, pop)     -> { sprite, minK, pri } for a city, wonder or (lost) ruin; minK = zoom it appears at,
//                                           pri = importance for pm.sprites' declutter (see budget below)
//   PixelEra.budget(k)                   -> { max, pad } for pm.sprites: few, well-spaced sprites zoomed out, more as you come in
//   PixelEra.army(year, lon, lat)        -> army sprite; draw the other side with { flip: true }
//   PixelEra.mover(year, lon, lat, sea)  -> ship or caravan sprite for a trade mover
//   PixelEra.shock(subtype)              -> plague, famine, eruption, fire, flood or earthquake sprite
(function (global) {
  const lib = () => global.PIXEL_SPRITE_LIBRARY;
  const has = n => !!(global.PIXEL_SPRITES || {})[n];

  // Rough culture regions, matched to the regions the sprite library is drawn for. Checked in order.
  function region(lon, lat) {
    if (lon < -25) return "americas";
    if (lat < -10 && lon > 110) return "oceania";
    if (lon > 160 || lon < -150) return "oceania";
    if (lat >= 30 && lat < 46 && lon >= -10 && lon < 36) return "mediterranean";
    if (lat >= 46 && lon < 45) return "europe";
    if (lat >= 36 && lon < -5) return "europe";
    if (lat < 30 && lon < 35 || lat < 12 && lon < 52) return "africa";
    if (lat >= 12 && lat < 42 && lon < 62) return "middle_east";
    if (lat >= 37 && lon < 125 && !(lat < 42 && lon > 100)) return "steppe";
    if (lon < 92 && lat >= 5) return "south_asia";
    if (lat < 22 && lon >= 92) return "southeast_asia";
    if (lon >= 92) return "east_asia";
    return "south_asia";
  }

  // Building tradition for a city: finer than region() and dated (Islamic world from 650, Al-Andalus until the
  // Reconquista reaches it, Anatolia after Manzikert, Mesoamerica and the Andes until the conquest).
  function culture(lon, lat, y) {
    const r = region(lon, lat);
    if (r === "americas") {
      if (y < 1550 && lat > 8 && lat < 26 && lon < -85) return "meso";
      if (y < 1560 && lat < 2 && lat > -35 && lon < -63) return "andes";
      return r;
    }
    if (lat >= 36 && lat < 41 && lon >= -9.5 && lon < 0 && y >= 720 && y < (lat < 37.6 ? 1492 : lat < 38.5 ? 1250 : 1085)) return "islamic";
    if (lat >= 8 && lat < 18 && lon >= -18 && lon < 25) return y >= 1000 ? "sahel" : "africa";
    if (lat >= -12 && lat < 5 && lon >= 38 && lon < 52 && y >= 1000) return "islamic";
    if (lat >= 36 && lat < 42 && lon >= 26 && lon < 45)
      return y >= (lon < 30 ? (lat > 40.8 && lat < 41.3 ? 1453 : 1350) : 1080) ? "islamic" : r;
    const oasis = lat >= 35 && lat < 43.5 && lon >= 52 && lon < 75;
    if ((lat >= 14 || lon >= 40 && lat >= 12) && lon >= -18 && lon < 63 && (lat < 37.5 || lon >= 44 && lat < 40) && !(lat >= 36 && lon < 26) || oasis)
      return y >= 650 ? "islamic" : lon >= 25 ? "near_east" : r;
    if (r === "steppe" && y >= 1700 && lon < 90) return "europe";
    if (r === "south_asia" && lat < 20) return "deccan";
    return r;
  }
  // Cultures that the generic (European-drawn) settlements already fit.
  const GENERIC = new Set(["europe", "mediterranean", "americas", "oceania"]);

  const pick = (kind, y, r, where) => lib() ? lib().pick(kind, y, r, where) : null;
  const sizeOf = pop => pop == null ? 2 : pop > 1e6 ? 5 : pop > 400000 ? 4 : pop > 80000 ? 3 : pop > 15000 ? 2 : 1;
  // Zoom at which each size appears: great cities from the world view, villages only close in.
  const SIZE_K = [8, 8, 5, 3, 1.4, 1.4];
  const STARTER = ["city_village", "city_village", "city_town", "city_city", "city_metropolis", "city_metropolis"];

  // A library wonder drawn for this exact place, if any (within about 50 km).
  function wonderAt(e, y) {
    if (!lib()) return null;
    const S = lib().sprites;
    for (const n in S) {
      const s = S[n];
      if (s.kind === "wonder" && s.place && Math.abs(s.place[0] - e.lat) < 0.45 && Math.abs(s.place[1] - e.lon) < 0.45) return n;
    }
    return null;
  }

  // The city sprite for a culture and size in a year, memoised per year (place() runs for every city on a year step).
  let memoY = null; const memo = new Map();
  function citySprite(y, c, r, size) {
    if (memoY !== y) { memo.clear(); memoY = y; }
    const key = c + size;
    if (memo.has(key)) return memo.get(key);
    let sp = pick("city", y, c, { size });
    if (!sp && size === 5) sp = pick("city", y, r, { size: 4 });
    // Outside the generic tradition, a local building one size off beats a European one of the right size.
    const local = n => n && lib() && lib().sprites[n].regions.includes(c);
    if (!GENERIC.has(c) && !local(sp)) for (const d of [-1, 1, -2]) {
      const alt = size + d >= 1 && size + d <= 4 && pick("city", y, c, { size: size + d });
      if (local(alt)) { sp = alt; break; }
    }
    memo.set(key, sp);
    return sp;
  }

  function place(e, y, pop) {
    const r = region(e.lon, e.lat);
    if (e.end != null && y >= e.end) return { sprite: pick("ruin", y, r) || "ruin", minK: 4.5, pri: 1.5 };
    if (e.layer === "wonders") {
      const w = wonderAt(e, y);
      return { sprite: w || (/pyramid/i.test(e.name) ? "wonder_pyramid" : "wonder_temple"), minK: 3, pri: 3.5 };
    }
    let size = sizeOf(pop);
    // The library's modern skyline starts in 1900; before that a million-city is still a great city.
    if (size === 5 && y < 1900) size = 4;
    const c = size === 5 ? r : culture(e.lon, e.lat, y);
    const sp = citySprite(y, c, r, size);
    return { sprite: sp && has(sp) ? sp : STARTER[size], minK: SIZE_K[size], pri: size + (pop || 0) / 1e8 };
  }

  const army = (y, lon, lat) => pick("army", y, region(lon, lat)) || "army";
  const mover = (y, lon, lat, sea) => pick(sea ? "ship" : "caravan", y, region(lon, lat)) || (sea ? "ship" : "caravan");
  function shock(subtype) {
    const t = subtype || "";
    const n = /epidemic|pandemic|plague/.test(t) ? "plague" : /famine/.test(t) ? "famine" : /erupt|volcan/.test(t) ? "volcano"
      : /flood/.test(t) ? "flood" : /quake/.test(t) ? "earthquake" : "fire";
    if (has("event_" + n)) return "event_" + n;
    return { plague: "plague", famine: "skull", volcano: "volcano" }[n] || "fire";
  }

  // Priorities used with place(): battles 5, great cities 4-5, shocks 3.8, wonders 3.5, cities 3, towns 2, ruins 1.5, movers 0.5.
  const budget = k => ({ max: Math.round(10 + 14 * Math.pow(Math.max(1, k) - 0.6, 1.1)), pad: k < 2 ? 7 : k < 4 ? 4 : 2 });

  global.PixelEra = { region, culture, place, army, mover, shock, budget };
})(typeof window !== "undefined" ? window : globalThis);
