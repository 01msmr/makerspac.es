// embed-overlay.js — Unified overlay: Add Space + Embed guide

import { WEEKDAY_NAMES } from './date-utils.js';
import AppConfig from './config.js';

const GITHUB_REPO = '01msmr/makerspac.es';

const COUNTRIES    = ['Germany', 'Austria', 'Switzerland', 'Netherlands', 'Belgium', 'Denmark', 'Ukraine', 'other'];
const STYLES       = ['for all', 'for youth', 'for students', 'commercial'];
const WEEKDAYS     = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const WORKSHOPS = [
  ['3D printing', '3d'],  ['Laser cutting', 'laser'], ['CNC', 'cnc'],
  ['Electronics', 'electronics'], ['Coding', 'coding'], ['VR', 'vr'],
  ['Music', 'music'],     ['Photography', 'photo'],
  ['Woodworking', 'wood'], ['Metalworking', 'metal'], ['Bike repair', 'bike'],
  ['Textile', 'textile'], ['Screen printing', 'screenprint'], ['Ceramics', 'ceramics'],
];

// i18n shorthands
const t  = (key, fb) => window.i18n?.t(`addMakerspace.${key}`) ?? fb;  // addMakerspace namespace
const ti = (key, fb) => window.i18n?.t(key) ?? fb;                      // full key path
// Photon supports de/en/fr/it; map UI language → Photon lang param
const PHOTON_LANGS = new Set(['de', 'en', 'fr', 'it']);
const photonLang = () => { const l = window.i18n?.getLanguage?.() || 'en'; return PHOTON_LANGS.has(l) ? l : 'en'; };

// null = not yet fetched; false = fetch failed; object = data
let _enrichmentCache = null;

export function initEmbedOverlay() {
  const btn = document.querySelector('.tool-add');
  if (!btn) return;

  btn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    showOverlay();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') _closeEmbed();
  });
}

function _closeEmbed() {
  const backdrop = document.querySelector('.embed-backdrop');
  if (backdrop) {
    backdrop.classList.remove('show');
    backdrop.classList.add('fade-out');
    setTimeout(() => backdrop.remove(), 300);
  }
  document.querySelector('.embed-overlay')?.remove();
  document.body.style.overflow = '';
}

// ─── HTML helpers ─────────────────────────────────────────────────────────────

function opt(values, selected = '') {
  return values.map(v => {
    const [val, label] = Array.isArray(v) ? v : [v, v];
    return `<option value="${val}"${val === selected ? ' selected' : ''}>${label}</option>`;
  }).join('');
}

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

// ─── Embed snippets ────────────────────────────────────────────────────────────

const snippet440 =
`<iframe
  src="https://makerspac.es/embed.html?id=YOUR_ID&friends=ID1,ID2"
  width="100%"
  height="440px"
  frameborder="0">
</iframe>`;

const snippet640 =
`<iframe
  src="https://makerspac.es/embed.html?id=YOUR_ID&friends=ID1,ID2"
  width="100%"
  height="640px"
  frameborder="0">
</iframe>`;

const snippetDiv =
`<!-- CSS in the <head> -->
<link rel="stylesheet" href="https://makerspac.es/embed.css">

<!-- div at the desired location -->
<div id="map-container" style="position:relative; height:440px;">
  <div id="map"></div>
  <div id="loading" class="loading">📍 loading...</div>
</div>

<!-- scripts at the end of <body> -->
<script src="https://makerspac.es/libs/leaflet/leaflet.js"></script>
<script src="https://makerspac.es/embed.js"></script>`;

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

// ─── Overlay ───────────────────────────────────────────────────────────────────

function showOverlay() {
  if (document.querySelector('.embed-overlay')) return;

  const backdrop = document.createElement('div');
  backdrop.className = 'map-backdrop embed-backdrop';
  backdrop.style.zIndex = '99999';
  document.body.appendChild(backdrop);
  requestAnimationFrame(() => backdrop.classList.add('show'));

  const overlay = document.createElement('div');
  overlay.className = 'embed-overlay';
  overlay.innerHTML = `
    <div class="embed-modal">
      <div class="embed-modal-header">
        <div class="embed-modal-header-text">
          <h2>📍 makerspac.es</h2>
          <div class="embed-tabs">
            <button class="embed-tab active" data-tab="addspace"><i class="fas fa-square-plus"></i> <span class="tab-label-full">${t('title', 'add your makerspace')}</span><span class="tab-label-short">add space</span></button>
            <button class="embed-tab" data-tab="embed"><i class="fas fa-code"></i> <span class="tab-label-full">${t('embed', 'embed into your site')}</span><span class="tab-label-short">embed map</span></button>
          </div>
        </div>
        <button class="embed-close-btn" aria-label="Close"><i class="fas fa-times"></i></button>
      </div>
      <hr class="embed-modal-divider">
      <div class="embed-modal-scroll">
        <!-- ── Tab: Add Space ── -->
        <div class="embed-tab-panel" data-tab="addspace">
          <p class="embed-tab-intro">${t('tabIntro', 'Submit your makerspace to the map. A maintainer will review and publish it.')}</p>
          <!-- Top area: silver background -->
          <div class="addspace-top-area">
            <!-- Mode toggle -->
            <div class="addspace-mode-toggle">
              <label class="addspace-mode-option">
                <input type="radio" name="addspace_mode" value="add" checked>
                ${t('addToggle', 'add makerspace')}
              </label>
              <label class="addspace-mode-option">
                <input type="radio" name="addspace_mode" value="edit">
                ${t('editToggle', 'edit makerspace')}
              </label>
            </div>

            <!-- Search (edit mode only) -->
            <div class="addspace-lookup" hidden>
              <div class="addspace-lookup-field">
                <input type="text" class="addspace-input addspace-lookup-input"
                       placeholder="${t('lookupPlaceholder', 'Name or ID — e.g. Toolbox Bodensee or 45')}"
                       autocomplete="off" spellcheck="false">
                <div class="addspace-lookup-results" hidden></div>
              </div>
              <button class="addspace-edit-btn" type="button" hidden>${t('editBtn', 'edit')}</button>
            </div>

          </div><!-- /addspace-top-area -->
          <hr class="addspace-lookup-divider">

          <form class="addspace-form" novalidate>
            <!-- Honeypot: bots fill this, humans don't -->
            <input name="hp_url" autocomplete="off" tabindex="-1" aria-hidden="true"
                   style="position:absolute;left:-9999px;opacity:0;height:0;pointer-events:none">

            <h3 class="embed-h3">${t('sectionSpaceInfo', 'Space info')}</h3>

            <label class="addspace-label">${t('labelName', 'Name')} <span class="embed-pill embed-pill-required">${t('required', 'required')}</span></label>
            <input type="text" name="name" class="addspace-input" required placeholder="${t('namePlaceholder', 'Your Makerspace Name')}">

            <label class="addspace-label">${ti('filter.style', 'Style')} <span class="embed-pill embed-pill-required">${t('required', 'required')}</span></label>
            <select name="style" class="addspace-input">${opt([
              ['for all',      ti('style.forAll',      'for all')],
              ['for youth',    ti('style.forYouth',    'for youth')],
              ['for students', ti('style.forStudents', 'for students')],
              ['commercial',   ti('style.commercial',  'commercial')],
            ])}</select>

            <label class="addspace-label">${t('labelWebsite', 'Website')} <span class="embed-pill embed-pill-required">${t('required', 'required')}</span></label>
            <input type="url" name="url" class="addspace-input" required placeholder="https://yourspace.org">

            <label class="addspace-label">${t('labelLinkText', 'Link display text')} <span class="embed-pill embed-pill-required">${t('required', 'required')}</span></label>
            <input type="text" name="url_text" class="addspace-input" required placeholder="yourspace.org">

            <h3 class="embed-h3">${t('sectionLocation', 'Location')}</h3>

            <div class="addspace-row">
              <div>
                <label class="addspace-label">${t('labelLatitude', 'Latitude')} <span class="embed-pill embed-pill-required">${t('required', 'required')}</span></label>
                <input type="text" name="lat" class="addspace-input" required placeholder="47.7126816">
              </div>
              <div>
                <label class="addspace-label">${t('labelLongitude', 'Longitude')} <span class="embed-pill embed-pill-required">${t('required', 'required')}</span></label>
                <input type="text" name="long" class="addspace-input" required placeholder="9.3995537">
              </div>
            </div>
            <div class="addspace-map-preview"></div>

            <div class="addspace-row">
              <div>
                <label class="addspace-label">${ti('filter.country', 'Country')} <span class="embed-pill embed-pill-required">${t('required', 'required')}</span></label>
                <select name="country" class="addspace-input">${opt([
                  ['Germany',     ti('countries.Germany',     'Germany')],
                  ['Austria',     ti('countries.Austria',     'Austria')],
                  ['Switzerland', ti('countries.Switzerland', 'Switzerland')],
                  ['Netherlands', ti('countries.Netherlands', 'Netherlands')],
                  ['Belgium',     ti('countries.Belgium',     'Belgium')],
                  ['Denmark',     ti('countries.Denmark',     'Denmark')],
                  ['Ukraine',     ti('countries.Ukraine',     'Ukraine')],
                  ['other',       t('countryOther',           'other')],
                ])}</select>
              </div>
              <div>
                <label class="addspace-label">${t('labelCity', 'City')} <span class="embed-pill embed-pill-required">${t('required', 'required')}</span></label>
                <input type="text" name="city" class="addspace-input" required autocomplete="off">
              </div>
              <div class="addspace-col-narrow">
                <label class="addspace-label">${t('labelPostalCode', 'Postal code')} <span class="embed-pill embed-pill-required">${t('required', 'required')}</span></label>
                <input type="text" name="plz" class="addspace-input" required autocomplete="off">
              </div>
            </div>

            <div class="addspace-row">
              <div class="addspace-street-wrap">
                <label class="addspace-label">${t('labelStreet', 'Street')} <span class="embed-pill embed-pill-required">${t('required', 'required')}</span></label>
                <input type="text" name="street_name" class="addspace-input" required autocomplete="off">
              </div>
              <div class="addspace-col-narrow">
                <label class="addspace-label">${t('labelStreetNo', 'Street no.')} <span class="embed-pill embed-pill-required">${t('required', 'required')}</span></label>
                <input type="text" name="street_number" class="addspace-input" required autocomplete="off">
              </div>
              <div>
                <label class="addspace-label">${t('labelAddressAddition', 'Address addition')}</label>
                <input type="text" name="street_ext" class="addspace-input" autocomplete="off" placeholder="${t('addressAdditionPlaceholder', 'e.g. Apt. 2, Building B')}">
              </div>
            </div>

            <h3 class="embed-h3">${ti('filter.workshops', 'Workshops')} <span class="embed-pill">${t('optional', 'optional')}</span></h3>
            <p class="addspace-enrich-warning" hidden>${t('workshopLoadError', '⚠ Workshop data could not be loaded — please check all workshops that apply manually.')}</p>
            <div class="addspace-checkboxes">
              ${WORKSHOPS.map(([label, key]) => `
                <label class="addspace-checkbox-label">
                  <input type="checkbox" name="workshop" value="${label}"> ${ti(`workshops.${key}`, label)}
                </label>`).join('')}
            </div>

            <h3 class="embed-h3">${t('sectionMeeting', 'Regular meeting')} <span class="embed-pill">${t('optional', 'optional')}</span></h3>
            <div class="addspace-row">
              <div>
                <label class="addspace-label">${t('labelWeekday', 'Weekday')}</label>
                <select name="weekly_weekday" class="addspace-input">
                  <option value="">${t('weekdayNone', '— none —')}</option>
                  ${opt([
                    ['Monday',    t('weekdayMonday',    'Monday')],
                    ['Tuesday',   t('weekdayTuesday',   'Tuesday')],
                    ['Wednesday', t('weekdayWednesday', 'Wednesday')],
                    ['Thursday',  t('weekdayThursday',  'Thursday')],
                    ['Friday',    t('weekdayFriday',    'Friday')],
                    ['Saturday',  t('weekdaySaturday',  'Saturday')],
                    ['Sunday',    t('weekdaySunday',    'Sunday')],
                  ])}
                </select>
              </div>
              <div>
                <label class="addspace-label">${t('labelTime', 'Time')}</label>
                <input type="text" name="weekly_time" class="addspace-input" placeholder="1900">
              </div>
            </div>

            <h3 class="embed-h3">${t('sectionOnline', 'Online presence')} <span class="embed-pill">${t('optional', 'optional')}</span></h3>

            <label class="addspace-label">${t('labelSpaceAPI', 'SpaceAPI Endpoint')}</label>
            <input type="url" name="spaceapi" class="addspace-input" placeholder="https://yourspace.org/spaceapi.json">

            <label class="addspace-label">${t('labelEventsUrl', 'Event calendar URL')}</label>
            <input type="url" name="events_url" class="addspace-input" placeholder="https://yourspace.org/events/">

            <div class="addspace-submit-row">
              <button type="submit" class="addspace-submit-btn">${t('submitBtn', 'Submit to maintainers')}</button>
              <span class="addspace-status"></span>
            </div>
          </form>
        </div><!-- /addspace panel -->

        <!-- ── Tab: Embed guide ── -->
        <div class="embed-tab-panel" data-tab="embed" hidden>
          <p class="embed-tab-intro">Show your <b>position</b>, your makerspace-<b>status</b> (open/closed) and connect with <b>friendly spaces of yours</b>.</p>
          <h3 class="embed-h3">1. Live Preview</h3>

          <h4 class="embed-h4">a) 440 px — without minimap</h4>
          <div class="embed-preview embed-preview-440">
            <iframe src="embed.html?id=1&friends=73,187,45,67&noscroll=1" width="100%" height="100%" frameborder="0" loading="lazy"></iframe>
          </div>

          <h4 class="embed-h4">b) 640 px — with minimap</h4>
          <div class="embed-preview embed-preview-640">
            <iframe src="embed.html?id=1&friends=2,45,67&noscroll=1" width="100%" height="100%" frameborder="0" loading="lazy"></iframe>
          </div>

          <h3 class="embed-h3">2. Embed by iframe <em>(recommended)</em></h3>
          <p>Copy one of the following snippets and insert it on your website where you want the map to appear.</p>

          <h4 class="embed-h4">a) 440 px — without minimap</h4>
          <div class="embed-code-block">
            <pre class="embed-snippet">${AppConfig.escapeHtml(snippet440)}</pre>
            <button class="embed-copy-btn">copy</button>
          </div>

          <h4 class="embed-h4">b) 640 px — with minimap</h4>
          <div class="embed-code-block">
            <pre class="embed-snippet">${AppConfig.escapeHtml(snippet640)}</pre>
            <button class="embed-copy-btn">copy</button>
          </div>

          <h4 class="embed-h4">c) Parameters</h4>
          <table class="embed-param-table">
            <thead><tr><th>parameter</th><th>description</th><th>example</th></tr></thead>
            <tbody>
              <tr>
                <td><code>id</code> <span class="embed-pill embed-pill-required">required</span></td>
                <td>The ID of your makerspace (hover the link in the marker popup).</td>
                <td><code>id=1</code></td>
              </tr>
              <tr>
                <td><code>friends</code> <span class="embed-pill">optional</span></td>
                <td>IDs of friendly makerspaces, comma-separated.</td>
                <td><code>friends=12,34,56</code></td>
              </tr>
            </tbody>
          </table>

          <h3 class="embed-h3">3. Embed by div &amp; JavaScript</h3>
          <p>Load the map directly into a div to control the styling yourself.</p>
          <div class="embed-code-block">
            <pre class="embed-snippet">${AppConfig.escapeHtml(snippetDiv)}</pre>
            <button class="embed-copy-btn">copy</button>
          </div>

          <h3 class="embed-h3">4. FAQ</h3>
          <p><strong>How do I find my ID?</strong><br>
            Search for your makerspace and click on the pin. Hover the coloured link in the popup.</p>
          <p><strong>What are those friends?</strong><br>
            IDs of friendly makerspaces. Example: <code>&amp;friends=x,y,z</code></p>
          <p><strong>What happens when my space is closed?</strong><br>
            When you use the SpaceAPI, the marker turns red and the sidebar displays "closed."</p>
        </div><!-- /embed panel -->

      </div><!-- /.embed-modal-scroll -->
      <div class="embed-modal-footer"></div>
    </div>`;

  document.body.appendChild(overlay);
  document.body.style.overflow = 'hidden';

  const loadTime = Date.now();
  const header   = overlay.querySelector('.embed-modal-header');
  const scrollEl = overlay.querySelector('.embed-modal-scroll');

  // Block keydown events from reaching main-site document handlers.
  // capture=true: fires before search-header's document listener regardless of focus position.
  const _overlayKeyHandler = (e) => {
    if (!overlay.isConnected) { document.removeEventListener('keydown', _overlayKeyHandler, true); return; }
    // When focus is inside a form field, only intercept Escape + Tab so the field's
    // own keydown handlers (e.g. street autocomplete arrow keys) still fire.
    const inField = ['INPUT', 'SELECT', 'TEXTAREA'].includes(document.activeElement?.tagName);
    if (!inField || e.key === 'Escape' || e.key === 'Tab') e.stopImmediatePropagation();
    if (e.key === 'Escape') { close(); return; }
    if (e.key === 'Tab') {
      const focusable = [...overlay.querySelectorAll(
        'a[href],button:not([disabled]),input,select,textarea,[tabindex]:not([tabindex="-1"])'
      )].filter(el => el.offsetParent !== null);
      if (!focusable.length) { e.preventDefault(); return; }
      const atEdge = e.shiftKey ? document.activeElement === focusable[0] : document.activeElement === focusable.at(-1);
      if (atEdge || !overlay.contains(document.activeElement)) { e.preventDefault(); (e.shiftKey ? focusable.at(-1) : focusable[0]).focus(); }
    }
  };
  document.addEventListener('keydown', _overlayKeyHandler, true);

  // ── Close ──
  const close = () => { _closeEmbed(); document.removeEventListener('keydown', _overlayKeyHandler, true); };
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
  overlay.querySelector('.embed-close-btn').addEventListener('click', close);

  // ── Scroll shadow ──
  scrollEl.addEventListener('scroll', () => {
    header.classList.toggle('scrolled', scrollEl.scrollTop >= 100);
  }, { passive: true });

  // ── Wheel forwarding over header / footer ──
  const forwardWheel = (e) => { scrollEl.scrollTop += e.deltaY; e.preventDefault(); };
  header.addEventListener('wheel', forwardWheel, { passive: false });
  overlay.querySelector('.embed-modal-footer').addEventListener('wheel', forwardWheel, { passive: false });

  // ── Tab switching ──
  function switchTab(tab) {
    overlay.querySelectorAll('.embed-tab').forEach(
      t => t.classList.toggle('active', t.dataset.tab === tab)
    );
    overlay.querySelectorAll('.embed-tab-panel').forEach(
      p => { p.hidden = p.dataset.tab !== tab; }
    );
    scrollEl.scrollTop = 0;
    header.classList.remove('scrolled');
  }

  overlay.querySelectorAll('.embed-tab').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });

  // ── Copy buttons (embed tab) ──
  const snippets = [snippet440, snippet640, snippetDiv];
  overlay.querySelectorAll('.embed-copy-btn').forEach((btn, i) => {
    btn.addEventListener('click', () => {
      navigator.clipboard.writeText(snippets[i]);
      btn.textContent = 'copied!';
      setTimeout(() => { btn.textContent = 'copy'; }, 2500);
    });
  });

  // ── Mode toggle + lookup / prefill ───────────────────────────────────────

  let selectedSpace      = null;
  let workshopsAvailable = true;
  let originalSnapshot   = null;

  const modeRadios    = overlay.querySelectorAll('input[name="addspace_mode"]');
  const lookupDiv     = overlay.querySelector('.addspace-lookup');
  const lookupInput   = overlay.querySelector('.addspace-lookup-input');
  const lookupResults = overlay.querySelector('.addspace-lookup-results');
  const editBtn       = overlay.querySelector('.addspace-edit-btn');
  const submitBtn     = overlay.querySelector('.addspace-submit-btn');
  const enrichWarn    = overlay.querySelector('.addspace-enrich-warning');
  const form          = overlay.querySelector('.addspace-form');

  function setEditMode(on) {
    lookupDiv.hidden = !on;
    form.hidden      =  on;
    if (!on) resetLookup();
    if (on) requestAnimationFrame(() => lookupInput.focus());
  }

  modeRadios.forEach(r => r.addEventListener('change', () => setEditMode(r.value === 'edit')));

  let highlightedIndex = -1;

  function setHighlight(index) {
    const items = [...lookupResults.querySelectorAll('.addspace-lookup-item')];
    highlightedIndex = Math.max(-1, Math.min(items.length - 1, index));
    items.forEach((el, i) => el.classList.toggle('is-active', i === highlightedIndex));
    if (highlightedIndex >= 0) items[highlightedIndex].scrollIntoView({ block: 'nearest' });
  }

  function renderResults(results) {
    lookupResults.innerHTML = '';
    highlightedIndex = -1;
    if (!results.length) { lookupResults.hidden = true; return; }
    results.forEach(loc => {
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'addspace-lookup-item';
      item.textContent = `ID ${loc.ID} - ${loc.name} - ${loc.loc?.plz ? loc.loc.plz + ' ' : ''}${loc.loc?.city || ''}`;
      item._loc = loc;
      item.addEventListener('mousedown', (e) => { e.preventDefault(); selectSpace(loc); });
      lookupResults.appendChild(item);
    });
    lookupResults.hidden = false;
  }

  function selectSpace(loc) {
    selectedSpace = loc;
    lookupInput.value    = `ID ${loc.ID} - ${loc.name} - ${loc.loc?.plz ? loc.loc.plz + ' ' : ''}${loc.loc?.city || ''}`;
    lookupResults.hidden = true;
    editBtn.textContent  = `${t('editBtn', 'edit')}\u00a0\u00a0ID ${loc.ID} — ${loc.name}`;
    editBtn.hidden       = false;
  }

  async function prefillAndEdit() {
    if (!selectedSpace) return;
    const loc = selectedSpace;

    // Show form
    form.hidden = false;
    locationMap?.invalidate();
    form.reset();

    // Smooth-scroll first section header into view (offset controlled by scroll-margin-top in CSS)
    requestAnimationFrame(() => {
      form.querySelector('.embed-h3')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });

    // Pre-fill from locations.json
    const set = (name, val) => {
      const el = form.elements[name];
      if (el && val != null && val !== '') el.value = val;
    };
    set('name',          loc.name);
    set('city',          loc.loc?.city);
    set('plz',           loc.loc?.plz);
    set('street_name',   loc.loc?.street?.name);
    set('street_number', loc.loc?.street?.number);
    set('street_ext',    loc.loc?.street?.ext);
    set('lat',           loc.loc?.lat);
    set('long',          loc.loc?.long);
    form.querySelector('input[name="lat"]').dispatchEvent(new Event('blur'));
    set('url',           loc.link?.url);
    set('url_text',      loc.link?.text);
    if (loc.style)        form.elements['style'].value   = loc.style;
    if (loc.loc?.country) form.elements['country'].value = loc.loc.country;

    submitBtn.textContent = t('submitCorrectionBtn', 'Submit correction');

    // Pre-fill from loc-enrichment.json
    const enrichment = await fetchEnrichment();
    if (enrichment === false) {
      workshopsAvailable = false;
      enrichWarn.hidden  = false;
      return;
    }
    workshopsAvailable = true;
    enrichWarn.hidden  = true;
    const enr = enrichment[String(loc.ID)] || {};

    const active = new Set(enr.workshops || []);
    form.querySelectorAll('input[name="workshop"]').forEach(cb => {
      const key = WORKSHOPS.find(([label]) => label === cb.value)?.[1];
      cb.checked = key ? active.has(key) : false;
    });

    const weekdayName = WEEKDAY_NAMES[enr.weekly?.weekday];
    if (weekdayName) form.elements['weekly_weekday'].value = weekdayName;
    if (enr.weekly?.time) set('weekly_time', enr.weekly.time);
    if (enr.spaceapi?.endpoint) set('spaceapi', enr.spaceapi.endpoint);
    if (enr.events)             set('events_url', enr.events);

    // Capture snapshot of all pre-filled values for diff on submit
    const snap = {};
    ['name','city','plz','street_name','street_number','street_ext','lat','long',
     'url','url_text','style','country','weekly_weekday','weekly_time','spaceapi','events_url'
    ].forEach(n => { snap[n] = (form.elements[n]?.value || '').trim(); });
    snap._workshops = [...form.querySelectorAll('input[name="workshop"]:checked')].map(el => el.value).sort().join(',');
    originalSnapshot = snap;
  }

  function resetLookup() {
    selectedSpace        = null;
    workshopsAvailable   = true;
    originalSnapshot     = null;
    lookupInput.value    = '';
    lookupResults.hidden = true;
    editBtn.textContent  = t('editBtn', 'edit');
    editBtn.hidden       = true;
    enrichWarn.hidden    = true;
    submitBtn.textContent = t('submitBtn', 'Submit to maintainers');
    form.hidden = false;
    locationMap?.invalidate();
    form.reset();
  }

  editBtn.addEventListener('click', prefillAndEdit);

  lookupInput.addEventListener('input', () => {
    if (selectedSpace) { selectedSpace = null; editBtn.hidden = true; }
    renderResults(searchSpaces(lookupInput.value));
  });

  lookupInput.addEventListener('focus', () => {
    lookupInput.select();
    renderResults(searchSpaces(''));
  });

  lookupInput.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (lookupResults.hidden) renderResults(searchSpaces(''));
      setHighlight(highlightedIndex + 1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (!lookupResults.hidden) setHighlight(highlightedIndex - 1);
    } else if (e.key === 'Enter' && highlightedIndex >= 0) {
      e.preventDefault();
      const items = [...lookupResults.querySelectorAll('.addspace-lookup-item')];
      if (items[highlightedIndex]?._loc) selectSpace(items[highlightedIndex]._loc);
    } else if (e.key === 'Escape') {
      lookupResults.hidden = true;
      highlightedIndex = -1;
    }
  });

  lookupInput.addEventListener('blur', () => {
    setTimeout(() => { lookupResults.hidden = true; }, 150);
  });

  // ── Location preview map ──
  const locationMap = initLocationMap(overlay);
  initStreetAutocomplete(overlay);

  // ── Form submit ──
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    await handleSubmit(e.target, loadTime, overlay, selectedSpace, workshopsAvailable, originalSnapshot);
  });
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
