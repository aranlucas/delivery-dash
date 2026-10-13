import { createRoot } from "react-dom/client";
import { App } from "./app";
import "./arcade.css";

createRoot(document.querySelector("#root")!).render(<App />);
