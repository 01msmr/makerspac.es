var map;
var ajaxRequest;
var plotlist;
var plotlayers = [];

// Main Map Tile Layer from OpenStreetMap
function initmap() {
  map = new L.Map('map');
  var osmUrl = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
  var osmAttrib = 'Map data © <a href="https://openstreetmap.org">OpenStreetMap</a> contributors';
  var osm = new L.TileLayer(osmUrl, { minZoom: 2, maxZoom: 19, attribution: osmAttrib });
  map.setView(new L.LatLng(51.0122995, 10.3995537), 7);
  map.addLayer(osm);







// from https://medium.com/@limeira.felipe94/highlighting-countries-on-a-map-with-leaflet-f84b7efee0a9


// Main Map Tile Layer from OpenStreetMap
const tileLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '© OpenStreetMap contributors'
}).addTo(map);

// Style for countries on the main map
function style(feature) {
  return {
    fillColor: 'silver',
    weight: 1,
    opacity: 1,
    color: 'white',
    fillOpacity: 0.0
  };
}
  

// Highlight a country on hover
function highlightFeature(e) {
  const layer = e.target;
  layer.setStyle({
    weight: 6,
    color: 'blue',
    fillColor: 'blue',
    dashArray: '',
    fillOpacity: 0.08
  });
}

  

// Reset the country's style when the mouse leaves
function resetHighlight(e) {
  geojson.resetStyle(e.target);
}
  
// Zoom into the clicked country
function zoomToFeature(e) {
  map.fitBounds(e.target.getBounds(), { padding: [10, 10] });
}


// Define events for each feature (country)
function onEachFeature(feature, layer) {
  layer.on({
    mouseover: highlightFeature,
    mouseout: resetHighlight,
    click: zoomToFeature
  });
}



// Add GeoJSON data to the main map
let geojson;
fetch('data/countries.geojson')
  .then(response => response.json())
  .then(data => {
    geojson = L.geoJson(data, {
      style: style,
      onEachFeature: onEachFeature
    }).addTo(map);
  })
  .catch(error => {
    console.error('Error loading GeoJSON on the Main Map:', error);
  });









  // MAKERSPACE TEMPLATE
  // MAKERSPACE TEMPLATE
  // MAKERSPACE TEMPLATE


  // PLZ  NAME
  var marker = L.marker([50.5, 10]).addTo(map);
  marker.bindPopup("<h3>NAME1</h3><a href=\"https://www.eu\" target=\"_blank\"><h2>NAME2</h2></a>STRASSE<br><b>PLZ ORT</b><br>Germany<br><hr><a href=\"https://www.eu\" target=\"_blank\"><b>WWW</b></a>");









  
  
  
  
  // known Makerspaces (Name; (Picture;) Adress: Street, No.; PLZ, Town; Country)


  DE
  DE
  DE


  // 01069  SLUB Makerspace
  var marker = L.marker([51.0296177, 13.7387907]).addTo(map);
  marker.bindPopup("<h3></h3><a href=\"https://www.slub-dresden.de\" target=\"_blank\"><h2>SLUB Makerspace</h2></a>Zellescher Weg 17<br><b>01069 Dresden</b><br>Germany<br><hr><a href=\"https://www.slub-dresden.de\" target=\"_blank\"><b>slub-dresden.de</b></a>");


  // 04155  Makerspace Leipzig
  var marker = L.marker([51.3664380, 12.3651633]).addTo(map);
  marker.bindPopup("<h3></h3><a href=\"https://www.makerspace-leipzig.de\" target=\"_blank\"><h2>Makerspace Leipzig</h2></a>Lindenthaler Straße 61-65<br><b>04155 Leipzig</b><br>Germany<br><hr><a href=\"https://www.makerspace-leipzig.de\" target=\"_blank\"><b>makerspace-leipzig.de</b></a>");


  // 10969  TüftelLab Berlin
  var marker = L.marker([52.5035024, 13.4102680]).addTo(map);
  marker.bindPopup("<h3>YOUTH</h3><a href=\"https://tueftellab.de/makerspace/berlin/\" target=\"_blank\"><h2>TüftelLab Berlin</h2></a>Prinzenstraße 85C<br><b>10969 Berlin</b><br>Germany<br><hr><a href=\"https://tueftellab.de/makerspace/berlin/\" target=\"_blank\"><b>tueftellab.de/makerspace/berlin/</b></a>");


  // 12053  Happylab Berlin
  var marker = L.marker([4793387, 13.4322983]).addTo(map);
  marker.bindPopup("<h3>COMMERCIAL</h3><a href=\"https://www.happylab.de/de_ber\" target=\"_blank\"><h2>Happylab Berlin</h2></a>Rollbergstraße 28a<br><b>12053 Berlin</b><br>Germany<br><hr><a href=\"https://www.happylab.de/de_ber\" target=\"_blank\"><b>www.happylab.de/de_ber</b></a>");


  // 12459  htw Maker Space
  var marker = L.marker([52.4595052, 13.5265921]).addTo(map);
  marker.bindPopup("<h3>STUDENT</h3><a href=\"https://entrepreneurship.htw-berlin.de/ueber-uns/ideas-in-action-idia/idia-spaces/maker-space\" target=\"_blank\"><h2>htw Maker Space</h2></a>Wilhelminenhofstraße 75A<br><b>12459 Berlin</b><br>Germany<br><hr><a href=\"https://entrepreneurship.htw-berlin.de/ueber-uns/ideas-in-action-idia/idia-spaces/maker-space/\" target=\"_blank\"><b>entrepreneurship.htw-berlin.de/ueber-uns/ideas-in-action-idia/idia-spaces/maker-space/</b></a>");


  // 20354  TüftelLab Hamburg
  var marker = L.marker([53.5552490, 9.9875944]).addTo(map);
  marker.bindPopup("<h3>YOUTH</h3><a href=\"https://www.eu\" target=\"_blank\"><h2>TüftelLab Hamburg</h2></a>105 VIERTEL Bildung<br>Gänsemarkt 33<br><b>20354 Hamburg</b><br>Germany<br><hr><a href=\"https://tueftellab.de/makerspace/hamburg-105viertel/\" target=\"_blank\"><b>tueftellab.de/makerspace/hamburg-105viertel/</b></a>");


  // 20457  Fabulous St. Pauli
  var marker = L.marker([53.5421506, 10.010595]).addTo(map);
  marker.bindPopup("<h3></h3><a href=\"https://www.fablab-hamburg.org\" target=\"_blank\"><h2>Fabulous St. Pauli</h2></a>Stockmeyerstr. 43, Halle 4K<br><b>20457 Hamburg</b><br>Germany<br><hr><a href=\"https://www.fablab-hamburg.org\" target=\"_blank\"><b>fablab-hamburg.org</b></a>");


  // 22761  Makerhafen
  var marker = L.marker([53.5628589, 9.9257698]).addTo(map);
  marker.bindPopup("<h3></h3><a href=\"https://www.makerhafen.de\" target=\"_blank\"><h2>Makerhafen</h2></a>Stahltwiete 21<br><b>22761 Hamburg</b><br>Germany<br><hr><a href=\"https://www.makerhafen.de\" target=\"_blank\"><b>makerhafen.de</b></a>");


  // 22767  Attraktor
  var marker = L.marker([53.5498981, 9.9464159]).addTo(map);
  marker.bindPopup("<h3></h3><a href=\"https://makerspace-hamburg.de/attraktor/\" target=\"_blank\"><h2>Attraktor</h2></a>Eschelsweg 4<br><b>22767 Hamburg</b><br>Germany<br><hr><a href=\"https://makerspace-hamburg.de/attraktor\" target=\"_blank\"><b>makerspace-hamburg.de/attraktor</b></a>");


  // 30167  Hafven Maker Space
  var marker = L.marker([52.3880068, 9.7262848]).addTo(map);
  marker.bindPopup("<h3></h3><a href=\"https://hafven.de/maker-space\" target=\"_blank\"><h2>Hafven Maker Space</h2></a>Kopernikusstraße 14<br><b>30167 Hannover</b><br>Germany<br><hr><a href=\"https://hafven.de/maker-space\" target=\"_blank\"><b>hafven.de/maker-space</b></a>");


  // 33330 Makerspace Gütersloh
  var marker = L.marker([51.9022879, 8.3773189]).addTo(map);
  marker.bindPopup("<h3></h3><a href=\"https://makerspace-gt.de\" target=\"_blank\"><h2>Makerspace Gütersloh</h2></a>Bogenstraße 1-8<br><b>33330 Gütersloh</b><br>Germany<br><hr><a href=\"https://makerspace-gt.de\" target=\"_blank\"><b>makerspace-gt.de</b></a>");


  // 35390  Makerspace Gießen
  var marker = L.marker([50.5899306, 8.6777523]).addTo(map);
  marker.bindPopup("<h3></h3><a href=\"https://www.makerspace-giessen.de\" target=\"_blank\"><h2>Makerspace Gießen</h2></a>Walltorstraße 57<br><b>35390 Gießen</b><br>Germany<br><hr><a href=\"https://www.makerspace-giessen.de\" target=\"_blank\"><b>makerspace-giessen.de</b></a>");


  // 38114  Makerspace Braunschweig
  var marker = L.marker([52.2822038, 10.5156945]).addTo(map);
  marker.bindPopup("<h3></h3><a href=\"https://www.makerspace-bs.de\" target=\"_blank\"><h2>Makerspace Braunschweig</h2></a>Hamburger Str. 49<br><b>38114 Braunschweig</b><br>Germany<br><hr><a href=\"https://www.makerspace-bs.de\" target=\"_blank\"><b>makerspace-bs.de</b></a>");


  // 41460  TüftelLab Rhein-Kreis Neuss
  var marker = L.marker([51.2013193, 6.6868142]).addTo(map);
  marker.bindPopup("<h3>YOUTH</h3><a href=\"https://tueftellab.de/makerspace/rhein-kreis-neuss/\" target=\"_blank\"><h2>TüftelLab Rhein-Kreis Neuss</h2></a>Krefelder Str. 55<br><b>41460 Neuss</b><br>Germany<br><hr><a href=\"https://tueftellab.de/makerspace/rhein-kreis-neuss/\" target=\"_blank\"><b>tueftellab.de/makerspace/rhein-kreis-neuss/</b></a>");


  // 44803  RUB-Makerspace
  var marker = L.marker([51.4654434, 7.2597076]).addTo(map);
  marker.bindPopup("<h3></h3><a href=\"https://makerspace.ruhr-uni-bochum.de\" target=\"_blank\"><h2>RUB-Makerspace</h2></a>Suttner-Nobel-Allee 4<br><b>44803 Bochum</b><br>Germany<br><hr><a href=\"https://makerspace.ruhr-uni-bochum.de\" target=\"_blank\"><b>makerspace.ruhr-uni-bochum.de</b></a>");


  // 46399  Makerspace Bocholt
  var marker = L.marker([51.8385327, 6.603737438715986]).addTo(map);
  marker.bindPopup("<h3></h3><a href=\"https://www.makerspace-bocholt.de\" target =\"_blank\"><h2>Makerspace Bocholt</h2></a>Westend 31<br><b>46399 Bocholt<br></b>Germany<br><hr><a href=\"https://www.makerspace-bocholt.de\" target=\"_blank\"><b>makerspace-bocholt.de</b></a>");


  // 48565  MakerSpace FH Münster
  var marker = L.marker([52.1431977, 7.3234219]).addTo(map);
  marker.bindPopup("<h3>NAME1</h3><a href=\"https://www.fh-muenster.de/de/makerspace\" target=\"_blank\"><h2>MakerSpace FH Münster</h2></a>Stegerwaldstraße 39<br>Gebäude H, Raum H011a<br><b>48565 Steinfurt</b><br>Germany<br><hr><a href=\"https://www.fh-muenster.de/de/makerspace\" target=\"_blank\"><b>fh-muenster.de/de/makerspace</b></a>");


  // 50679  MakerSpace - TH Köln
  var marker = L.marker([50.5, 10]).addTo(map);
  marker.bindPopup("<h3>STUDENT</h3><a href=\"https://www.th-koeln.de/forschung/makerspace-und-mini-inkubatoren_77114.php\" target=\"_blank\"><h2>MakerSpace - TH Köln</h2></a>Campus Deutz<br>Betzdorfer Straße 2<br><b>50679 Köln</b><br>Germany<br><hr><a href=\"https://www.th-koeln.de/forschung/makerspace-und-mini-inkubatoren_77114.php\" target=\"_blank\"><b>th-koeln.de/forschung/makerspace-und-mini-inkubatoren_77114.php</b></a>");


  // 53175  MakerSpace Bonn
  var marker = L.marker([50.6981704, 7.1450146]).addTo(map);
  marker.bindPopup("<h3></h3><a href=\"https://www.makerspacebonn.de\" target=\"_blank\"><h2>Makerspace Bonn</h2></a>Kennedyallee 18<br><b>53175 Bonn</b><br>Germany<br><hr><a href=\"https://www.makerspacebonn.de\" target=\"_blank\"><b>makerspacebonn.de</b></a>");


  // 54516  Makerspace Wittlich
  var marker = L.marker([49.9865645, 6.8880852]).addTo(map);
  marker.bindPopup("<h3></h3><a href=\"http://www.makerspace.wittlich.de\" target=\"_blank\"><h2>Makerspace Wittlich</h2></a>Neustraße 6<br><b>54516 Wittlich</b><br>Germany<br><hr><a href=\"http://www.makerspace.wittlich.de\" target=\"_blank\"><b>makerspace.wittlich.de</b></a>");


  // 56170  Makerspace Mayen-Koblenz
  var marker = L.marker([50.4214156, 7.5751553]).addTo(map);
  marker.bindPopup("<h3></h3><a href=\"https://www.makerspace-myk.de\" target=\"_blank\"><h2>Makerspace Mayen-Koblenz</h2></a>Untere Vallendarer Straße 26<br><b>56170 Bendorf</b><br>Germany<br><hr><a href=\"https://www.makerspace-myk.de\" target=\"_blank\"><b>makerspace-myk.de</b></a>");


  // 63450  MakerSpace - Kulturforum Hanau
  var marker = L.marker([50.1352742, 8.9175025]).addTo(map);
  marker.bindPopup("<h3></h3><a href=\"https://www.kulturforum-hanau.de/angebote/49944/index.html\" target=\"_blank\"><h2>MakerSpace - Kulturforum Hanau</h2></a>Am Markt 14-18<br><b>63450 Hanau</b><br>Germany<br><hr><a href=\"https://www.kulturforum-hanau.de/angebote/49944/index.html\" target=\"_blank\"><b>kulturforum-hanau.de</b></a>");


  // 64293  Makerspace Darmstadt
  var marker = L.marker([49.8802245, 8.6325583]).addTo(map);
  marker.bindPopup("<h3></h3><a href=\"https://www.makerspace-darmstadt.de\" target=\"_blank\"><h2>Makerspace Darmstadt</h2></a>Mainzer Straße 74<br><b>64293 Darmstadt</b><br>Germany<br><hr><a href=\"https://www.makerspace-darmstadt.de\" target=\"_blank\"><b>makerspace-darmstadt.de</b></a>");


  // 65205  Makerspace Wiesbaden
  var marker = L.marker([50.0555848, 8.3085765]).addTo(map);
  marker.bindPopup("<h3></h3><a href=\"https://www.makerspace-wi.de\" target=\"_blank\"><h2>Makerspace Wiesbaden</h2></a>Wandersmannstrasse 60<br><b>65205 Wiesbaden</b><br>Germany<br><hr><a href=\"https://www.makerspace-wi.de\" target=\"_blank\"><b>makerspace-wi.de</b></a>");


  // 67065  MAKERSPACE Rhein-Neckar
  var marker = L.marker([49.7520597, 8.4526774]).addTo(map);
  marker.bindPopup("<h3></h3><a href=\"https://makerspace-rheinneckar.de\" target=\"_blank\"><h2>Makerspace Rhein-Neckar</h2></a>Am Bubenpfad 2<br><b>67065 Ludwigshafen am Rhein</b><br>Germany<br><hr><a href=\"https://makerspace-rheinneckar.de\" target=\"_blank\"><b>makerspace-rheinneckar.de</b></a>");


  // 70569  Hochschule der Medien - Makerspace
  var marker = L.marker([48.7462142, 9.1037595]).addTo(map);
  marker.bindPopup("<h3>STUDENT</h3><a href=\"https://www.hdm-stuttgart.de/makerspace\" target=\"_blank\"><h2>Hochschule der Medien - Makerspace</h2></a>Nobelstraße 10<br><b>70569 Stuttgart</b><br>Germany<br><hr><a href=\"https://www.hdm-stuttgart.de/makerspace\" target=\"_blank\"><b>hdm-stuttgart.de/makerspace</b></a>");


  // 70569  Universität Stuttgart - Makerspace Universum
  var marker = L.marker([48.7462287, 9.1037325]).addTo(map);
  marker.bindPopup("<h3>STUDENT</h3><a href=\"https://www.eu\" target=\"_blank\"><h2>NAME2</h2></a>Pfaffenwaldring 45<br><b> Stuttgart</b><br>Germany<br><hr><a href=\"https://www.eu\" target=\"_blank\"><b>WWW</b></a>");


  // 77652  Makerspace Hochschule Offenburg
  var marker = L.marker([48.4576465, 7.9423574]).addTo(map);
  marker.bindPopup("<h3>NAME1</h3><a href=\"https://emi.hs-offenburg.de/fakultaet-elektrotechnik-medizintechnik-und-informatik/labore/edu-fablab-hso\" target=\"_blank\"><h2>Makerspace Hochschule Offenburg</h2></a>Badstraße 24<br><b>77652 Offenburg</b><br>Germany<br><hr><a href=\"https://emi.hs-offenburg.de/fakultaet-elektrotechnik-medizintechnik-und-informatik/labore/edu-fablab-hso\" target=\"_blank\"><b>emi.hs-offenburg.de</b></a>");


  // 80636  Munich Maker Lab
  var marker = L.marker([48.1589395, 11.5500795]).addTo(map);
  marker.bindPopup("<h3></h3><a href=\"https://www.munichmakerlab.de\" target=\"_blank\"><h2>Munich Maker Lab</h2></a>Dachauer Str. 112h<br><b>80636 München</b><br>Germany<br><hr><a href=\"https://www.munichmakerlab.de\" target=\"_blank\"><b>munichmakerlab.de</b></a>");


  // 80797  MakerSpace München
  var marker = L.marker([48.1608454, 11.5524567]).addTo(map);
  marker.bindPopup("<h3></h3><a href=\"https://www.maker-space.de\" target=\"_blank\"><h2>MakerSpace München</h2></a>Freddie-Mercury-Straße 5<br><b>80797 München</b><br>Germany<br><hr><a href=\"https://www.maker-space.de\" target=\"_blank\"><b>maker-space.de</b></a>");


  // 80797  TüftelLab München
  var marker = L.marker([48.1570606, 11.5514604]).addTo(map);
  marker.bindPopup("<h3>YOUTH</h3><a href=\"https://tueftellab.de/makerspace/muenchen/\" target=\"_blank\"><h2>TüftelLab München</h2></a>Freddie-Mercury-Straße 5<br><b>80797 München</b><br>Germany<br><hr><a href=\"https://tueftellab.de/makerspace/muenchen/\" target=\"_blank\"><b>tueftellab.de/makerspace/muenchen/</b></a>");


  // 85049  brigk Makerspace
  var marker = L.marker([50.5, 10]).addTo(map);
  marker.bindPopup("<h3>COMMERCIAL</h3><a href=\"https://www.brigk.digital/brigk-makerspace\" target=\"_blank\"><h2>brigk Makerspace</h2></a>Schloßlände 26<br><b>85049 Ingolstadt</b><br>Germany<br><hr><a href=\"https://www.brigk.digital/brigk-makerspace\" target=\"_blank\"><b>brigk.digital/brigk-makerspace</b></a>");


  // 85748  MakerSpace Garching
  var marker = L.marker([48.2683205, 11.6660252]).addTo(map);
  marker.bindPopup("<h3></h3><a href=\"https://www.maker-space.de\" target=\"_blank\"><h2>MakerSpace Garching</h2></a>Lichtenbergstraße 6<br><b>85748 Garching bei München</b><br>Germany<br><hr><a href=\"https://www.maker-space.de\" target=\"_blank\"><b>maker-space.de</b></a>");


  // 88677  Toolbox Bodensee  
  var marker = L.marker([47.7122995, 9.3995537]).addTo(map);
  marker.bindPopup("<a href=\"https://www.toolbox-bodensee.de\" target=\"_blank\"><h2>Toolbox Bodensee.</h2></a>Bergheimer Straße 6<br><b>88677 Markdorf</b><br>Germany<br><hr><a href=\"https://www.toolbox-bodensee.de\" target=\"_blank\"><b>toolbox-bodensee.de</b></a>");


  // 96450  CREAPOLIS Makerspace
  var marker = L.marker([50.2538682, 10.9595537]).addTo(map);
  marker.bindPopup("<h3>NAME1</h3><a href=\"https://www.hs-coburg.de/hochschule/organisation/servicestellen/referat-transfer-entrepreneurship/creapolis-makerspace/\" target=\"_blank\"><h2>CREAPOLIS Makerspace</h2></a>Schlachthofstr. 1<br><b>96450 Coburg</b><br>Germany<br><hr><a href=\"https://www.hs-coburg.de/hochschule/organisation/servicestellen/referat-transfer-entrepreneurship/creapolis-makerspace/\" target=\"_blank\"><b>hs-coburg.de</b></a>");








  AT
  AT
  AT


  // 9020  MAKERSPACE Carinthia
  var marker = L.marker([46.6180671, 14.3171542]).addTo(map);
  marker.bindPopup("<h3>COMMERCIAL</h3><a href=\"https://www.makerspace-carinthia.com\" target=\"_blank\"><h2>MAKERSPACE Carinthia</h2></a>Lastenstraße 26<br><b>9020 Klagenfurt am Wörthersee</b><br>Austria<br><hr><a href=\"https://www.makerspace-carinthia.com\" target=\"_blank\"><b>makerspace-carinthia.com</b></a>");
}


initmap();