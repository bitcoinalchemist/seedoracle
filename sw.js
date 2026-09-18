'use strict';

var CACHE_NAME = 'seed-oracle-2026-09-18e';
var APP_SHELL = [
  './',
  './index.html',
  './manifest.webmanifest?v=20260918c',
  './css/site.css?v=20260918e',
  './js/site.js?v=20260918c',
  './js/ichingjudgments.js',
  './js/bip39-words.js',
  './js/bip84.js',
  './js/stardata.js?v=20260909a',
  './js/stars.js?v=20260909a',
  './js/seedoracle-store.js?v=20260715a',
  './js/seedoracle-bitcoin.js?v=20260716b',
  './js/seedoracle-hexagrams.js?v=20260909b',
  './js/seedoracle.js?v=20260912p',
  './assets/favicon.svg',
  './assets/favicon.ico',
  './assets/apple-touch-icon.png',
  './assets/icon-192.png',
  './assets/icon-512.png',
  './assets/logo-mark.svg'
];

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function (cache) {
      return cache.addAll(APP_SHELL);
    }).then(function () {
      return self.skipWaiting();
    })
  );
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (names) {
      return Promise.all(names.map(function (name) {
        if (name !== CACHE_NAME) return caches.delete(name);
      }));
    }).then(function () {
      return self.clients.claim();
    })
  );
});

self.addEventListener('fetch', function (event) {
  var request = event.request;
  if (request.method !== 'GET') return;

  var url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).then(function (response) {
        var copy = response.clone();
        caches.open(CACHE_NAME).then(function (cache) { cache.put('./index.html', copy); });
        return response;
      }).catch(function () {
        return caches.match('./index.html');
      })
    );
    return;
  }

  event.respondWith(
    caches.match(request).then(function (cached) {
      if (cached) return cached;
      return fetch(request).then(function (response) {
        if (!response || response.status !== 200) return response;
        var copy = response.clone();
        caches.open(CACHE_NAME).then(function (cache) { cache.put(request, copy); });
        return response;
      });
    })
  );
});
