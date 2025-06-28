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


  // PLZ NAME
  var marker = L.marker([50.5, 10]).addTo(map);
  marker.bindPopup("<h3>NAME1</h3><a href=\"https://www.eu\" target=\"_blank\"><h2>NAME2</h2></a>STRASSE<br><b>PLZ ORT</b><br>Germany<br><hr><a href=\"https://www.eu\" target=\"_blank\"><b>WWW</b></a>");




  // known Makerspaces (Name; (Picture;) Adress: Street, No.; PLZ, Town; Country)




  // 01069  SLUB Makerspace
  var marker = L.marker([51.0296177, 13.7387907]).addTo(map);
  marker.bindPopup("<h3></h3><a href=\"https://www.slub-dresden.de\" target=\"_blank\"><h2>SLUB Makerspace</h2></a>Zellescher Weg 17<br><b>01069 Dresden</b><br>Germany<br><hr><a href=\"https://www.slub-dresden.de\" target=\"_blank\"><b>slub-dresden.de</b></a>");


  // 04155  Makerspace Leipzig
  var marker = L.marker([51.3664380, 12.3651633]).addTo(map);
  marker.bindPopup("<h3></h3><a href=\"https://www.makerspace-leipzig.de\" target=\"_blank\"><h2>Makerspace Leipzig</h2></a>Lindenthaler Straße 61-65<br><b>04155 Leipzig</b><br>Germany<br><hr><a href=\"https://www.makerspace-leipzig.de\" target=\"_blank\"><b>makerspace-leipzig.de</b></a>");


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


  // 35390  Makerspace Gießen
  var marker = L.marker([50.5899306, 8.6777523]).addTo(map);
  marker.bindPopup("<h3></h3><a href=\"https://www.makerspace-giessen.de\" target=\"_blank\"><h2>Makerspace Gießen</h2></a>Walltorstraße 57<br><b>35390 Gießen</b><br>Germany<br><hr><a href=\"https://www.makerspace-giessen.de\" target=\"_blank\"><b>makerspace-giessen.de</b></a>");


  // 38114  Makerspace Braunschweig
  var marker = L.marker([52.2822038, 10.5156945]).addTo(map);
  marker.bindPopup("<h3></h3><a href=\"https://www.makerspace-bs.de\" target=\"_blank\"><h2>Makerspace Braunschweig</h2></a>Hamburger Str. 49<br><b>38114 Braunschweig</b><br>Germany<br><hr><a href=\"https://www.makerspace-bs.de\" target=\"_blank\"><b>makerspace-bs.de</b></a>");


  // 44803  RUB-Makerspace
  var marker = L.marker([51.4654434, 7.2597076]).addTo(map);
  marker.bindPopup("<h3></h3><a href=\"https://makerspace.ruhr-uni-bochum.de\" target=\"_blank\"><h2>RUB-Makerspace</h2></a>Suttner-Nobel-Allee 4<br><b>44803 Bochum</b><br>Germany<br><hr><a href=\"https://makerspace.ruhr-uni-bochum.de\" target=\"_blank\"><b>makerspace.ruhr-uni-bochum.de</b></a>");


  // 46399  Makerspace Bocholt
  var marker = L.marker([51.8385327, 6.603737438715986]).addTo(map);
  marker.bindPopup("<h3></h3><a href=\"https://www.makerspace-bocholt.de\" target =\"_blank\"><h2>Makerspace Bocholt</h2></a>Westend 31<br><b>46399 Bocholt<br></b>Germany<br><hr><a href=\"https://www.makerspace-bocholt.de\" target=\"_blank\"><b>makerspace-bocholt.de</b></a>");


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
  var marker = L.marker([50.5, 10]).addTo(map);
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


  // 80636  Munich Maker Lab
  var marker = L.marker([48.1589395, 11.5500795]).addTo(map);
  marker.bindPopup("<h3></h3><a href=\"https://www.munichmakerlab.de\" target=\"_blank\"><h2>Munich Maker Lab</h2></a>Dachauer Str. 112h<br><b>80636 München</b><br>Germany<br><hr><a href=\"https://www.munichmakerlab.de\" target=\"_blank\"><b>munichmakerlab.de</b></a>");


  // 80797  MakerSpace München
  var marker = L.marker([48.1608454, 11.5524567]).addTo(map);
  marker.bindPopup("<h3></h3><a href=\"https://www.maker-space.de\" target=\"_blank\"><h2>MakerSpace München</h2></a>Freddie-Mercury-Straße 5<br><b>80797 München</b><br>Germany<br><hr><a href=\"https://www.maker-space.de\" target=\"_blank\"><b>maker-space.de</b></a>");


  // 85748  MakerSpace Garching
  var marker = L.marker([48.2683205, 11.6660252]).addTo(map);
  marker.bindPopup("<h3></h3><a href=\"https://www.maker-space.de\" target=\"_blank\"><h2>MakerSpace Garching</h2></a>Lichtenbergstraße 6<br><b>85748 Garching bei München</b><br>Germany<br><hr><a href=\"https://www.maker-space.de\" target=\"_blank\"><b>maker-space.de</b></a>");


  // 88677  Toolbox Bodensee  
  var marker = L.marker([47.7122995, 9.3995537]).addTo(map);
  marker.bindPopup("<a href=\"https://www.toolbox-bodensee.de\" target=\"_blank\"><h2>Toolbox Bodensee</h2></a>Bergheimer Straße 6<br><b>88677 Markdorf</b><br>Germany<br><hr><a href=\"https://www.toolbox-bodensee.de\" target=\"_blank\"><b>toolbox-bodensee.de</b></a>");


}


initmap();