(function () {
  const defaultCenter = [39.5, -98.35];
  const tileLayerUrl = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
  const tileAttribution =
    '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';

  const state = {
    mode: "draw",
    selectedPhotoId: null,
    route: [],
    photos: [],
  };

  const elements = {
    trailTitle: document.querySelector("#trailTitle"),
    trailDate: document.querySelector("#trailDate"),
    trailMood: document.querySelector("#trailMood"),
    trailNotes: document.querySelector("#trailNotes"),
    distanceOutput: document.querySelector("#distanceOutput"),
    photoCountOutput: document.querySelector("#photoCountOutput"),
    photoList: document.querySelector("#photoList"),
    photoTemplate: document.querySelector("#photoItemTemplate"),
    photoInput: document.querySelector("#photoInput"),
    addPhotosButton: document.querySelector("#addPhotosButton"),
    gpxInput: document.querySelector("#gpxInput"),
    importRouteButton: document.querySelector("#importRouteButton"),
    undoPointButton: document.querySelector("#undoPointButton"),
    clearRouteButton: document.querySelector("#clearRouteButton"),
    locateButton: document.querySelector("#locateButton"),
    exportButton: document.querySelector("#exportButton"),
    sampleButton: document.querySelector("#sampleButton"),
    floatingNote: document.querySelector("#floatingNote"),
    modeStatus: document.querySelector("#modeStatus"),
    toast: document.querySelector("#toast"),
    modeButtons: document.querySelectorAll(".mode-button"),
  };

  const today = new Date();
  elements.trailDate.value = today.toISOString().slice(0, 10);

  const map = L.map("map", {
    zoomControl: true,
  }).setView(defaultCenter, 4);

  L.tileLayer(tileLayerUrl, {
    maxZoom: 19,
    attribution: tileAttribution,
  }).addTo(map);

  const routeLayer = L.polyline([], {
    color: "#356c55",
    weight: 5,
    opacity: 0.88,
    lineCap: "round",
    lineJoin: "round",
  }).addTo(map);

  const routePointLayer = L.layerGroup().addTo(map);
  const photoLayer = L.layerGroup().addTo(map);
  const photoMarkers = new Map();

  map.on("click", handleMapClick);
  elements.modeButtons.forEach((button) => {
    button.addEventListener("click", () => setMode(button.dataset.mode));
  });

  elements.addPhotosButton.addEventListener("click", () => elements.photoInput.click());
  elements.photoInput.addEventListener("change", handlePhotoFiles);
  elements.importRouteButton.addEventListener("click", () => elements.gpxInput.click());
  elements.gpxInput.addEventListener("change", handleGpxFile);
  elements.undoPointButton.addEventListener("click", undoRoutePoint);
  elements.clearRouteButton.addEventListener("click", clearRoute);
  elements.locateButton.addEventListener("click", locateUser);
  elements.exportButton.addEventListener("click", exportSharePage);
  elements.sampleButton.addEventListener("click", loadSampleRoute);

  ["input", "change"].forEach((eventName) => {
    elements.trailTitle.addEventListener(eventName, refreshFloatingNote);
    elements.trailDate.addEventListener(eventName, refreshFloatingNote);
    elements.trailMood.addEventListener(eventName, refreshFloatingNote);
    elements.trailNotes.addEventListener(eventName, refreshFloatingNote);
  });

  refreshAll();

  function handleMapClick(event) {
    const point = [event.latlng.lat, event.latlng.lng];

    if (state.mode === "draw") {
      state.route.push(point);
      refreshRoute();
      refreshFloatingNote();
      showToast("Route point added.");
      return;
    }

    if (state.mode === "place") {
      const photo = getSelectedPhoto();
      if (!photo) {
        showToast("Select a photo, then place it on the map.");
        return;
      }

      photo.lat = point[0];
      photo.lng = point[1];
      photo.hasGps = false;
      photo.needsPlacement = false;
      refreshPhotos();
      refreshFloatingNote();
      showToast("Photo placed on the trail.");
    }
  }

  async function handlePhotoFiles(event) {
    const files = Array.from(event.target.files || []);
    if (!files.length) {
      return;
    }

    showToast("Adding photos...");

    for (const file of files) {
      try {
        const gps = await readGps(file);
        const image = await createImageCopies(file);
        const photo = {
          id:
            window.crypto && window.crypto.randomUUID
              ? window.crypto.randomUUID()
              : String(Date.now() + Math.random()),
          name: file.name,
          caption: "",
          src: image.display,
          thumb: image.thumb,
          lat: gps ? gps.lat : null,
          lng: gps ? gps.lng : null,
          hasGps: Boolean(gps),
          needsPlacement: !gps,
        };

        state.photos.push(photo);
        if (!gps) {
          state.selectedPhotoId = photo.id;
          setMode("place", { silent: true });
        }
      } catch (error) {
        console.error(error);
        showToast(`Could not add ${file.name}.`);
      }
    }

    event.target.value = "";
    refreshPhotos();
    refreshFloatingNote();
    fitMapToContent();
    showToast("Photos added.");
  }

  async function readGps(file) {
    if (!window.exifr) {
      return null;
    }

    try {
      const gps = await window.exifr.gps(file);
      if (gps && isFiniteNumber(gps.latitude) && isFiniteNumber(gps.longitude)) {
        return {
          lat: gps.latitude,
          lng: gps.longitude,
        };
      }
    } catch (error) {
      console.warn("GPS metadata unavailable", error);
    }

    return null;
  }

  function createImageCopies(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const image = new Image();

      image.onload = () => {
        try {
          const display = drawCompressedImage(image, 1600, 0.78);
          const thumb = drawCompressedImage(image, 420, 0.76);
          URL.revokeObjectURL(url);
          resolve({ display, thumb });
        } catch (error) {
          URL.revokeObjectURL(url);
          reject(error);
        }
      };

      image.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error("Image could not be read."));
      };

      image.src = url;
    });
  }

  function drawCompressedImage(image, maxSide, quality) {
    const scale = Math.min(1, maxSide / Math.max(image.naturalWidth, image.naturalHeight));
    const width = Math.max(1, Math.round(image.naturalWidth * scale));
    const height = Math.max(1, Math.round(image.naturalHeight * scale));
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d", { alpha: false });

    canvas.width = width;
    canvas.height = height;
    context.fillStyle = "#fffaf2";
    context.fillRect(0, 0, width, height);
    context.drawImage(image, 0, 0, width, height);

    return canvas.toDataURL("image/jpeg", quality);
  }

  function handleGpxFile(event) {
    const file = event.target.files && event.target.files[0];
    if (!file) {
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      try {
        const points = parseGpx(String(reader.result || ""));
        if (!points.length) {
          showToast("No route points found in that file.");
          return;
        }

        state.route = points;
        refreshRoute();
        fitMapToContent();
        setMode("pan");
        showToast(`Imported ${points.length} route points.`);
      } catch (error) {
        console.error(error);
        showToast("That route file could not be read.");
      } finally {
        event.target.value = "";
      }
    };

    reader.onerror = () => {
      event.target.value = "";
      showToast("That route file could not be read.");
    };

    reader.readAsText(file);
  }

  function parseGpx(text) {
    const xml = new DOMParser().parseFromString(text, "application/xml");
    if (xml.querySelector("parsererror")) {
      throw new Error("Invalid GPX XML.");
    }

    const nodes = [
      ...xml.querySelectorAll("trkpt"),
      ...xml.querySelectorAll("rtept"),
    ];

    return nodes
      .map((node) => [Number(node.getAttribute("lat")), Number(node.getAttribute("lon"))])
      .filter(([lat, lng]) => isFiniteNumber(lat) && isFiniteNumber(lng));
  }

  function undoRoutePoint() {
    if (!state.route.length) {
      showToast("No route points to undo.");
      return;
    }

    state.route.pop();
    refreshRoute();
    refreshFloatingNote();
    showToast("Last route point removed.");
  }

  function clearRoute() {
    if (!state.route.length) {
      showToast("The route is already clear.");
      return;
    }

    state.route = [];
    refreshRoute();
    refreshFloatingNote();
    showToast("Route cleared.");
  }

  function locateUser() {
    if (!navigator.geolocation) {
      showToast("Location is not available in this browser.");
      return;
    }

    showToast("Finding your location...");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const latLng = [position.coords.latitude, position.coords.longitude];
        map.setView(latLng, 14);
        L.circleMarker(latLng, {
          radius: 8,
          color: "#fff",
          weight: 3,
          fillColor: "#b75f69",
          fillOpacity: 1,
        })
          .addTo(map)
          .bindPopup("You are here.")
          .openPopup();
        showToast("Location found.");
      },
      () => {
        showToast("Location permission was not available.");
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
      }
    );
  }

  function loadSampleRoute() {
    state.route = [
      [54.459, -3.088],
      [54.462, -3.083],
      [54.466, -3.078],
      [54.471, -3.079],
      [54.474, -3.085],
      [54.471, -3.092],
      [54.466, -3.096],
      [54.461, -3.093],
    ];

    elements.trailTitle.value = "Borrowdale ridge loop";
    elements.trailMood.value = "Misty and peaceful";
    elements.trailNotes.value =
      "A soft little loop with a steady climb, wide views, and a perfect snack stop near the ridge.";
    refreshAll();
    fitMapToContent();
    showToast("Sample trail loaded.");
  }

  function setMode(mode, options = {}) {
    state.mode = mode;
    elements.modeButtons.forEach((button) => {
      button.classList.toggle("is-active", button.dataset.mode === mode);
    });
    refreshFloatingNote();

    if (!options.silent) {
      const names = {
        draw: "Draw mode ready.",
        place: "Photo placing ready.",
        pan: "Explore mode ready.",
      };
      showToast(names[mode] || "Mode updated.");
    }
  }

  function refreshAll() {
    refreshRoute();
    refreshPhotos();
    refreshFloatingNote();
  }

  function refreshRoute() {
    routeLayer.setLatLngs(state.route);
    routePointLayer.clearLayers();

    state.route.forEach((point, index) => {
      const marker = L.circleMarker(point, {
        radius: index === 0 ? 7 : 5,
        color: "#fff",
        weight: 2,
        fillColor: index === 0 ? "#b75f69" : "#356c55",
        fillOpacity: 1,
      });
      marker.bindTooltip(index === 0 ? "Start" : `Point ${index + 1}`);
      routePointLayer.addLayer(marker);
    });

    elements.distanceOutput.value = formatDistance(routeDistanceMiles());
  }

  function refreshPhotos() {
    elements.photoList.innerHTML = "";
    photoLayer.clearLayers();
    photoMarkers.clear();

    state.photos.forEach((photo) => {
      renderPhotoItem(photo);
      if (isPlaced(photo)) {
        const marker = L.marker([photo.lat, photo.lng], {
          icon: createPhotoIcon(photo),
          title: photo.name,
        }).bindPopup(createPhotoPopup(photo));

        marker.on("click", () => {
          state.selectedPhotoId = photo.id;
          refreshPhotos();
        });

        photoMarkers.set(photo.id, marker);
        photoLayer.addLayer(marker);
      }
    });

    elements.photoCountOutput.value =
      state.photos.length === 1 ? "1 photo" : `${state.photos.length} photos`;
  }

  function renderPhotoItem(photo) {
    const node = elements.photoTemplate.content.firstElementChild.cloneNode(true);
    const thumb = node.querySelector("img");
    const name = node.querySelector(".photo-name");
    const stateLabel = node.querySelector(".photo-state");
    const captionInput = node.querySelector(".caption-input");
    const thumbButton = node.querySelector(".photo-thumb");
    const placeButton = node.querySelector(".place-photo");
    const removeButton = node.querySelector(".remove-photo");

    node.classList.toggle("is-selected", state.selectedPhotoId === photo.id);
    thumb.src = photo.thumb;
    thumb.alt = photo.caption || photo.name;
    name.textContent = photo.name;
    stateLabel.textContent = isPlaced(photo) ? "Placed" : "Needs map";
    stateLabel.classList.toggle("needs-place", !isPlaced(photo));
    captionInput.value = photo.caption;

    captionInput.addEventListener("input", () => {
      photo.caption = captionInput.value;
      updatePhotoMarker(photo);
    });

    thumbButton.addEventListener("click", () => {
      selectPhoto(photo.id);
      if (isPlaced(photo)) {
        map.setView([photo.lat, photo.lng], Math.max(map.getZoom(), 15));
        const marker = photoMarkers.get(photo.id);
        if (marker) {
          marker.openPopup();
        }
      } else {
        setMode("place");
      }
    });

    placeButton.addEventListener("click", () => {
      selectPhoto(photo.id);
      setMode("place");
    });

    removeButton.addEventListener("click", () => {
      state.photos = state.photos.filter((item) => item.id !== photo.id);
      if (state.selectedPhotoId === photo.id) {
        state.selectedPhotoId = null;
      }
      refreshPhotos();
      refreshFloatingNote();
      showToast("Photo removed.");
    });

    elements.photoList.appendChild(node);
  }

  function updatePhotoMarker(photo) {
    if (!isPlaced(photo)) {
      refreshPhotos();
      return;
    }

    const marker = photoMarkers.get(photo.id);
    if (marker) {
      marker.setPopupContent(createPhotoPopup(photo));
    }
  }

  function selectPhoto(id) {
    state.selectedPhotoId = id;
    refreshPhotos();
  }

  function getSelectedPhoto() {
    return state.photos.find((photo) => photo.id === state.selectedPhotoId) || null;
  }

  function isPlaced(photo) {
    return isFiniteNumber(photo.lat) && isFiniteNumber(photo.lng);
  }

  function createPhotoIcon(photo) {
    return L.divIcon({
      className: "",
      iconSize: [48, 58],
      iconAnchor: [24, 52],
      popupAnchor: [0, -52],
      html: `
        <div class="photo-pin">
          <div class="photo-pin-frame">
            <img src="${escapeAttribute(photo.thumb)}" alt="">
          </div>
        </div>
      `,
    });
  }

  function createPhotoPopup(photo) {
    const caption = photo.caption ? `<p>${escapeHtml(photo.caption)}</p>` : "";
    return `
      <div class="photo-popup">
        <img src="${escapeAttribute(photo.src)}" alt="${escapeAttribute(photo.caption || photo.name)}">
        <strong>${escapeHtml(photo.name)}</strong>
        ${caption}
      </div>
    `;
  }

  function refreshFloatingNote() {
    const routeCount = state.route.length;
    const placedPhotos = state.photos.filter(isPlaced).length;
    const pendingPhotos = state.photos.length - placedPhotos;
    const selected = getSelectedPhoto();

    const modeText = {
      draw:
        routeCount > 1
          ? `${routeCount} route points. ${formatDistance(routeDistanceMiles())}.`
          : "Click the map to start the trail.",
      place: selected
        ? `Placing ${selected.name}.`
        : pendingPhotos
          ? "Select a photo to place."
          : "No unplaced photo selected.",
      pan: `${elements.trailTitle.value || "Untitled trail"} is ready to explore.`,
    };

    elements.floatingNote.textContent = modeText[state.mode];
    elements.modeStatus.textContent = modeText[state.mode];
  }

  function fitMapToContent() {
    const points = [
      ...state.route,
      ...state.photos.filter(isPlaced).map((photo) => [photo.lat, photo.lng]),
    ];

    if (!points.length) {
      return;
    }

    map.fitBounds(L.latLngBounds(points), {
      padding: [48, 48],
      maxZoom: 15,
    });
  }

  function routeDistanceMiles() {
    let total = 0;
    for (let index = 1; index < state.route.length; index += 1) {
      total += haversineMiles(state.route[index - 1], state.route[index]);
    }
    return total;
  }

  function haversineMiles(a, b) {
    const earthMiles = 3958.8;
    const lat1 = degreesToRadians(a[0]);
    const lat2 = degreesToRadians(b[0]);
    const deltaLat = degreesToRadians(b[0] - a[0]);
    const deltaLng = degreesToRadians(b[1] - a[1]);
    const sinLat = Math.sin(deltaLat / 2);
    const sinLng = Math.sin(deltaLng / 2);
    const value =
      sinLat * sinLat + Math.cos(lat1) * Math.cos(lat2) * sinLng * sinLng;
    return earthMiles * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
  }

  function formatDistance(miles) {
    const km = miles * 1.609344;
    if (miles < 0.1) {
      return "0 mi / 0 km";
    }
    return `${miles.toFixed(1)} mi / ${km.toFixed(1)} km`;
  }

  function exportSharePage() {
    const payload = {
      title: elements.trailTitle.value.trim() || "Untitled hike",
      date: elements.trailDate.value,
      mood: elements.trailMood.value,
      notes: elements.trailNotes.value.trim(),
      distance: formatDistance(routeDistanceMiles()),
      route: state.route,
      photos: state.photos.filter(isPlaced).map((photo) => ({
        name: photo.name,
        caption: photo.caption,
        src: photo.src,
        thumb: photo.thumb,
        lat: photo.lat,
        lng: photo.lng,
      })),
    };

    const html = buildShareHtml(payload);
    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = `${slugify(payload.title)}-hikemage.html`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    showToast("Share page exported.");
  }

  function buildShareHtml(data) {
    const json = JSON.stringify(data).replace(/</g, "\\u003c");
    return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escapeHtml(data.title)} - Hikemage</title>
    <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css">
    <style>
      :root {
        --ink: #28332f;
        --muted: #6f7d76;
        --paper: #fffaf2;
        --shell: #eaf3ee;
        --pine: #356c55;
        --rose: #f2b8a8;
        --berry: #b75f69;
        --sky: #bedbea;
        --line: rgba(40, 51, 47, 0.14);
        font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        color: var(--ink);
        background:
          linear-gradient(135deg, rgba(190, 219, 234, 0.72), transparent 35%),
          linear-gradient(315deg, rgba(242, 184, 168, 0.5), transparent 35%),
          var(--shell);
      }
      .viewer {
        display: grid;
        grid-template-columns: minmax(320px, 410px) minmax(0, 1fr);
        min-height: 100vh;
      }
      aside {
        display: flex;
        flex-direction: column;
        gap: 14px;
        max-height: 100vh;
        overflow: auto;
        padding: 22px;
        border-right: 1px solid var(--line);
        background: rgba(255, 250, 242, 0.94);
        box-shadow: 12px 0 38px rgba(47, 77, 61, 0.12);
        z-index: 2;
      }
      .brand {
        display: flex;
        gap: 12px;
        align-items: center;
      }
      .brand-mark {
        width: 52px;
        height: 52px;
        border-radius: 50%;
        background:
          linear-gradient(135deg, transparent 44%, #356c55 45% 60%, transparent 61%),
          linear-gradient(45deg, transparent 43%, #79a88a 44% 60%, transparent 61%),
          var(--sky);
        border: 2px solid rgba(53, 108, 85, 0.18);
        flex: 0 0 auto;
      }
      .eyebrow {
        margin: 0 0 3px;
        color: var(--berry);
        font-size: .76rem;
        font-weight: 850;
        letter-spacing: .08em;
        text-transform: uppercase;
      }
      h1 {
        margin: 0;
        font-family: Georgia, "Times New Roman", serif;
        font-size: clamp(1.6rem, 4vw, 2.35rem);
        line-height: 1.04;
      }
      p { margin: 0; }
      .meta {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 10px;
      }
      .stat, .notes, .photo-card {
        border: 1px solid var(--line);
        border-radius: 8px;
        background: rgba(255, 255, 255, .58);
        box-shadow: 0 8px 20px rgba(66, 91, 77, .08);
      }
      .stat {
        padding: 12px;
      }
      .stat span {
        display: block;
        color: var(--muted);
        font-size: .74rem;
        font-weight: 850;
        text-transform: uppercase;
        letter-spacing: .05em;
      }
      .stat strong {
        display: block;
        margin-top: 5px;
      }
      .notes {
        padding: 14px;
        color: #42534c;
        line-height: 1.55;
      }
      .photo-stack {
        display: grid;
        gap: 12px;
      }
      .photo-card {
        display: grid;
        grid-template-columns: 92px minmax(0, 1fr);
        gap: 12px;
        padding: 9px;
        text-align: left;
        color: inherit;
        cursor: pointer;
      }
      .photo-card img {
        width: 92px;
        height: 112px;
        object-fit: cover;
        border: 5px solid #fff;
        border-radius: 7px;
        box-shadow: 0 7px 12px rgba(40, 51, 47, .12);
      }
      .photo-card strong {
        display: block;
        margin-top: 7px;
      }
      .photo-card span {
        display: block;
        margin-top: 6px;
        color: var(--muted);
        line-height: 1.35;
      }
      main {
        min-width: 0;
        padding: 22px;
      }
      #map {
        height: calc(100vh - 44px);
        min-height: 560px;
        overflow: hidden;
        border: 1px solid var(--line);
        border-radius: 8px;
        box-shadow: 0 18px 45px rgba(39, 61, 51, .16);
        background: #dfe8df;
      }
      .photo-popup {
        width: min(230px, 60vw);
      }
      .photo-popup img {
        width: 100%;
        max-height: 220px;
        object-fit: cover;
        border-radius: 7px;
      }
      .photo-popup strong {
        display: block;
        margin-top: 8px;
      }
      .photo-popup p {
        margin-top: 4px;
        color: var(--muted);
      }
      .photo-pin {
        width: 48px;
        height: 58px;
        filter: drop-shadow(0 8px 10px rgba(33, 54, 44, .24));
      }
      .photo-pin-frame {
        width: 48px;
        height: 48px;
        overflow: hidden;
        border: 4px solid #fff;
        border-radius: 7px;
        background: var(--paper);
      }
      .photo-pin-frame img {
        width: 100%;
        height: 100%;
        object-fit: cover;
      }
      .photo-pin:after {
        content: "";
        position: absolute;
        left: 18px;
        bottom: 2px;
        width: 13px;
        height: 13px;
        background: #fff;
        transform: rotate(45deg);
      }
      @media (max-width: 900px) {
        .viewer { grid-template-columns: 1fr; }
        aside { max-height: none; border-right: 0; border-bottom: 1px solid var(--line); }
        main { padding: 14px; }
        #map { height: 62vh; min-height: 410px; }
      }
      @media (max-width: 520px) {
        aside { padding: 16px; }
        .meta { grid-template-columns: 1fr; }
        .photo-card { grid-template-columns: 76px minmax(0, 1fr); }
        .photo-card img { width: 76px; height: 94px; }
      }
    </style>
  </head>
  <body>
    <div class="viewer">
      <aside>
        <header class="brand">
          <div class="brand-mark" aria-hidden="true"></div>
          <div>
            <p class="eyebrow">Hikemage</p>
            <h1 id="title"></h1>
          </div>
        </header>
        <div class="meta">
          <div class="stat"><span>Date</span><strong id="date"></strong></div>
          <div class="stat"><span>Distance</span><strong id="distance"></strong></div>
          <div class="stat"><span>Mood</span><strong id="mood"></strong></div>
          <div class="stat"><span>Photos</span><strong id="count"></strong></div>
        </div>
        <p class="notes" id="notes"></p>
        <div class="photo-stack" id="photos"></div>
      </aside>
      <main>
        <div id="map"></div>
      </main>
    </div>
    <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
    <script>window.HIKE_DATA = ${json};</script>
    <script>
      const hike = window.HIKE_DATA;
      const map = L.map("map").setView([39.5, -98.35], 4);
      L.tileLayer("${tileLayerUrl}", {
        maxZoom: 19,
        attribution: "${tileAttribution.replace(/"/g, '\\"')}"
      }).addTo(map);
      const route = L.polyline(hike.route || [], {
        color: "#356c55",
        weight: 5,
        opacity: .88,
        lineCap: "round",
        lineJoin: "round"
      }).addTo(map);
      const markers = [];
      document.querySelector("#title").textContent = hike.title || "Untitled hike";
      document.querySelector("#date").textContent = hike.date || "Saved trail";
      document.querySelector("#distance").textContent = hike.distance || "0 mi / 0 km";
      document.querySelector("#mood").textContent = hike.mood || "Fresh air";
      document.querySelector("#count").textContent =
        hike.photos.length === 1 ? "1 photo" : hike.photos.length + " photos";
      document.querySelector("#notes").textContent = hike.notes || "A trail worth keeping.";

      function escapeHtml(value) {
        return String(value || "").replace(/[&<>"']/g, (character) => ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#039;"
        })[character]);
      }

      function photoIcon(photo) {
        return L.divIcon({
          className: "",
          iconSize: [48, 58],
          iconAnchor: [24, 52],
          popupAnchor: [0, -52],
          html: '<div class="photo-pin"><div class="photo-pin-frame"><img src="' +
            photo.thumb + '" alt=""></div></div>'
        });
      }

      function popup(photo) {
        const caption = photo.caption ? "<p>" + escapeHtml(photo.caption) + "</p>" : "";
        return '<div class="photo-popup"><img src="' + photo.src + '" alt="">' +
          "<strong>" + escapeHtml(photo.name) + "</strong>" +
          caption + "</div>";
      }

      const list = document.querySelector("#photos");
      hike.photos.forEach((photo, index) => {
        const marker = L.marker([photo.lat, photo.lng], {
          icon: photoIcon(photo),
          title: photo.caption || photo.name
        }).bindPopup(popup(photo)).addTo(map);
        markers.push(marker);

        const card = document.createElement("button");
        card.type = "button";
        card.className = "photo-card";
        card.innerHTML =
          '<img src="' + photo.thumb + '" alt="">' +
          '<div><strong>' + escapeHtml(photo.caption || photo.name) + '</strong>' +
          '<span>Stop ' + (index + 1) + '</span></div>';
        card.addEventListener("click", () => {
          map.setView([photo.lat, photo.lng], Math.max(map.getZoom(), 15));
          marker.openPopup();
        });
        list.appendChild(card);
      });

      const boundsPoints = [
        ...(hike.route || []),
        ...hike.photos.map((photo) => [photo.lat, photo.lng])
      ];
      if (boundsPoints.length) {
        map.fitBounds(L.latLngBounds(boundsPoints), { padding: [48, 48], maxZoom: 15 });
      }
    </script>
  </body>
</html>`;
  }

  function showToast(message) {
    elements.toast.textContent = message;
    elements.toast.classList.add("is-visible");
    clearTimeout(showToast.timeoutId);
    showToast.timeoutId = setTimeout(() => {
      elements.toast.classList.remove("is-visible");
    }, 2600);
  }

  function degreesToRadians(value) {
    return (value * Math.PI) / 180;
  }

  function isFiniteNumber(value) {
    return typeof value === "number" && Number.isFinite(value);
  }

  function slugify(value) {
    return String(value || "hikemage-trail")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "")
      .slice(0, 70) || "hikemage-trail";
  }

  function escapeHtml(value) {
    return String(value || "").replace(/[&<>"']/g, (character) => {
      const entities = {
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;",
      };
      return entities[character];
    });
  }

  function escapeAttribute(value) {
    return escapeHtml(value).replace(/`/g, "&#096;");
  }
})();
