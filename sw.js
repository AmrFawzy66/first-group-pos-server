const APP_CACHE = "first-group-pos-v2";
const QURAN_CACHE = "first-group-quran-audio-v1";
const APP_SHELL = [
  "./first_group_pos.html",
  "./manifest.json",
  "./icon-192.png",
  "./icon-512.png",
  "./apple-touch-icon.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(APP_CACHE).then((cache) => cache.addAll(APP_SHELL)).catch(()=>{})
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== APP_CACHE && k !== QURAN_CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

function isQuranAudio(url){
  return url.indexOf("cdn.islamic.network") !== -1;
}

// Cached responses are stored WITHOUT the Range header (full file), so a
// single download covers both normal playback and any later seek. When the
// browser asks for a specific byte range, we slice it out of the cached
// file ourselves — the Cache API has no built-in Range support.
async function sliceRange(response, rangeHeader){
  try{
    const buffer = await response.clone().arrayBuffer();
    const size = buffer.byteLength;
    const match = /bytes=(\d+)-(\d*)/.exec(rangeHeader);
    if(!match) return response;
    const start = parseInt(match[1], 10) || 0;
    const end = match[2] ? parseInt(match[2], 10) : size - 1;
    const chunk = buffer.slice(start, end + 1);
    return new Response(chunk, {
      status: 206,
      statusText: "Partial Content",
      headers: {
        "Content-Range": `bytes ${start}-${end}/${size}`,
        "Content-Length": String(chunk.byteLength),
        "Content-Type": response.headers.get("Content-Type") || "audio/mpeg",
        "Accept-Ranges": "bytes"
      }
    });
  }catch(e){
    return response;
  }
}

async function handleQuranAudio(request){
  const cache = await caches.open(QURAN_CACHE);
  const cacheKeyUrl = request.url;
  let cached = await cache.match(cacheKeyUrl);

  if(!cached){
    try{
      const networkResp = await fetch(cacheKeyUrl);
      if(networkResp && (networkResp.status === 200 || networkResp.type === "opaque")){
        await cache.put(cacheKeyUrl, networkResp.clone());
        cached = networkResp;
      } else {
        return networkResp;
      }
    }catch(e){
      // offline and not cached yet — nothing we can do for this one
      return new Response("", {status: 504, statusText: "Offline and not downloaded yet"});
    }
  }

  const rangeHeader = request.headers.get("range");
  if(rangeHeader && cached.type !== "opaque"){
    return sliceRange(cached, rangeHeader);
  }
  return cached;
}

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = event.request.url;

  if(isQuranAudio(url)){
    event.respondWith(handleQuranAudio(event.request));
    return;
  }

  if(url.startsWith(self.location.origin)){
    event.respondWith(
      caches.match(event.request).then((cached) => {
        const fetchPromise = fetch(event.request)
          .then((networkResp) => {
            if (networkResp && networkResp.status === 200) {
              const clone = networkResp.clone();
              caches.open(APP_CACHE).then((cache) => cache.put(event.request, clone));
            }
            return networkResp;
          })
          .catch(() => cached);
        return cached || fetchPromise;
      })
    );
  }
});
