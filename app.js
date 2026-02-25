/**
 * new_dmap - 지도 엔진 기반 DXF 도면 뷰어 (메인 앱)
 * ADMAP 기능 유지 + Google Maps 렌더링 (VMAP 참조)
 * 배경 기본 없음, 사용자 선택 가능
 */
'use strict';

var map = null;
var dxfData = null;
var dxfFileName = '';
var dxfFileFullName = ''; // 저장소 키 (파일명과 동일)
var dxfBoundsLatLng = null;
var currentMapType = 'none';

var photos = [];
var texts = [];
var photoMarkers = [];
var textMarkers = [];
var textOverlay = null;
var pendingAddPosition = null; // { x, y } DXF 좌표 (롱프레스 시)
var lastLongPressEndTime = 0;
var contextMenuEl = null;
var longPressTimer = null;
var longPressDuration = 400;

var fileListScreen = null;
var viewerScreen = null;
var viewerUI = null;
var fileList = null;
var localFileInput = null;
var loadingEl = null;
var slideMenu = null;
var menuOverlay = null;
var mapTypeSelector = null;
var editingPhotoId = null;
var editingTextId = null;
var imageSizeSetting = typeof localStorage !== 'undefined' ? (localStorage.getItem('dmap:imageSize') || '2MB') : '2MB';
var exportInfo = null; // 내보내기 방식 선택 모달용 { photos, totalSizeMB }
var mapBindingsDone = false; // ensureMap에서 map 의존 바인딩 1회만 수행
/** DXF에 참조된 이미지: { id, x, y, fileName, file?: File }. 파란원으로 표시, 클릭 시 뷰어. 내보내기에는 미포함. */
var dxfImageRefs = [];
var dxfImageMarkers = [];
var editingDxfImageRef = null; // 참조 이미지 뷰어 표시 중인 ref (사진 모달 재사용)
var dxfImageObjectUrl = null; // 참조 이미지 object URL (닫을 때 revoke)

/**
 * Google Maps API 로드 후 콜백. 지도는 생성하지 않고 DOM/UI만 준비 (지도는 뷰어 표시 시 ensureMap에서 생성).
 */
function initMap() {
  fileListScreen = document.getElementById('file-list-screen');
  viewerScreen = document.getElementById('viewer-screen');
  viewerUI = document.getElementById('viewer-ui');
  fileList = document.getElementById('file-list');
  localFileInput = document.getElementById('local-file-input');
  loadingEl = document.getElementById('loading');
  slideMenu = document.getElementById('slide-menu');
  menuOverlay = document.getElementById('menu-overlay');
  mapTypeSelector = document.getElementById('map-type-selector');
  contextMenuEl = document.getElementById('context-menu');

  var crsEl = document.getElementById('menu-map-type-crs');
  if (crsEl) {
    var C = window.DMAP_CONFIG || {};
    crsEl.textContent = C.DXF_CRS ? '(' + C.DXF_CRS + ')' : '';
  }

  if (window.localStore && window.localStore.init) {
    window.localStore.init().catch(function () {});
  }
  bindPhotoModal();
  bindTextModal();
  bindImageSizeModal();
  bindUI();
  bindDeleteDataModal();
  console.log('new_dmap: API 로드 완료 (지도는 뷰어 표시 시 생성)');
}

/**
 * 뷰어가 표시된 상태에서 지도가 없으면 생성하고 map 의존 바인딩 1회 수행.
 * VMAP처럼 컨테이너가 보이는 시점에만 지도를 만들어 타일 미로드 방지.
 */
function ensureMap() {
  if (map) {
    if (!mapBindingsDone) {
      bindMapLongPress();
      bindContextMenu();
      bindContextMenuCloseOnMap();
      bindScaleDisplay();
      bindDoubleTapZoom();
      bindDxfDataLayerClick();
      bindDxfTextModal();
      mapBindingsDone = true;
    }
    return;
  }
  if (!window.google || !window.google.maps) {
    console.error('new_dmap: Google Maps API가 로드되지 않았습니다. config.js API 키와 실행 환경(http 서버)을 확인하세요.');
    return;
  }
  var C = window.DMAP_CONFIG || {};
  var lat0 = C.MAP_ORIGIN_LAT != null ? C.MAP_ORIGIN_LAT : 36.3;
  var lng0 = C.MAP_ORIGIN_LNG != null ? C.MAP_ORIGIN_LNG : 127.8;
  var blankStyle = C.BLANK_MAP_STYLE || [];

  var mapEl = document.getElementById('map');
  if (!mapEl) {
    console.error('new_dmap: #map 요소 없음');
    return;
  }
  var rect = mapEl.getBoundingClientRect();
  console.log('new_dmap: #map 크기 (지도 생성 시점)', rect.width, 'x', rect.height);

  map = new google.maps.Map(mapEl, {
    zoom: 16,
    center: { lat: lat0, lng: lng0 },
    mapTypeControl: false,
    fullscreenControl: false,
    streetViewControl: false,
    zoomControl: false,
    scaleControl: false,
    rotateControl: false,
    tilt: 0,
    gestureHandling: 'greedy',
    disableDefaultUI: true,
    clickableIcons: false,
    animation: google.maps.Animation.NONE,
    backgroundColor: '#f5f5f5',
    disableDoubleClickZoom: true,
    styles: blankStyle
  });

  // VMAP 참고: 브이월드 타일 레이어 등록 (도로/위성에서 구글·브이월드 선택 가능)
  var vworldRoadmapType = new google.maps.ImageMapType({
    getTileUrl: function (coord, zoom) {
      return 'https://xdworld.vworld.kr/2d/Base/service/' + zoom + '/' + coord.x + '/' + coord.y + '.png';
    },
    tileSize: new google.maps.Size(256, 256),
    name: '브이월드일반',
    maxZoom: 19
  });
  var vworldSatelliteType = new google.maps.ImageMapType({
    getTileUrl: function (coord, zoom) {
      return 'https://xdworld.vworld.kr/2d/Satellite/service/' + zoom + '/' + coord.x + '/' + coord.y + '.jpeg';
    },
    tileSize: new google.maps.Size(256, 256),
    name: '브이월드영상',
    maxZoom: 19
  });
  map.mapTypes.set('브이월드일반', vworldRoadmapType);
  map.mapTypes.set('브이월드영상', vworldSatelliteType);

  bindMapLongPress();
  bindContextMenu();
  bindContextMenuCloseOnMap();
  bindScaleDisplay();
  bindDoubleTapZoom();
  bindDxfDataLayerClick();
  bindDxfTextModal();
  mapBindingsDone = true;
  console.log('new_dmap: 지도 생성 완료 (뷰어 표시 후, 배경 없음 기본)');
}

function bindUI() {
  if (localFileInput) {
    localFileInput.addEventListener('change', function (e) {
      var file = e.target && e.target.files[0];
      if (file) loadDxfFile(file);
      e.target.value = '';
    });
  }
  var folderInput = document.getElementById('folder-input');
  if (folderInput) {
    folderInput.addEventListener('change', function (e) {
      var files = e.target && e.target.files;
      if (files && files.length) loadDxfFromFolder(files);
      e.target.value = '';
    });
  }

  document.getElementById('hamburger-btn').addEventListener('click', function () {
    slideMenu.classList.add('active');
    menuOverlay.classList.add('active');
    if (typeof console !== 'undefined' && console.log) {
      var items = document.querySelectorAll('#slide-menu .slide-menu-item');
      var list = [];
      for (var i = 0; i < items.length; i++) {
        var el = items[i];
        list.push((el.id || '(no id)') + ': ' + (el.textContent || '').trim().slice(0, 30));
      }
      console.log('[new_dmap] 슬라이드 메뉴 항목 (' + items.length + '개):', list);
    }
  });
  menuOverlay.addEventListener('click', function () {
    slideMenu.classList.remove('active');
    menuOverlay.classList.remove('active');
    if (mapTypeSelector) mapTypeSelector.classList.remove('show');
    if (contextMenuEl) contextMenuEl.classList.remove('active');
  });

  document.getElementById('menu-back-to-list').addEventListener('click', function () {
    slideMenu.classList.remove('active');
    menuOverlay.classList.remove('active');
    showFileList();
  });
  document.getElementById('menu-map-type').addEventListener('click', function () {
    slideMenu.classList.remove('active');
    menuOverlay.classList.remove('active');
    if (mapTypeSelector) mapTypeSelector.classList.toggle('show');
  });
  document.getElementById('menu-image-size').addEventListener('click', function () {
    slideMenu.classList.remove('active');
    menuOverlay.classList.remove('active');
    showImageSizeModal();
  });
  document.getElementById('menu-export').addEventListener('click', function () {
    slideMenu.classList.remove('active');
    menuOverlay.classList.remove('active');
    if (!dxfFileFullName || !window.localStore) {
      alert('저장된 자료가 없습니다.');
      return;
    }
    exportLocalData();
  });

  var menuDeleteData = document.getElementById('menu-delete-data');
  if (menuDeleteData) {
    menuDeleteData.addEventListener('click', function () {
      slideMenu.classList.remove('active');
      menuOverlay.classList.remove('active');
      showDeleteDataModal();
    });
    if (typeof console !== 'undefined' && console.log) console.log('[new_dmap] 자료 삭제 메뉴 바인딩 완료 (menu-delete-data)');
  } else {
    if (typeof console !== 'undefined' && console.warn) console.warn('[new_dmap] menu-delete-data 요소를 찾을 수 없음. 슬라이드 메뉴 항목 수:', document.querySelectorAll('#slide-menu .slide-menu-item').length);
  }

  var toggleObjectVisibilityBtn = document.getElementById('menu-toggle-object-visibility');
  if (toggleObjectVisibilityBtn) {
    toggleObjectVisibilityBtn.addEventListener('click', function () {
      slideMenu.classList.remove('active');
      menuOverlay.classList.remove('active');
      showObjectVisibilityModal();
    });
  }

  var objVisModal = document.getElementById('object-visibility-modal');
  var objVisClose = document.getElementById('object-visibility-close');
  var objVisRed = document.getElementById('obj-vis-red');
  var objVisBlue = document.getElementById('obj-vis-blue');
  var objVisText = document.getElementById('obj-vis-text');
  if (objVisClose) objVisClose.addEventListener('click', hideObjectVisibilityModal);
  if (objVisModal) {
    objVisModal.addEventListener('click', function (e) {
      if (e.target === objVisModal) hideObjectVisibilityModal();
    });
  }
  function syncObjectVisibilityFromCheckboxes() {
    photoMarkersVisible = objVisRed ? objVisRed.checked : true;
    dxfImageMarkersVisible = objVisBlue ? objVisBlue.checked : true;
    dxfTextVisible = objVisText ? objVisText.checked : true;
    applyObjectVisibility();
  }
  if (objVisRed) objVisRed.addEventListener('change', syncObjectVisibilityFromCheckboxes);
  if (objVisBlue) objVisBlue.addEventListener('change', syncObjectVisibilityFromCheckboxes);
  if (objVisText) objVisText.addEventListener('change', syncObjectVisibilityFromCheckboxes);

  var menuConsoleBtn = document.getElementById('menu-console');
  if (menuConsoleBtn) {
    menuConsoleBtn.addEventListener('click', function () {
      slideMenu.classList.remove('active');
      menuOverlay.classList.remove('active');
      toggleVConsole();
    });
  }

  var exportMethodModal = document.getElementById('export-method-modal');
  var exportInfoBox = document.getElementById('export-info-box');
  var exportMethodClose = document.getElementById('export-method-close');
  var exportZipBtn = document.getElementById('export-zip-btn');
  var exportIndividualBtn = document.getElementById('export-individual-btn');
  if (exportMethodClose) exportMethodClose.addEventListener('click', hideExportMethodModal);
  if (exportZipBtn) exportZipBtn.addEventListener('click', exportAsZip);
  if (exportIndividualBtn) exportIndividualBtn.addEventListener('click', exportAsIndividual);
  if (exportMethodModal) {
    exportMethodModal.addEventListener('click', function (e) {
      if (e.target === exportMethodModal) hideExportMethodModal();
    });
  }

  document.getElementById('zoom-fit').addEventListener('click', fitDxfToView);
  document.getElementById('zoom-in').addEventListener('click', function () {
    if (map) map.setZoom((map.getZoom() || 16) + 1);
  });
  document.getElementById('zoom-out').addEventListener('click', function () {
    if (map) map.setZoom(Math.max(1, (map.getZoom() || 16) - 1));
  });

  if (mapTypeSelector) {
    mapTypeSelector.querySelectorAll('button[data-type]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var type = this.getAttribute('data-type');
        setMapType(type);
        mapTypeSelector.querySelectorAll('button[data-type]').forEach(function (b) { b.classList.remove('active'); });
        this.classList.add('active');
        mapTypeSelector.classList.remove('show');
      });
    });
  }
}

/**
 * ADMAP과 동일: 현재 화면 가로 폭을 미터 단위로 표시.
 * 거리 계산: 지도 bounds(NE, SW)의 경도 차이(도) × 해당 위도에서 1도 경도당 미터(111320×cos(위도)).
 * 위도 1도 ≈ 111320m, 경도 1도 ≈ 111320×cos(위도)m 이므로, 가로 폭(m) = (NE.lng - SW.lng) × 111320 × cos(중심위도).
 */
function updateScaleDisplay() {
  var el = document.getElementById('scale-display');
  if (!el || !map) return;
  var bounds = map.getBounds();
  if (!bounds) { el.textContent = '—'; return; }
  var ne = bounds.getNorthEast();
  var sw = bounds.getSouthWest();
  var centerLat = (ne.lat() + sw.lat()) / 2;
  var latRad = (centerLat * Math.PI) / 180;
  var metersPerDegLng = 111320 * Math.cos(latRad);
  var widthMeters = (ne.lng() - sw.lng()) * metersPerDegLng;
  if (widthMeters >= 1000) {
    el.textContent = (widthMeters / 1000).toFixed(1) + 'km';
  } else if (widthMeters >= 10) {
    el.textContent = widthMeters.toFixed(0) + 'm';
  } else if (widthMeters >= 1) {
    el.textContent = widthMeters.toFixed(1) + 'm';
  } else {
    el.textContent = (widthMeters * 100).toFixed(0) + 'cm';
  }
}

function bindScaleDisplay() {
  if (!map) return;
  google.maps.event.addListener(map, 'idle', updateScaleDisplay);
  google.maps.event.addListener(map, 'bounds_changed', function () {
    if (scaleDisplayTimeout) clearTimeout(scaleDisplayTimeout);
    scaleDisplayTimeout = setTimeout(updateScaleDisplay, 180);
  });
  updateScaleDisplay();
}
var scaleDisplayTimeout = null;

/** 더블탭 시 해당 위치를 중심으로 화면 가로 폭 50m가 되도록 확대/축소 (ADMAP defaultZoomRange 50m) */
var lastTapTime = 0;
var lastTapLatLng = null;
var doubleTapDelayMs = 300;
var doubleTapMaxDistM = 8;

function bindDoubleTapZoom() {
  if (!map) return;
  google.maps.event.addListener(map, 'click', function (e) {
    var latLng = e.latLng;
    if (!latLng) return;
    var now = Date.now();
    var isDoubleTap = lastTapTime && (now - lastTapTime) < doubleTapDelayMs && lastTapLatLng &&
      getLatLngDistanceM(lastTapLatLng, latLng) < doubleTapMaxDistM;
    if (isDoubleTap) {
      lastTapTime = 0;
      lastTapLatLng = null;
      zoomMapTo50mAt(latLng);
      return;
    }
    lastTapTime = now;
    lastTapLatLng = latLng;
  });
}

function getLatLngDistanceM(a, b) {
  var lat1 = (a.lat && a.lat()) ? a.lat() : a.lat;
  var lng1 = (a.lng && a.lng()) ? a.lng() : a.lng;
  var lat2 = (b.lat && b.lat()) ? b.lat() : b.lat;
  var lng2 = (b.lng && b.lng()) ? b.lng() : b.lng;
  var latRad = (lat1 * Math.PI) / 180;
  var dy = (lat2 - lat1) * 111320;
  var dx = (lng2 - lng1) * 111320 * Math.cos(latRad);
  return Math.sqrt(dx * dx + dy * dy);
}

function zoomMapTo50mAt(latLng) {
  if (!map || !latLng) return;
  var lat = (latLng.lat && latLng.lat()) ? latLng.lat() : latLng.lat;
  var lng = (latLng.lng && latLng.lng()) ? latLng.lng() : latLng.lng;
  var latRad = (lat * Math.PI) / 180;
  var lngSpan = 50 / (111320 * Math.cos(latRad));
  var half = lngSpan / 2;
  var bounds = new google.maps.LatLngBounds(
    new google.maps.LatLng(lat - 1e-5, lng - half),
    new google.maps.LatLng(lat + 1e-5, lng + half)
  );
  map.fitBounds(bounds);
}

function showLoading(show) {
  if (loadingEl) loadingEl.classList.toggle('active', !!show);
}

function exportLocalData() {
  window.localStore.loadPhotos(dxfFileFullName).then(function (photosList) {
    var totalSize = 0;
    if (photosList && photosList.length) {
      photosList.forEach(function (p) { if (p.blob) totalSize += p.blob.size; });
    }
    exportInfo = {
      photos: photosList || [],
      totalSizeMB: (totalSize / 1024 / 1024).toFixed(1)
    };
    showExportMethodModal();
  }).catch(function (err) {
    console.error('내보내기 준비 실패:', err);
    alert('내보내기 준비 실패: ' + (err && err.message ? err.message : err));
  });
}

function showExportMethodModal() {
  var modal = document.getElementById('export-method-modal');
  var infoBox = document.getElementById('export-info-box');
  if (modal) modal.classList.add('active');
  if (infoBox && exportInfo) {
    infoBox.textContent = '사진 ' + exportInfo.photos.length + '장, 총 ' + exportInfo.totalSizeMB + 'MB';
  }
}

function hideExportMethodModal() {
  var modal = document.getElementById('export-method-modal');
  if (modal) modal.classList.remove('active');
  exportInfo = null;
}

function exportAsZip() {
  hideExportMethodModal();
  if (!dxfFileFullName || !window.localStore) return;
  showLoading(true);
  window.localStore.exportAsZipOnly(dxfFileFullName).then(function () {
    showLoading(false);
    alert('내보내기 완료.');
  }).catch(function (err) {
    showLoading(false);
    alert('내보내기 실패: ' + (err && err.message ? err.message : err));
  });
}

function exportAsIndividual() {
  hideExportMethodModal();
  if (!dxfFileFullName || !window.localStore) return;
  showLoading(true);
  window.localStore.exportProjectSequential(dxfFileFullName, function (cur, total, name) {
    console.log('내보내기 ' + cur + '/' + total + ' ' + name);
  }).then(function () {
    showLoading(false);
    alert('내보내기 완료.');
  }).catch(function (err) {
    showLoading(false);
    alert('내보내기 실패: ' + (err && err.message ? err.message : err));
  });
}

function showFileList() {
  if (fileListScreen) fileListScreen.classList.remove('hidden');
  if (viewerScreen) viewerScreen.classList.add('hidden');
  if (viewerUI) viewerUI.classList.add('hidden');
}

function showViewer() {
  if (fileListScreen) fileListScreen.classList.add('hidden');
  if (viewerScreen) viewerScreen.classList.remove('hidden');
  if (viewerUI) viewerUI.classList.remove('hidden');
  // 뷰어가 보인 뒤에만 지도 생성 (컨테이너 크기 확보 → 타일 로드 보장)
  ensureMap();
  if (map) {
    requestAnimationFrame(function () {
      google.maps.event.trigger(map, 'resize');
    });
  }
}

/**
 * DXF 원본 텍스트에서 constantWidth(그룹코드 43)를 추출하여 엔티티에 추가.
 * 파서가 constantWidth를 파싱하지 못하는 경우를 대비 (ADMAP 방식).
 */
function extractConstantWidths(dxfData, dxfText) {
  if (!dxfData || !dxfData.entities || !dxfText || typeof dxfText !== 'string') return;
  var lines = dxfText.split(/\r?\n/);
  var mapList = [];
  var inEntity = false;
  var currentLayer = '';
  var constantWidth = null;
  var entityType = '';
  var firstX = null;
  var firstY = null;
  var i, line, nextLine, j, val;
  function pushCurrent() {
    if (inEntity && constantWidth !== null && currentLayer) {
      mapList.push({
        layer: currentLayer,
        constantWidth: constantWidth,
        type: entityType,
        firstVertex: firstX !== null && firstY !== null ? { x: firstX, y: firstY } : null
      });
    }
  }
  for (i = 0; i < lines.length; i++) {
    line = lines[i].trim();
    if (line === 'LWPOLYLINE' || line === 'POLYLINE') {
      pushCurrent();
      inEntity = true;
      entityType = line;
      currentLayer = '';
      constantWidth = null;
      firstX = null;
      firstY = null;
    } else if (inEntity) {
      if (line === '8' && i + 1 < lines.length) {
        currentLayer = lines[i + 1].trim();
      } else if (line === '100' && i + 1 < lines.length && lines[i + 1].trim() === 'AcDbPolyline') {
        for (j = i + 2; j < Math.min(i + 20, lines.length); j++) {
          nextLine = lines[j].trim();
          if (nextLine === '43' && j + 1 < lines.length) {
            val = parseFloat(lines[j + 1].trim());
            if (!isNaN(val)) { constantWidth = val; break; }
          } else if (nextLine === '10') break;
        }
      } else if (line === '43' && i + 1 < lines.length && constantWidth === null) {
        val = parseFloat(lines[i + 1].trim());
        if (!isNaN(val)) constantWidth = val;
      } else if (line === '10' && i + 1 < lines.length && firstX === null) {
        val = parseFloat(lines[i + 1].trim());
        if (!isNaN(val)) firstX = val;
      } else if (line === '20' && i + 1 < lines.length && firstX !== null && firstY === null) {
        val = parseFloat(lines[i + 1].trim());
        if (!isNaN(val)) firstY = val;
      } else if (line === '0' || line === 'SEQEND') {
        pushCurrent();
        inEntity = false;
        currentLayer = '';
        constantWidth = null;
        firstX = null;
        firstY = null;
      }
    }
  }
  pushCurrent();
  var mapIndex = 0;
  dxfData.entities.forEach(function (entity) {
    if (entity.type !== 'LWPOLYLINE' && entity.type !== 'POLYLINE') return;
    if (entity.constantWidth !== undefined && entity.constantWidth !== null) return;
    var best = null;
    var bestScore = -1;
    for (var k = 0; k < mapList.length; k++) {
      var item = mapList[k];
      if (item.type !== entity.type || item.layer !== entity.layer) continue;
      var score = 0;
      if (entity.vertices && entity.vertices.length > 0 && item.firstVertex) {
        var v0 = entity.vertices[0];
        var th = 0.001;
        if (Math.abs(v0.x - item.firstVertex.x) < th && Math.abs(v0.y - item.firstVertex.y) < th) {
          score = 100;
          best = item;
          bestScore = score;
          break;
        }
      }
      if (score === 0) {
        score = 100 - Math.abs(k - mapIndex);
        if (score > bestScore) { best = item; bestScore = score; }
      }
    }
    if (best) {
      entity.constantWidth = best.constantWidth;
      mapIndex = mapList.indexOf(best) + 1;
    }
  });
}

/**
 * DXF 원문에서 IMAGE 엔티티와 IMAGEDEF 객체를 파싱해 참조 이미지 목록 반환.
 * IMAGE: 10,20 (삽입점), 340 (IMAGEDEF 핸들). IMAGEDEF: 5 (핸들), 1 (파일명).
 */
function extractDxfImageRefs(dxfText) {
  if (!dxfText || typeof dxfText !== 'string') return [];
  var lines = dxfText.split(/\r?\n/).map(function (l) { return l.trim(); });
  var handleToFilename = {};
  var refs = [];
  var i, j, code, val, section, x, y, handle, defHandle, defFile, fn;

  for (i = 0; i < lines.length - 3; i++) {
    if (lines[i] !== '0' || lines[i + 1] !== 'SECTION') continue;
    section = lines[i + 3];
    if (section === 'OBJECTS') {
      for (j = i + 4; j < lines.length - 1; j++) {
        code = lines[j];
        val = lines[j + 1];
        if (code === '0' && val === 'ENDSEC') break;
        if (code === '0' && val === 'IMAGEDEF') {
          defHandle = '';
          defFile = '';
          for (j = j + 2; j < lines.length - 1; j += 2) {
            code = lines[j];
            val = lines[j + 1];
            if (code === '0') { j -= 2; break; }
            if (code === '5') defHandle = val;
            if (code === '1') defFile = val;
          }
          if (defHandle && defFile) handleToFilename[defHandle.toUpperCase()] = defFile.replace(/\\/g, '/');
        }
      }
      break;
    }
  }
  for (i = 0; i < lines.length - 3; i++) {
    if (lines[i] !== '0' || lines[i + 1] !== 'SECTION') continue;
    section = lines[i + 3];
    if (section === 'ENTITIES') {
      for (j = i + 4; j < lines.length - 1; j++) {
        code = lines[j];
        val = lines[j + 1];
        if (code === '0' && val === 'ENDSEC') break;
        if (code === '0' && val === 'IMAGE') {
          x = y = handle = null;
          for (j = j + 2; j < lines.length - 1; j += 2) {
            code = lines[j];
            val = lines[j + 1];
            if (code === '0') { j -= 2; break; }
            if (code === '10') x = parseFloat(val);
            if (code === '20') y = parseFloat(val);
            if (code === '340') handle = val ? String(val).toUpperCase() : '';
          }
          if (x != null && !isNaN(x) && y != null && !isNaN(y)) {
            fn = (handle && handleToFilename[handle]) ? handleToFilename[handle] : '';
            refs.push({ x: x, y: y, fileName: fn || '(이미지)', handle: handle });
          }
        }
      }
      break;
    }
  }
  return refs;
}

function fileBasename(pathOrName) {
  if (typeof pathOrName !== 'string') return '';
  var s = pathOrName.replace(/\\/g, '/');
  var i = s.lastIndexOf('/');
  return i >= 0 ? s.slice(i + 1) : s;
}

/**
 * DXF 원문을 1회만 파싱하고 constantWidth·IMAGE ref 추출까지 수행.
 * 반환: { dxfData, rawImageRefs }. 오류 시 throw.
 */
function parseDxfTextAndBuildRefs(text) {
  if (!text || !text.includes('SECTION') || !text.includes('ENTITIES')) {
    throw new Error('올바른 DXF 파일 형식이 아닙니다.');
  }
  if (typeof DxfParser === 'undefined') {
    throw new Error('DXF 파서 라이브러리가 로드되지 않았습니다.');
  }
  var parser = new DxfParser();
  var data = parser.parseSync(text);
  if (!data) throw new Error('DXF 파싱에 실패했습니다.');
  if (!data.entities || data.entities.length === 0) {
    console.warn('DXF 엔티티 없음');
  }
  extractConstantWidths(data, text);
  var rawRefs = extractDxfImageRefs(text);
  return { dxfData: data, rawImageRefs: rawRefs };
}

/**
 * 파싱 결과를 전역에 반영하고 뷰어·지도·마커를 갱신. (로드 플로우 공통)
 */
function applyDxfLoadResult(dxfFileNameStr, dxfDataResult, imageRefsWithFile) {
  dxfData = dxfDataResult;
  dxfImageRefs = imageRefsWithFile;
  dxfFileName = dxfFileFullName = dxfFileNameStr;
  showViewer();
  applyDxfToMap();
  updateFileNameDisplay();
  drawDxfImageMarkers();
  loadMetadataAndDisplay(dxfFileFullName).then(function () {
    fitDxfToView();
  }).finally(function () {
    setTimeout(function () { showLoading(false); }, 100);
  });
}

function loadDxfFromFolder(files) {
  var arr = Array.from(files || []);
  var dxfFile = arr.filter(function (f) { return (f.name || '').toLowerCase().endsWith('.dxf'); })[0];
  if (!dxfFile) {
    alert('선택한 폴더에 DXF 파일이 없습니다.');
    return;
  }
  var fileMapByBasename = {};
  arr.forEach(function (f) {
    var name = (f.name || '').toLowerCase();
    fileMapByBasename[name] = f;
    fileMapByBasename[fileBasename(name)] = f;
  });
  showLoading(true);
  dxfFile.text().then(function (text) {
    try {
      var result = parseDxfTextAndBuildRefs(text);
      var imageRefsWithFile = result.rawImageRefs.map(function (r, idx) {
        var base = fileBasename(r.fileName).toLowerCase();
        var matched = fileMapByBasename[base] || fileMapByBasename[(r.fileName || '').toLowerCase()];
        return { id: 'dxfimg-' + idx, x: r.x, y: r.y, fileName: r.fileName, file: matched || null };
      });
      applyDxfLoadResult(dxfFile.name, result.dxfData, imageRefsWithFile);
    } catch (err) {
      console.error('DXF 로드 오류:', err);
      alert('DXF 파일을 여는데 실패했습니다: ' + (err.message || err));
      showLoading(false);
    }
  }).catch(function (err) {
    showLoading(false);
    alert('파일을 읽을 수 없습니다.');
    console.error(err);
  });
}

function loadDxfFile(file) {
  if (!file || !file.name) return;
  showLoading(true);
  file.text().then(function (text) {
    try {
      var result = parseDxfTextAndBuildRefs(text);
      var imageRefsWithFile = result.rawImageRefs.map(function (r, idx) {
        return { id: 'dxfimg-' + idx, x: r.x, y: r.y, fileName: r.fileName, file: null };
      });
      applyDxfLoadResult(file.name, result.dxfData, imageRefsWithFile);
    } catch (err) {
      console.error('DXF 로드 오류:', err);
      alert('DXF 파일을 여는데 실패했습니다: ' + (err.message || err));
      showLoading(false);
    }
  }).catch(function (err) {
    showLoading(false);
    alert('파일을 읽을 수 없습니다.');
    console.error(err);
  });
}

var dxfTextGreenCircleIcon = null;
var dxfTextGrayCircleIcon = null;

// DXF 텍스트 포인트 아이콘 고정 크기
var dxfTextIconSizePx = 10;

// DXF 텍스트 포인트 표시 여부 (객체 숨기기 모달)
var dxfTextVisible = true;
// 빨간원(촬영 사진)·파란원(참조 이미지) 표시 여부
var photoMarkersVisible = true;
var dxfImageMarkersVisible = true;

function getDxfTextGreenCircleIcon() {
  if (dxfTextGreenCircleIcon) return dxfTextGreenCircleIcon;
  var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24">' +
    '<circle cx="12" cy="12" r="10" fill="#00C853" fill-opacity="0.2" stroke="#FFFFFF" stroke-width="1.0"/></svg>';
  var s = dxfTextIconSizePx;
  dxfTextGreenCircleIcon = {
    url: 'data:image/svg+xml,' + encodeURIComponent(svg),
    scaledSize: new google.maps.Size(s, s),
    anchor: new google.maps.Point(s / 2, s / 2)
  };
  return dxfTextGreenCircleIcon;
}

function getDxfTextGrayCircleIcon() {
  if (dxfTextGrayCircleIcon) return dxfTextGrayCircleIcon;
  var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24">' +
    '<circle cx="12" cy="12" r="10" fill="#888888" fill-opacity="0.2" stroke="#FFFFFF" stroke-width="1.0"/></svg>';
  var s = dxfTextIconSizePx;
  dxfTextGrayCircleIcon = {
    url: 'data:image/svg+xml,' + encodeURIComponent(svg),
    scaledSize: new google.maps.Size(s, s),
    anchor: new google.maps.Point(s / 2, s / 2)
  };
  return dxfTextGrayCircleIcon;
}

function applyDxfToMap() {
  if (!map || !dxfData || !window.DxfToGeoJSON) return;
  var geoJson = window.DxfToGeoJSON.dxfToGeoJSON(dxfData);
  map.data.forEach(function (feature) { map.data.remove(feature); });
  if (geoJson.features && geoJson.features.length > 0) {
    map.data.addGeoJson(geoJson);
    map.data.setStyle(function (feature) {
      var geom = feature.getGeometry && feature.getGeometry();
      var geomType = geom && geom.getType ? geom.getType() : '';
      if (geomType === 'Point') {
        if (!dxfTextVisible) {
          return { visible: false, clickable: false };
        }
        var text = feature.getProperty('text');
        if (text != null && String(text).trim() !== '') {
          return {
            icon: getDxfTextGreenCircleIcon(),
            clickable: true
          };
        }
        return {
          icon: getDxfTextGrayCircleIcon(),
          clickable: false
        };
      }
      var strokeColor = feature.getProperty('strokeColor') || '#333';
      var fillColor = feature.getProperty('fillColor') || strokeColor;
      var thick = feature.getProperty('thick');
      var strokeWeight = thick ? 3 : 1;
      return {
        strokeColor: strokeColor,
        strokeWeight: strokeWeight,
        strokeOpacity: 0.9,
        fillColor: fillColor,
        fillOpacity: 0.06,
        clickable: false
      };
    });
    dxfBoundsLatLng = boundsFromGeoJSON(geoJson);
  } else {
    dxfBoundsLatLng = null;
  }
}

function showDxfTextModal(text) {
  var modal = document.getElementById('dxf-text-modal');
  var body = document.getElementById('dxf-text-modal-body');
  if (body) body.textContent = text == null ? '' : String(text);
  if (modal) modal.classList.add('active');
}

function hideDxfTextModal() {
  var modal = document.getElementById('dxf-text-modal');
  if (modal) modal.classList.remove('active');
}

function bindDxfTextModal() {
  var modal = document.getElementById('dxf-text-modal');
  var closeBtn = document.getElementById('dxf-text-modal-close');
  if (closeBtn) closeBtn.addEventListener('click', hideDxfTextModal);
  if (modal) modal.addEventListener('click', function (e) {
    if (e.target === modal) hideDxfTextModal();
  });
}

function showDeleteDataModal() {
  var modal = document.getElementById('delete-data-modal');
  var startInput = document.getElementById('delete-start-date');
  var endInput = document.getElementById('delete-end-date');
  if (!modal || !startInput || !endInput) return;
  var today = new Date();
  var yyyy = today.getFullYear();
  var mm = String(today.getMonth() + 1).padStart(2, '0');
  var dd = String(today.getDate()).padStart(2, '0');
  var todayStr = yyyy + '-' + mm + '-' + dd;
  if (!startInput.value) startInput.value = todayStr;
  if (!endInput.value) endInput.value = todayStr;
  modal.classList.add('active');
}

function hideDeleteDataModal() {
  var modal = document.getElementById('delete-data-modal');
  if (modal) modal.classList.remove('active');
}

function deleteDataByDateRange() {
  var startInput = document.getElementById('delete-start-date');
  var endInput = document.getElementById('delete-end-date');
  if (!startInput || !endInput) return;
  var startValue = startInput.value;
  var endValue = endInput.value;
  if (!startValue || !endValue) {
    alert('삭제할 날짜 범위를 선택하세요.');
    return;
  }
  if (!dxfFileFullName || !window.localStore) {
    alert('저장된 자료가 없습니다.');
    return;
  }
  var startDate = new Date(startValue + 'T00:00:00');
  var endDate = new Date(endValue + 'T23:59:59.999');
  if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
    alert('날짜 형식이 올바르지 않습니다.');
    return;
  }
  if (startDate > endDate) {
    alert('시작 날짜가 종료 날짜보다 늦습니다.');
    return;
  }
  if (!confirm('선택한 날짜 범위의 사진과 메타데이터를 삭제하시겠습니까?\n복구할 수 없습니다.')) return;
  var startMs = startDate.getTime();
  var endMs = endDate.getTime();
  window.localStore.deletePhotosByDateRange(dxfFileFullName, startMs, endMs).then(function (deletedIds) {
    var beforeTextCount = texts.length;
    texts = texts.filter(function (t) {
      if (!t.createdAt) return true;
      var ms = new Date(t.createdAt).getTime();
      return ms < startMs || ms > endMs;
    });
    var deletedTextCount = beforeTextCount - texts.length;
    var deletedIdSet = {};
    for (var i = 0; i < deletedIds.length; i++) deletedIdSet[String(deletedIds[i])] = true;
    photos = photos.filter(function (p) { return !deletedIdSet[String(p.id)]; });
    window.localStore.saveProject(dxfFileFullName, { texts: texts, lastModified: new Date().toISOString() }).then(function () {
      drawPhotoMarkers();
      drawTextMarkers();
      hideDeleteDataModal();
      hidePhotoModal();
      if (deletedIds.length === 0 && deletedTextCount === 0) {
        alert('삭제할 데이터가 없습니다.');
      } else {
        alert('사진 ' + deletedIds.length + '개, 텍스트 ' + deletedTextCount + '개 삭제 완료');
      }
    });
  }).catch(function (err) {
    console.error('자료 삭제 실패:', err);
    alert('삭제 실패: ' + (err && err.message ? err.message : '알 수 없음'));
  });
}

function bindDeleteDataModal() {
  var modal = document.getElementById('delete-data-modal');
  var closeBtn = document.getElementById('delete-data-close');
  var cancelBtn = document.getElementById('delete-data-cancel');
  var confirmBtn = document.getElementById('delete-data-confirm');
  if (closeBtn) closeBtn.addEventListener('click', hideDeleteDataModal);
  if (cancelBtn) cancelBtn.addEventListener('click', hideDeleteDataModal);
  if (confirmBtn) confirmBtn.addEventListener('click', deleteDataByDateRange);
  if (modal) modal.addEventListener('click', function (e) {
    if (e.target === modal) hideDeleteDataModal();
  });
}

/** ADMAP처럼 vConsole 토글. 열릴 때 진단 보고서를 로그로 출력해 프로그램 전체 상태 확인에 활용 */
function toggleVConsole() {
  var vcSwitch = document.querySelector('.vc-switch');
  if (vcSwitch) {
    vcSwitch.click();
    try {
      console.log('[new_dmap] vConsole 토글됨');
      console.log(buildConsoleReport());
    } catch (e) {}
    return;
  }
  var vc = window.vConsole || (typeof vConsole !== 'undefined' ? vConsole : null);
  if (vc) {
    var vcPanel = document.querySelector('.vc-panel');
    var isOpen = vcPanel && vcPanel.offsetParent !== null && vcPanel.style.display !== 'none';
    if (isOpen) {
      vc.hide();
    } else {
      vc.show();
      try {
        console.log('[new_dmap] vConsole 열림');
        console.log(buildConsoleReport());
      } catch (e) {}
    }
  } else {
    console.warn('[new_dmap] vConsole이 로드되지 않았습니다. index.html에 vConsole 스크립트를 추가하세요.');
  }
}

function buildConsoleReport() {
  var lines = [];
  lines.push('new_dmap 콘솔');
  lines.push('------------------------------');

  if (!map) {
    lines.push('map: 초기화되지 않음');
  } else {
    lines.push('map: OK (zoom=' + map.getZoom() + ')');
  }

  if (!dxfData) {
    lines.push('dxfData: 없음 (DXF 미로딩)');
  } else {
    var entCount = Array.isArray(dxfData.entities) ? dxfData.entities.length : 0;
    lines.push('dxfData.entities: ' + entCount + ' 개');
  }

  var totalFeatures = 0;
  var pointFeatures = 0;
  var textPoints = 0;
  var noTextPoints = 0;
  var textSamples = [];

  if (map && map.data) {
    map.data.forEach(function (f) {
      totalFeatures++;
      var g = f.getGeometry && f.getGeometry();
      if (!g || !g.getType) return;
      var t = g.getType();
      if (t === 'Point') {
        pointFeatures++;
        var txt = f.getProperty && f.getProperty('text');
        var s = txt != null ? String(txt).trim() : '';
        if (s) {
          textPoints++;
          if (textSamples.length < 10) {
            textSamples.push(s);
          }
        } else {
          noTextPoints++;
        }
      }
    });
  }

  lines.push('GeoJSON Feature 수: ' + totalFeatures);
  lines.push('Point Feature 수: ' + pointFeatures);
  lines.push(' ├─ text 있는 Point: ' + textPoints);
  lines.push(' └─ text 없는 Point: ' + noTextPoints);

  // 원본 DXF 엔티티에서 TEXT/MTEXT/ATTRIB 계열 통계
  if (dxfData && Array.isArray(dxfData.entities)) {
    var rawTextCount = 0;
    var rawMTextCount = 0;
    var rawAttribCount = 0;
    var rawSamples = [];
    dxfData.entities.forEach(function (e) {
      if (!e || !e.type) return;
      var t = String(e.type).toUpperCase();
      if (t === 'TEXT') rawTextCount++;
      else if (t === 'MTEXT') rawMTextCount++;
      else if (t === 'ATTRIB' || t === 'ATTDEF') rawAttribCount++;

      if (rawSamples.length < 5 && (t === 'TEXT' || t === 'MTEXT' || t === 'ATTRIB' || t === 'ATTDEF')) {
        rawSamples.push({
          type: t,
          layer: e.layer,
          position: e.position,
          insertionPoint: e.insertionPoint || e.insert,
          text: e.text,
          value: e.value,
          string: e.string,
          height: e.height,
          rotation: e.rotation
        });
      }
    });

    lines.push('');
    lines.push('원본 DXF 엔티티(TEXT/MTEXT/ATTRIB):');
    lines.push('  TEXT  개수: ' + rawTextCount);
    lines.push('  MTEXT 개수: ' + rawMTextCount);
    lines.push('  ATTRIB/ATTDEF 개수: ' + rawAttribCount);

    if (rawSamples.length > 0) {
      lines.push('');
      lines.push('원본 엔티티 샘플(최대 5개):');
      rawSamples.forEach(function (s, idx) {
        lines.push('  [' + (idx + 1) + '] ' + JSON.stringify(s));
      });
    } else {
      lines.push('');
      lines.push('TEXT/MTEXT/ATTRIB 엔티티를 찾지 못했습니다.');
    }
  }

  if (textSamples.length > 0) {
    lines.push('');
    lines.push('text 샘플(최대 10개):');
    textSamples.forEach(function (s, idx) {
      lines.push('  [' + (idx + 1) + '] ' + s);
    });
  } else {
    lines.push('');
    lines.push('text 있는 Point가 없습니다.');
  }

  var reportText = lines.join('\n');
  try {
    console.log('[new_dmap 콘솔 보고서]\n' + reportText);
  } catch (e) {}
  return reportText;
}

function bindDxfDataLayerClick() {
  if (!map) return;
  map.data.addListener('click', function (e) {
    if (Date.now() - lastLongPressEndTime < 600) return;
    var feature = e.feature;
    if (!feature) return;
    var text = feature.getProperty('text');
    if (text != null && String(text).trim() !== '') showDxfTextModal(text);
  });
}

function boundsFromGeoJSON(geoJson) {
  var minLat = Infinity, minLng = Infinity, maxLat = -Infinity, maxLng = -Infinity;
  function add(c) {
    if (c && Array.isArray(c) && c.length >= 2) {
      var lng = c[0], lat = c[1];
      if (isFinite(lat) && isFinite(lng)) {
        minLat = Math.min(minLat, lat);
        minLng = Math.min(minLng, lng);
        maxLat = Math.max(maxLat, lat);
        maxLng = Math.max(maxLng, lng);
      }
    }
  }
  function walk(coords) {
    if (Array.isArray(coords[0])) {
      coords.forEach(walk);
    } else {
      add(coords);
    }
  }
  if (geoJson.features) {
    geoJson.features.forEach(function (f) {
      var geom = f.geometry;
      if (!geom || !geom.coordinates) return;
      walk(geom.coordinates);
    });
  }
  if (!isFinite(minLat)) return null;
  return {
    sw: { lat: minLat, lng: minLng },
    ne: { lat: maxLat, lng: maxLng }
  };
}

function fitDxfToView() {
  if (!map) return;
  if (dxfBoundsLatLng) {
    var bounds = new google.maps.LatLngBounds(dxfBoundsLatLng.sw, dxfBoundsLatLng.ne);
    map.fitBounds(bounds, 40);
  } else {
    var C = window.DMAP_CONFIG || {};
    map.setCenter({ lat: C.MAP_ORIGIN_LAT || 36.3, lng: C.MAP_ORIGIN_LNG || 127.8 });
    map.setZoom(16);
  }
}

function updateFileNameDisplay() {
  var el = document.getElementById('file-name-text');
  if (el) {
    var sizeText = imageSizeSetting === 'original' ? '원본' : imageSizeSetting;
    el.textContent = (dxfFileName || '도면') + ' [' + sizeText + ']';
  }
}

function setMapType(type) {
  currentMapType = type || 'none';
  if (!map) return;
  var C = window.DMAP_CONFIG || {};
  if (currentMapType === 'none') {
    map.setOptions({ styles: C.BLANK_MAP_STYLE || [] });
    map.setMapTypeId('roadmap');
  } else if (currentMapType === 'roadmap') {
    map.setOptions({ styles: C.ROAD_ONLY_STYLE || [] });
    map.setMapTypeId('roadmap');
  } else {
    map.setOptions({ styles: [] });
    map.setMapTypeId(currentMapType);
  }
  requestAnimationFrame(function () {
    google.maps.event.trigger(map, 'resize');
  });
}

function getImageTargetSize() {
  switch (imageSizeSetting) {
    case '500KB': return 500 * 1024;
    case '1MB': return 1024 * 1024;
    case '2MB': return 2 * 1024 * 1024;
    case 'original': return null;
    default: return 2 * 1024 * 1024;
  }
}

/** ADMAP과 동일: DXF 파일 기준명(.dxf 제외) */
function getDxfBaseName() {
  var base = dxfFileFullName || (dxfFileName ? dxfFileName + '.dxf' : 'photo');
  return base.replace(/\.dxf$/i, '');
}

/** ADMAP과 동일: 사진 파일명 = 기준명_photo_MMDDHHmmss.jpg */
function generatePhotoFileName() {
  var baseName = getDxfBaseName();
  var now = new Date();
  var mm = String(now.getMonth() + 1).padStart(2, '0');
  var dd = String(now.getDate()).padStart(2, '0');
  var hh = String(now.getHours()).padStart(2, '0');
  var min = String(now.getMinutes()).padStart(2, '0');
  var ss = String(now.getSeconds()).padStart(2, '0');
  return baseName + '_photo_' + mm + dd + hh + min + ss + '.jpg';
}

function showImageSizeModal() {
  var modal = document.getElementById('image-size-modal');
  var currentDisplay = document.getElementById('current-size-display');
  if (currentDisplay) currentDisplay.textContent = imageSizeSetting;
  var opts = document.querySelectorAll('.size-opt');
  opts.forEach(function (btn) {
    var size = btn.getAttribute('data-size');
    btn.style.opacity = size === imageSizeSetting ? '1' : '0.7';
  });
  if (modal) modal.classList.add('active');
}

function closeImageSizeModal() {
  var modal = document.getElementById('image-size-modal');
  if (modal) modal.classList.remove('active');
}

function setImageSize(size) {
  if (!['500KB', '1MB', '2MB', 'original'].includes(size)) return;
  imageSizeSetting = size;
  if (typeof localStorage !== 'undefined') localStorage.setItem('dmap:imageSize', size);
  closeImageSizeModal();
  updateFileNameDisplay();
}

function bindImageSizeModal() {
  var closeBtn = document.getElementById('image-size-close');
  if (closeBtn) closeBtn.addEventListener('click', closeImageSizeModal);
  ['size-500kb', 'size-1mb', 'size-2mb', 'size-original'].forEach(function (id) {
    var btn = document.getElementById(id);
    if (btn) btn.addEventListener('click', function () {
      setImageSize(btn.getAttribute('data-size'));
    });
  });
  var modal = document.getElementById('image-size-modal');
  if (modal) modal.addEventListener('click', function (e) {
    if (e.target === modal) closeImageSizeModal();
  });
}

function latLngToDxf(latLng) {
  if (!window.DxfToGeoJSON || !latLng) return null;
  var lat = typeof latLng.lat === 'function' ? latLng.lat() : latLng.lat;
  var lng = typeof latLng.lng === 'function' ? latLng.lng() : latLng.lng;
  return window.DxfToGeoJSON.lngLatToDxf(lng, lat);
}

function dxfToLatLng(x, y) {
  if (!window.DxfToGeoJSON) return null;
  var ll = window.DxfToGeoJSON.dxfToLngLat(x, y);
  return ll ? { lat: ll[1], lng: ll[0] } : null;
}

function clearDxfImageMarkers() {
  dxfImageMarkers.forEach(function (m) {
    if (m && m.setMap) m.setMap(null);
  });
  dxfImageMarkers = [];
}

function drawDxfImageMarkers() {
  clearDxfImageMarkers();
  if (!map || !window.DxfToGeoJSON) return;
  // 빨간원(사진 마커)과 동일: viewBox 24x24, circle cx=12 cy=12 r=10, 크기 12px, 짙은 파란색
  var blueSvg = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24">' +
    '<circle cx="12" cy="12" r="10" fill="#1565C0" stroke="#FFFFFF" stroke-width="1.5"/></svg>';
  var sizePx = 12;
  var blueIcon = {
    url: 'data:image/svg+xml,' + encodeURIComponent(blueSvg),
    scaledSize: new google.maps.Size(sizePx, sizePx),
    anchor: new google.maps.Point(sizePx / 2, sizePx / 2)
  };
  dxfImageRefs.forEach(function (ref) {
    var pos = dxfToLatLng(ref.x, ref.y);
    if (!pos) return;
    var m = new google.maps.Marker({
      map: dxfImageMarkersVisible ? map : null,
      position: pos,
      icon: blueIcon,
      title: ref.fileName || '참조 이미지'
    });
    m.dxfImageRef = ref;
    m.addListener('click', function () {
      if (Date.now() - lastLongPressEndTime < 600) return;
      showDxfImageModal(ref);
    });
    dxfImageMarkers.push(m);
  });
}

function applyObjectVisibility() {
  if (photoMarkers) {
    photoMarkers.forEach(function (m) {
      if (m && m.setMap) m.setMap(photoMarkersVisible ? map : null);
    });
  }
  if (dxfImageMarkers) {
    dxfImageMarkers.forEach(function (m) {
      if (m && m.setMap) m.setMap(dxfImageMarkersVisible ? map : null);
    });
  }
  if (map && map.data) {
    try {
      map.data.setStyle(map.data.getStyle());
    } catch (e) { /* no-op */ }
  }
}

function showObjectVisibilityModal() {
  var modal = document.getElementById('object-visibility-modal');
  var redCb = document.getElementById('obj-vis-red');
  var blueCb = document.getElementById('obj-vis-blue');
  var textCb = document.getElementById('obj-vis-text');
  if (!modal || !redCb || !blueCb || !textCb) return;
  redCb.checked = photoMarkersVisible;
  blueCb.checked = dxfImageMarkersVisible;
  textCb.checked = dxfTextVisible;
  modal.classList.add('active');
}

function hideObjectVisibilityModal() {
  var modal = document.getElementById('object-visibility-modal');
  if (modal) modal.classList.remove('active');
}

function loadMetadataAndDisplay(dxfFile) {
  if (!window.localStore) return Promise.resolve();
  photos = [];
  texts = [];
  clearPhotoMarkers();
  clearTextMarkers();
  return Promise.all([
    window.localStore.loadProject(dxfFile),
    window.localStore.loadPhotos(dxfFile)
  ]).then(function (res) {
    var project = res[0] || {};
    var loadedPhotos = res[1] || [];
    texts = project.texts || [];
    loadedPhotos.forEach(function (p) {
      photos.push({
        id: p.id, x: p.x, y: p.y, width: p.width, height: p.height,
        blob: p.blob, memo: p.memo || '', fileName: p.fileName || '',
        createdAt: p.createdAt, updatedAt: p.updatedAt
      });
    });
    drawPhotoMarkers();
    drawTextMarkers();
  }).catch(function (err) {
    console.warn('메타데이터 로드 실패:', err);
  });
}

function clearPhotoMarkers() {
  photoMarkers.forEach(function (m) {
    if (m && m.setMap) m.setMap(null);
  });
  photoMarkers = [];
}

function clearTextMarkers() {
  if (textOverlay) {
    textOverlay.setMap(null);
    textOverlay = null;
  }
  textMarkers = [];
}

function drawPhotoMarkers() {
  clearPhotoMarkers();
  if (!map || !window.DxfToGeoJSON) return;
  photos.forEach(function (p) {
    var pos = dxfToLatLng(p.x, p.y);
    if (!pos) return;
    var isUploaded = p.uploaded !== false;
    var hasMemo = p.memo && String(p.memo).trim();
    var markerColor;
    var sizePx;
    if (isUploaded) {
      markerColor = hasMemo ? '#9B51E0' : '#FF0000';
      sizePx = 12;
    } else {
      markerColor = '#00C853';
      sizePx = 38;
    }
    var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24">' +
      '<circle cx="12" cy="12" r="10" fill="' + markerColor + '" stroke="#FFFFFF" stroke-width="1.5"/>' +
      '</svg>';
    var icon = {
      url: 'data:image/svg+xml,' + encodeURIComponent(svg),
      scaledSize: new google.maps.Size(sizePx, sizePx),
      anchor: new google.maps.Point(sizePx / 2, sizePx / 2)
    };
    var m = new google.maps.Marker({
      map: photoMarkersVisible ? map : null,
      position: pos,
      icon: icon,
      title: p.memo || p.fileName || '사진'
    });
    m.photoId = p.id;
    m.addListener('click', function () {
      if (Date.now() - lastLongPressEndTime < 600) return;
      showPhotoModal(p.id);
    });
    photoMarkers.push(m);
  });
}

function drawTextMarkers() {
  clearTextMarkers();
  if (!map || !window.DxfToGeoJSON || !texts.length) return;
  function TextOnlyOverlay(textsArr) {
    this.textsArr = textsArr;
    this.div = null;
    this._drawThrottleMs = 120;
    this._lastDrawTime = 0;
    this._drawScheduled = false;
    this.setMap(map);
  }
  TextOnlyOverlay.prototype = new google.maps.OverlayView();
  TextOnlyOverlay.prototype.onAdd = function () {
    this.div = document.createElement('div');
    this.div.style.position = 'absolute';
    this.div.style.pointerEvents = 'auto';
    this.div.style.left = '0';
    this.div.style.top = '0';
    var pane = this.getPanes && this.getPanes();
    if (pane) (pane.floatPane || pane.overlayLayer).appendChild(this.div);
  };
  TextOnlyOverlay.prototype.draw = function () {
    if (!this.div || !this.getProjection) return;
    var now = Date.now();
    if (now - this._lastDrawTime < this._drawThrottleMs) {
      var self = this;
      if (!this._drawScheduled) {
        this._drawScheduled = true;
        setTimeout(function () {
          self._drawScheduled = false;
          self.draw();
        }, self._drawThrottleMs - (now - self._lastDrawTime));
      }
      return;
    }
    this._lastDrawTime = now;
    var proj = this.getProjection();
    this.div.innerHTML = '';
    var self = this;
    this.textsArr.forEach(function (t) {
      var pos = dxfToLatLng(t.x, t.y);
      if (!pos) return;
      var point = proj.fromLatLngToDivPixel(new google.maps.LatLng(pos.lat, pos.lng));
      var span = document.createElement('span');
      span.textContent = (t.text || '').trim() || ' ';
      span.style.position = 'absolute';
      span.style.left = (point.x - 50) + 'px';
      span.style.top = (point.y - 8) + 'px';
      span.style.width = '100px';
      span.style.fontSize = '12px';
      span.style.fontWeight = 'bold';
      span.style.color = '#FF3B30';
      span.style.textAlign = 'center';
      span.style.pointerEvents = 'auto';
      span.style.cursor = 'pointer';
      span.style.textShadow = '0 0 1px #fff, 0 0 2px #fff';
      span.setAttribute('data-text-id', t.id);
      span.addEventListener('click', function (e) {
        e.stopPropagation();
        if (Date.now() - lastLongPressEndTime < 600) return;
        showTextModal(t.id);
      });
      self.div.appendChild(span);
    });
  };
  TextOnlyOverlay.prototype.onRemove = function () {
    if (this.div && this.div.parentNode) this.div.parentNode.removeChild(this.div);
    this.div = null;
  };
  textOverlay = new TextOnlyOverlay(texts);
}

function hideContextMenu() {
  if (contextMenuEl) contextMenuEl.classList.remove('active');
}

function bindContextMenuCloseOnMap() {
  if (!map || !contextMenuEl) return;
  map.addListener('dragstart', function () {
    hideContextMenu();
  });
  map.addListener('zoom_changed', function () {
    hideContextMenu();
  });
  document.addEventListener('touchstart', function (e) {
    if (!contextMenuEl.classList.contains('active')) return;
    if (e.target && !contextMenuEl.contains(e.target)) hideContextMenu();
  }, { passive: true });
  document.addEventListener('mousedown', function (e) {
    if (!contextMenuEl.classList.contains('active')) return;
    if (e.target && !contextMenuEl.contains(e.target)) hideContextMenu();
  });
}

function bindMapLongPress() {
  if (!map || !contextMenuEl) return;
  var mapEl = document.getElementById('map');
  var moveThreshold = 15;
  var touchStartX = 0;
  var touchStartY = 0;
  var pendingLongPress = null;
  function cancelLongPress() {
    if (longPressTimer) {
      clearTimeout(longPressTimer);
      longPressTimer = null;
    }
    pendingLongPress = null;
  }
  function showMenuAt(clientX, clientY, latLng) {
    if (!latLng) return;
    var xy = latLngToDxf(latLng);
    if (xy) {
      pendingAddPosition = { x: xy.x, y: xy.y };
      lastLongPressEndTime = Date.now();
      contextMenuEl.classList.add('active');
      contextMenuEl.style.left = (clientX != null ? clientX : window.innerWidth / 2) + 'px';
      contextMenuEl.style.top = (clientY != null ? clientY : window.innerHeight / 2) + 'px';
    }
  }
  function latLngFromClient(clientX, clientY) {
    if (!mapEl || !map) return null;
    var bounds = map.getBounds();
    if (!bounds) return null;
    var proj = map.getProjection();
    if (!proj) return null;
    var rect = mapEl.getBoundingClientRect();
    var fx = (clientX - rect.left) / rect.width;
    var fy = (clientY - rect.top) / rect.height;
    var topRight = proj.fromLatLngToPoint(bounds.getNorthEast());
    var bottomLeft = proj.fromLatLngToPoint(bounds.getSouthWest());
    var point = new google.maps.Point(
      bottomLeft.x + fx * (topRight.x - bottomLeft.x),
      topRight.y + fy * (bottomLeft.y - topRight.y)
    );
    return proj.fromPointToLatLng(point);
  }
  var isTouchDevice = typeof window !== 'undefined' && 'ontouchstart' in window;
  if (!isTouchDevice) {
    map.addListener('mousedown', function (e) {
      var cX = e.domEvent && e.domEvent.clientX;
      var cY = e.domEvent && e.domEvent.clientY;
      pendingLongPress = { clientX: cX, clientY: cY, latLng: e.latLng };
      longPressTimer = setTimeout(function () {
        longPressTimer = null;
        if (!pendingLongPress) return;
        showMenuAt(pendingLongPress.clientX, pendingLongPress.clientY, pendingLongPress.latLng);
        pendingLongPress = null;
      }, longPressDuration);
    });
    map.addListener('mouseup', cancelLongPress);
    map.addListener('mousemove', cancelLongPress);
  }
  if (mapEl) {
    mapEl.addEventListener('touchstart', function (e) {
      if (e.touches && e.touches.length >= 2) {
        cancelLongPress();
        return;
      }
      if (e.touches.length === 1) {
        touchStartX = e.touches[0].clientX;
        touchStartY = e.touches[0].clientY;
        pendingLongPress = { clientX: touchStartX, clientY: touchStartY, latLng: null };
        longPressTimer = setTimeout(function () {
          longPressTimer = null;
          if (!pendingLongPress) return;
          var latLng = latLngFromClient(pendingLongPress.clientX, pendingLongPress.clientY);
          if (latLng) {
            showMenuAt(pendingLongPress.clientX, pendingLongPress.clientY, latLng);
          }
          pendingLongPress = null;
        }, longPressDuration);
      }
    }, { passive: true });
    mapEl.addEventListener('touchmove', function (e) {
      if (!longPressTimer || !e.touches.length) return;
      var dx = e.touches[0].clientX - touchStartX;
      var dy = e.touches[0].clientY - touchStartY;
      if (dx * dx + dy * dy > moveThreshold * moveThreshold) cancelLongPress();
    }, { passive: true });
    mapEl.addEventListener('touchend', function (e) {
      if (e.touches && e.touches.length >= 1) return;
      if (longPressTimer) cancelLongPress();
    }, { passive: true });
  }
}

function bindContextMenu() {
  if (!contextMenuEl) return;
  document.getElementById('camera-btn').addEventListener('click', function () {
    contextMenuEl.classList.remove('active');
    var input = document.getElementById('camera-input');
    if (input) { input.click(); }
  });
  document.getElementById('text-btn').addEventListener('click', function () {
    contextMenuEl.classList.remove('active');
    pendingAddPosition && showTextModal(null);
  });
  document.getElementById('camera-input').addEventListener('change', function (e) {
    var file = e.target && e.target.files[0];
    if (file && pendingAddPosition) addPhotoAtPosition(pendingAddPosition, file);
    e.target.value = '';
  });
}

function compressImage(dataUrl, targetSize) {
  return new Promise(function (resolve, reject) {
    var img = new Image();
    img.onload = function () {
      var maxDim = targetSize <= 500 * 1024 ? 800 : targetSize <= 1024 * 1024 ? 1200 : targetSize <= 2 * 1024 * 1024 ? 1600 : 2000;
      var w = img.width;
      var h = img.height;
      if (w > maxDim || h > maxDim) {
        if (w > h) {
          h = Math.floor((h / w) * maxDim);
          w = maxDim;
        } else {
          w = Math.floor((w / h) * maxDim);
          h = maxDim;
        }
      }
      var canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      var ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, w, h);

      function getActualBlobSize(dataUrlStr) {
        return fetch(dataUrlStr).then(function (r) { return r.blob(); }).then(function (blob) { return blob.size; }).catch(function () {
          return Promise.resolve(Math.floor((dataUrlStr.length - 22) * 0.75));
        });
      }

      var adjustedTarget = targetSize * 2.5;
      var pixelCount = w * h;
      var quality = Math.pow(adjustedTarget / (pixelCount * 0.25), 1 / 1.6);
      quality = Math.max(0.4, Math.min(0.95, quality));
      if (targetSize <= 500 * 1024) quality *= 1.2;
      else if (targetSize <= 1024 * 1024) quality *= 1.15;
      else quality *= 1.1;
      quality = Math.max(0.4, Math.min(0.95, quality));

      function tryCompress(q) {
        var data = canvas.toDataURL('image/jpeg', q);
        return getActualBlobSize(data).then(function (size) { return { data: data, size: size }; });
      }

      tryCompress(quality).then(function (first) {
        var compressedData = first.data;
        var compressedSize = first.size;
        var minQ = 0.3;
        var maxQ = 0.95;
        var q = quality;
        var tolerance = 0.12;
        var maxIter = 3;
        var iter = 0;
        function next() {
          var diffRatio = Math.abs(compressedSize - targetSize) / targetSize;
          if (diffRatio <= tolerance || iter >= maxIter) {
            if (compressedSize < targetSize * 0.7) {
              var scaleFactor = Math.sqrt(targetSize / compressedSize) * 1.05;
              var nw = Math.floor(w * scaleFactor);
              var nh = Math.floor(h * scaleFactor);
              canvas.width = nw;
              canvas.height = nh;
              ctx.clearRect(0, 0, canvas.width, canvas.height);
              ctx.drawImage(img, 0, 0, nw, nh);
              var nq = Math.pow(adjustedTarget / (nw * nh * 0.25), 1 / 1.6);
              nq = Math.max(0.4, Math.min(0.9, nq));
              return tryCompress(nq).then(function (r) {
                ctx = null;
                canvas.width = 0;
                canvas.height = 0;
                resolve(r.data);
              });
            }
            ctx = null;
            canvas.width = 0;
            canvas.height = 0;
            resolve(compressedData);
            return;
          }
          iter++;
          if (compressedSize > targetSize) {
            maxQ = q;
            q = (minQ + q) / 2;
          } else {
            minQ = q;
            q = (q + maxQ) / 2;
          }
          q = Math.max(0.3, Math.min(0.95, q));
          compressedData = canvas.toDataURL('image/jpeg', q);
          getActualBlobSize(compressedData).then(function (size) {
            compressedSize = size;
            next();
          });
        }
        next();
      });
    };
    img.onerror = function () { reject(new Error('이미지 로드 실패')); };
    img.src = dataUrl;
  });
}

function addPhotoAtPosition(xy, file) {
  if (!dxfFileFullName || !window.localStore) return;
  var id = 'photo-' + Date.now();
  var targetSize = getImageTargetSize();
  var reader = new FileReader();
  reader.onload = function () {
    var dataUrl = reader.result;
    function finish(useDataUrl) {
      var blob = window.localStore.dataUrlToBlob(useDataUrl);
      var photo = {
        id: id, x: xy.x, y: xy.y, width: 1, height: 1,
        blob: blob, memo: '', fileName: generatePhotoFileName(),
        createdAt: new Date().toISOString()
      };
      photos.push(photo);
      window.localStore.savePhoto(dxfFileFullName, photo).then(function () {
        drawPhotoMarkers();
        pendingAddPosition = null;
      }).catch(function (err) {
        console.error('사진 저장 실패:', err);
        alert('사진 저장에 실패했습니다. 다시 시도해 주세요.');
      });
    }
    if (targetSize != null) {
      compressImage(dataUrl, targetSize).then(function (compressed) {
        finish(compressed);
      }).catch(function () {
        finish(dataUrl);
      });
    } else {
      finish(dataUrl);
    }
  };
  reader.readAsDataURL(file);
}

function addTextAtPosition(xy, textStr) {
  if (!dxfFileFullName || !window.localStore) return;
  var id = 'text-' + Date.now();
  var t = { id: id, x: xy.x, y: xy.y, text: textStr || '', fontSize: 14 };
  texts.push(t);
  window.localStore.saveProject(dxfFileFullName, { texts: texts, lastModified: new Date().toISOString() }).then(function () {
    drawTextMarkers();
    pendingAddPosition = null;
  }).catch(function (err) {
    console.error('텍스트 저장 실패:', err);
    alert('텍스트 저장에 실패했습니다. 다시 시도해 주세요.');
  });
}

function showPhotoModal(photoId) {
  editingDxfImageRef = null;
  if (dxfImageObjectUrl) {
    URL.revokeObjectURL(dxfImageObjectUrl);
    dxfImageObjectUrl = null;
  }
  editingPhotoId = photoId;
  var modal = document.getElementById('photo-modal');
  var img = document.getElementById('photo-modal-img');
  var memo = document.getElementById('photo-modal-memo');
  var titleEl = document.getElementById('photo-modal-title');
  var actionsEl = document.getElementById('photo-modal-actions');
  var noFileEl = document.getElementById('photo-modal-no-file');
  if (!modal || !img || !memo) return;
  var p = photos.filter(function (x) { return x.id === photoId; })[0];
  if (!p) { modal.classList.remove('active'); return; }
  if (titleEl) titleEl.textContent = '📷 사진';
  if (actionsEl) actionsEl.style.display = 'flex';
  if (noFileEl) noFileEl.style.display = 'none';
  memo.style.display = 'block';
  memo.value = p.memo || '';
  img.style.display = 'block';
  img.src = '';
  window.localStore.getPhotoDataUrl(photoId).then(function (url) {
    img.src = url || '';
  });
  modal.classList.add('active');
}

function showDxfImageModal(ref) {
  editingPhotoId = null;
  editingDxfImageRef = ref;
  var modal = document.getElementById('photo-modal');
  var img = document.getElementById('photo-modal-img');
  var memo = document.getElementById('photo-modal-memo');
  var titleEl = document.getElementById('photo-modal-title');
  var actionsEl = document.getElementById('photo-modal-actions');
  var noFileEl = document.getElementById('photo-modal-no-file');
  if (!modal || !img) return;
  if (titleEl) titleEl.textContent = '🖼 참조 이미지';
  if (actionsEl) actionsEl.style.display = 'none';
  memo.style.display = 'none';
  if (ref.file) {
    if (dxfImageObjectUrl) URL.revokeObjectURL(dxfImageObjectUrl);
    dxfImageObjectUrl = URL.createObjectURL(ref.file);
    img.src = dxfImageObjectUrl;
    img.style.display = 'block';
    if (noFileEl) noFileEl.style.display = 'none';
  } else {
    if (dxfImageObjectUrl) { URL.revokeObjectURL(dxfImageObjectUrl); dxfImageObjectUrl = null; }
    img.src = '';
    img.style.display = 'none';
    if (noFileEl) {
      noFileEl.textContent = '이미지 파일을 찾을 수 없습니다. DXF와 같은 폴더를 선택하세요.';
      noFileEl.style.display = 'block';
    }
  }
  modal.classList.add('active');
}

function hidePhotoModal() {
  var modal = document.getElementById('photo-modal');
  var img = document.getElementById('photo-modal-img');
  if (modal) modal.classList.remove('active');
  if (img) img.src = '';
  editingPhotoId = null;
  editingDxfImageRef = null;
  if (dxfImageObjectUrl) {
    URL.revokeObjectURL(dxfImageObjectUrl);
    dxfImageObjectUrl = null;
  }
}

function bindPhotoModal() {
  var modal = document.getElementById('photo-modal');
  var closeBtn = document.getElementById('photo-modal-close');
  var saveBtn = document.getElementById('photo-modal-save');
  var delBtn = document.getElementById('photo-modal-delete');
  var memo = document.getElementById('photo-modal-memo');
  if (closeBtn) closeBtn.addEventListener('click', hidePhotoModal);
  if (saveBtn) saveBtn.addEventListener('click', function () {
    if (!editingPhotoId || !window.localStore) return;
    window.localStore.updatePhotoMemo(editingPhotoId, memo.value).then(function () {
      var p = photos.filter(function (x) { return x.id === editingPhotoId; })[0];
      if (p) p.memo = memo.value;
      hidePhotoModal();
    }).catch(function (err) {
      console.error('메모 저장 실패:', err);
      alert('메모 저장에 실패했습니다. 다시 시도해 주세요.');
    });
  });
  if (delBtn) delBtn.addEventListener('click', function () {
    if (!editingPhotoId || !window.localStore || !dxfFileFullName) return;
    if (!confirm('이 사진을 삭제할까요?')) return;
    window.localStore.deletePhoto(editingPhotoId).then(function () {
      photos = photos.filter(function (x) { return x.id !== editingPhotoId; });
      drawPhotoMarkers();
      hidePhotoModal();
    });
  });
}

function showTextModal(textId) {
  editingTextId = textId;
  var modal = document.getElementById('text-modal');
  var title = document.getElementById('text-modal-title');
  var input = document.getElementById('text-modal-input');
  var delBtn = document.getElementById('text-modal-delete');
  if (!modal || !input) return;
  if (textId) {
    var t = texts.filter(function (x) { return x.id === textId; })[0];
    if (t) {
      input.value = t.text || '';
      if (delBtn) delBtn.style.display = 'block';
    }
  } else {
    input.value = '';
    if (delBtn) delBtn.style.display = 'none';
  }
  title.textContent = textId ? '📝 텍스트 편집' : '📝 텍스트 입력';
  modal.classList.add('active');
}

function hideTextModal() {
  document.getElementById('text-modal').classList.remove('active');
  editingTextId = null;
}

function bindTextModal() {
  var modal = document.getElementById('text-modal');
  var closeBtn = document.getElementById('text-modal-close');
  var saveBtn = document.getElementById('text-modal-save');
  var delBtn = document.getElementById('text-modal-delete');
  var input = document.getElementById('text-modal-input');
  if (closeBtn) closeBtn.addEventListener('click', hideTextModal);
  if (saveBtn) saveBtn.addEventListener('click', function () {
    var str = (input && input.value) || '';
    if (editingTextId) {
      var t = texts.filter(function (x) { return x.id === editingTextId; })[0];
      if (t) {
        t.text = str;
        window.localStore.saveProject(dxfFileFullName, { texts: texts, lastModified: new Date().toISOString() }).then(function () {
          drawTextMarkers();
          hideTextModal();
        }).catch(function (err) {
          console.error('텍스트 저장 실패:', err);
          alert('텍스트 저장에 실패했습니다. 다시 시도해 주세요.');
        });
      }
    } else if (pendingAddPosition && window.localStore) {
      addTextAtPosition(pendingAddPosition, str);
      hideTextModal();
    }
  });
  if (delBtn) delBtn.addEventListener('click', function () {
    if (!editingTextId || !window.localStore || !dxfFileFullName) return;
    if (!confirm('이 텍스트를 삭제할까요?')) return;
    texts = texts.filter(function (x) { return x.id !== editingTextId; });
    window.localStore.saveProject(dxfFileFullName, { texts: texts, lastModified: new Date().toISOString() }).then(function () {
      drawTextMarkers();
      hideTextModal();
    }).catch(function (err) {
      console.error('텍스트 삭제 후 저장 실패:', err);
      alert('저장에 실패했습니다. 다시 시도해 주세요.');
    });
  });
}

// DxfParser 전역 (dxf-parser.min.js가 DxfParser를 붙이지 않을 수 있음)
if (typeof DxfParser === 'undefined' && typeof window !== 'undefined') {
  window.DxfParser = window.dxfParser || null;
}
