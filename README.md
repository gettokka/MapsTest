# Leaflet Maps with Google Sheets
Customize Leaflet maps with a linked Google Sheets template and GeoJSON data on GitHub

## Live links (replace with your own)
- Leaflet Map https://handsondataviz.github.io/leaflet-maps-with-google-sheets/
- Google Sheets template https://docs.google.com/spreadsheets/d/1ZxvU8eGyuN9M8GxTU9acKVJv70iC3px_m3EVFsOHN9g/edit#gid=0

## Create your own
- See video with step-by-step tutorial in *Hands-On Data Visualization* https://handsondataviz.org/leaflet-maps-with-google-sheets.html
- Make a copy of the Google Sheets template, share it as **"Anyone with the link can view"**, and paste its URL into `google-doc-url.js`.
- GeoJSON and image paths in the sheet are relative to this repository (e.g. `geometry/polygons-town-population.geojson`).
- Alternatively, export the tabs as `csv/Options.csv`, `csv/Points.csv`, `csv/Polylines.csv`, `csv/Polygons.csv` (`Polygons1.csv`, …). If `csv/Options.csv` exists, the map uses these local files instead of Google Sheets.
- The page uses ES modules, so open it through a web server (e.g. GitHub Pages or `python3 -m http.server`), not via `file://`.

## Notes
- The sheet is read through Google's CSV export (`gviz/tq?tqx=out:csv`); no API key is needed. Format columns with mixed content as "Plain text" in Google Sheets, otherwise Google may drop some values.
- Cells may contain simple HTML (links, `<br>`, `<b>`, images). Everything that could run script is removed with DOMPurify.
- CARTO basemaps (`CartoDB.*`) now require an API key: enter it as "Basemap Tiles API Key". Without a key the map falls back to OpenStreetMap. Tile keys are visible in the browser by design, so restrict them to your domain in the provider's dashboard.
- Marker colors accept the former awesome-markers names (`red`, `darkgreen`, `cadetblue`, …) or any CSS color. Icons are Font Awesome names such as `fa-bicycle`; Font Awesome 4/5 names keep working.

## Credits (and licenses)
Developed by [Ilya Ilyankou](https://github.com/ilyankou) and [Jack Dougherty](https://github.com/jackdougherty) with support from Trinity College CT, using a [Google Sheets](https://www.google.com/sheets/about/) template, with these open-source components:
- Inspired by: Code for Atlanta mapsfor.us (2016) https://github.com/codeforatlanta/mapsforus (BSD-3-Clause)
- Leaflet v1.9.4 https://leafletjs.com (BSD-2-Clause)
- leaflet-providers v4.0.0 https://github.com/leaflet-extras/leaflet-providers (BSD-2-Clause)
- leaflet.locatecontrol v0.90.1 https://github.com/domoritz/leaflet-locatecontrol (MIT)
- Leaflet.markercluster v1.5.3 https://github.com/Leaflet/Leaflet.markercluster (MIT)
- Leaflet.MarkerCluster.LayerSupport v2.0.1 https://github.com/ghybs/Leaflet.MarkerCluster.LayerSupport (MIT)
- Leaflet Control Geocoder v4.0.0 https://github.com/perliedman/leaflet-control-geocoder (BSD-2-Clause)
- Font Awesome Free v7.3.1 https://fontawesome.com (CC BY 4.0, SIL OFL 1.1, MIT)
- Papa Parse v5.7.0 https://www.papaparse.com (MIT)
- DOMPurify v3.4.15 https://github.com/cure53/DOMPurify (Apache-2.0 / MPL-2.0)
- Google Colour Palette Generator v1.1.1 https://github.com/google/palette.js (Apache-2.0)
- polylabel v2.1.0 https://github.com/mapbox/polylabel and TinyQueue v3.0.0 https://github.com/mourner/tinyqueue (ISC), bundled in `scripts/vendor/`
- Single Element CSS Spinner https://github.com/lukehaas/css-loaders (MIT)
