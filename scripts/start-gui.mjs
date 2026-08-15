#!/usr/bin/env node
/** Quick-start GUI server for screenshot capture */
import { startGuiServer } from "../packages/service/dist/gui/pipelineServer.js";

const server = startGuiServer({ port: 3099 });
console.log("GUI server on http://localhost:3099");
