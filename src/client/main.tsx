import { createRoot } from "react-dom/client";
import { App } from "./app";
import "./arcade.css";

const root = document.querySelector("#root");

if (!root) {
  throw new Error("Missing application root element");
}

createRoot(root).render(<App />);
