import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";
import { installPreviewGameHost } from './game/previewGameHost';

installPreviewGameHost();

// React replaces the lightweight HTML loader when the actual interface is ready.
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
