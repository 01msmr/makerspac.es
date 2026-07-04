(function () {
  const s = document.currentScript;
  const id = s.getAttribute('data-id');
  if (!id) return;

  const p = new URLSearchParams({ id });
  const friends = s.getAttribute('data-friends');
  const lang    = s.getAttribute('data-lang');
  const country = s.getAttribute('data-country');
  if (friends) p.set('friends', friends);
  if (lang)    p.set('lang', lang);
  if (country) p.set('country', country);

  const f = document.createElement('iframe');
  f.src   = 'https://makerspac.es/embed.html?' + p;
  f.width = '100%';
  f.height = s.getAttribute('data-height') || '440';
  f.style.cssText = 'border:none;border-radius:10px;display:block';
  f.title = 'Makerspace-Karte';
  s.replaceWith(f);
})();
