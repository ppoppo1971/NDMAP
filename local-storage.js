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

  function deleteProjectData(dxfFile) {
    return loadPhotos(dxfFile).then(function (photos) {
      if (!photos) photos = [];
      return getDb().then(function (db) {
        return new Promise(function (resolve, reject) {
          // 1. PHOTO_STORE에서 사진 일괄 삭제
          var tx1 = db.transaction(PHOTO_STORE, 'readwrite');
          var store1 = tx1.objectStore(PHOTO_STORE);
          photos.forEach(function (p) { store1.delete(String(p.id)); });
          
          tx1.oncomplete = function () {
            // 2. PROJECT_STORE에서 텍스트 배열 비우기
            var tx2 = db.transaction(PROJECT_STORE, 'readwrite');
            var store2 = tx2.objectStore(PROJECT_STORE);
            var req = store2.get(dxfFile);
            req.onsuccess = function () {
              var project = req.result;
              if (project) {
                project.texts = [];
                project.lastModified = new Date().toISOString();
                store2.put(project);
              }
            };
            tx2.oncomplete = function () { resolve(photos.length); };
            tx2.onerror = function () { reject(tx2.error); };
          };
          tx1.onerror = function () { reject(tx1.error); };
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

  function encodeUtf8(str) {
    return new TextEncoder().encode(str);
  }

  function crc32(bytes) {
    var table = crc32.table;
    if (!table) {
      table = new Uint32Array(256);
      for (var i = 0; i < 256; i++) {
        var c = i;
        for (var k = 0; k < 8; k++) {
          c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
        }
        table[i] = c >>> 0;
      }
      crc32.table = table;
    }
    var crc = 0xffffffff;
    for (var i = 0; i < bytes.length; i++) {
      crc = table[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
    }
    return (crc ^ 0xffffffff) >>> 0;
  }

  function toDosDateTime(date) {
    var dt = date instanceof Date ? date : new Date();
    var year = Math.max(1980, dt.getFullYear());
    var month = dt.getMonth() + 1;
    var day = dt.getDate();
    var hours = dt.getHours();
    var minutes = dt.getMinutes();
    var seconds = Math.floor(dt.getSeconds() / 2);
    var dosTime = (hours << 11) | (minutes << 5) | seconds;
    var dosDate = ((year - 1980) << 9) | (month << 5) | day;
    return { dosTime: dosTime, dosDate: dosDate };
  }

  function createZip(entries) {
    var offset = 0;
    var fileParts = [];
    var centralParts = [];
    function process(i) {
      if (i >= entries.length) {
        var centralSize = 0;
        for (var k = 0; k < centralParts.length; k++) centralSize += centralParts[k].length;
        var fileCount = entries.length;
        var endRecord = new ArrayBuffer(22);
        var endView = new DataView(endRecord);
        endView.setUint32(0, 0x06054b50, true);
        endView.setUint16(4, 0, true);
        endView.setUint16(6, 0, true);
        endView.setUint16(8, fileCount, true);
        endView.setUint16(10, fileCount, true);
        endView.setUint32(12, centralSize, true);
        endView.setUint32(16, offset, true);
        endView.setUint16(20, 0, true);
        var allParts = fileParts.concat(centralParts).concat([new Uint8Array(endRecord)]);
        return Promise.resolve(new Blob(allParts, { type: 'application/zip' }));
      }
      var entry = entries[i];
      var nameBytes = encodeUtf8(entry.name);
      return entry.blob.arrayBuffer().then(function (arrayBuffer) {
        var dataBytes = new Uint8Array(arrayBuffer);
        var crcVal = crc32(dataBytes);
        var size = dataBytes.length;
        var dos = toDosDateTime(entry.modifiedAt);
        var flags = 0x0800;
        var localHeader = new ArrayBuffer(30 + nameBytes.length);
        var localView = new DataView(localHeader);
        localView.setUint32(0, 0x04034b50, true);
        localView.setUint16(4, 20, true);
        localView.setUint16(6, flags, true);
        localView.setUint16(8, 0, true);
        localView.setUint16(10, dos.dosTime, true);
        localView.setUint16(12, dos.dosDate, true);
        localView.setUint32(14, crcVal, true);
        localView.setUint32(18, size, true);
        localView.setUint32(22, size, true);
        localView.setUint16(26, nameBytes.length, true);
        localView.setUint16(28, 0, true);
        new Uint8Array(localHeader).set(nameBytes, 30);
        fileParts.push(new Uint8Array(localHeader), dataBytes);
        var centralHeader = new ArrayBuffer(46 + nameBytes.length);
        var centralView = new DataView(centralHeader);
        centralView.setUint32(0, 0x02014b50, true);
        centralView.setUint16(4, 20, true);
        centralView.setUint16(6, 20, true);
        centralView.setUint16(8, flags, true);
        centralView.setUint16(10, 0, true);
        centralView.setUint16(12, dos.dosTime, true);
        centralView.setUint16(14, dos.dosDate, true);
        centralView.setUint32(16, crcVal, true);
        centralView.setUint32(20, size, true);
        centralView.setUint32(24, size, true);
        centralView.setUint16(28, nameBytes.length, true);
        centralView.setUint16(30, 0, true);
        centralView.setUint16(32, 0, true);
        centralView.setUint16(34, 0, true);
        centralView.setUint16(36, 0, true);
        centralView.setUint32(38, 0, true);
        centralView.setUint32(42, offset, true);
        new Uint8Array(centralHeader).set(nameBytes, 46);
        centralParts.push(new Uint8Array(centralHeader));
        offset += localHeader.byteLength + size;
        return process(i + 1);
      });
    }
    return process(0);
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
            position: { x: p.x, y: -p.y },
            size: { width: p.width, height: p.height },
            memo: p.memo || '', uploaded: true
          };
        }),
        texts: (project.texts || []).map(function (t) {
          var out = {}; for (var k in t) if (Object.prototype.hasOwnProperty.call(t, k)) out[k] = t[k];
          out.y = typeof t.y === 'number' ? -t.y : t.y; return out;
        }),
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
    return Promise.all([loadProject(dxfFile), loadPhotos(dxfFile)]).then(function (res) {
      var project = res[0] || {};
      var photos = res[1] || [];
      var baseName = normalizeBaseName(dxfFile);
      var metadata = {
        dxfFile: dxfFile,
        photos: photos.map(function (p) {
          return {
            id: p.id, fileName: p.fileName,
            position: { x: p.x, y: -p.y },
            size: { width: p.width, height: p.height },
            memo: p.memo || '', uploaded: true
          };
        }),
        texts: (project.texts || []).map(function (t) {
          var out = {}; for (var k in t) if (Object.prototype.hasOwnProperty.call(t, k)) out[k] = t[k];
          out.y = typeof t.y === 'number' ? -t.y : t.y; return out;
        }),
        lastModified: project.lastModified || new Date().toISOString()
      };
      var metadataBlob = new Blob([JSON.stringify(metadata, null, 2)], { type: 'application/json' });
      var entries = [
        { name: baseName + '_metadata.json', blob: metadataBlob, modifiedAt: new Date() }
      ];
      photos.forEach(function (p) {
        if (p.blob && p.fileName) {
          entries.push({
            name: p.fileName,
            blob: p.blob,
            modifiedAt: new Date(p.updatedAt || Date.now())
          });
        }
      });
      return createZip(entries).then(function (zipBlob) {
        var zipName = baseName + '_export.zip';
        return downloadFile(zipBlob, zipName).then(function () {
          return { success: true, type: 'zip', fileName: zipName };
        });
      });
    });
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
    deleteProjectData: deleteProjectData,
    dataUrlToBlob: dataUrlToBlob,
    exportProjectZip: exportProjectZip,
    exportProjectSequential: exportProjectSequential,
    exportAsZipOnly: exportAsZipOnly,
    getPhotoDataUrl: getPhotoDataUrl
  };
})();
