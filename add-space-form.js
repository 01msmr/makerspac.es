// @ts-check
// add-space-form.js — Add-Space form: data fetching, geocoding, autocomplete, submit

const GITHUB_REPO = '01msmr/makerspac.es';

const WORKSHOPS = [
  ['3D printing', '3d'],  ['Laser cutting', 'laser'], ['CNC', 'cnc'],
  ['Electronics', 'electronics'], ['Coding', 'coding'], ['VR', 'vr'],
  ['Music', 'music'],     ['Photography', 'photo'],
  ['Woodworking', 'wood'], ['Metalworking', 'metal'], ['Bike repair', 'bike'],
  ['Textile', 'textile'], ['Screen printing', 'screenprint'], ['Ceramics', 'ceramics'],
];

// i18n shorthands
const t  = (key, fb) => window.i18n?.t(`addMakerspace.${key}`) ?? fb;  // addMakerspace namespace
// Photon supports de/en/fr/it; map UI language → Photon lang param
const PHOTON_LANGS = new Set(['de', 'en', 'fr', 'it']);
const photonLang = () => { const l = window.i18n?.getLanguage?.() || 'en'; return PHOTON_LANGS.has(l) ? l : 'en'; };

// null = not yet fetched; false = fetch failed; object = data
let _enrichmentCache = null;

// ─── Enrichment fetch + space search ──────────────────────────────────────────

async function fetchEnrichment() {
  if (_enrichmentCache !== null) return _enrichmentCache;
  try {
    const res = await fetch('/loc-enrichment.json');
    _enrichmentCache = res.ok ? await res.json() : false;
  } catch { _enrichmentCache = false; }
  return _enrichmentCache;
}

const sortAlpha = (arr, key) => key
  ? [...arr].sort((a, b) => (a[key] || '').localeCompare(b[key] || ''))
  : [...arr].sort((a, b) => a.localeCompare(b));

function searchSpaces(query) {
  const locs = window.locationById ? [...window.locationById.values()] : [];
  const q = query.trim().toLowerCase();
  // Empty → full list sorted alphabetically by name
  if (!q) return sortAlpha(locs, 'name');
  // Numeric → all IDs containing the digits, sorted by ID
  if (/^\d+$/.test(q)) {
    return locs.filter(l => String(l.ID).includes(q)).sort((a, b) => a.ID - b.ID);
  }
  // Name, city, or postal code substring
  return locs.filter(l =>
    l.name?.toLowerCase().includes(q) ||
    l.loc?.city?.toLowerCase().includes(q) ||
    String(l.loc?.plz || '').includes(q)
  );
}

// ─── Location preview map ──────────────────────────────────────────────────────

const GEOCODE_COUNTRY = {
  de: 'Germany', at: 'Austria', ch: 'Switzerland', fr: 'France',
  nl: 'Netherlands', be: 'Belgium', dk: 'Denmark', ua: 'Ukraine',
};
// Geographic centers used as Photon location bias when no pin is placed
const COUNTRY_CENTERS = {
  de: [51.0, 10.0], at: [47.5, 14.0], ch: [46.8,  8.2], fr: [46.5,  2.0],
  nl: [52.3,  5.3], be: [50.5,  4.5], dk: [56.0, 10.0], ua: [49.0, 32.0],
};

async function reverseGeocode(lat, lng) {
  try {
    const r = await fetch(`https://photon.komoot.io/reverse?lon=${lng}&lat=${lat}`);
    const data = r.ok ? await r.json() : null;
    const p = data?.features?.[0]?.properties;
    if (!p) return null;
    // Map Photon fields to Nominatim-compatible structure used by callers
    return { address: {
      road: p.street, house_number: p.housenumber,
      postcode: p.postcode, city: p.city, town: p.town,
      village: p.village, municipality: p.municipality,
      country_code: p.countrycode,
    }};
  } catch { return null; }
}

function initLocationMap(overlay) {
  const latInput  = overlay.querySelector('input[name="lat"]');
  const longInput = overlay.querySelector('input[name="long"]');
  const mapEl     = overlay.querySelector('.addspace-map-preview');
  const form      = overlay.querySelector('.addspace-form');
  if (!mapEl || !window.L) return null;

  const DEFAULT_CENTER = [48.5, 10.5];
  const DEFAULT_ZOOM   = 5;

  const previewMap = L.map(mapEl, {
    zoomControl: true,
    attributionControl: false,
    scrollWheelZoom: false,
  }).setView(DEFAULT_CENTER, DEFAULT_ZOOM);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(previewMap);

  // Address display: text + "use address" button, top-right of zoom buttons
  const addrWrap = document.createElement('div');
  addrWrap.className = 'addspace-map-addr';
  const addrText = document.createElement('span');
  addrText.className = 'addspace-map-addr-text';
  const addrBtn  = document.createElement('button');
  addrBtn.className = 'addspace-map-addr-btn';
  addrBtn.type = 'button';
  addrBtn.textContent = t('useAddress', 'use address');
  addrWrap.append(addrText, addrBtn);
  mapEl.appendChild(addrWrap);
  L.DomEvent.disableClickPropagation(addrWrap);

  let marker          = null;
  let lastGeodata     = null;
  let suppressForward = false;

  function parseCoords() {
    const lat = parseFloat(latInput.value);
    const lng = parseFloat(longInput.value);
    if (isNaN(lat) || isNaN(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
    return [lat, lng];
  }

  function placeMarker(coords) {
    if (!marker) {
      marker = L.marker(coords).addTo(previewMap);
    } else {
      marker.setLatLng(coords);
    }
    previewMap.setView(coords, previewMap.getZoom() < 12 ? 14 : previewMap.getZoom());
  }

  // Update map from lat/lng fields + reverse geocode
  async function updateFromCoords() {
    const coords = parseCoords();
    if (coords) {
      placeMarker(coords);
      const geo = await reverseGeocode(coords[0], coords[1]);
      lastGeodata = geo;
      if (geo?.address) {
        const a = geo.address;
        const street = [a.road, a.house_number].filter(Boolean).join(' ');
        const place  = [a.postcode, a.city || a.town || a.village || a.municipality].filter(Boolean).join(' ');
        addrText.textContent = [street, place].filter(Boolean).join(', ');
        addrWrap.classList.add('is-visible');
        addrWrap.classList.remove('is-used');
      } else {
        addrWrap.classList.remove('is-visible');
      }
    } else {
      if (marker) { marker.remove(); marker = null; }
      previewMap.setView(DEFAULT_CENTER, DEFAULT_ZOOM);
      addrWrap.classList.remove('is-visible');
      lastGeodata = null;
    }
  }

  // Forward geocode from address fields → move pin (no reverse geocode after)
  async function updateFromAddress() {
    if (suppressForward) return;
    const g = name => (form?.elements[name]?.value || '').trim();
    const city = g('city'), plz = g('plz'), street = g('street_name'), hno = g('street_number');
    if (!city) return;
    const q = [[hno, street].filter(Boolean).join(' '), plz, city].filter(Boolean).join(' ');
    const cc = Object.entries(GEOCODE_COUNTRY).find(([, v]) => v === g('country'))?.[0];
    const params = new URLSearchParams({ q, limit: '1', lang: photonLang() });
    try {
      const r = await fetch(`https://photon.komoot.io/api/?${params}`);
      const data = r.ok ? await r.json() : null;
      const f = data?.features?.[0];
      if (!f) return;
      const [lon, lat] = f.geometry.coordinates;
      latInput.value  = lat.toFixed(7);
      longInput.value = lon.toFixed(7);
      placeMarker([lat, lon]);
      // Hide chip — address was entered manually, no need to show it back
      addrWrap.classList.remove('is-visible');
      lastGeodata = null;
    } catch { /* ignore */ }
  }

  // "use address" button → transfer reverse-geocoded address to form fields
  addrBtn.addEventListener('mousedown', () => { suppressForward = true; });

  addrBtn.addEventListener('click', () => {
    if (!lastGeodata?.address) return;
    const a   = lastGeodata.address;
    const set = (name, val) => { if (val != null && form?.elements[name]) form.elements[name].value = val; };
    set('city',          a.city || a.town || a.village || a.municipality);
    set('plz',           a.postcode);
    set('street_name',   a.road);
    const hnoMatch = (a.house_number || '').match(/^(\d+)\s*([^\d\s].*)?\s*$/);
    set('street_number', hnoMatch ? hnoMatch[1] : a.house_number);
    set('street_ext', hnoMatch?.[2]?.trim() ?? '');
    const country = GEOCODE_COUNTRY[a.country_code?.toLowerCase()] || 'other';
    if (form?.elements['country']) form.elements['country'].value = country;
    addrWrap.classList.add('is-used');
    // Release suppression after blur events have fired
    setTimeout(() => { suppressForward = false; }, 200);
  });

  // Map click → lat/lng → reverse geocode
  previewMap.on('click', (e) => {
    latInput.value  = e.latlng.lat.toFixed(7);
    longInput.value = e.latlng.lng.toFixed(7);
    updateFromCoords();
  });

  // Lat/lng inputs → reverse geocode
  let coordDebounce;
  const onCoordInput = () => { clearTimeout(coordDebounce); coordDebounce = setTimeout(updateFromCoords, 400); };
  const onCoordBlur  = () => { clearTimeout(coordDebounce); updateFromCoords(); };
  latInput.addEventListener('input', onCoordInput);  longInput.addEventListener('input', onCoordInput);
  latInput.addEventListener('blur',  onCoordBlur);   longInput.addEventListener('blur',  onCoordBlur);

  // Address fields → forward geocode → move pin
  let addrDebounce;
  const onAddrInput = () => { clearTimeout(addrDebounce); addrDebounce = setTimeout(updateFromAddress, 700); };
  const onAddrBlur  = () => { clearTimeout(addrDebounce); updateFromAddress(); };
  ['city', 'plz', 'street_name', 'street_number'].forEach(name => {
    const el = form?.elements[name];
    if (!el) return;
    el.addEventListener('input', onAddrInput);
    el.addEventListener('blur',  onAddrBlur);
  });

  const invalidate = () => requestAnimationFrame(() => previewMap.invalidateSize());
  requestAnimationFrame(() => { previewMap.invalidateSize(); updateFromCoords(); });

  return { invalidate };
}

// ─── Street autocomplete ───────────────────────────────────────────────────────

function initStreetAutocomplete(overlay) {
  const form          = overlay.querySelector('.addspace-form');
  const streetInput   = form?.elements['street_name'];
  const hnoInput      = form?.elements['street_number'];
  const cityInput     = form?.elements['city'];
  const plzInput      = form?.elements['plz'];
  const countrySelect = form?.elements['country'];
  if (!streetInput) return;

  // ── Street dropdown ──
  const streetDrop = document.createElement('div');
  streetDrop.className = 'addspace-street-dropdown';
  streetDrop.hidden = true;
  streetInput.parentElement.appendChild(streetDrop);

  // ── City dropdown ──
  const cityDrop = document.createElement('div');
  cityDrop.className = 'addspace-street-dropdown';
  cityDrop.hidden = true;
  cityInput?.parentElement && (cityInput.parentElement.style.position = 'relative',
    cityInput.parentElement.appendChild(cityDrop));

  // ── PLZ dropdown ──
  const plzDrop = document.createElement('div');
  plzDrop.className = 'addspace-street-dropdown';
  plzDrop.hidden = true;
  plzInput?.parentElement && (plzInput.parentElement.style.position = 'relative',
    plzInput.parentElement.appendChild(plzDrop));

  const latInput  = form?.elements['lat'];
  const longInput = form?.elements['long'];

  function cc() {
    return Object.entries(GEOCODE_COUNTRY).find(([, v]) => v === countrySelect?.value)?.[0];
  }

  // ── Generic dropdown helpers ──
  function makeDropdown(drop, items, onSelect) {
    drop.innerHTML = '';
    if (!items.length) { drop.hidden = true; return; }
    let active = -1;
    items.forEach(text => {
      const item = document.createElement('div');
      item.className = 'addspace-street-item';
      item.textContent = text;
      item.addEventListener('mousedown', e => { e.preventDefault(); onSelect(text); drop.hidden = true; });
      drop.appendChild(item);
    });
    drop.hidden = false;
    // keyboard nav on the triggering input
    return {
      nav(e) {
        if (drop.hidden) return false;
        const els = [...drop.querySelectorAll('.addspace-street-item')];
        if (e.key === 'ArrowDown') { e.preventDefault(); active = Math.min(active + 1, els.length - 1); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); active = Math.max(active - 1, -1); }
        else if (e.key === 'Enter' && active >= 0) { e.preventDefault(); onSelect(els[active].textContent); drop.hidden = true; }
        else if (e.key === 'Escape') { drop.hidden = true; }
        else return false;
        els.forEach((el, i) => el.classList.toggle('is-active', i === active));
        if (active >= 0) els[active].scrollIntoView({ block: 'nearest' });
        return true;
      }
    };
  }

  let streetNav = null;

  // ── Street fetch via Photon (prefix-matching autocomplete, OSM-backed) ──
  async function fetchStreets(query) {
    const city = (cityInput?.value  || '').trim();
    const plz  = (plzInput?.value   || '').trim();
    if (!city && !plz) return [];

    const p = new URLSearchParams({ q: query, limit: '50', lang: photonLang() });
    p.set('osm_tag', 'highway');

    // Use pin coords as bias, fall back to country center
    const pinLat = parseFloat(latInput?.value);
    const pinLon = parseFloat(longInput?.value);
    const hasBias = !isNaN(pinLat) && !isNaN(pinLon);
    const center = hasBias ? [pinLat, pinLon] : (COUNTRY_CENTERS[cc()] || null);
    if (center) { p.set('lat', String(center[0])); p.set('lon', String(center[1])); }

    try {
      const r = await fetch(`https://photon.komoot.io/api/?${p}`);
      const data = r.ok ? await r.json() : { features: [] };
      const c = cc();
      const features = data.features.filter(f => {
        const fp = f.properties;
        // Always filter by country
        if (c && fp.countrycode?.toLowerCase() !== c) return false;
        // City filter when no pin bias
        if (!hasBias && city && fp.city && !fp.city.toLowerCase().includes(city.toLowerCase())) return false;
        // PLZ filter: if PLZ set, require postcode match (missing postcode = reject)
        if (plz && fp.postcode !== plz) return false;
        return true;
      });
      return sortAlpha([...new Set(features.map(f => f.properties.name).filter(Boolean))]);
    } catch { return []; }
  }

  function selectStreet(road) {
    streetInput.value = road;
    streetDrop.hidden = true;
    streetNav = null;
    lookupPostal();
    hnoInput?.focus();
  }

  // ── Postal lookup ──
  async function lookupPostal() {
    const city   = (cityInput?.value   || '').trim();
    const street = (streetInput?.value || '').trim();
    const hno    = (hnoInput?.value    || '').trim();
    if (!city || !street) return;
    const q = [[hno, street].filter(Boolean).join(' '), city].join(' ');
    const features = await photonSearch(q, 5);
    const postcodes = [...new Set(features.map(f => f.properties.postcode).filter(Boolean))];
    if (!postcodes.length) return;
    if (plzInput?.value.trim()) return; // PLZ already filled — don't overwrite or show dropdown
    if (postcodes.length === 1) { plzInput.value = postcodes[0]; plzDrop.hidden = true; }
    else makeDropdown(plzDrop, postcodes, val => { plzInput.value = val; });
  }

  // ── Shared Photon search helper ──
  async function photonSearch(query, limit = 10) {
    const p = new URLSearchParams({ q: query, limit: String(limit), lang: photonLang() });
    try {
      const r = await fetch(`https://photon.komoot.io/api/?${p}`);
      const features = r.ok ? (await r.json()).features || [] : [];
      const c = cc();
      return c ? features.filter(f => f.properties.countrycode?.toLowerCase() === c) : features;
    } catch { return []; }
  }

  // ── City → PLZ lookup ──
  let pendingPlzOptions = [];
  let cityDebounce;
  function cityMatch(props, cityLc) {
    return props.city?.toLowerCase() === cityLc ||
           props.name?.toLowerCase() === cityLc ||
           props.town?.toLowerCase() === cityLc ||
           props.village?.toLowerCase() === cityLc;
  }

  // OpenPLZ API: exact city→PLZ lookup for DE/AT/CH (no API key, full CORS)
  const OPENPLZ_CC = new Set(['de', 'at', 'ch']);
  async function openPlzForCity(city) {
    const c = cc();
    if (!OPENPLZ_CC.has(c)) return null;
    const params = new URLSearchParams({ name: city, pageSize: '50' });
    try {
      const r = await fetch(`https://openplzapi.org/${c}/Localities?${params}`);
      if (!r.ok) return null;
      const items = await r.json();
      // Handle pagination: if more pages exist, fetch them all
      const totalPages = parseInt(r.headers.get('x-total-pages') || '1', 10);
      const all = Array.isArray(items) ? [...items] : [];
      for (let page = 2; page <= Math.min(totalPages, 5); page++) {
        const p2 = new URLSearchParams({ name: city, pageSize: '50', page: String(page) });
        try {
          const r2 = await fetch(`https://openplzapi.org/${c}/Localities?${p2}`);
          if (r2.ok) all.push(...(await r2.json()));
        } catch { break; }
      }
      // Filter exact city name match (case-insensitive), extract postal codes
      const cityLc = city.toLowerCase();
      const codes = all
        .filter(loc => loc.name?.toLowerCase() === cityLc)
        .map(loc => loc.postalCode)
        .filter(Boolean);
      return sortAlpha([...new Set(codes)]);
    } catch { return null; }
  }

  async function lookupPlzForCity() {
    const city = (cityInput?.value || '').trim();
    if (!city) { pendingPlzOptions = []; return; }

    // DE/AT/CH: use OpenPLZ API for exact, complete results
    const openPlz = await openPlzForCity(city);
    if (openPlz !== null) {
      pendingPlzOptions = openPlz;
      if (!plzInput?.value.trim()) {
        if (openPlz.length === 1) { plzInput.value = openPlz[0]; plzDrop.hidden = true; }
      }
      return;
    }

    // Fallback for other countries: Photon two-phase approach
    const cityLc = city.toLowerCase();
    const phase1 = await photonSearch(city, 150);
    const found = [...new Set(phase1.filter(f => cityMatch(f.properties, cityLc))
      .map(f => f.properties.postcode).filter(Boolean))];

    const cityFeature = phase1.find(f =>
      f.properties.osm_key === 'place' &&
      (f.properties.name?.toLowerCase() === cityLc ||
       f.properties.town?.toLowerCase() === cityLc ||
       f.properties.village?.toLowerCase() === cityLc)
    ) || phase1[0];

    if (found.length > 0 && cityFeature?.geometry?.coordinates) {
      const [lon, lat] = cityFeature.geometry.coordinates;
      const prefix = found[0].slice(0, 3);
      const p = new URLSearchParams({ q: prefix, limit: '50', lang: photonLang() });
      p.set('lat', String(lat)); p.set('lon', String(lon));
      try {
        const r2 = await fetch(`https://photon.komoot.io/api/?${p}`);
        const data2 = r2.ok ? await r2.json() : { features: [] };
        const c = cc();
        data2.features
          .filter(f => (!c || f.properties.countrycode?.toLowerCase() === c) &&
                       cityMatch(f.properties, cityLc) &&
                       f.properties.postcode?.startsWith(prefix))
          .forEach(f => found.push(f.properties.postcode));
      } catch {}
    }

    const postcodes = sortAlpha([...new Set(found)]);
    pendingPlzOptions = postcodes;
    if (!plzInput?.value.trim()) {
      if (postcodes.length === 1) { plzInput.value = postcodes[0]; plzDrop.hidden = true; }
    }
  }
  // ── City autocomplete via Photon ──
  // Use no osm_tag URL filter (encoding issues); filter client-side by osm_key=place
  const PLACE_TYPES = new Set(['city', 'town', 'village', 'municipality', 'borough', 'suburb']);
  let cityNav = null;
  async function fetchCities(query) {
    const p = new URLSearchParams({ q: query, limit: '50', lang: photonLang() });
    const pinLat = parseFloat(latInput?.value), pinLon = parseFloat(longInput?.value);
    const center = (!isNaN(pinLat) && !isNaN(pinLon)) ? [pinLat, pinLon] : (COUNTRY_CENTERS[cc()] || null);
    if (center) { p.set('lat', String(center[0])); p.set('lon', String(center[1])); }
    try {
      const r = await fetch(`https://photon.komoot.io/api/?${p}`);
      const data = r.ok ? await r.json() : { features: [] };
      const c = cc();
      const places = data.features.filter(f =>
        f.properties.osm_key === 'place' && PLACE_TYPES.has(f.properties.osm_value) &&
        (!c || f.properties.countrycode?.toLowerCase() === c)
      );
      return sortAlpha([...new Set(places.map(f => f.properties.name).filter(Boolean))]);
    } catch { return []; }
  }
  function selectCity(name) {
    cityInput.value = name;
    cityDrop.hidden = true;
    cityNav = null;
    lookupPlzForCity().then(() => {
      if (!plzInput?.value.trim() && pendingPlzOptions.length > 1) {
        plzNav = makeDropdown(plzDrop, pendingPlzOptions, val => { plzInput.value = val; plzDrop.hidden = true; streetInput?.focus(); }) || null;
        plzInput?.focus();
      } else if (!plzInput?.value.trim() && pendingPlzOptions.length === 1) {
        plzInput?.focus();
      }
    });
  }
  cityInput?.addEventListener('input', () => {
    if (plzInput?.value.trim()) { plzInput.value = ''; plzDrop.hidden = true; pendingPlzOptions = []; }
    if (streetInput?.value.trim()) { streetInput.value = ''; streetDrop.hidden = true; }
    if (hnoInput?.value.trim()) hnoInput.value = '';
    const q = cityInput.value.trim();
    clearTimeout(cityDebounce);
    if (q.length < 2) { cityDrop.hidden = true; lookupPlzForCity(); return; }
    cityDebounce = setTimeout(async () => {
      const cities = await fetchCities(q);
      cityNav = makeDropdown(cityDrop, cities, selectCity) || null;
      lookupPlzForCity();
    }, 300);
  });
  cityInput?.addEventListener('keydown', e => { cityNav?.nav(e); });
  cityInput?.addEventListener('blur', () => {
    setTimeout(() => { cityDrop.hidden = true; }, 150);
    lookupPlzForCity().then(() => {
      if (!plzInput?.value.trim() && pendingPlzOptions.length > 1)
        plzNav = makeDropdown(plzDrop, pendingPlzOptions, val => { plzInput.value = val; plzDrop.hidden = true; streetInput?.focus(); }) || null;
    });
  });

  // ── PLZ → City lookup + PLZ autocomplete ──
  let plzDebounce;
  async function fetchPlzSuggestions(digits) {
    const c = cc();
    if (OPENPLZ_CC.has(c)) {
      // OpenPLZ supports postalCode prefix search
      try {
        const params = new URLSearchParams({ postalCode: digits, pageSize: '50' });
        const r = await fetch(`https://openplzapi.org/${c}/Localities?${params}`);
        if (r.ok) {
          const items = await r.json();
          return sortAlpha([...new Set((Array.isArray(items) ? items : [])
            .map(i => i.postalCode).filter(p => p?.startsWith(digits)))]);
        }
      } catch {}
    }
    const features = await photonSearch(digits, 20);
    return sortAlpha([...new Set(features.map(f => f.properties.postcode).filter(p => p?.startsWith(digits)))]);
  }
  async function lookupCityForPlz() {
    const plz = (plzInput?.value || '').trim();
    if (!plz) return;
    const c = cc();
    if (OPENPLZ_CC.has(c)) {
      try {
        const params = new URLSearchParams({ postalCode: plz, pageSize: '5' });
        const r = await fetch(`https://openplzapi.org/${c}/Localities?${params}`);
        if (r.ok) {
          const items = await r.json();
          const names = [...new Set((Array.isArray(items) ? items : []).map(i => i.name).filter(Boolean))];
          if (!cityInput?.value.trim() && names.length === 1) cityInput.value = names[0];
          return;
        }
      } catch {}
    }
    const features = await photonSearch(plz);
    const cities = [...new Set(features.map(f => f.properties.city || f.properties.name).filter(Boolean))];
    if (!cityInput?.value.trim() && cities.length === 1) cityInput.value = cities[0];
  }
  plzInput?.addEventListener('input', () => {
    if (cityInput?.value.trim()) { cityInput.value = ''; cityDrop.hidden = true; }
    if (streetInput?.value.trim()) { streetInput.value = ''; streetDrop.hidden = true; }
    if (hnoInput?.value.trim()) hnoInput.value = '';
    const q = (plzInput.value || '').trim();
    clearTimeout(plzDebounce);
    plzDrop.hidden = true;
    if (q.length < 2) { plzDebounce = setTimeout(lookupCityForPlz, 500); return; }
    // Prefer filtering already-known options by prefix (no API call)
    const filtered = pendingPlzOptions.filter(p => p.startsWith(q));
    if (filtered.length) {
      plzNav = makeDropdown(plzDrop, filtered, val => { plzInput.value = val; plzDrop.hidden = true; lookupCityForPlz(); streetInput?.focus(); }) || null;
    } else if (q.length >= 2) {
      plzDebounce = setTimeout(async () => {
        const codes = await fetchPlzSuggestions(q);
        plzNav = makeDropdown(plzDrop, codes, val => { plzInput.value = val; plzDrop.hidden = true; lookupCityForPlz(); streetInput?.focus(); }) || null;
      }, 300);
    }
    plzDebounce = setTimeout(lookupCityForPlz, 500);
  });
  plzInput?.addEventListener('blur', () => { clearTimeout(plzDebounce); setTimeout(() => { plzDrop.hidden = true; }, 150); lookupCityForPlz(); });

  // ── Street input listeners ──
  let streetDebounce;
  streetInput.addEventListener('input', () => {
    const q = streetInput.value.trim();
    clearTimeout(streetDebounce);
    if (q.length < 1) { streetDrop.hidden = true; return; }
    streetDebounce = setTimeout(async () => {
      const roads = await fetchStreets(q);
      streetNav = makeDropdown(streetDrop, roads, selectStreet) || null;
    }, 300);
  });

  streetInput.addEventListener('keydown', e => { streetNav?.nav(e); });
  streetInput.addEventListener('blur', () => setTimeout(() => { streetDrop.hidden = true; }, 150));

  // ── Street number listeners → postal lookup ──
  let hnoDebounce;
  hnoInput?.addEventListener('input',  () => { clearTimeout(hnoDebounce); hnoDebounce = setTimeout(lookupPostal, 500); });
  hnoInput?.addEventListener('blur',   () => { clearTimeout(hnoDebounce); lookupPostal(); });

  // ── PLZ dropdown keyboard + focus shows pending options ──
  let plzNav = null;
  plzInput?.addEventListener('focus', () => {
    if (!plzInput.value.trim() && pendingPlzOptions.length > 1) {
      plzNav = makeDropdown(plzDrop, pendingPlzOptions, val => { plzInput.value = val; plzDrop.hidden = true; lookupCityForPlz(); streetInput?.focus(); }) || null;
    }
  });
  plzInput?.addEventListener('keydown', e => { plzNav?.nav(e); });
}

// ─── Form: build GitHub issue body ────────────────────────────────────────────

function buildIssueBody(form, selectedSpace, workshopsAvailable, originalSnapshot = null) {
  const g = name => (form.elements[name]?.value || '').trim();
  const checked = [...form.querySelectorAll('input[name="workshop"]:checked')].map(el => el.value);
  const isCorrection = !!selectedSpace && !!originalSnapshot;

  // For corrections: show only changed fields. For new spaces: show all.
  const field = (label, name, fallback = '_No response_') => {
    const val = g(name) || '';
    if (isCorrection) {
      const orig = originalSnapshot[name] ?? '';
      if (val === orig) return null; // unchanged — skip
      return `### ${label}\n\n~~${orig || '_empty_'}~~ → **${val || '_empty_'}**`;
    }
    return `### ${label}\n\n${val || fallback}`;
  };

  // Workshops diff
  let workshopSection = null;
  if (workshopsAvailable) {
    const workshopBlock = WORKSHOPS
      .map(([label]) => `- [${checked.includes(label) ? 'x' : ' '}] ${label}`)
      .join('\n');
    if (isCorrection) {
      const nowStr = checked.sort().join(',');
      if (nowStr !== originalSnapshot._workshops) {
        workshopSection = `### Workshop types (optional)\n\n${workshopBlock}`;
      }
    } else {
      workshopSection = `### Workshop types (optional)\n\n${workshopBlock}`;
    }
  } else if (!isCorrection) {
    workshopSection = `### Workshop types (optional)\n\n_No response_`;
  }

  const lines = [
    selectedSpace ? `### Existing ID\n\n${selectedSpace.ID}` : null,
    field('Name', 'name'),
    field('Country', 'country'),
    field('City', 'city'),
    field('Postal code', 'plz'),
    field('Street', 'street_name'),
    field('Street number', 'street_number'),
    field('Address addition', 'street_ext'),
    field('Latitude', 'lat'),
    field('Longitude', 'long'),
    field('Style', 'style'),
    workshopSection,
    isCorrection ? null : `### Workshops submitted\n\n${workshopsAvailable ? 'yes' : 'no'}`,
    field('Website (URL)', 'url'),
    field('Link display text', 'url_text'),
    field('Weekly open day (optional)', 'weekly_weekday'),
    field('Weekly open time (optional)', 'weekly_time'),
    field('SpaceAPI Endpoint (optional)', 'spaceapi'),
    field('Event calendar URL (optional)', 'events_url'),
  ].filter(Boolean);

  if (isCorrection && lines.length === 1) {
    // Only the ID line — nothing changed
    lines.push('_No changes detected._');
  }

  return lines.join('\n\n');
}

// ─── Form: submit ─────────────────────────────────────────────────────────────

async function handleSubmit(form, loadTime, overlay, selectedSpace = null, workshopsAvailable = true, originalSnapshot = null) {
  const statusEl  = overlay.querySelector('.addspace-status');
  const submitBtn = overlay.querySelector('.addspace-submit-btn');

  // Honeypot
  if (form.elements['hp_url'].value !== '') return;

  // Timing guard (skip for updates — fields were pre-filled, not typed)
  if (!selectedSpace && Date.now() - loadTime < 3000) {
    statusEl.textContent = t('statusTooFast', 'Please take a moment to fill in the form completely.');
    return;
  }

  // Required fields
  const name = form.elements['name'].value.trim();
  const lat  = form.elements['lat'].value.trim();
  const long = form.elements['long'].value.trim();
  const url  = form.elements['url'].value.trim();
  if (!name || !lat || !long || !url) {
    statusEl.textContent = t('statusRequired', 'Please fill in all required fields.');
    return;
  }

  const isUpdate = !!selectedSpace;
  const title    = isUpdate
    ? `update makerspace: ${name} (ID ${selectedSpace.ID})`
    : `neuer Makerspace: ${name}`;
  const body     = buildIssueBody(form, selectedSpace, workshopsAvailable, originalSnapshot);

  const url_gh = `https://github.com/${GITHUB_REPO}/issues/new`
    + `?title=${encodeURIComponent(title)}`
    + `&body=${encodeURIComponent(body)}`;

  const win = window.open(url_gh, '_blank', 'noopener');
  if (win) {
    const action = isUpdate
      ? t('statusCorrectionSuccess', 'Correction submitted')
      : t('statusSuccess', 'Submitted');
    statusEl.innerHTML = `✅ ${action} — ${t('statusGitHubOpened', 'GitHub opened in new tab')}.`;
  } else {
    // Popup blocked — show link instead
    statusEl.innerHTML = `<a href="${url_gh}" target="_blank" rel="noopener">${t('statusViewIssue', 'Open on GitHub')} ↗</a>`;
  }
}

export { fetchEnrichment, searchSpaces, initLocationMap, initStreetAutocomplete, handleSubmit, WORKSHOPS };
