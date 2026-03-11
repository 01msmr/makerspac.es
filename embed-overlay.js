// embed-overlay.js — Unified overlay: Add Space + Embed guide

const GITHUB_REPO = '01msmr/makerspac.es';

const COUNTRIES    = ['Germany', 'Austria', 'Switzerland', 'Netherlands', 'Belgium', 'Denmark', 'Ukraine', 'other'];
const STYLES       = ['for all', 'for youth', 'for students', 'commercial'];
const WEEKDAYS     = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
// Indexed by weekday number (Sunday=0 … Saturday=6), matches loc-enrichment.json convention
const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
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
    if (e.key === 'Escape') {
      document.querySelector('.embed-overlay')?.remove();
      document.body.style.overflow = '';
    }
  });
}

// ─── HTML helpers ─────────────────────────────────────────────────────────────

function esc(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

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

function searchSpaces(query) {
  const locs = window.locationById ? [...window.locationById.values()] : [];
  const q = query.trim().toLowerCase();
  // Empty → full list sorted alphabetically by name
  if (!q) return [...locs].sort((a, b) =>
    (a.name || '').localeCompare(b.name || '')
  );
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

// ─── Overlay ───────────────────────────────────────────────────────────────────

function showOverlay() {
  if (document.querySelector('.embed-overlay')) return;

  const overlay = document.createElement('div');
  overlay.className = 'embed-overlay';
  overlay.innerHTML = `
    <div class="embed-modal">
      <div class="embed-modal-header">
        <div class="embed-modal-header-text">
          <h2>📍 makerspac.es</h2>
          <div class="embed-tabs">
            <button class="embed-tab active" data-tab="addspace"><i class="fas fa-square-plus"></i> ${t('title', 'add your makerspace')}</button>
            <button class="embed-tab" data-tab="embed"><i class="fas fa-code"></i> ${t('embed', 'embed into your site')}</button>
          </div>
          <p class="embed-tab-intro" data-tab="addspace">${t('tabIntro', 'Submit your makerspace to the map. A maintainer will review and publish it.')}</p>
          <p class="embed-tab-intro" data-tab="embed" hidden>Show your <b>position</b>, your makerspace-<b>status</b> (open/closed) and connect with <b>friendly spaces of yours</b>.</p>
        </div>
        <button class="embed-close-btn" aria-label="Close"><i class="fas fa-times"></i></button>
      </div>
      <hr class="embed-modal-divider">
      <div class="embed-modal-scroll">

        <!-- ── Tab: Add Space ── -->
        <div class="embed-tab-panel" data-tab="addspace">

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
                ${t('editToggle', 'edit existing makerspace')}
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
                <input type="text" name="city" class="addspace-input" required>
              </div>
            </div>

            <div class="addspace-row">
              <div>
                <label class="addspace-label">${t('labelStreet', 'Street')} <span class="embed-pill embed-pill-required">${t('required', 'required')}</span></label>
                <input type="text" name="street_name" class="addspace-input" required>
              </div>
              <div class="addspace-col-narrow">
                <label class="addspace-label">${t('labelStreetNr', 'Nr.')} <span class="embed-pill embed-pill-required">${t('required', 'required')}</span></label>
                <input type="text" name="street_number" class="addspace-input" required>
              </div>
              <div class="addspace-col-narrow">
                <label class="addspace-label">${t('labelPostalCode', 'Postal code')} <span class="embed-pill embed-pill-required">${t('required', 'required')}</span></label>
                <input type="text" name="plz" class="addspace-input" required>
              </div>
            </div>

            <label class="addspace-label">${t('labelAddressAddition', 'Address addition')}</label>
            <input type="text" name="street_ext" class="addspace-input" placeholder="${t('addressAdditionPlaceholder', 'e.g. Apt. 2, Building B')}">

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
                  ${opt(WEEKDAYS)}
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
            <pre class="embed-snippet">${esc(snippet440)}</pre>
            <button class="embed-copy-btn">copy</button>
          </div>

          <h4 class="embed-h4">b) 640 px — with minimap</h4>
          <div class="embed-code-block">
            <pre class="embed-snippet">${esc(snippet640)}</pre>
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
            <pre class="embed-snippet">${esc(snippetDiv)}</pre>
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

  // ── Close ──
  const close = () => { overlay.remove(); document.body.style.overflow = ''; };
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
  overlay.querySelector('.embed-close-btn').addEventListener('click', close);

  // Block keydown events from reaching main-site document handlers (bubble phase, fires after our own handlers)
  overlay.addEventListener('keydown', (e) => { e.stopPropagation(); });

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
    overlay.querySelectorAll('.embed-tab-intro').forEach(
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
    editBtn.textContent  = `${t('editBtn', 'edit')} ID ${loc.ID} — ${loc.name}`;
    editBtn.hidden       = false;
  }

  async function prefillAndEdit() {
    if (!selectedSpace) return;
    const loc = selectedSpace;

    // Show form
    form.hidden = false;
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
  }

  function resetLookup() {
    selectedSpace        = null;
    workshopsAvailable   = true;
    lookupInput.value    = '';
    lookupResults.hidden = true;
    editBtn.textContent  = t('editBtn', 'edit');
    editBtn.hidden       = true;
    enrichWarn.hidden    = true;
    submitBtn.textContent = t('submitBtn', 'Submit to maintainers');
    form.hidden = false;
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

  // ── Form submit ──
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    await handleSubmit(e.target, loadTime, overlay, selectedSpace, workshopsAvailable);
  });
}

// ─── Form: build GitHub issue body ────────────────────────────────────────────

function buildIssueBody(form, selectedSpace, workshopsAvailable) {
  const g = name => (form.elements[name]?.value || '').trim();
  const checked = [...form.querySelectorAll('input[name="workshop"]:checked')].map(el => el.value);

  const workshopBlock = WORKSHOPS
    .map(([label]) => `- [${checked.includes(label) ? 'x' : ' '}] ${label}`)
    .join('\n');

  return [
    selectedSpace ? `### Existing ID\n\n${selectedSpace.ID}` : null,
    `### Name\n\n${g('name')}`,
    `### Country\n\n${g('country')}`,
    `### City\n\n${g('city')}`,
    `### Postal code\n\n${g('plz')}`,
    `### Street\n\n${g('street_name')}`,
    `### Street number\n\n${g('street_number')}`,
    `### Address addition\n\n${g('street_ext') || '_No response_'}`,
    `### Latitude\n\n${g('lat')}`,
    `### Longitude\n\n${g('long')}`,
    `### Style\n\n${g('style')}`,
    `### Workshop types (optional)\n\n${workshopsAvailable ? workshopBlock : '_No response_'}`,
    `### Workshops submitted\n\n${workshopsAvailable ? 'yes' : 'no'}`,
    `### Website (URL)\n\n${g('url')}`,
    `### Link display text\n\n${g('url_text')}`,
    `### Weekly open day (optional)\n\n${g('weekly_weekday') || '_No response_'}`,
    `### Weekly open time (optional)\n\n${g('weekly_time') || '_No response_'}`,
    `### SpaceAPI Endpoint (optional)\n\n${g('spaceapi') || '_No response_'}`,
    `### Event calendar URL (optional)\n\n${g('events_url') || '_No response_'}`,
  ].filter(Boolean).join('\n\n');
}

// ─── Form: submit ─────────────────────────────────────────────────────────────

async function handleSubmit(form, loadTime, overlay, selectedSpace = null, workshopsAvailable = true) {
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

  submitBtn.disabled   = true;
  statusEl.textContent = t('statusSubmitting', 'Submitting…');

  const isUpdate = !!selectedSpace;
  const title    = isUpdate
    ? `update makerspace: ${name} (ID ${selectedSpace.ID})`
    : `neuer Makerspace: ${name}`;
  const labels   = isUpdate ? ['update-space'] : ['space-pending'];
  const body     = buildIssueBody(form, selectedSpace, workshopsAvailable);

  async function postIssue(withLabels) {
    return fetch(`https://api.github.com/repos/${GITHUB_REPO}/issues`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/vnd.github+json' },
      body:    JSON.stringify({ title, body, ...(withLabels ? { labels } : {}) }),
    });
  }

  try {
    let res = await postIssue(true);

    // 422 = label doesn't exist yet in the repo — retry without labels
    if (res.status === 422) res = await postIssue(false);

    if (res.status === 201) {
      const issue = await res.json();
      const action = isUpdate
        ? t('statusCorrectionSuccess', 'Correction submitted')
        : t('statusSuccess', 'Submitted');
      statusEl.innerHTML = `✅ ${action}! <a href="${issue.html_url}" target="_blank">${t('statusViewIssue', 'View issue')} #${issue.number}</a>`;
      submitBtn.disabled = false;
    } else if (res.status === 403 || res.status === 429) {
      statusEl.textContent = t('statusRateLimit', 'Rate limit reached — please try again in an hour.');
      submitBtn.disabled   = false;
    } else {
      statusEl.textContent = `Error ${res.status} — please try again.`;
      submitBtn.disabled   = false;
    }
  } catch {
    statusEl.textContent = t('statusNetworkError', 'Network error — please check your connection.');
    submitBtn.disabled   = false;
  }
}
