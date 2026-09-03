import "../styles/fonts.css";
import "../styles/tokens.css";
import "../styles/shell.css";

const app = document.querySelector<HTMLDivElement>("#app");

if (app) {
  app.innerHTML = `
    <div class="band">
      <div class="wrap">
        <span class="lbl"><b>KRYS NEWMAN</b> &nbsp;/&nbsp; AI LAB</span>
        <nav aria-label="Sections">
          <button class="theme keep" id="theme" type="button" aria-live="polite">
            <svg class="i-dark" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>
            <svg class="i-light" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4.2"/><path d="M12 2v2.4M12 19.6V22M2 12h2.4M19.6 12H22M4.9 4.9l1.7 1.7M17.4 17.4l1.7 1.7M19.1 4.9l-1.7 1.7M6.6 17.4l-1.7 1.7"/></svg>
            <span id="theme-text">Dark</span>
          </button>
        </nav>
      </div>
    </div>
  `;
}
