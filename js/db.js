/* Storage layer.
   Sheets (JSON) live in localStorage; binary assets (photos, layout PDFs)
   live in IndexedDB so they survive offline and don't blow the quota. */
(function (global) {
  'use strict';

  var LS_KEY = 'acl_nms_sheets_v1';
  var DB_NAME = 'acl-nms';
  var DB_VER = 1;
  var dbPromise = null;

  function openDB() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise(function (resolve, reject) {
      var req = indexedDB.open(DB_NAME, DB_VER);
      req.onupgradeneeded = function () {
        var db = req.result;
        if (!db.objectStoreNames.contains('blobs')) db.createObjectStore('blobs');
      };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error); };
    });
    return dbPromise;
  }

  function putBlob(key, blob) {
    return openDB().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction('blobs', 'readwrite');
        tx.objectStore('blobs').put(blob, key);
        tx.oncomplete = function () { resolve(key); };
        tx.onerror = function () { reject(tx.error); };
      });
    });
  }

  function getBlob(key) {
    return openDB().then(function (db) {
      return new Promise(function (resolve, reject) {
        var req = db.transaction('blobs').objectStore('blobs').get(key);
        req.onsuccess = function () { resolve(req.result || null); };
        req.onerror = function () { reject(req.error); };
      });
    });
  }

  function deleteBlob(key) {
    return openDB().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction('blobs', 'readwrite');
        tx.objectStore('blobs').delete(key);
        tx.oncomplete = function () { resolve(); };
        tx.onerror = function () { reject(tx.error); };
      });
    });
  }

  function blobToDataURL(blob) {
    return new Promise(function (resolve, reject) {
      var r = new FileReader();
      r.onload = function () { resolve(r.result); };
      r.onerror = reject;
      r.readAsDataURL(blob);
    });
  }

  function loadSheets() {
    try {
      return JSON.parse(localStorage.getItem(LS_KEY)) || [];
    } catch (e) {
      return [];
    }
  }

  function saveSheets(sheets) {
    localStorage.setItem(LS_KEY, JSON.stringify(sheets));
  }

  global.Store = {
    loadSheets: loadSheets,
    saveSheets: saveSheets,
    putBlob: putBlob,
    getBlob: getBlob,
    deleteBlob: deleteBlob,
    blobToDataURL: blobToDataURL
  };
})(window);
