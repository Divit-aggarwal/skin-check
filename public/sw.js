// TD-47 reminders. Only push and notificationclick: no fetch handler and no
// cache, so this worker never changes how a page loads. Pushes carry no data;
// the line below is fixed, and Home says what is due.
self.addEventListener("push", (event) => {
  event.waitUntil(
    self.registration.showNotification("The Project SKIN", {
      body: "You have a reminder for today: your next check or your routine.",
      tag: "daily-reminder",
      icon: "/icon-192.png",
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((all) => {
      const open = all.find((c) => new URL(c.url).pathname === "/dashboard");
      return open ? open.focus() : self.clients.openWindow("/dashboard");
    })
  );
});
