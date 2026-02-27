// utils.js - Gemeinsame Hilfsfunktionen

export const Utils = {
  // PLZ-Formatierung
  zfill(plz, country) {
    const expectedLengths = {
      Germany: 5,
      Austria: 4,
      Switzerland: 4,
      Poland: 5,
      USA: 5,
      Italy: 5,
      Spain: 5,
      France: 5,
      Luxemburg: 4,
      Netherlands: 4
    };
    let plzStr = String(plz);
    let expectedLength = expectedLengths[country] || plzStr.length;
    return plzStr.padStart(expectedLength, "0");
  },

  // Strikte Nord-Süd Sortierung
  sortLocationsByGeography(locations) {
    return locations.sort((a, b) => {
      // Nur nach Breitengrad sortieren: Nord → Süd
      // Höhere latitude-Werte (nördlicher) kommen zuerst
      return b.loc.lat - a.loc.lat;
    });
  },

  // Debounce Funktion
  debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
      const later = () => {
        clearTimeout(timeout);
        func(...args);
      };
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
    };
  },

  // Event Listener Helper
  addEventListenerSafe(element, event, handler) {
    if (element && typeof element.addEventListener === 'function') {
      element.addEventListener(event, handler);
      return true;
    }
    return false;
  },

  // DOM Helper
  createElement(tag, className, innerHTML) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (innerHTML) element.innerHTML = innerHTML;
    return element;
  },

  // Popup HTML Generator
  generatePopupHTML(location) {
    return `
      <h3 id="style">${location.style}</h3>
      <a id="titleurl" href="${location.link.url}" target="_blank">
        <h3>${location.name}</h3><br><br>
      </a>
      ${location.loc.street.name} ${location.loc.street.number}
      <span id="streetext">${location.loc.street.ext}</span><br>
      <b>${this.zfill(location.loc.plz, location.loc.country)} ${location.loc.city}</b><br>
      ${location.loc.country}<br>
      <a id="url" href="${location.link.url}" target="_blank">
        <b>${location.link.text}</b>
      </a>
    `;
  }
};