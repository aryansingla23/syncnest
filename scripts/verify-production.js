const BACKEND_URL = process.env.SYNCNEST_API_BASE
  || process.env.BACKEND_URL
  || "https://syncnest-backend.onrender.com";
const FRONTEND_URL = process.env.FRONTEND_URL || "https://syncnest-room.netlify.app";

async function check(url, label) {
  try {
    const response = await fetch(`${url.replace(/\/+$/, "")}/health`, {
      headers: { Accept: "application/json" }
    });
    const body = await response.text();
    const ok = response.ok && body.includes('"ok":true');
    console.log(`${ok ? "OK" : "FAIL"} ${label}: ${response.status} ${body.slice(0, 120)}`);
    return ok;
  } catch (error) {
    console.log(`FAIL ${label}: ${error.message}`);
    return false;
  }
}

async function main() {
  console.log("SyncNest production checks");
  console.log(`Backend: ${BACKEND_URL}`);
  console.log(`Frontend: ${FRONTEND_URL}`);
  const backendOk = await check(BACKEND_URL, "backend /health");
  let frontendOk = false;
  try {
    const response = await fetch(FRONTEND_URL);
    frontendOk = response.ok;
    console.log(`${frontendOk ? "OK" : "FAIL"} frontend: ${response.status}`);
  } catch (error) {
    console.log(`FAIL frontend: ${error.message}`);
  }

  if (!backendOk) {
    console.log("\nBackend is not live. Deploy Render service from render.yaml, then redeploy Netlify.");
    process.exitCode = 1;
    return;
  }

  if (!frontendOk) {
    console.log("\nFrontend check failed.");
    process.exitCode = 1;
    return;
  }

  console.log("\nProduction stack looks reachable.");
}

main();
