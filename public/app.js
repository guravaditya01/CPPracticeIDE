const STORAGE_KEY = "cpp-drive-practice-project";
const REMEMBER_KEY = "cpp-drive-practice-remember-google";
const DRIVE_FILE_NAME = "cpp-practice-ide-project.json";
const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.file";
let browserRunnerPromise;

const defaultProject = {
  activePath: "",
  selected: { type: "folder", path: "" },
  folders: [],
  progress: {},
  files: [],
};

let project = normalizeProject(loadProject());
let appConfig = window.APP_CONFIG || { googleClientId: "" };
let accessToken = "";
let tokenClient = null;

const elements = {
  fileTree: document.querySelector("#fileTree"),
  editor: document.querySelector("#editor"),
  activePath: document.querySelector("#activePath"),
  selectedFolderLabel: document.querySelector("#selectedFolderLabel"),
  output: document.querySelector("#output"),
  stdin: document.querySelector("#stdin"),
  syncStatus: document.querySelector("#syncStatus"),
  loginBtn: document.querySelector("#loginBtn"),
  syncBtn: document.querySelector("#syncBtn"),
    newFileBtn: document.querySelector("#newFileBtn"),
    newFolderBtn: document.querySelector("#newFolderBtn"),
    runFileBtn: document.querySelector("#runFileBtn"),
  runProjectBtn: document.querySelector("#runProjectBtn"),
  rememberSignIn: document.querySelector("#rememberSignIn"),
};

function loadProject() {
  const saved = localStorage.getItem(STORAGE_KEY);
  return saved ? JSON.parse(saved) : structuredClone(defaultProject);
}

function normalizeProject(rawProject) {
  const next = {
    activePath: rawProject.activePath || rawProject.files?.[0]?.path || "main.cpp",
    selected: rawProject.selected || { type: "folder", path: "" },
    folders: Array.isArray(rawProject.folders) ? rawProject.folders : [],
    files: Array.isArray(rawProject.files) ? rawProject.files : [],
    progress: rawProject.progress && typeof rawProject.progress === "object" ? rawProject.progress : {},
  };

  const folders = new Set(next.folders.map(normalizePath).filter(Boolean));
  for (const file of next.files) {
    file.path = normalizePath(file.path);
    let current = "";
    for (const part of dirname(file.path).split("/").filter(Boolean)) {
      current = current ? `${current}/${part}` : part;
      folders.add(current);
    }
  }
  next.folders = [...folders].sort(sortPaths);
  for (const file of next.files) {
    next.progress[file.path] ||= "todo";
  }
  for (const folder of next.folders) {
    next.progress[folder] ||= "todo";
  }
  if (!next.files.some((file) => file.path === next.activePath)) {
    next.activePath = next.files[0]?.path || "";
  }
  if (!next.selected || (next.selected.type === "folder" && next.selected.path && !next.folders.includes(next.selected.path))) {
    next.selected = { type: "folder", path: dirname(next.activePath) };
  }
  return next;
}

function saveProject(status = "Saved locally") {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(project));
  elements.syncStatus.textContent = status;
}

function activeFile() {
  return project.files.find((file) => file.path === project.activePath) || project.files[0];
}

function selectedFolder() {
  return project.selected?.type === "folder" ? project.selected.path : dirname(project.selected?.path || project.activePath);
}

function normalizePath(path) {
  return String(path || "")
    .trim()
    .replaceAll("\\", "/")
    .replace(/^\/+/, "")
    .replace(/\/+/g, "/")
    .replace(/\/$/, "");
}

function validateName(name, type) {
  const cleaned = normalizePath(name);
  if (!cleaned || cleaned.includes("/")) {
    alert(`Enter only a ${type} name, not a full path.`);
    return "";
  }
  if (cleaned === "." || cleaned === ".." || cleaned.includes("..")) {
    alert("That name is not allowed.");
    return "";
  }
  return cleaned;
}

function joinPath(parent, child) {
  return parent ? `${parent}/${child}` : child;
}

function dirname(path) {
  const index = path.lastIndexOf("/");
  return index === -1 ? "" : path.slice(0, index);
}

function basename(path) {
  return path.split("/").pop() || "Project root";
}

function sortPaths(a, b) {
  return a.localeCompare(b, undefined, { sensitivity: "base" });
}

function isDirectChild(path, parent) {
  const childParent = dirname(path);
  return childParent === parent;
}

function childFolders(parent) {
  return project.folders.filter((folder) => isDirectChild(folder, parent)).sort(sortPaths);
}

function childFiles(parent) {
  return project.files.filter((file) => isDirectChild(file.path, parent)).sort((a, b) => sortPaths(a.path, b.path));
}

function renderTree() {
  const container = document.createDocumentFragment();
  container.append(folderRow("", "root"));
  const rootChildren = document.createElement("div");
  rootChildren.className = "tree-children root-children";
  renderFolderContents("", rootChildren);
  if (!project.files.length && !project.folders.length) {
    const empty = document.createElement("p");
    empty.className = "empty-tree";
    empty.textContent = "Create a file or folder inside root.";
    rootChildren.append(empty);
  }
  container.append(rootChildren);
  elements.fileTree.replaceChildren(container);
}

function renderFolderContents(parent, container) {
  for (const folder of childFolders(parent)) {
    container.append(folderRow(folder, basename(folder)));
    const children = document.createElement("div");
    children.className = "tree-children";
    renderFolderContents(folder, children);
    container.append(children);
  }
  for (const file of childFiles(parent)) {
    container.append(fileButton(file));
  }
}

function folderRow(path, label) {
  const row = document.createElement("div");
  row.className = `tree-row folder${project.selected?.type === "folder" && project.selected.path === path ? " selected" : ""}`;

  const button = document.createElement("button");
  button.className = "tree-item";
  button.type = "button";
  button.title = path || "root";
  button.innerHTML = `<span class="tree-icon" aria-hidden="true">▾</span><span class="tree-name">${escapeHtml(label)}</span>`;
  button.addEventListener("click", () => {
    persistEditor();
    project.selected = { type: "folder", path };
    saveProject();
    render();
  });
  row.append(button);
  if (path) row.append(itemTools("folder", path));
  return row;
}

function fileButton(file) {
  const row = document.createElement("div");
  const isActive = file.path === project.activePath;
  const isSelected = project.selected?.type === "file" && project.selected.path === file.path;
  row.className = `tree-row file${isActive ? " active" : ""}${isSelected ? " selected" : ""}`;

  const button = document.createElement("button");
  button.className = "tree-item";
  button.type = "button";
  button.title = file.path;
  button.innerHTML = `<span class="tree-icon" aria-hidden="true">${file.path.endsWith(".cpp") ? "◇" : "□"}</span><span class="tree-name">${escapeHtml(basename(file.path))}</span>`;
  button.addEventListener("click", () => {
    persistEditor();
    project.activePath = file.path;
    project.selected = { type: "file", path: file.path };
    saveProject();
    render();
  });
  row.append(button, itemTools("file", file.path));
  return row;
}

function itemTools(type, path) {
  const tools = document.createElement("div");
  tools.className = "item-tools";
  tools.append(progressSelect(path), iconButton("Rename", "✎", () => renameItem(type, path)), iconButton("Delete", "×", () => deleteItem(type, path)));
  return tools;
}

function progressSelect(path) {
  const select = document.createElement("select");
  const currentStatus = project.progress[path] || "todo";
  select.className = `progress-select ${currentStatus}`;
  select.value = currentStatus;
  for (const [value, label] of [
    ["todo", "To do"],
    ["progress", "Progress"],
    ["done", "Done"],
  ]) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = label;
    select.append(option);
  }
  select.title = select.options[select.selectedIndex].textContent;
  select.addEventListener("click", (event) => event.stopPropagation());
  select.addEventListener("change", () => {
    project.progress[path] = select.value;
    select.className = `progress-select ${select.value}`;
    select.title = select.options[select.selectedIndex].textContent;
    saveProject("Progress saved");
  });
  return select;
}

function iconButton(label, icon, handler) {
  const button = document.createElement("button");
  button.className = "tiny-icon-button";
  button.type = "button";
  button.title = label;
  button.setAttribute("aria-label", label);
  button.textContent = icon;
  button.addEventListener("click", (event) => {
    event.stopPropagation();
    handler();
  });
  return button;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => {
    const map = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" };
    return map[char];
  });
}

function render() {
  project = normalizeProject(project);
  const file = activeFile();
  if (file) {
    project.activePath = file.path;
    elements.activePath.textContent = file.path;
    elements.editor.value = file.content;
    elements.editor.disabled = false;
  } else {
    elements.activePath.textContent = "root";
    elements.editor.value = "";
    elements.editor.disabled = true;
  }
  const folder = selectedFolder();
  elements.selectedFolderLabel.textContent = folder || "Project root";
  renderTree();
}

function persistEditor() {
  const file = activeFile();
  if (file) file.content = elements.editor.value;
}

function createFile() {
  persistEditor();
  const parent = selectedFolder();
  const name = validateName(prompt(`New file in ${parent || "Project root"}`, "new.cpp") || "", "file");
  if (!name) return;
  const path = joinPath(parent, name);
  if (project.files.some((file) => file.path === path)) {
    alert("A file already exists with that name.");
    return;
  }
  if (project.folders.includes(path)) {
    alert("A folder already exists with that name.");
    return;
  }
  project.files.push({
    path,
    content: path.endsWith(".cpp") ? cppTemplate() : "",
  });
  project.progress[path] = "todo";
  project.activePath = path;
  project.selected = { type: "file", path };
  saveProject();
  render();
}

function createFolder() {
  persistEditor();
  const parent = selectedFolder();
  const name = validateName(prompt(`New folder in ${parent || "Project root"}`, "exercises") || "", "folder");
  if (!name) return;
  const path = joinPath(parent, name);
  if (project.folders.includes(path) || project.files.some((file) => file.path === path)) {
    alert("Something already exists with that name.");
    return;
  }
  project.folders.push(path);
  project.progress[path] = "todo";
  project.selected = { type: "folder", path };
  saveProject();
  render();
}

function renameItem(type, path) {
  persistEditor();
  const selected = { type, path };
  if (selected.type === "folder" && selected.path === "") {
    alert("The root folder cannot be renamed.");
    return;
  }

  const currentName = basename(selected.path);
  const newName = validateName(prompt(`Rename ${currentName}`, currentName) || "", selected.type);
  if (!newName || newName === currentName) return;

  const parent = dirname(selected.path);
  const newPath = joinPath(parent, newName);
  if (project.files.some((file) => file.path === newPath) || project.folders.includes(newPath)) {
    alert("Something already exists with that name.");
    return;
  }

  if (selected.type === "file") {
    const file = project.files.find((item) => item.path === selected.path);
    if (!file) return;
    file.path = newPath;
    project.progress[newPath] = project.progress[selected.path] || "todo";
    delete project.progress[selected.path];
    project.activePath = newPath;
    project.selected = { type: "file", path: newPath };
  } else {
    renameFolder(selected.path, newPath);
    project.selected = { type: "folder", path: newPath };
  }

  saveProject("Renamed");
  render();
}

function renameFolder(oldPath, newPath) {
  const nextProgress = {};
  project.folders = project.folders.map((folder) => replacePathPrefix(folder, oldPath, newPath));
  for (const file of project.files) {
    file.path = replacePathPrefix(file.path, oldPath, newPath);
  }
  for (const [path, status] of Object.entries(project.progress)) {
    nextProgress[replacePathPrefix(path, oldPath, newPath)] = status;
  }
  project.progress = nextProgress;
  project.activePath = replacePathPrefix(project.activePath, oldPath, newPath);
}

function replacePathPrefix(path, oldPrefix, newPrefix) {
  if (path === oldPrefix) return newPrefix;
  if (path.startsWith(`${oldPrefix}/`)) return `${newPrefix}${path.slice(oldPrefix.length)}`;
  return path;
}

function deleteItem(type, path) {
  persistEditor();
  const selected = { type, path };
  if (selected.type === "folder" && selected.path === "") {
    alert("The root folder cannot be deleted.");
    return;
  }

  const label = selected.type === "file" ? selected.path : selected.path;
  const confirmation = prompt(`Type exactly "${basename(label)}" to delete ${label}.`);
  if (confirmation !== basename(label)) return;

  if (selected.type === "file") {
    project.files = project.files.filter((file) => file.path !== selected.path);
    delete project.progress[selected.path];
  } else {
    project.folders = project.folders.filter((folder) => folder !== selected.path && !folder.startsWith(`${selected.path}/`));
    project.files = project.files.filter((file) => !file.path.startsWith(`${selected.path}/`));
    for (const path of Object.keys(project.progress)) {
      if (path === selected.path || path.startsWith(`${selected.path}/`)) delete project.progress[path];
    }
  }

  if (!project.files.length) {
    project.files.push({ path: "main.cpp", content: cppTemplate() });
    project.progress["main.cpp"] = "todo";
  }
  project.activePath = project.files[0].path;
  project.selected = { type: "file", path: project.activePath };
  saveProject("Deleted");
  render();
}

function cppTemplate() {
  return `#include <iostream>
using namespace std;

int main() {
    return 0;
}
`;
}

async function run(mode) {
  persistEditor();
  saveProject("Saved locally");
  elements.output.textContent = mode === "project" ? "Starting browser project run..." : `Starting browser run for ${project.activePath}...`;

  try {
    if (!browserRunnerPromise) browserRunnerPromise = import("/browser-runner.js");
    const { runCppInBrowser } = await browserRunnerPromise;
    const result = await runCppInBrowser({
      files: project.files,
      mode,
      targetPath: project.activePath,
      stdin: elements.stdin.value,
      status: (message) => {
        elements.output.textContent = message;
      },
    });
    renderRunResult(result);
    return;
  } catch (error) {
    elements.output.textContent = `${error.message}\n\nTrying local server runner...`;
  }

  const response = await fetch("/api/run", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      files: project.files,
      mode,
      targetPath: project.activePath,
      stdin: elements.stdin.value,
    }),
  });

  const result = await response.json();
  if (!result.ok && result.error) {
    elements.output.textContent = result.error;
    return;
  }
  renderRunResult(result);
}

function renderRunResult(result) {
  const lines = [];
  if (result.timedOut) lines.push("Process timed out.");
  if (result.phase === "compile") lines.push("Compilation failed.");
  if (result.phase === "run") lines.push(`Exit code: ${result.exitCode}`);
  if (result.stdout) lines.push(`\nstdout:\n${result.stdout}`);
  if (result.stderr) lines.push(`\nstderr:\n${result.stderr}`);
  elements.output.textContent = lines.join("\n").trim() || "Program finished with no output.";
}

function initGoogleAuth() {
  if (!appConfig.googleClientId || !window.google?.accounts?.oauth2) return false;
  tokenClient = window.google.accounts.oauth2.initTokenClient({
    client_id: appConfig.googleClientId,
    scope: DRIVE_SCOPE,
    callback: (response) => {
      if (response.error) {
        elements.syncStatus.textContent = "Sign-in needed";
        return;
      }
      accessToken = response.access_token;
      elements.loginBtn.textContent = "Signed in";
      elements.syncBtn.disabled = false;
      elements.syncStatus.textContent = "Drive ready";
    },
    error_callback: () => {
      elements.syncStatus.textContent = "Sign-in needed";
    },
  });
  return true;
}

function login(prompt = "consent") {
  if (!tokenClient && !initGoogleAuth()) {
    elements.syncStatus.textContent = "Drive not configured";
    elements.output.textContent =
      "Google Drive sync is not configured for this app yet. The app owner needs to start the server with GOOGLE_CLIENT_ID set. You can still write and run code locally.";
    return;
  }
  localStorage.setItem(REMEMBER_KEY, String(elements.rememberSignIn.checked));
  tokenClient.requestAccessToken({ prompt: accessToken ? "" : prompt });
}

async function driveFetch(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      authorization: `Bearer ${accessToken}`,
      ...(options.headers || {}),
    },
  });
  if (!response.ok) {
    throw new Error(await response.text());
  }
  return response;
}

async function findDriveFile() {
  const query = encodeURIComponent(`name='${DRIVE_FILE_NAME}' and trashed=false`);
  const response = await driveFetch(`https://www.googleapis.com/drive/v3/files?q=${query}&spaces=drive&fields=files(id,name,modifiedTime)`);
  const data = await response.json();
  return data.files?.[0] || null;
}

async function uploadDriveFile(fileId) {
  persistEditor();
  const metadata = { name: DRIVE_FILE_NAME, mimeType: "application/json" };
  const boundary = `practice_ide_${Date.now()}`;
  const body = [
    `--${boundary}`,
    "Content-Type: application/json; charset=UTF-8",
    "",
    JSON.stringify(metadata),
    `--${boundary}`,
    "Content-Type: application/json; charset=UTF-8",
    "",
    JSON.stringify(project),
    `--${boundary}--`,
  ].join("\r\n");

  const url = fileId
    ? `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=multipart`
    : "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart";
  await driveFetch(url, {
    method: fileId ? "PATCH" : "POST",
    headers: { "content-type": `multipart/related; boundary=${boundary}` },
    body,
  });
  saveProject("Synced to Drive");
}

async function syncDrive() {
  if (!accessToken) return login();
  elements.syncStatus.textContent = "Syncing...";
  try {
    const existing = await findDriveFile();
    if (existing && confirm("Load project from Drive? Choose Cancel to upload this local project.")) {
      const response = await driveFetch(`https://www.googleapis.com/drive/v3/files/${existing.id}?alt=media`);
      project = normalizeProject(await response.json());
      saveProject("Loaded from Drive");
      render();
      return;
    }
    await uploadDriveFile(existing?.id);
  } catch (error) {
    elements.syncStatus.textContent = "Drive error";
    elements.output.textContent = error.message;
  }
}

elements.editor.addEventListener("input", () => {
  persistEditor();
  saveProject();
});
elements.newFileBtn.addEventListener("click", createFile);
elements.newFolderBtn.addEventListener("click", createFolder);
elements.runFileBtn.addEventListener("click", () => run("single"));
elements.runProjectBtn.addEventListener("click", () => run("project"));
elements.loginBtn.addEventListener("click", () => login("consent"));
elements.syncBtn.addEventListener("click", syncDrive);
elements.rememberSignIn.addEventListener("change", () => {
  localStorage.setItem(REMEMBER_KEY, String(elements.rememberSignIn.checked));
});

window.addEventListener("load", async () => {
  try {
    const response = await fetch("/api/config");
    const serverConfig = await response.json();
    appConfig = {
      ...appConfig,
      ...Object.fromEntries(Object.entries(serverConfig).filter(([, value]) => value)),
    };
  } catch {
    appConfig = window.APP_CONFIG || { googleClientId: "" };
  }
  if (appConfig.googleClientId) {
    initGoogleAuth();
    elements.syncStatus.textContent = "Local draft";
  } else {
    elements.loginBtn.disabled = true;
    elements.syncBtn.disabled = true;
    elements.syncStatus.textContent = "Local only";
  }
  elements.rememberSignIn.checked = localStorage.getItem(REMEMBER_KEY) === "true";
  if (appConfig.googleClientId && elements.rememberSignIn.checked) {
    const tryAutoSignIn = () => {
      if (initGoogleAuth()) login("");
      else setTimeout(tryAutoSignIn, 300);
    };
    tryAutoSignIn();
  }
  saveProject();
  render();
});
