#!/usr/bin/env node
/** Capability-scoped local GUI server for development and screenshot capture. */
import { getGuiServerAccess, startGuiServer } from "../packages/service/dist/gui/pipelineServer.js";

const port = Number(process.env.MACHINE_GUI_PORT || 3099);
const server = startGuiServer({ port });
const access = getGuiServerAccess();
if (!access) throw new Error("GUI server access capabilities were not initialized.");
process.env.MACHINE_GUI_EVENT_TOKEN = access.eventToken;
process.env.PANTAW_FRONTEND_WEBHOOK_URL = access.eventWebhookUrl;
console.log(`Dashboard: ${access.dashboardUrl}`);
console.log(`Builder: ${access.builderUrl}`);

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.once(signal, () => {
    server.close(() => process.exit(0));
  });
}
