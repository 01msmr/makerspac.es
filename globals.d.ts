// Ambient declarations for window globals used as module bus.
export {};

declare global {
  interface Window {
    app?:               { searchHeader?: any; mobileFilterUI?: any } & Record<string, any>;
    zoomManager?:       any;
    mobileFilterUI?:    any;
    routingManager?:    any;
    markerStateManager?: any;
    clusterGroup?:      any;
    mapUtils?:          any;
    map?:               any;
    spaceAPI?:          any;
    bookmarkManager?:   any;
    i18n?:              any;
  }
}

declare module 'leaflet' {
  interface Marker {
    _openedByHover?:             boolean;
    _openedByItemClick?:         boolean;
    _isTemporarilyUnclustered?:  boolean;
    _retainPopup?:               boolean;
    locationId?:                 number;
  }
}
