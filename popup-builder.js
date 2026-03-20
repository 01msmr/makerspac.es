// @ts-check
// popup-builder.js — Shared marker popup HTML builder (main map + embed)

/** @typedef {import('./types.js').MakerSpace} MakerSpace */

import AppConfig from './config.js';

const styleTranslationMap = {
  'for all':              'style.forAll',
  'for students':         'style.forStudents',
  'for youth':            'style.forYouth',
  'for students & youth': 'style.forStudents',
  'commercial':           'style.commercial'
};

/**
 * Build the Leaflet popup HTML for a makerspace marker.
 * @param {MakerSpace} location
 * @param {{ bookmarkManager?: { createBookmarkIcon: (id: number, cls: string) => string } | null }} [opts]
 * @returns {string}
 */
export function buildPopupHTML(location, opts = {}) {
  const { bookmarkManager = null } = opts;
  const t = (key) => window.i18n ? window.i18n.t(key) : '';

  let statusIconHtml = '';
  let nameClass = '';
  let statusColor = 'var(--space-hover)';

  if (location.isOpen === true) {
    statusColor = 'var(--space-open)';
    statusIconHtml = `<span aria-label="${t('tooltips.spaceOpen')}" role="tooltip" data-microtip-position="bottom"><i class="fas fa-door-open"></i></span> `;
    nameClass = 'space-open';
  } else if (location.isOpen === false) {
    statusColor = 'var(--space-closed)';
    statusIconHtml = `<span aria-label="${t('tooltips.spaceClosed')}" role="tooltip" data-microtip-position="bottom"><i class="fas fa-lock"></i></span> `;
    nameClass = 'space-closed';
  } else if (location.spaceapi && location.spaceapi.endpoint) {
    statusColor = 'var(--space-unknown)';
    const tipLabel = location.statusMessage || t('tooltips.spaceStatusLoading');
    const tipPos   = location.statusMessage ? 'top-right' : 'bottom';
    statusIconHtml = `<span aria-label="${tipLabel}" role="tooltip" data-microtip-position="${tipPos}"><i class="fas fa-question-circle"></i></span> `;
    nameClass = 'space-unknown';
  }

  const locationStyle  = location.style ? location.style.toLowerCase() : '';
  const styleIconClass = AppConfig.getStyleIcon(locationStyle);
  let styleIconHtml = '';
  if (styleIconClass) {
    const translatedStyle = t(styleTranslationMap[locationStyle]) || location.style;
    styleIconHtml = `<span aria-label="${translatedStyle}" role="tooltip" data-microtip-position="top"><i class="${styleIconClass}"></i></span>`;
  }

  const kw = AppConfig.getSortedWorkshops(location.workshops);
  const workshopsHtml = kw.length > 0
    ? `<div></div><div class="popup-workshops" aria-label="${AppConfig.getWorkshopsTooltip(kw)}" role="tooltip" data-microtip-position="top">${kw.map(w => `<i class="${AppConfig.getWorkshopIcon(w)}"></i>`).join('')}</div>`
    : '';

  const _t          = t;
  const _hasWeekly  = location.weekly && location.weekly.time && location.weekly.weekday <= 6;
  let weeklyHtml = '';
  if (_hasWeekly) {
    const _isToday  = location.weekly.weekday === new Date().getDay();
    const _timeStr  = String(location.weekly.time).padStart(4, '0').replace(/(\d{2})(\d{2})/, '$1:$2');
    const _suf      = _t('weekly.timeSuffix');
    const _label    = _isToday ? _t('weekly.today') : _t('weekdaysShort.' + location.weekly.weekday);
    const _evLabel  = _t('weekly.eventsCalendar');
    const _weeklyText = `${_label} — ${_timeStr}${_suf}`;
    if (location.events) {
      weeklyHtml = `<div></div><div class="popup-weekly"><a href="${location.events}" target="_blank" class="popup-events-link" aria-label="${_evLabel}" role="tooltip" data-microtip-position="bottom-right"><i class="fas fa-calendar-day"></i> ${_weeklyText}</a></div>`;
    } else {
      weeklyHtml = `<div></div><div class="popup-weekly" aria-label="${_t('weekly.tooltip')}" role="tooltip" data-microtip-position="bottom"><i class="fas fa-calendar-day"></i> ${_weeklyText}</div>`;
    }
  } else if (location.events) {
    const _evLabel = _t('weekly.eventsCalendar');
    weeklyHtml = `<div></div><div class="popup-weekly"><a href="${location.events}" target="_blank" class="popup-events-line"><i class="fas fa-calendar-day"></i> ${_evLabel}</a></div>`;
  }

  const streetName     = location.loc?.street?.name   || '';
  const streetNumber   = location.loc?.street?.number || '';
  const streetExt      = location.loc?.street?.ext    || '';
  const linkUrl        = location.link?.url  || '#';
  const linkText       = location.link?.text || linkUrl;
  const countryName    = location.loc?.country || '';
  const translatedCtry = t(`countries.${countryName}`);
  const bookmarkIcon   = bookmarkManager
    ? bookmarkManager.createBookmarkIcon(location.ID, 'popup-bookmark')
    : '';

  return `
    <div style="--status-color: ${statusColor};">
      <div class="popup-body-grid">
        ${workshopsHtml}
        <div class="popup-style-cell">${styleIconHtml}</div>
        <div class="popup-title-row">
          <a id="titleurl" href="${linkUrl}" target="_blank">
            <h3 class="${nameClass}" data-id="${location.ID}">
              ${statusIconHtml}${location.name || 'Unnamed Space'}
            </h3>
          </a>
          ${bookmarkIcon}
        </div>
        ${weeklyHtml}
      </div>
      <a href="#" class="popup-street-line navigation-icon" aria-label="Route zu ${location.name || ''}" role="tooltip" data-microtip-position="bottom">
        <i></i>
        <div class="popup-address-lines">
          <div>${streetName} ${streetNumber}<span class="streetext">${streetExt}</span></div>
          <div>${AppConfig.zfill(location.loc?.plz || '', countryName)} <b>${location.loc?.city || ''}</b></div>
          <div><span class="fi fi-${AppConfig.getCountryCode(countryName)}"></span> ${translatedCtry}</div>
        </div>
      </a>
      <a id="url" href="${linkUrl}" target="_blank"><b>${linkText}</b></a>
    `;
}
