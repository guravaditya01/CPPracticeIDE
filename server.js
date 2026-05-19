import { createServer } from "node:http";
import { readFile, rm, mkdir, writeFile } from "node:fs/promises";
import { createWriteStream } from "node:fs";
import { extname, join, normalize, resolve, dirname } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";

const PORT = Number(process.env.PORT || 3000);
const PUBLIC_DIR = resolve("public");
const RUN_TIMEOUT_MS = 7000;

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml"
};

function sendJson(res, status, data) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(data));
}

async function parseJson(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const body = Buffer.concat(chunks).toString("utf8");
  if (!body) return {};
  return JSON.parse(body);
}

function safeRelativePath(path) {
  const cleaned = normalize(String(path || "").replaceAll("\\", "/"));
  if (!cleaned || cleaned.startsWith("..") || cleaned.includes("../") || resolve("/", cleaned) === "/") {
    throw new Error(`Unsafe path: ${path}`);
  }
  return cleaned.replace(/^[/\\]+/, "");
}

async function writeWorkspace(files, root) {
  for (const file of files) {
    const relative = safeRelativePath(file.path);
    const fullPath = resolve(root, relative);
    if (!fullPath.startsWith(root)) throw new Error(`Unsafe path: ${file.path}`);
    await mkdir(dirname(fullPath), { recursive: true });
    await writeFile(fullPath, String(file.content ?? ""), "utf8");
  }
}

function runProcess(command, args, options = {}) {
  return new Promise((resolveProcess) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      shell: false,
      windowsHide: true
    });

    let stdout = "";
    let stderr = "";
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, options.timeout || RUN_TIMEOUT_MS);

    if (options.input) {
      child.stdin.write(options.input);
    }
    child.stdin.end();

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      resolveProcess({ code: 1, stdout, stderr: `${stderr}${error.message}`, timedOut });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolveProcess({ code, stdout, stderr, timedOut });
    });
  });
}

async function handleRun(req, res) {
  let tempRoot;
  try {
    const { files = [], mode = "single", targetPath, stdin = "" } = await parseJson(req);
    const cppFiles = files.filter((file) => String(file.path || "").endsWith(".cpp"));
    if (!cppFiles.length) {
      sendJson(res, 400, { ok: false, error: "Create at least one .cpp file before running." });
      return;
    }

    tempRoot = resolve(tmpdir(), `cpp-ide-${randomUUID()}`);
    await mkdir(tempRoot, { recursive: true });
    await writeWorkspace(files, tempRoot);

    const exeName = process.platform === "win32" ? "program.exe" : "program";
    const outputPath = join(tempRoot, exeName);
    const sources =
      mode === "project"
        ? cppFiles.map((file) => safeRelativePath(file.path))
        : [safeRelativePath(targetPath || cppFiles[0].path)];

    const compile = await runProcess("g++", ["-std=c++17", "-Wall", "-Wextra", ...sources, "-o", outputPath], {
      cwd: tempRoot,
      timeout: RUN_TIMEOUT_MS
    });

    if (compile.code !== 0) {
      sendJson(res, 200, {
        ok: false,
        phase: "compile",
        stdout: compile.stdout,
        stderr: compile.stderr,
        timedOut: compile.timedOut
      });
      return;
    }

    const run = await runProcess(outputPath, [], {
      cwd: tempRoot,
      input: stdin,
      timeout: RUN_TIMEOUT_MS
    });

    sendJson(res, 200, {
      ok: run.code === 0 && !run.timedOut,
      phase: "run",
      exitCode: run.code,
      stdout: run.stdout,
      stderr: run.stderr,
      timedOut: run.timedOut
    });
  } catch (error) {
    sendJson(res, 500, { ok: false, error: error.message });
  } finally {
    if (tempRoot) {
      await rm(tempRoot, { recursive: true, force: true }).catch(() => {});
    }
  }
}

function handleConfig(res) {
  sendJson(res, 200, {
    googleClientId: process.env.GOOGLE_CLIENT_ID || ""
  });
}

async function serveStatic(req, res) {
  const requestedUrl = new URL(req.url, `http://${req.headers.host}`);
  const pathname = requestedUrl.pathname === "/" ? "/index.html" : requestedUrl.pathname;
  const filePath = resolve(PUBLIC_DIR, `.${decodeURIComponent(pathname)}`);

  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  try {
    const file = await readFile(filePath);
    res.writeHead(200, { "content-type": mimeTypes[extname(filePath)] || "application/octet-stream" });
    res.end(file);
  } catch {
    res.writeHead(404);
    res.end("Not found");
  }
}

createServer(async (req, res) => {
  if (req.method === "POST" && req.url === "/api/run") {
    await handleRun(req, res);
    return;
  }
  if (req.method === "GET" && req.url === "/api/config") {
    handleConfig(res);
    return;
  }
  if (req.method === "GET") {
    await serveStatic(req, res);
    return;
  }
  res.writeHead(405);
  res.end("Method not allowed");
}).listen(PORT, () => {
  console.log(`C++ Drive Practice IDE running at http://localhost:${PORT}`);
});
