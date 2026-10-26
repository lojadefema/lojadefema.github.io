/* Painel Defema — service worker mínimo para o painel poder ser instalado
   como aplicativo. Estratégia "rede primeiro": sempre busca a versão nova;
   só usa a cópia guardada se estiver sem internet. Nada do Supabase
   (dados, login, fotos enviadas) é guardado aqui. */
const CACHE = "painel-defema-demo-v1";
const BASICO = ["./", "./manifest.webmanifest", "./favicon.svg", "./icone-192.png"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(BASICO)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== location.origin) return;   // Supabase, fontes etc.: direto na rede
  if (url.pathname.endsWith("/versao.txt")) return;                    // autoatualização sempre na rede
  e.respondWith(
    fetch(req).then(r => {
      if (r.ok && (req.mode === "navigate" || BASICO.some(b => url.pathname.endsWith(b.replace("./", "/"))))) {
        const copia = r.clone(); caches.open(CACHE).then(c => c.put(req.mode === "navigate" ? "./" : req, copia));
      }
      return r;
    }).catch(() => caches.match(req.mode === "navigate" ? "./" : req).then(r => r || Response.error()))
  );
});
