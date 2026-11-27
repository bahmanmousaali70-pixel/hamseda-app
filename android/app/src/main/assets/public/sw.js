/**
 * Copyright 2018 Google Inc. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *     http://www.apache.org/licenses/LICENSE-2.0
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

// If the loader is already loaded, just stop.
if (!self.define) {
  let registry = {};

  // Used for `eval` and `importScripts` where we can't get script URL by other means.
  // In both cases, it's safe to use a global var because those functions are synchronous.
  let nextDefineUri;

  const singleRequire = (uri, parentUri) => {
    uri = new URL(uri + ".js", parentUri).href;
    return registry[uri] || (
      
        new Promise(resolve => {
          if ("document" in self) {
            const script = document.createElement("script");
            script.src = uri;
            script.onload = resolve;
            document.head.appendChild(script);
          } else {
            nextDefineUri = uri;
            importScripts(uri);
            resolve();
          }
        })
      
      .then(() => {
        let promise = registry[uri];
        if (!promise) {
          throw new Error(`Module ${uri} didn’t register its module`);
        }
        return promise;
      })
    );
  };

  self.define = (depsNames, factory) => {
    const uri = nextDefineUri || ("document" in self ? document.currentScript.src : "") || location.href;
    if (registry[uri]) {
      // Module is already loading or loaded.
      return;
    }
    let exports = {};
    const require = depUri => singleRequire(depUri, uri);
    const specialDeps = {
      module: { uri },
      exports,
      require
    };
    registry[uri] = Promise.all(depsNames.map(
      depName => specialDeps[depName] || require(depName)
    )).then(deps => {
      factory(...deps);
      return exports;
    });
  };
}
define(['./workbox-afac4cd2'], (function (workbox) { 'use strict';

  importScripts("/sw-notifications.js");
  self.skipWaiting();
  workbox.clientsClaim();
  /**
   * The precacheAndRoute() method efficiently caches and responds to
   * requests for URLs in the manifest.
   * See https://goo.gl/S9QRab
   */
  workbox.precacheAndRoute([{
    "url": "sw-notifications.js",
    "revision": "cc7e116baa56bab425cca3aeaedf08bd"
  }, {
    "url": "pwa-maskable-512x512.png",
    "revision": "82428634ae1b291e418c0f53ec249091"
  }, {
    "url": "pwa-512x512.png",
    "revision": "ef4e59a02043965f84074ff92a48206e"
  }, {
    "url": "pwa-192x192.png",
    "revision": "126f2b58ea2c8e66ccd58a00a94f1342"
  }, {
    "url": "privacy-policy.html",
    "revision": "338cdd0c99703953e1239da51c543741"
  }, {
    "url": "index.html",
    "revision": "179b87cf9973ca7485de63ba1173b79e"
  }, {
    "url": "icon.svg",
    "revision": "4f748340753a47785f077697aaf8b10a"
  }, {
    "url": "hamseda-icon.png",
    "revision": "ef4e59a02043965f84074ff92a48206e"
  }, {
    "url": "favicon.ico",
    "revision": "7929dfff2318a6ea354ae58cdbd7e4f8"
  }, {
    "url": "delete-account.html",
    "revision": "c56d21a92394a3191a145687dcb1efbc"
  }, {
    "url": "apple-touch-icon.png",
    "revision": "2d3567b6da5fae4b28b2ecb5f675804a"
  }, {
    "url": "assets/pocketFarsiWorker-CSZI4XtF.js",
    "revision": null
  }, {
    "url": "assets/index-DwkkwvjU.css",
    "revision": null
  }, {
    "url": "assets/index-0GBwZzd-.js",
    "revision": null
  }, {
    "url": "assets/aistudio/IMG_________________d5acadba.png",
    "revision": null
  }, {
    "url": "apple-touch-icon.png",
    "revision": "2d3567b6da5fae4b28b2ecb5f675804a"
  }, {
    "url": "hamseda-icon.png",
    "revision": "ef4e59a02043965f84074ff92a48206e"
  }, {
    "url": "pwa-192x192.png",
    "revision": "126f2b58ea2c8e66ccd58a00a94f1342"
  }, {
    "url": "pwa-512x512.png",
    "revision": "ef4e59a02043965f84074ff92a48206e"
  }, {
    "url": "pwa-maskable-512x512.png",
    "revision": "82428634ae1b291e418c0f53ec249091"
  }, {
    "url": "sw-notifications.js",
    "revision": "cc7e116baa56bab425cca3aeaedf08bd"
  }, {
    "url": "manifest.webmanifest",
    "revision": "a806ee2470ae74295e932787277386aa"
  }], {});
  workbox.cleanupOutdatedCaches();
  workbox.registerRoute(new workbox.NavigationRoute(workbox.createHandlerBoundToURL("/index.html"), {
    denylist: [/^\/__\/auth/, /^\/api\//]
  }));
  workbox.registerRoute(/^https:\/\/fonts\.googleapis\.com\/.*/i, new workbox.CacheFirst({
    "cacheName": "google-fonts-cache",
    plugins: [new workbox.ExpirationPlugin({
      maxEntries: 10,
      maxAgeSeconds: 31536000
    }), new workbox.CacheableResponsePlugin({
      statuses: [0, 200]
    })]
  }), 'GET');
  workbox.registerRoute(/^https:\/\/fonts\.gstatic\.com\/.*/i, new workbox.CacheFirst({
    "cacheName": "gstatic-fonts-cache",
    plugins: [new workbox.ExpirationPlugin({
      maxEntries: 10,
      maxAgeSeconds: 31536000
    }), new workbox.CacheableResponsePlugin({
      statuses: [0, 200]
    })]
  }), 'GET');

}));
