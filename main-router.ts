console.log("main function started");

// Load secrets from mounted GCP secret volume (dotenv format)
const dotenvPath = Deno.env.get("DOTENV_PATH") || "/secrets/.env";
try {
  const content = await Deno.readTextFile(dotenvPath);
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIndex = trimmed.indexOf("=");
    if (eqIndex === -1) continue;
    const key = trimmed.slice(0, eqIndex).trim();
    const value = trimmed.slice(eqIndex + 1).trim().replace(/^["']|["']$/g, "");
    if (!Deno.env.get(key)) {
      Deno.env.set(key, value);
    }
  }
  console.log(`Loaded env from ${dotenvPath}`);
} catch (e) {
  console.warn(`Could not load ${dotenvPath}: ${e.message}`);
}

Deno.serve(async (req: Request) => {
  const url = new URL(req.url);
  const { pathname } = url;
  const headers = new Headers({ "Content-Type": "application/json" });

  // Health check endpoint
  if (pathname === "/_internal/health") {
    return new Response(JSON.stringify({ message: "ok" }), { status: 200, headers });
  }

  const path_parts = pathname.split("/");
  const service_name = path_parts[1];

  if (!service_name || service_name === "") {
    return new Response(JSON.stringify({ msg: "missing function name in request" }), {
      status: 400,
      headers,
    });
  }

  const servicePath = `/home/deno/functions/${service_name}`;
  console.error(`serving the request with ${servicePath}`);

  const envVarsObj = Deno.env.toObject();
  const envVars = Object.keys(envVarsObj).map((k) => [k, envVarsObj[k]]);

  try {
    const worker = await EdgeRuntime.userWorkers.create({
      servicePath,
      memoryLimitMb: 150,
      workerTimeoutMs: 5 * 60 * 1000,
      noModuleCache: false,
      envVars,
      forceCreate: false,
    });
    return await worker.fetch(req);
  } catch (e) {
    return new Response(JSON.stringify({ msg: e.toString() }), {
      status: 500,
      headers,
    });
  }
});
