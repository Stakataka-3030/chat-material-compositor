import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "../../src/ui/App.js";
import { RenderPage } from "../../src/ui/RenderPage.js";
import "../../src/ui/style.css";
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    {location.pathname === "/render" ? <RenderPage /> : <App />}
  </React.StrictMode>,
);
