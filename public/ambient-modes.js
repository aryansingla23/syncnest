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
const backend = String(params.get("backend") || "").trim();

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
