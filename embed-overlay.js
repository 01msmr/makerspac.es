// embed-overlay.js — Unified overlay: Add Space + Embed guide

import { WEEKDAY_NAMES } from './date-utils.js';
import AppConfig from './config.js';
import { fetchEnrichment, searchSpaces, initLocationMap, initStreetAutocomplete, handleSubmit, WORKSHOPS } from './add-space-form.js';

const COUNTRIES    = ['Germany', 'Austria', 'Switzerland', 'Netherlands', 'Belgium', 'Denmark', 'Ukraine', 'other'];
const STYLES       = ['for all', 'for youth', 'for students', 'commercial'];
const WEEKDAYS     = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

// i18n shorthands
const t  = (key, fb) => window.i18n?.t(`addMakerspace.${key}`) ?? fb;  // addMakerspace namespace
const ti = (key, fb) => window.i18n?.t(key) ?? fb;                      // full key path

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

