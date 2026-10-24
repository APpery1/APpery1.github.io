import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { LanguageProvider } from "./i18n/LanguageContext";
import { parseRoute } from "./lib/places";
import { loadCityBytes } from "./components/city/CityAsset";
import "./styles.css";
import "./city.css";

// Start the model transfer and engine import before React mounts the city.
if (!parseRoute().place) {
  void loadCityBytes().catch(() => {});
  void import("./components/city/CityRuntime").catch(() => {});
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <LanguageProvider>
      <App />
    </LanguageProvider>
  </React.StrictMode>,
);
