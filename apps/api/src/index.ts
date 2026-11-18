import { createApp } from "./app.js";
import { startScheduler } from "./rpt/alerts.js";

const port = Number(process.env.PORT ?? 4000);
createApp().listen(port, () => {
  console.log(`api listening on :${port}`);
});

// FR-15: daily due-date and expiry check (D11).
startScheduler();
