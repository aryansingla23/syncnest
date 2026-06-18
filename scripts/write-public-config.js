const fs = require("fs");
const path = require("path");

const publicDir = path.join(__dirname, "..", "public");
const configPath = path.join(publicDir, "config.js");
const deployConfigPath = path.join(__dirname, "..", "deploy", "config.json");

function normalizeUrl(value) {
  const trimmed = String(value || "").trim();
  if (!trimmed) return "";
  if (/^https?:\/\//i.test(trimmed)) return trimmed.replace(/\/+$/, "");
  return `https://${trimmed}`.replace(/\/+$/, "");
}

function readDeployDefaults() {
  try {
    const raw = fs.readFileSync(deployConfigPath, "utf8");
    const parsed = JSON.parse(raw);
    return {
      backendUrl: normalizeUrl(parsed?.backendUrl || ""),
      frontendUrl: normalizeUrl(parsed?.frontendUrl || "")
    };
  } catch {
    return { backendUrl: "", frontendUrl: "" };
  }
}

const deployDefaults = readDeployDefaults();
const backendUrl = normalizeUrl(
  process.env.SYNCNEST_API_BASE
  || process.env.PULSE_BACKEND_URL
  || process.env.BACKEND_URL
  || deployDefaults.backendUrl
  || ""
);

const body = `window.SYNCNEST_API_BASE = ${JSON.stringify(backendUrl)};
window.PULSE_BACKEND_URL = window.SYNCNEST_API_BASE;
`;

fs.writeFileSync(configPath, body);
console.log(`Wrote public/config.js with backend URL: ${backendUrl || "(empty — set SYNCNEST_API_BASE or deploy/config.json)"}.`);
