self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open("obno-v1").then((cache) => cache.addAll(["/offline"]))
  )
})

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim())
})

self.addEventListener("fetch", (event) => {
  const request = event.request

  if (request.method !== "GET") return

  if (request.mode === "navigate") {
    event.respondWith(fetch(request).catch(() => caches.match("/offline")))
    return
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached
      return fetch(request).then((response) => {
        const copy = response.clone()
        caches.open("obno-v1").then((cache) => cache.put(request, copy))
        return response
      })
    })
  )
})
