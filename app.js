const API_BASE = "http://localhost:3000";

function escapeHtml(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "<")
    .replaceAll(">", ">")
    .replaceAll('"', """)
    .replaceAll("'", "&#039;");
}

async function apiGet(path) {
  const res = await fetch(`${API_BASE}${path}`);
  if (!res.ok) throw new Error(`API ${res.status}: ${await res.text()}`);
  return res.json();
}

function renderProjects(projects) {
  const grid = document.getElementById("projectsGrid");
  grid.innerHTML = "";

  projects.forEach((p) => {
    const el = document.createElement("div");
    el.className = "card project";
    el.innerHTML = `
      <div class="title">${escapeHtml(p.title)}</div>
      <div class="desc">${escapeHtml(p.description || "")}</div>
      <div class="meta">
        ${(p.tech || [])
          .slice(0, 5)
          .map((t) => `<span class="badge">${escapeHtml(t)}</span>`)
          .join("")}
      </div>
      <div class="links">
        ${p.repo_url ? `<a class="link-btn" href="${escapeHtml(p.repo_url)}" target="_blank" rel="noreferrer">Repo</a>` : ""}
        ${p.live_url ? `<a class="link-btn" href="${escapeHtml(p.live_url)}" target="_blank" rel="noreferrer">Live</a>` : ""}
      </div>
    `;
    grid.appendChild(el);
  });
}

function renderSkills(skills) {
  const chips = document.getElementById("skillsChips");
  chips.innerHTML = "";
  skills.forEach((s) => {
    const el = document.createElement("div");
    el.className = "chip";
    el.textContent = s;
    chips.appendChild(el);
  });

  document.getElementById("statSkills").textContent = skills.length;
}

async function loadProjects() {
  const projects = await apiGet("/api/projects");
  renderProjects(projects);
  document.getElementById("statProjects").textContent = projects.length;
}

async function loadSkills() {
  const skills = await apiGet("/api/skills");
  renderSkills(skills);
}

async function loadMeta() {
  const meta = await apiGet("/api/meta");
  document.getElementById("brandName").textContent = meta.name;
  document.getElementById("brandTagline").textContent = meta.tagline;
  document.getElementById("heroName").textContent = meta.name;
  document.getElementById("heroBio").textContent = meta.bio;
  document.getElementById("year").textContent = new Date().getFullYear();
}

async function apiPost(path, body) {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json().catch(() => ({}));
}

function initContact() {
  const form = document.getElementById("contactForm");
  const status = document.getElementById("contactStatus");

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    status.textContent = "Sending...";
    status.style.color = "var(--primary2)";

    const fd = new FormData(form);
    const payload = {
      name: fd.get("name"),
      email: fd.get("email"),
      message: fd.get("message"),
    };

    try {
      await apiPost("/api/contact", payload);
      status.textContent = "Message sent! (stored in DB)";
      status.style.color = "var(--primary2)";
      form.reset();
    } catch (err) {
      status.textContent = `Failed: ${err.message}`;
      status.style.color = "#ff6b6b";
    }
  });
}

(async function main() {
  document.getElementById("loadProjectsBtn").addEventListener("click", async () => {
    document.getElementById("projectsGrid").innerHTML = "<div class='muted'>Loading...</div>";
    try {
      await loadProjects();
    } catch (e) {
      document.getElementById("projectsGrid").innerHTML = `<div class='muted'>${escapeHtml(e.message)}</div>`;
    }
  });

  try {
    await loadMeta();
    await loadSkills();
  } catch (e) {
    document.getElementById("projectsGrid").innerHTML = `<div class='muted'>Backend not running. Start the server to load projects. (${escapeHtml(e.message)})</div>`;
    document.getElementById("skillsChips").innerHTML = "";
  }

  initContact();
})();

