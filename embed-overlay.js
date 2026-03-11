// embed-overlay.js — Unified overlay: Add Space + Embed guide

const GITHUB_REPO = '01msmr/makerspac.es';

const COUNTRIES = ['Germany', 'Austria', 'Switzerland', 'Netherlands', 'Belgium', 'Denmark', 'Ukraine', 'other'];
const STYLES    = ['for all', 'for youth', 'for students', 'commercial'];
const WEEKDAYS  = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const WORKSHOPS = [
  ['3D printing', '3d'],  ['Laser cutting', 'laser'], ['CNC', 'cnc'],
  ['Electronics', 'electronics'], ['Coding', 'coding'], ['VR', 'vr'],
  ['Music', 'music'],     ['Photography', 'photo'],
  ['Woodworking', 'wood'], ['Metalworking', 'metal'], ['Bike repair', 'bike'],
  ['Textile', 'textile'], ['Screen printing', 'screenprint'], ['Ceramics', 'ceramics'],
];

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
  return values.map(v => `<option${v === selected ? ' selected' : ''}>${v}</option>`).join('');
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
            <button class="embed-tab active" data-tab="addspace"><i class="fas fa-square-plus"></i> ${window.i18n ? window.i18n.t('addMakerspace.title') : 'add your makerspace'}</button>
            <button class="embed-tab" data-tab="embed"><i class="fas fa-code"></i> ${window.i18n ? window.i18n.t('addMakerspace.embed') : 'embed into your site'}</button>
          </div>
          <p class="embed-tab-intro" data-tab="addspace">Submit your makerspace to the map. A maintainer will review and publish it.</p>
          <p class="embed-tab-intro" data-tab="embed" hidden>Show your <b>position</b>, your makerspace-<b>status</b> (open/closed) and connect with <b>friendly spaces of yours</b>.</p>
        </div>
        <button class="embed-close-btn" aria-label="Close"><i class="fas fa-times"></i></button>
      </div>
      <hr class="embed-modal-divider">
      <div class="embed-modal-scroll">

        <!-- ── Tab: Add Space ── -->
        <div class="embed-tab-panel" data-tab="addspace">
          <form class="addspace-form" novalidate>
            <!-- Honeypot: bots fill this, humans don't -->
            <input name="hp_url" autocomplete="off" tabindex="-1" aria-hidden="true"
                   style="position:absolute;left:-9999px;opacity:0;height:0;pointer-events:none">

            <h3 class="embed-h3">Space info</h3>

            <label class="addspace-label">Name <span class="embed-pill embed-pill-required">required</span></label>
            <input type="text" name="name" class="addspace-input" required placeholder="Your Makerspace Name">

            <label class="addspace-label">Style <span class="embed-pill embed-pill-required">required</span></label>
            <select name="style" class="addspace-input">${opt(STYLES)}</select>

            <label class="addspace-label">Website <span class="embed-pill embed-pill-required">required</span></label>
            <input type="url" name="url" class="addspace-input" required placeholder="https://yourspace.org">

            <label class="addspace-label">Link display text <span class="embed-pill embed-pill-required">required</span></label>
            <input type="text" name="url_text" class="addspace-input" required placeholder="yourspace.org">

            <h3 class="embed-h3">Location</h3>

            <div class="addspace-row">
              <div>
                <label class="addspace-label">Country <span class="embed-pill embed-pill-required">required</span></label>
                <select name="country" class="addspace-input">${opt(COUNTRIES)}</select>
              </div>
              <div>
                <label class="addspace-label">City <span class="embed-pill embed-pill-required">required</span></label>
                <input type="text" name="city" class="addspace-input" required>
              </div>
            </div>

            <div class="addspace-row">
              <div>
                <label class="addspace-label">Street <span class="embed-pill embed-pill-required">required</span></label>
                <input type="text" name="street_name" class="addspace-input" required>
              </div>
              <div class="addspace-col-narrow">
                <label class="addspace-label">Nr. <span class="embed-pill embed-pill-required">required</span></label>
                <input type="text" name="street_number" class="addspace-input" required>
              </div>
              <div class="addspace-col-narrow">
                <label class="addspace-label">Postal code <span class="embed-pill embed-pill-required">required</span></label>
                <input type="text" name="plz" class="addspace-input" required>
              </div>
            </div>

            <label class="addspace-label">Address addition</label>
            <input type="text" name="street_ext" class="addspace-input" placeholder="e.g. Apt. 2, Building B">

            <div class="addspace-row">
              <div>
                <label class="addspace-label">Latitude <span class="embed-pill embed-pill-required">required</span></label>
                <input type="text" name="lat" class="addspace-input" required placeholder="47.7126816">
              </div>
              <div>
                <label class="addspace-label">Longitude <span class="embed-pill embed-pill-required">required</span></label>
                <input type="text" name="long" class="addspace-input" required placeholder="9.3995537">
              </div>
            </div>

            <h3 class="embed-h3">Workshops <span class="embed-pill">optional</span></h3>
            <div class="addspace-checkboxes">
              ${WORKSHOPS.map(([label]) => `
                <label class="addspace-checkbox-label">
                  <input type="checkbox" name="workshop" value="${label}"> ${label}
                </label>`).join('')}
            </div>

            <h3 class="embed-h3">Regular meeting <span class="embed-pill">optional</span></h3>
            <div class="addspace-row">
              <div>
                <label class="addspace-label">Weekday</label>
                <select name="weekly_weekday" class="addspace-input">
                  <option value="">— none —</option>
                  ${opt(WEEKDAYS)}
                </select>
              </div>
              <div>
                <label class="addspace-label">Time</label>
                <input type="text" name="weekly_time" class="addspace-input" placeholder="1900">
              </div>
            </div>

            <h3 class="embed-h3">Online presence <span class="embed-pill">optional</span></h3>

            <label class="addspace-label">SpaceAPI Endpoint</label>
            <input type="url" name="spaceapi" class="addspace-input" placeholder="https://yourspace.org/spaceapi.json">

            <label class="addspace-label">Event calendar URL</label>
            <input type="url" name="events_url" class="addspace-input" placeholder="https://yourspace.org/events/">

            <div class="addspace-submit-row">
              <button type="submit" class="addspace-submit-btn">Submit to maintainers</button>
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

  // ── Form submit (addspace tab) ──
  overlay.querySelector('.addspace-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    await handleSubmit(e.target, loadTime, overlay);
  });
}

// ─── Form: build GitHub issue body ────────────────────────────────────────────

function buildIssueBody(form) {
  const g = name => (form.elements[name]?.value || '').trim();
  const checked = [...form.querySelectorAll('input[name="workshop"]:checked')].map(el => el.value);

  const workshopBlock = WORKSHOPS
    .map(([label]) => `- [${checked.includes(label) ? 'x' : ' '}] ${label}`)
    .join('\n');

  return [
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
    `### Workshop types (optional)\n\n${workshopBlock}`,
    `### Website (URL)\n\n${g('url')}`,
    `### Link display text\n\n${g('url_text')}`,
    `### Weekly open day (optional)\n\n${g('weekly_weekday') || '_No response_'}`,
    `### Weekly open time (optional)\n\n${g('weekly_time') || '_No response_'}`,
    `### SpaceAPI Endpoint (optional)\n\n${g('spaceapi') || '_No response_'}`,
    `### Event calendar URL (optional)\n\n${g('events_url') || '_No response_'}`,
  ].join('\n\n');
}

// ─── Form: submit ─────────────────────────────────────────────────────────────

async function handleSubmit(form, loadTime, overlay) {
  const statusEl  = overlay.querySelector('.addspace-status');
  const submitBtn = overlay.querySelector('.addspace-submit-btn');

  // Honeypot
  if (form.elements['hp_url'].value !== '') return;

  // Timing
  if (Date.now() - loadTime < 3000) {
    statusEl.textContent = 'Please take a moment to fill in the form completely.';
    return;
  }

  // Required fields
  const name = form.elements['name'].value.trim();
  const lat  = form.elements['lat'].value.trim();
  const long = form.elements['long'].value.trim();
  const url  = form.elements['url'].value.trim();
  if (!name || !lat || !long || !url) {
    statusEl.textContent = 'Please fill in all required fields.';
    return;
  }

  submitBtn.disabled  = true;
  statusEl.textContent = 'Submitting…';

  try {
    const res = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/issues`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/vnd.github+json' },
      body:    JSON.stringify({
        title:  `neuer Makerspace: ${name}`,
        body:   buildIssueBody(form),
        labels: ['space-pending'],
      }),
    });

    if (res.status === 201) {
      const issue = await res.json();
      statusEl.innerHTML = `✅ Submitted! <a href="${issue.html_url}" target="_blank">View issue #${issue.number}</a>`;
      submitBtn.disabled = false;
    } else if (res.status === 403 || res.status === 429) {
      statusEl.textContent = 'Rate limit reached — please try again in an hour.';
      submitBtn.disabled   = false;
    } else if (res.status === 422) {
      // Label "space-pending" doesn't exist yet — submit without label
      const res2 = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/issues`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/vnd.github+json' },
        body:    JSON.stringify({ title: `neuer Makerspace: ${name}`, body: buildIssueBody(form) }),
      });
      if (res2.status === 201) {
        const issue = await res2.json();
        statusEl.innerHTML = `✅ Submitted! <a href="${issue.html_url}" target="_blank">View issue #${issue.number}</a>`;
        submitBtn.disabled = false;
      } else {
        statusEl.textContent = `Error ${res2.status}. Please try again.`;
        submitBtn.disabled   = false;
      }
    } else {
      statusEl.textContent = `Error ${res.status} — please try again.`;
      submitBtn.disabled   = false;
    }
  } catch {
    statusEl.textContent = 'Network error — please check your connection.';
    submitBtn.disabled   = false;
  }
}
