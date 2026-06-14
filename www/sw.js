/**
 * Service Worker - 静态缓存 + 后台提醒检查
 */
const CACHE_NAME = 'todo-assistant-v3';

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then(cache =>
            cache.addAll(['/', '/index.html', '/css/styles.css', '/manifest.json', '/icons/icon.svg', '/js/config.js'])
        )
    );
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(self.clients.claim());
    setInterval(() => self.checkReminders(), 60000);
});

self.addEventListener('message', (event) => {
    if (event.data?.type === 'SYNC_REMINDERS') {
        caches.open(CACHE_NAME).then(cache =>
            cache.put('/__reminders__', new Response(JSON.stringify(event.data.reminders || [])))
        );
    }
});

/**
 * 检查并触发到期提醒
 */
async function checkReminders() {
    try {
        const cache = await caches.open(CACHE_NAME);
        const res = await cache.match('/__reminders__');
        if (!res) return;
        const reminders = await res.json();
        const now = Date.now();

        reminders.forEach(r => {
            if (!r.time) return;
            const fire = new Date(r.time).getTime();
            const diff = now - fire;
            if (diff >= 0 && diff < 60000) {
                self.registration.showNotification('智能TODO清单提醒', {
                    body: r.title,
                    icon: '/icons/icon.svg',
                    tag: r.id || r.title
                });
            }
        });
    } catch {
        /* 忽略 */
    }
}

self.addEventListener('fetch', (event) => {
    event.respondWith(
        caches.match(event.request).then(cached => cached || fetch(event.request))
    );
});
