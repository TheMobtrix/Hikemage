# Hikemage Trail Scrapbook

A cute static hiking scrapbook app for drawing a trail, adding geotagged photos,
and exporting a private shareable HTML page for a friend.

## Open The App

Open `index.html` in a browser. The app uses online map tiles and CDN libraries,
so the browser needs internet access for the real map and photo GPS metadata tool.

## Add Photos From A Phone

1. Open the app in your phone browser.
2. Tap `Add photos`.
3. Choose photos from your camera roll.
4. Photos with GPS metadata are placed on the map automatically.
5. Photos without GPS metadata can be placed manually by tapping `Place photo`
   and then tapping the map.

## Find Places And Trails

1. Search for a place, park, mountain, or trailhead in the `Find` panel.
2. Tap `Go here` to move the map to that area.
3. Tap `Find trails nearby` to search for named hiking/foot routes around the
   current map center.
4. Preview a trail, then tap `Use trail` to copy it into your route.

Place search uses the public Photon OpenStreetMap-based geocoder. Nearby trail
search uses the public Overpass API. Keep searches human-triggered and light.

## Share A Hike

1. Draw or import your route.
2. Add photos and captions.
3. Tap `Export share page`.
4. Send the downloaded `.html` file to your friend by AirDrop, WhatsApp, email,
   Google Drive, iCloud, or another file-sharing app.

The exported file is private by possession: anyone with the file can open it, but
there is no account login or password protection.
