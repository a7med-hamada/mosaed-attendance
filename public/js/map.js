// Leaflet Map Integration & Geofence Visualizer
let workplaceMap = null;
let workplaceMarker = null;
let workplaceCircle = null;

let recordPreviewMap = null;
let previewMarker = null;
let previewCircle = null;

const MapHelper = {
  // Initialize workplace geofence map in Manager Settings
  initWorkplaceMap(containerId, lat, lng, radius, onLocationChange) {
    if (typeof L === 'undefined') {
      console.warn('Leaflet library is not loaded');
      return;
    }

    const container = document.getElementById(containerId);
    if (!container) return;

    if (workplaceMap) {
      workplaceMap.remove();
      workplaceMap = null;
    }

    const defaultLat = parseFloat(lat) || 30.0444;
    const defaultLng = parseFloat(lng) || 31.2357;
    const defaultRadius = parseFloat(radius) || 150;

    workplaceMap = L.map(containerId).setView([defaultLat, defaultLng], 16);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
      maxZoom: 19
    }).addTo(workplaceMap);

    // Workplace marker
    workplaceMarker = L.marker([defaultLat, defaultLng], {
      draggable: true
    }).addTo(workplaceMap);

    // Geofence Circle
    workplaceCircle = L.circle([defaultLat, defaultLng], {
      color: '#2563eb',
      fillColor: '#3b82f6',
      fillOpacity: 0.2,
      radius: defaultRadius
    }).addTo(workplaceMap);

    // On Drag
    workplaceMarker.on('dragend', function (e) {
      const position = workplaceMarker.getLatLng();
      workplaceCircle.setLatLng(position);
      if (onLocationChange) {
        onLocationChange(position.lat, position.lng);
      }
    });

    // On Click map
    workplaceMap.on('click', function (e) {
      workplaceMarker.setLatLng(e.latlng);
      workplaceCircle.setLatLng(e.latlng);
      if (onLocationChange) {
        onLocationChange(e.latlng.lat, e.latlng.lng);
      }
    });

    setTimeout(() => {
      if (workplaceMap) workplaceMap.invalidateSize();
    }, 200);
  },

  // Update circle radius dynamically
  updateCircleRadius(newRadius) {
    if (workplaceCircle) {
      workplaceCircle.setRadius(parseFloat(newRadius));
    }
  },

  // Move marker & circle programmatically
  setWorkplaceCoordinates(lat, lng) {
    if (workplaceMap && workplaceMarker && workplaceCircle) {
      const latlng = [parseFloat(lat), parseFloat(lng)];
      workplaceMarker.setLatLng(latlng);
      workplaceCircle.setLatLng(latlng);
      workplaceMap.setView(latlng, 16);
    }
  },

  // Preview employee check-in on map with distance line
  initRecordMap(containerId, wpLat, wpLng, radius, empLat, empLng) {
    if (typeof L === 'undefined') return;
    const container = document.getElementById(containerId);
    if (!container) return;

    if (recordPreviewMap) {
      recordPreviewMap.remove();
      recordPreviewMap = null;
    }

    const wp = [parseFloat(wpLat), parseFloat(wpLng)];
    const emp = empLat && empLng ? [parseFloat(empLat), parseFloat(empLng)] : wp;

    recordPreviewMap = L.map(containerId).setView(wp, 16);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap'
    }).addTo(recordPreviewMap);

    // Workplace Circle
    L.circle(wp, {
      color: '#10b981',
      fillColor: '#10b981',
      fillOpacity: 0.2,
      radius: parseFloat(radius) || 150
    }).addTo(recordPreviewMap);

    // Workplace Pin
    L.marker(wp, {
      title: 'مقر العمل'
    }).addTo(recordPreviewMap).bindPopup('مقر العمل الرئيسي');

    // Employee Pin if available
    if (empLat && empLng) {
      const empMarker = L.marker(emp, {
        title: 'موقع الموظف'
      }).addTo(recordPreviewMap).bindPopup('موقع تسجيل الموظف').openPopup();

      // Connecting line
      L.polyline([wp, emp], {
        color: '#ef4444',
        weight: 3,
        dashArray: '5, 10'
      }).addTo(recordPreviewMap);

      const group = new L.featureGroup([L.marker(wp), empMarker]);
      recordPreviewMap.fitBounds(group.getBounds().pad(0.3));
    }

    setTimeout(() => {
      if (recordPreviewMap) recordPreviewMap.invalidateSize();
    }, 200);
  }
};
