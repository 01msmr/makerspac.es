// embed-overlay.js — In-page overlay for the embed guide (replaces embed-demo.html)

export function initEmbedOverlay() {
  const btn = document.querySelector('.tool-embed');
  if (!btn) return;

  btn.addEventListener('click', (e) => {
    e.preventDefault();
    showEmbedOverlay();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      document.querySelector('.embed-overlay')?.remove();
      document.body.style.overflow = '';
    }
  });
}

function esc(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function showEmbedOverlay() {
  if (document.querySelector('.embed-overlay')) return;

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

  const overlay = document.createElement('div');
  overlay.className = 'embed-overlay';
  overlay.innerHTML = `
    <div class="embed-modal">
      <div class="embed-modal-header">
        <div class="embed-modal-header-text">
          <h2>📍 makerspac.es embed guide</h2>
          <p class="embed-intro">Show your <b>position</b>, your makerspace-<b>status</b> (open/closed) and connect with <b>friendly spaces of yours</b>.</p>
        </div>
        <button class="embed-close-btn" aria-label="Close"><i class="fas fa-times"></i></button>
      </div>
      <hr class="embed-modal-divider">
      <div class="embed-modal-scroll">

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
      <p>Copy one of the following snippets and insert it on your website where you want the map
        to appear. This does not interfere with your page's CSS.</p>

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
        <thead>
          <tr><th>parameter</th><th>description</th><th>example</th></tr>
        </thead>
        <tbody>
          <tr>
            <td><code>url</code> <span class="embed-pill embed-pill-required">required</span></td>
            <td>URL of the iframe embed page</td>
            <td><code>src=https://makerspac.es/embed.html</code></td>
          </tr>
          <tr>
            <td><code>id</code> <span class="embed-pill embed-pill-required">required</span></td>
            <td>The ID of your makerspace (get it from your space's marker popup).</td>
            <td><code>id=1</code></td>
          </tr>
          <tr>
            <td><code>friends</code> <span class="embed-pill">optional</span></td>
            <td>IDs of friendly makerspaces, comma-separated. They appear on the left below your space.</td>
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
        On the makerspac.es homepage, search for your makerspace and click on the pin.
        You will find the ID when you hover over the coloured link in the popup.</p>
      <p><strong>What are those friends?</strong><br>
        Search for the IDs of your friends' makerspaces to add them to the embedded map.
        Example: <code>&amp;friends=x,y,z</code></p>
      <p><strong>What happens when my space is closed?</strong><br>
        When you use the SpaceAPI, the marker automatically turns red and the sidebar
        displays "closed."</p>
      </div><!-- /.embed-modal-scroll -->
      <div class="embed-modal-footer"></div>
    </div>`;

  document.body.appendChild(overlay);
  document.body.style.overflow = 'hidden';

  const close = () => {
    overlay.remove();
    document.body.style.overflow = '';
  };

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close();
  });

  overlay.querySelector('.embed-close-btn').addEventListener('click', close);

  const header = overlay.querySelector('.embed-modal-header');
  const scrollEl = overlay.querySelector('.embed-modal-scroll');

  scrollEl.addEventListener('scroll', () => {
    header.classList.toggle('scrolled', scrollEl.scrollTop >= 100);
  }, { passive: true });

  const forwardWheel = (e) => {
    scrollEl.scrollTop += e.deltaY;
    e.preventDefault();
  };

  header.addEventListener('wheel', forwardWheel, { passive: false });
  overlay.querySelector('.embed-modal-footer').addEventListener('wheel', forwardWheel, { passive: false });

  overlay.querySelectorAll('.embed-copy-btn').forEach((btn, i) => {
    const snippets = [snippet440, snippet640, snippetDiv];
    btn.addEventListener('click', () => {
      navigator.clipboard.writeText(snippets[i]);
      btn.textContent = 'copied!';
      setTimeout(() => { btn.textContent = 'copy'; }, 2500);
    });
  });
}
