const roomId = decodeURIComponent((window.location.pathname.split("/room/")[1] || "").split("/")[0] || "");
const params = new URLSearchParams(window.location.search);
const NAME_KEY = "syncnest_name";
const LEGACY_NAME_KEY = "watchparty_name";
const modeKey = `syncnest_oasis_track_${roomId}`;
const legacyModeKey = `pulseroom_oasis_track_${roomId}`;
const userName = String(
  params.get("name")
  || localStorage.getItem(NAME_KEY)
  || localStorage.getItem(LEGACY_NAME_KEY)
  || ""
).trim();
function normalizeBackendUrl(value) {
  const trimmed = String(value || "").trim();
  if (!trimmed) return "";
  if (/^https?:\/\//i.test(trimmed)) return trimmed.replace(/\/+$/, "");
  return `https://${trimmed}`.replace(/\/+$/, "");
}

const PRODUCTION_BACKEND_DEFAULT = "https://syncnest-backend.onrender.com";

const configuredBackend = normalizeBackendUrl(window.SYNCNEST_API_BASE || window.PULSE_BACKEND_URL);
const backend = normalizeBackendUrl(params.get("backend") || configuredBackend || PRODUCTION_BACKEND_DEFAULT);

function buildRoomUrl() {
  const query = new URLSearchParams();
  if (userName) query.set("name", userName);
  if (backend) query.set("backend", backend);
  query.set("mode", "study");
  const queryString = query.toString();
  return `/room/${encodeURIComponent(roomId)}${queryString ? `?${queryString}` : ""}`;
}

const cards = Array.from(document.querySelectorAll(".oasis-card"));
cards.forEach((card) => {
  const button = card.querySelector(".oasis-select");
  button?.addEventListener("click", () => {
    const selected = String(card.dataset.mode || "").trim();
    if (!selected) return;
    localStorage.setItem(modeKey, selected);
    localStorage.setItem(legacyModeKey, selected);
    window.location.assign(buildRoomUrl());
  });
});

const backToRoomBtn = document.getElementById("backToRoomBtn");
if (backToRoomBtn) {
  backToRoomBtn.addEventListener("click", () => {
    window.location.assign(buildRoomUrl());
  });
}
