self.addEventListener("push", function (event) {
    if (event.data) {
        try {
            const data = event.data.json();
            const options = {
                body: data.body,
                icon: "/icon-192x192.png",
                badge: "/icon-192x192.png",
                data: {
                    url: data.url
                }
            };
            event.waitUntil(self.registration.showNotification(data.title, options));
        } catch (e) {
            console.error("Error parsing push payload", e);
        }
    }
});

self.addEventListener("notificationclick", function (event) {
    event.notification.close();
    event.waitUntil(
        clients.matchAll({ type: "window" }).then((clientList) => {
            const url = event.notification.data.url || "/";
            for (const client of clientList) {
                if (client.url === url && "focus" in client) {
                    return client.focus();
                }
            }
            if (clients.openWindow) {
                return clients.openWindow(url);
            }
        })
    );
});
