/**
 * new_dmap - 로컬 저장소 (IndexedDB)
 * ADMAP과 동일 API, DB 이름만 'dmap-map' 으로 분리
 */
(function () {
  var DB_NAME = 'dmap-map';
  var DB_VERSION = 1;
  var PROJECT_STORE = 'projects';
  var PHOTO_STORE = 'photos';
  var dbPromise = null;

  function openDb() {
    return new Promise(function (resolve, reject) {
      var request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = function () {
        var db = request.result;
        if (!db.objectStoreNames.contains(PROJECT_STORE)) {
          db.createObjectStore(PROJECT_STORE, { keyPath: 'dxfFile' });
        }
        if (!db.objectStoreNames.contains(PHOTO_STORE)) {
          var store = db.createObjectStore(PHOTO_STORE, { keyPath: 'id' });
          store.createIndex('dxfFile', 'dxfFile', { unique: false });
        }
      };
      request.onsuccess = function () { resolve(request.result); };
      request.onerror = function () { reject(request.error); };
    });
  }

  function getDb() {
    if (!dbPromise) dbPromise = openDb();
    return dbPromise;
  }

  function init() {
    return getDb().then(function () { return true; });
  }

  function saveProject(dxfFile, data) {
    return getDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(PROJECT_STORE, 'readwrite');
        tx.objectStore(PROJECT_STORE).put({
          dxfFile: dxfFile,
          texts: data.texts || [],
          lastModified: data.lastModified || new Date().toISOString()
        });
        tx.oncomplete = function () { resolve(true); };
        tx.onerror = function () { reject(tx.error); };
      });
    });
  }

  function loadProject(dxfFile) {
    return getDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(PROJECT_STORE, 'readonly');
        var req = tx.objectStore(PROJECT_STORE).get(dxfFile);
        req.onsuccess = function () { resolve(req.result || null); };
        req.onerror = function () { reject(req.error); };
      });
    });
  }

  function savePhoto(dxfFile, photo) {
    return getDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var record = {
          id: String(photo.id),
          dxfFile: dxfFile,
          fileName: photo.fileName || '',
          memo: photo.memo || '',
          x: photo.x, y: photo.y,
          width: photo.width, height: photo.height,
          blob: photo.blob,
          createdAt: photo.createdAt || new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };
        var tx = db.transaction(PHOTO_STORE, 'readwrite');
        tx.objectStore(PHOTO_STORE).put(record);
        tx.oncomplete = function () { resolve(true); };
        tx.onerror = function () { reject(tx.error); };
      });
    });
  }

  function loadPhotos(dxfFile) {
    return getDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(PHOTO_STORE, 'readonly');
        var req = tx.objectStore(PHOTO_STORE).index('dxfFile').getAll(dxfFile);
        req.onsuccess = function () { resolve(req.result || []); };
        req.onerror = function () { reject(req.error); };
      });
    });
  }

  function getPhotoById(id) {
    return getDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(PHOTO_STORE, 'readonly');
        var req = tx.objectStore(PHOTO_STORE).get(String(id));
        req.onsuccess = function () { resolve(req.result || null); };
        req.onerror = function () { reject(req.error); };
      });
    });
  }

  function updatePhotoMemo(id, memo) {
    return getPhotoById(id).then(function (record) {
      if (!record) return false;
      record.memo = memo || '';
      record.updatedAt = new Date().toISOString();
      return getDb().then(function (db) {
        return new Promise(function (resolve, reject) {
          var tx = db.transaction(PHOTO_STORE, 'readwrite');
          tx.objectStore(PHOTO_STORE).put(record);
          tx.oncomplete = function () { resolve(true); };
          tx.onerror = function () { reject(tx.error); };
        });
      });
    });
  }

  function deletePhoto(id) {
    return getDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(PHOTO_STORE, 'readwrite');
        tx.objectStore(PHOTO_STORE).delete(String(id));
        tx.oncomplete = function () { resolve(true); };
        tx.onerror = function () { reject(tx.error); };
      });
    });
  }

  function deletePhotosByDateRange(dxfFile, startMs, endMs) {
    return loadPhotos(dxfFile).then(function (photos) {
      var toDelete = photos.filter(function (p) {
        if (!p.createdAt) return false;
        var ms = new Date(p.createdAt).getTime();
        return ms >= startMs && ms <= endMs;
      });
      if (toDelete.length === 0) return Promise.resolve([]);
      return getDb().then(function (db) {
        return new Promise(function (resolve, reject) {
          var tx = db.transaction(PHOTO_STORE, 'readwrite');
          var store = tx.objectStore(PHOTO_STORE);
          toDelete.forEach(function (p) { store.delete(String(p.id)); });
          tx.oncomplete = function () { resolve(toDelete.map(function (p) { return p.id; })); };
          tx.onerror = function () { reject(tx.error); };
        });
      });
    });
  }

  function dataUrlToBlob(dataUrl) {
    var parts = dataUrl.split(',');
    var mimeMatch = (parts[0] || '').match(/data:(.*?);base64/);
    var mime = mimeMatch ? mimeMatch[1] : 'application/octet-stream';
    var binary = atob(parts[1] || '');
    var len = binary.length;
    var bytes = new Uint8Array(len);
    for (var i = 0; i < len; i++) bytes[i] = binary.charCodeAt(i);
    return new Blob([bytes], { type: mime });
  }

  function blobToDataUrl(blob) {
    return new Promise(function (resolve, reject) {
      var r = new FileReader();
      r.onload = function () { resolve(r.result); };
      r.onerror = reject;
      r.readAsDataURL(blob);
    });
  }

  function downloadFile(blob, filename) {
    return new Promise(function (resolve) {
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(function () { URL.revokeObjectURL(url); resolve(true); }, 500);
    });
  }

  function normalizeBaseName(dxfFile) {
    return (dxfFile || 'photo').replace(/\.dxf$/i, '');
  }

  function exportProjectSequential(dxfFile, onProgress) {
    return Promise.all([loadProject(dxfFile), loadPhotos(dxfFile)]).then(function (res) {
      var project = res[0] || {};
      var photos = res[1] || [];
      var baseName = normalizeBaseName(dxfFile);
      var totalFiles = photos.length + 1;
      var current = 0;
      var metadata = {
        dxfFile: dxfFile,
        photos: photos.map(function (p) {
          return {
            id: p.id, fileName: p.fileName,
            position: { x: p.x, y: p.y },
            size: { width: p.width, height: p.height },
            memo: p.memo || '', uploaded: true
          };
        }),
        texts: project.texts || [],
        lastModified: project.lastModified || new Date().toISOString()
      };
      var metaBlob = new Blob([JSON.stringify(metadata, null, 2)], { type: 'application/json' });
      current++;
      if (onProgress) onProgress(current, totalFiles, baseName + '_metadata.json');
      return downloadFile(metaBlob, baseName + '_metadata.json').then(function () {
        var chain = Promise.resolve();
        photos.forEach(function (p) {
          if (!p.blob || !p.fileName) return;
          chain = chain.then(function () {
            current++;
            if (onProgress) onProgress(current, totalFiles, p.fileName);
            return downloadFile(p.blob, p.fileName).then(function () {
              return new Promise(function (r) { setTimeout(r, 300); });
            });
          });
        });
        return chain.then(function () { return { success: true, totalFiles: totalFiles }; });
      });
    });
  }

  function exportProjectZip(dxfFile, onProgress) {
    return exportProjectSequential(dxfFile, onProgress);
  }

  function exportAsZipOnly(dxfFile) {
    return exportProjectSequential(dxfFile);
  }

  function getPhotoDataUrl(photoId) {
    return getPhotoById(photoId).then(function (r) {
      return r && r.blob ? blobToDataUrl(r.blob) : null;
    });
  }

  window.localStore = {
    init: init,
    saveProject: saveProject,
    loadProject: loadProject,
    savePhoto: savePhoto,
    loadPhotos: loadPhotos,
    getPhotoById: getPhotoById,
    updatePhotoMemo: updatePhotoMemo,
    deletePhoto: deletePhoto,
    deletePhotosByDateRange: deletePhotosByDateRange,
    dataUrlToBlob: dataUrlToBlob,
    exportProjectZip: exportProjectZip,
    exportProjectSequential: exportProjectSequential,
    exportAsZipOnly: exportAsZipOnly,
    getPhotoDataUrl: getPhotoDataUrl
  };
})();
