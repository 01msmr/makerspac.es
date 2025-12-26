// icons.js - Alle Icon-Definitionen als SVG

// 1. STATISCHE FARBDEFINITIONEN (Kanonische Werte für JS-Icons)
const ICON_COLOURS = {
  DEFAULT: '#2c2c2c',
  HIGHLIGHT: '#2c2c2c',
  OPEN: '#009900',
  CLOSED: '#DD0000',
  UNKNOWN: '#FF8C00',
  DARK_MODE_DEFAULT: '#666666',

  // Akzentfarben für dynamische Elemente (Hover/Line)
  HOVER_LIGHT: '#0000ff',
  HOVER_DARK: '#66b3ff'
};

// KORREKTUR: MACHEN IC GLOBAL VERFÜGBAR
window.IC = ICON_COLOURS;
const IC = window.IC; // Lokale Konstante für den Rest des Skripts

// Helper Funktion zur Bestimmung der aktuellen Farbe für das Default-Icon
function getDefaultIconColor() {
  const isDarkMode = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  return isDarkMode ? IC.DARK_MODE_DEFAULT : IC.DEFAULT;
}

// 2. HILFSFUNKTION FÜR DYNAMISCHE FARBABRUF (wird von search.js verwendet)
window.getDynamicSpaceColor = function (location) {
  const isDarkMode = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;

  if (location && location.spaceapi && location.spaceapi.endpoint) {
    if (location.isOpen === true) {
      return window.IC.OPEN; // KORREKTUR: Zugriff über window.IC
    } else if (location.isOpen === false) {
      return window.IC.CLOSED; // KORREKTUR: Zugriff über window.IC
    } else {
      return window.IC.UNKNOWN; // KORREKTUR: Zugriff über window.IC
    }
  } else {
    // Standard Akzentfarbe (Hover/Line)
    return isDarkMode ? window.IC.HOVER_DARK : window.IC.HOVER_LIGHT; // KORREKTUR: Zugriff über window.IC
  }
};


window.MapIcons = {
  // Standard dunkelgraues/schwarzes Icon (Dark Mode aware)
  defaultIcon: new L.Icon({
    iconUrl: 'data:image/svg+xml;base64,' + btoa(`
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 25 41">
        <path fill="${getDefaultIconColor()}" stroke="#000" stroke-width="1" d="M12.5,1 C6.16,1 1,6.16 1,12.5 C1,20.88 12.5,39 12.5,39 C12.5,39 24,20.88 24,12.5 C24,6.16 18.84,1 12.5,1 Z"/>
        <circle fill="#fff" cx="12.5" cy="12.5" r="3"/>
      </svg>
    `),
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
    shadowSize: [41, 41]
  }),

  // Schwarzes/Graues Icon (Dark Mode aware)
  highlightIcon: new L.Icon({
    iconUrl: 'data:image/svg+xml;base64,' + btoa(`
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 25 41">
        <path fill="${getDefaultIconColor()}" stroke="#000" stroke-width="1" d="M12.5,1 C6.16,1 1,6.16 1,12.5 C1,20.88 12.5,39 12.5,39 C12.5,39 24,20.88 24,12.5 C24,6.16 18.84,1 12.5,1 Z"/>
        <circle fill="#fff" cx="12.5" cy="12.5" r="3"/>
      </svg>
    `),
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
    shadowSize: [41, 41]
  }),

  // Blaues Hover-Icon (statisch)
  hoverIcon: new L.Icon({
    iconUrl: 'data:image/svg+xml;base64,' + btoa(`
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 25 41">
        <path fill="${IC.HOVER_LIGHT}" stroke="#000" stroke-width="1" d="M12.5,1 C6.16,1 1,6.16 1,12.5 C1,20.88 12.5,39 12.5,39 C12.5,39 24,20.88 24,12.5 C24,6.16 18.84,1 12.5,1 Z"/>
        <circle fill="#fff" cx="12.5" cy="12.5" r="3"/>
      </svg>
    `),
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
    iconSize: [37.5, 61.5],
    iconAnchor: [18.75, 61.5],
    popupAnchor: [1.5, -51],
    shadowSize: [61.5, 61.5]
  }),

  // Rotes Icon für geschlossene Spaces
  redIcon: new L.Icon({
    iconUrl: 'data:image/svg+xml;base64,' + btoa(`
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 25 41">
        <path fill="${IC.CLOSED}" stroke="#000" stroke-width="1" d="M12.5,1 C6.16,1 1,6.16 1,12.5 C1,20.88 12.5,39 12.5,39 C12.5,39 24,20.88 24,12.5 C24,6.16 18.84,1 12.5,1 Z"/>
        <circle fill="#fff" cx="12.5" cy="12.5" r="3"/>
      </svg>
    `),
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
    shadowSize: [41, 41]
  }),

  // Grünes Icon für geöffnete Spaces
  greenIcon: new L.Icon({
    iconUrl: 'data:image/svg+xml;base64,' + btoa(`
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 25 41">
        <path fill="${IC.OPEN}" stroke="#000" stroke-width="1" d="M12.5,1 C6.16,1 1,6.16 1,12.5 C1,20.88 12.5,39 12.5,39 C12.5,39 24,20.88 24,12.5 C24,6.16 18.84,1 12.5,1 Z"/>
        <circle fill="#fff" cx="12.5" cy="12.5" r="3"/>
      </svg>
    `),
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
    shadowSize: [41, 41]
  }),

  // Orange Icon für SpaceAPI-Spaces mit unbekanntem Status
  unknownStatusIcon: new L.Icon({
    iconUrl: 'data:image/svg+xml;base64,' + btoa(`
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 25 41">
        <path fill="${IC.UNKNOWN}" stroke="#000" stroke-width="1" d="M12.5,1 C6.16,1 1,6.16 1,12.5 C1,20.88 12.5,39 12.5,39 C12.5,39 24,20.88 24,12.5 C24,6.16 18.84,1 12.5,1 Z"/>
        <circle fill="#fff" cx="12.5" cy="12.5" r="3"/>
      </svg>
    `),
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
    shadowSize: [41, 41]
  })
};