const SB_URL = "https://tqfocdktvjuwoiyfgesb.supabase.co";
const SB_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRxZm9jZGt0dmp1d29peWZnZXNiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk5MDg0NTIsImV4cCI6MjEwNTQ4NDQ1Mn0.8TW4fQCQHc4c_xTNBEwOK3lSC9HYCbkTbfXuYQB-S8g";

const sb = supabase.createClient(SB_URL, SB_KEY);
const view = document.getElementById("view");
const authBtn = document.getElementById("authBtn");
const modal = document.getElementById("modal");
const authForm = document.getElementById("authForm");
const authMsg = document.getElementById("authMsg");

let session = null;

function hourKey(d = new Date()) {
  const x = new Date(d);
  x.setMinutes(0, 0, 0);
  return x.toISOString();
}
function slotDate(d = new Date()) {
  const x = new Date(d);
  x.setMinutes(0, 0, 0);
  return x.toISOString();
}
function prettyHour(iso) {
  const d = new Date(iso);
  return d.toLocaleString(undefined, { weekday: "short", hour: "numeric", minute: "2-digit" });
}
function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[c]));
}
function route() {
  const hash = location.hash.replace("#", "") || "/";
  if (hash.startsWith("/desk")) return renderDesk();
  if (hash.startsWith("/wall")) return renderWall();
  return renderHome();
}

async function refreshAuth() {
  const { data } = await sb.auth.getSession();
  session = data.session;
  authBtn.textContent = session ? "Sign out" : "Sign in";
}

authBtn.addEventListener("click", async () => {
  if (session) {
    await sb.auth.signOut();
    session = null;
    authBtn.textContent = "Sign in";
    route();
    return;
  }
  modal.classList.remove("hidden");
});
document.getElementById("closeModal").onclick = () => modal.classList.add("hidden");
authForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const email = document.getElementById("email").value.trim();
  authMsg.textContent = "Sending…";
  const { error } = await sb.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: location.origin + location.pathname }
  });
  authMsg.textContent = error ? error.message : "Check your inbox. The well will wait.";
});

sb.auth.onAuthStateChange(async (_e, s) => {
  session = s;
  authBtn.textContent = s ? "Sign out" : "Sign in";
  if (s) {
    modal.classList.add("hidden");
    await ensureProfile();
    route();
  }
});

async function ensureProfile() {
  if (!session) return;
  const id = session.user.id;
  const handle = (session.user.email || "visitor").split("@")[0].slice(0, 24);
  await sb.from("profiles").upsert({ id, handle, display_name: handle });
}

function progressToNextHour() {
  const now = new Date();
  const mins = now.getMinutes() + now.getSeconds() / 60;
  return Math.min(100, (mins / 60) * 100);
}

async function currentHour() {
  const { data } = await sb.from("hours").select("*").order("slot", { ascending: false }).limit(1);
  return data && data[0];
}

async function publicNotes() {
  const { data } = await sb.from("notes").select("*, profiles(handle, display_name)").eq("is_public", true).order("created_at", { ascending: false }).limit(36);
  return data || [];
}

async function myNotes() {
  if (!session) return [];
  const { data } = await sb.from("notes").select("*").eq("user_id", session.user.id).order("updated_at", { ascending: false });
  return data || [];
}

async function maybeTurnHour(notes) {
  const slot = slotDate();
  const { data: existing } = await sb.from("hours").select("id").eq("slot", slot).maybeSingle();
  if (existing) return;
  const pick = notes[Math.floor(Math.random() * Math.max(notes.length, 1))];
  const headlines = [
    "The well turned.",
    "Another hour, another ember.",
    "Something was pulled from the dark.",
    "The water is warmer this hour.",
    "A note found the light."
  ];
  const headline = headlines[new Date().getHours() % headlines.length];
  await sb.from("hours").insert({
    slot,
    headline,
    editorial: pick
      ? `This hour leans on “${pick.title}.” Public notes keep the well from going dry.`
      : "The well is quiet. Leave a public note and the next hour will have something to hold.",
    featured_note_id: pick ? pick.id : null
  });
}

function noteCard(n, i) {
  const who = n.profiles?.display_name || n.profiles?.handle || "anonymous";
  return `<article class="card" style="animation-delay:${i * 40}ms">
    <h3>${esc(n.title)}</h3>
    <p>${esc((n.body || "").slice(0, 280))}${n.body && n.body.length > 280 ? "…" : ""}</p>
    <div class="meta">${esc(who)} · ${new Date(n.created_at).toLocaleDateString()}</div>
  </article>`;
}

async function renderHome() {
  const notes = await publicNotes();
  await maybeTurnHour(notes);
  const hr = await currentHour();
  const featured = hr?.featured_note_id ? notes.find((n) => n.id === hr.featured_note_id) : notes[0];
  view.innerHTML = `
    <section class="hero">
      <div>
        <div class="kicker">Public well · turns on the hour</div>
        <h1>What people leave in the dark still warms the room.</h1>
        <p class="lede">Cinderwell is a small public press. Write privately. Mark a piece public and it climbs the wall. Every sixty minutes the edition turns.</p>
      </div>
      <aside class="hourcard">
        <div class="clock">${prettyHour(hr?.slot || hourKey())}</div>
        <h2>${esc(hr?.headline || "This hour is still gathering.")}</h2>
        <p>${esc(hr?.editorial || "")}</p>
        <div class="bar"><i id="hourbar"></i></div>
        <div class="clock">until the next turn</div>
        ${featured ? `<p style="margin-top:12px"><strong>${esc(featured.title)}</strong><br>${esc((featured.body || "").slice(0, 160))}</p>` : ""}
      </aside>
    </section>
    <h2 style="margin-top:48px">On the wall</h2>
    <div class="grid">${notes.length ? notes.slice(0, 9).map(noteCard).join("") : `<p class="empty">Nothing public yet. Be the first ember.</p>`}</div>
  `;
  const bar = document.getElementById("hourbar");
  if (bar) bar.style.width = progressToNextHour() + "%";
}

async function renderWall() {
  const notes = await publicNotes();
  view.innerHTML = `
    <div class="kicker">Open to anyone</div>
    <h1>The wall</h1>
    <p class="lede">Only notes marked public appear here. Private drafts stay at your desk.</p>
    <div class="grid">${notes.length ? notes.map(noteCard).join("") : `<p class="empty">The wall is blank.</p>`}</div>
  `;
}

async function renderDesk() {
  if (!session) {
    view.innerHTML = `
      <h1>Your desk</h1>
      <p class="lede">Sign in with a magic link. Drafts stay yours until you mark them public.</p>
      <button class="primary" id="openAuth">Open the door</button>
    `;
    document.getElementById("openAuth").onclick = () => modal.classList.remove("hidden");
    return;
  }
  const notes = await myNotes();
  view.innerHTML = `
    <div class="kicker">${esc(session.user.email)}</div>
    <h1>Desk</h1>
    <form class="compose" id="compose">
      <label>Title <input name="title" maxlength="140" required /></label>
      <label>Body <textarea name="body" required maxlength="8000"></textarea></label>
      <div class="row">
        <label class="toggle"><input type="checkbox" name="is_public" /> Mark public — show it on the wall</label>
        <button class="primary" type="submit">Save</button>
      </div>
      <p class="msg" id="saveMsg"></p>
    </form>
    <h2 style="margin-top:36px">Your notes</h2>
    <div class="grid" id="mine"></div>
  `;
  document.getElementById("mine").innerHTML = notes.length
    ? notes.map((n, i) => `
        <article class="card" data-id="${n.id}" style="animation-delay:${i * 30}ms">
          <h3>${esc(n.title)}</h3>
          <p>${esc((n.body || "").slice(0, 220))}</p>
          <div class="meta">${n.is_public ? "public" : "private"} · ${new Date(n.updated_at || n.created_at).toLocaleString()}</div>
          <div class="row">
            <button class="ghost togglePub" type="button">${n.is_public ? "Make private" : "Make public"}</button>
            <button class="ghost del" type="button">Delete</button>
          </div>
        </article>`).join("")
    : `<p class="empty">No notes yet.</p>`;

  document.getElementById("compose").onsubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const payload = {
      user_id: session.user.id,
      title: String(fd.get("title") || "").trim(),
      body: String(fd.get("body") || "").trim(),
      is_public: fd.get("is_public") === "on",
      updated_at: new Date().toISOString()
    };
    const msg = document.getElementById("saveMsg");
    const { error } = await sb.from("notes").insert(payload);
    msg.textContent = error ? error.message : "Saved.";
    if (!error) renderDesk();
  };

  document.getElementById("mine").onclick = async (e) => {
    const card = e.target.closest("[data-id]");
    if (!card) return;
    const id = card.dataset.id;
    if (e.target.classList.contains("del")) {
      await sb.from("notes").delete().eq("id", id);
      renderDesk();
    }
    if (e.target.classList.contains("togglePub")) {
      const makePrivate = e.target.textContent.includes("private");
      await sb.from("notes").update({ is_public: !makePrivate, updated_at: new Date().toISOString() }).eq("id", id);
      renderDesk();
    }
  };
}

window.addEventListener("hashchange", route);
refreshAuth().then(route);
setInterval(() => {
  const bar = document.getElementById("hourbar");
  if (bar) bar.style.width = progressToNextHour() + "%";
}, 1000);
