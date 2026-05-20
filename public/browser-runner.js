const WASMER_SDK_URL = "https://unpkg.com/@wasmer/sdk@latest/dist/index.mjs";
const CLANG_PACKAGE = "clang/clang";

let wasmerModulePromise;
let clangPackagePromise;

function text(bytes) {
  if (!bytes) return "";
  if (typeof bytes === "string") return bytes;
  return new TextDecoder().decode(bytes);
}

async function loadWasmer(status) {
  if (!crossOriginIsolated) {
    throw new Error(
      "Browser C++ runner needs cross-origin isolation. On Netlify, make sure the security headers are deployed, then hard refresh the page."
    );
  }

  if (!wasmerModulePromise) {
    status?.("Loading browser compiler runtime...");
    wasmerModulePromise = import(WASMER_SDK_URL).then(async (module) => {
      await module.init();
      return module;
    });
  }

  return wasmerModulePromise;
}

async function loadClang(wasmer, status) {
  if (!clangPackagePromise) {
    status?.("Downloading C++ compiler. First run can take a little while...");
    clangPackagePromise = wasmer.Wasmer.fromRegistry(CLANG_PACKAGE);
  }
  return clangPackagePromise;
}

async function writeProjectFiles(directory, files) {
  for (const file of files) {
    await directory.writeFile(file.path, file.content || "");
  }
}

async function readOutput(instance) {
  const output = await instance.wait();
  return {
    code: output.code ?? 0,
    stdout: text(output.stdoutBytes || output.stdout),
    stderr: text(output.stderrBytes || output.stderr),
  };
}

export async function runCppInBrowser({ files, mode, targetPath, stdin = "", status }) {
  const cppFiles = files.filter((file) => file.path.endsWith(".cpp"));
  if (!cppFiles.length) {
    throw new Error("Create at least one .cpp file before running.");
  }

  const selectedSources =
    mode === "project"
      ? cppFiles.map((file) => `/project/${file.path}`)
      : [`/project/${targetPath || cppFiles[0].path}`];

  const wasmer = await loadWasmer(status);
  const clang = await loadClang(wasmer, status);
  const project = new wasmer.Directory();
  await writeProjectFiles(project, files);

  status?.("Compiling in your browser...");
  const compile = await clang.entrypoint.run({
    args: [
      "--driver-mode=g++",
      "-std=c++17",
      "-Wall",
      "-Wextra",
      ...selectedSources,
      "-o",
      "/project/program.wasm",
    ],
    mount: {
      "/project": project,
    },
  });

  const compileResult = await readOutput(compile);
  if (compileResult.code !== 0) {
    return {
      ok: false,
      phase: "compile",
      exitCode: compileResult.code,
      stdout: compileResult.stdout,
      stderr: compileResult.stderr,
    };
  }

  const programBytes = await project.readFile("program.wasm");
  const program = await wasmer.Wasmer.fromFile(programBytes);

  status?.("Running in your browser...");
  const run = await program.entrypoint.run({
    stdin: new TextEncoder().encode(stdin),
  });
  const runResult = await readOutput(run);

  return {
    ok: runResult.code === 0,
    phase: "run",
    exitCode: runResult.code,
    stdout: runResult.stdout,
    stderr: runResult.stderr,
  };
}
