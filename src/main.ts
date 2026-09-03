import "../styles/fonts.css";
import "../styles/tokens.css";
import "../styles/shell.css";
import { createShell } from "./app/shell";

const app = document.querySelector<HTMLDivElement>("#app");
if (!app) throw new Error("#app is missing from index.html");

createShell(app);
