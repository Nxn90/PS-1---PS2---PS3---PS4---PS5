const { app, BrowserWindow, dialog, ipcMain, shell } = require("electron");
const { spawn } = require("node:child_process");
const { createWriteStream } = require("node:fs");
const fs = require("node:fs/promises");
const { createHash } = require("node:crypto");
const path = require("node:path");
const { Readable, Transform } = require("node:stream");
const { pipeline } = require("node:stream/promises");
const {
  inspectWindowsX64Pe,
  isPathInside,
  officialReleaseApi,
  selectWindowsReleaseAsset,
  sha256File,
} = require("./anyps5-release.cjs");

const configPath = () => path.join(app.getPath("userData"), "tools.json");
const runningProcesses = new Map();
const installingPs5Tools = new Set();
const githubHeaders = {
  Accept: "application/vnd.github+json",
  "X-GitHub-Api-Version": "2022-11-28",
  "User-Agent": "PlayStation-Recomp-Hub",
};

async function readToolConfig() {
  try {
    return JSON.parse(await fs.readFile(configPath(), "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return {};
    throw error;
  }
}

async function writeToolConfig(config) {
  const target = configPath();
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, JSON.stringify(config, null, 2), "utf8");
}

function sendInstallProgress(event, progress) {
  event.sender.send("hub:ps5-install-progress", progress);
}

async function runPowerShellExtract(archivePath, destinationPath) {
  const command = [
    "$ErrorActionPreference = 'Stop'",
    "Expand-Archive -LiteralPath $env:ANYPS5_ARCHIVE -DestinationPath $env:ANYPS5_DESTINATION",
  ].join("; ");

  await new Promise((resolve, reject) => {
    const child = spawn(
      "powershell.exe",
      ["-NoLogo", "-NoProfile", "-NonInteractive", "-Command", command],
      {
        windowsHide: true,
        shell: false,
        env: {
          ...process.env,
          ANYPS5_ARCHIVE: archivePath,
          ANYPS5_DESTINATION: destinationPath,
        },
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    let output = "";
    child.stdout.on("data", (chunk) => { output = `${output}${chunk.toString("utf8")}`.slice(-4000); });
    child.stderr.on("data", (chunk) => { output = `${output}${chunk.toString("utf8")}`.slice(-4000); });
    child.once("error", reject);
    child.once("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`Could not extract the verified AnyPS5 release${output ? `: ${output.trim()}` : "."}`));
    });
  });
}

async function findPs5Relinker(extractedPath) {
  const matches = [];
  const directories = [extractedPath];
  let visited = 0;
  while (directories.length > 0) {
    const current = directories.pop();
    const entries = await fs.readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      visited += 1;
      if (visited > 20_000) throw new Error("The AnyPS5 release archive has too many entries.");
      const entryPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        directories.push(entryPath);
      } else if (entry.isFile() && entry.name.toLowerCase() === "relinker.exe") {
        if (!isPathInside(extractedPath, entryPath)) {
          throw new Error("The relinker path escaped the extracted AnyPS5 release folder.");
        }
        matches.push(entryPath);
      }
    }
  }

  if (matches.length !== 1) {
    throw new Error(
      matches.length === 0
        ? "The verified AnyPS5 Windows release did not contain relinker.exe."
        : "The verified AnyPS5 Windows release contained multiple relinker.exe files.",
    );
  }
  return matches[0];
}

async function downloadWindowsReleaseAsset(event, asset, archivePath) {
  const response = await fetch(asset.downloadUrl, {
    headers: { Accept: "application/octet-stream", "User-Agent": "PlayStation-Recomp-Hub" },
    redirect: "follow",
    signal: AbortSignal.timeout(10 * 60 * 1000),
  });
  if (!response.ok || !response.body) {
    throw new Error(`The official AnyPS5 download returned HTTP ${response.status}.`);
  }

  const finalUrl = new URL(response.url);
  if (
    finalUrl.protocol !== "https:" ||
    !["github.com", "release-assets.githubusercontent.com", "objects.githubusercontent.com"].includes(finalUrl.hostname)
  ) {
    throw new Error("The AnyPS5 download redirected to an unexpected host.");
  }
  const contentLength = response.headers.get("content-length");
  if (contentLength && Number(contentLength) !== asset.size) {
    throw new Error("The AnyPS5 release size does not match GitHub's release metadata.");
  }

  const hash = createHash("sha256");
  let receivedBytes = 0;
  let lastUpdate = 0;
  const meter = new Transform({
    transform(chunk, _encoding, callback) {
      receivedBytes += chunk.length;
      if (receivedBytes > asset.size) {
        callback(new Error("The AnyPS5 download exceeded the published asset size."));
        return;
      }
      hash.update(chunk);
      const now = Date.now();
      if (now - lastUpdate >= 250 || receivedBytes === asset.size) {
        lastUpdate = now;
        sendInstallProgress(event, {
          phase: "downloading",
          version: asset.tag,
          receivedBytes,
          totalBytes: asset.size,
        });
      }
      callback(null, chunk);
    },
  });
  await pipeline(
    Readable.fromWeb(response.body),
    meter,
    createWriteStream(archivePath, { flags: "wx" }),
  );
  if (receivedBytes !== asset.size) {
    throw new Error("The AnyPS5 download ended before the full release asset was received.");
  }
  const actualSha256 = hash.digest("hex");
  if (actualSha256 !== asset.sha256) {
    throw new Error("The AnyPS5 release SHA-256 did not match GitHub's published digest.");
  }
  return actualSha256;
}

async function getToolStatus(config) {
  let executableReady = false;
  let executableSha256 = null;
  if (typeof config.ps5RelinkerPath === "string") {
    try {
      const inspection = await inspectWindowsX64Pe(config.ps5RelinkerPath);
      executableSha256 = inspection.valid ? await sha256File(config.ps5RelinkerPath) : null;
      executableReady =
        inspection.valid &&
        (!config.ps5RelinkerSha256 || executableSha256 === config.ps5RelinkerSha256);
    } catch {
      executableReady = false;
    }
  }

  const ready = process.platform === "win32" && executableReady;
  return {
    platform: process.platform,
    packaged: app.isPackaged,
    ps5RelinkerPath: ready ? config.ps5RelinkerPath : null,
    ps5RelinkerReady: ready,
    ps5RelinkerOfficial: ready && config.ps5ToolSource === "official",
    ps5ReleaseTag: ready ? config.ps5ReleaseTag ?? null : null,
    ps5ReleaseUrl: ready ? config.ps5ReleaseUrl ?? null : null,
    ps5ArchiveSha256: ready ? config.ps5ArchiveSha256 ?? null : null,
    ps5RelinkerSha256: ready ? executableSha256 : null,
  };
}

async function installOfficialPs5Tool(event) {
  if (process.platform !== "win32") {
    throw new Error("The official AnyPS5 Windows tool can only be installed in the Windows desktop app.");
  }

  const releaseResponse = await fetch(officialReleaseApi, {
    headers: githubHeaders,
    signal: AbortSignal.timeout(20_000),
  });
  if (!releaseResponse.ok) {
    throw new Error(`Could not read the official AnyPS5 release metadata (HTTP ${releaseResponse.status}).`);
  }
  const release = await releaseResponse.json();
  const asset = selectWindowsReleaseAsset(release);
  sendInstallProgress(event, { phase: "preparing", version: asset.tag });

  const config = await readToolConfig();
  const currentStatus = await getToolStatus(config);
  if (
    currentStatus.ps5RelinkerReady &&
    config.ps5ToolSource === "official" &&
    config.ps5ReleaseTag === asset.tag &&
    config.ps5ArchiveSha256 === asset.sha256
  ) {
    sendInstallProgress(event, { phase: "complete", version: asset.tag });
    return currentStatus;
  }

  const installRoot = path.join(app.getPath("userData"), "AnyPS5");
  await fs.mkdir(installRoot, { recursive: true });
  const stagingPath = await fs.mkdtemp(path.join(installRoot, ".install-"));
  const archivePath = path.join(stagingPath, asset.name);
  const extractedPath = path.join(stagingPath, "extracted");

  try {
    await downloadWindowsReleaseAsset(event, asset, archivePath);
    sendInstallProgress(event, { phase: "extracting", version: asset.tag });
    await fs.mkdir(extractedPath);
    await runPowerShellExtract(archivePath, extractedPath);

    const stagedExecutablePath = await findPs5Relinker(extractedPath);
    const inspection = await inspectWindowsX64Pe(stagedExecutablePath);
    if (!inspection.valid) {
      throw new Error("The relinker in the verified AnyPS5 release is not a valid Windows x64 executable.");
    }
    const relinkerSha256 = await sha256File(stagedExecutablePath);
    const relativeExecutablePath = path.relative(extractedPath, stagedExecutablePath);
    const installedPath = path.join(installRoot, `${asset.tag}-${asset.sha256.slice(0, 12)}`);
    const finalExecutablePath = path.join(installedPath, relativeExecutablePath);

    try {
      await fs.lstat(installedPath);
      const existingInspection = await inspectWindowsX64Pe(finalExecutablePath).catch(() => ({ valid: false }));
      if (!existingInspection.valid || (await sha256File(finalExecutablePath)) !== relinkerSha256) {
        throw new Error("An existing AnyPS5 install folder is present but does not match the verified release.");
      }
      await fs.rm(extractedPath, { recursive: true, force: true });
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      await fs.rename(extractedPath, installedPath);
    }

    const finalInspection = await inspectWindowsX64Pe(finalExecutablePath);
    if (!finalInspection.valid || (await sha256File(finalExecutablePath)) !== relinkerSha256) {
      throw new Error("The installed AnyPS5 executable failed its final integrity check.");
    }

    Object.assign(config, {
      ps5RelinkerPath: finalExecutablePath,
      ps5RelinkerSha256: relinkerSha256,
      ps5ToolSource: "official",
      ps5ReleaseTag: asset.tag,
      ps5ReleaseUrl: asset.pageUrl,
      ps5ArchiveSha256: asset.sha256,
      ps5AssetName: asset.name,
    });
    await writeToolConfig(config);
    sendInstallProgress(event, { phase: "complete", version: asset.tag });
    return getToolStatus(config);
  } finally {
    await fs.rm(stagingPath, { recursive: true, force: true });
  }
}

function createWindow() {
  const window = new BrowserWindow({
    width: 1240,
    height: 820,
    minWidth: 900,
    minHeight: 640,
    backgroundColor: "#080d17",
    title: "PlayStation Recomp Hub",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  if (app.isPackaged) {
    window.loadFile(path.join(__dirname, "../dist/public/index.html"));
  } else {
    window.loadURL(process.env.VITE_DEV_SERVER_URL || "http://127.0.0.1:5173");
  }

  window.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("https://github.com/")) {
      void shell.openExternal(url);
    }
    return { action: "deny" };
  });

  window.on("closed", () => {
    const processForWindow = runningProcesses.get(window.webContents.id);
    if (processForWindow) processForWindow.kill();
    runningProcesses.delete(window.webContents.id);
  });
}

ipcMain.handle("hub:choose-input", async (_event, generation, language = "en") => {
  const isArabic = language === "ar";
  const filtersByGeneration = {
    ps1: [{ name: isArabic ? "ملفات قرص PS1" : "PS1 CUE files", extensions: ["cue"] }],
    ps2: [{
      name: isArabic ? "ملفات مشروع PS2Recomp" : "PS2Recomp project files",
      extensions: ["elf", "toml", "csv", "iso"],
    }],
    ps3: [{
      name: isArabic ? "ملف ELF مفكوك التشفير للعبة PS3" : "Decrypted PS3 game ELF",
      extensions: ["elf"],
    }],
    ps5: [{ name: isArabic ? "ملف PS5 ELF" : "PS5 ELF executable", extensions: ["elf"] }],
  };
  const filters = filtersByGeneration[generation];
  if (!filters) throw new Error("This generation is not available.");

  const result = await dialog.showOpenDialog({
    properties: generation === "ps5" || generation === "ps3" ? ["openFile"] : ["openFile", "multiSelections"],
    filters,
    title: isArabic ? "اختر ملفات المشروع" : "Select project files",
  });
  return result.canceled ? null : result.filePaths;
});

ipcMain.handle("hub:validate-ps1-disc-set", async (_event, paths) => {
  if (!Array.isArray(paths) || paths.length < 1 || paths.length > 32) {
    throw new Error("Choose between 1 and 32 PS1 CUE files.");
  }

  for (const selectedPath of paths) {
    if (typeof selectedPath !== "string" || path.extname(selectedPath).toLowerCase() !== ".cue") {
      throw new Error("The PS1 disc set must contain CUE files.");
    }
    const cuePath = path.resolve(selectedPath);
    const cueStat = await fs.stat(cuePath);
    if (!cueStat.isFile() || cueStat.size > 1024 * 1024) {
      throw new Error("A CUE file is invalid or too large to inspect.");
    }

    const cueText = await fs.readFile(cuePath, "utf8");
    const referencedFiles = [...cueText.matchAll(/^\s*FILE\s+(?:"([^"]+)"|(\S+))/gim)]
      .map((match) => match[1] || match[2])
      .filter(Boolean);
    if (referencedFiles.length === 0) {
      throw new Error(`No FILE tracks were found in ${path.basename(cuePath)}.`);
    }

    const cueDirectory = path.dirname(cuePath);
    for (const reference of referencedFiles) {
      const referencedPath = path.resolve(cueDirectory, reference);
      const relative = path.relative(cueDirectory, referencedPath);
      if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
        throw new Error(`A track reference in ${path.basename(cuePath)} points outside its disc folder.`);
      }
      const referencedStat = await fs.stat(referencedPath).catch(() => null);
      if (!referencedStat?.isFile()) {
        throw new Error(`A track referenced by ${path.basename(cuePath)} was not found.`);
      }
    }
  }

  return { ok: true, discCount: paths.length };
});

ipcMain.handle("hub:choose-folder", async (_event, purpose, language = "en") => {
  if (!["output", "modules"].includes(purpose)) {
    throw new Error("Unsupported folder selection.");
  }

  const result = await dialog.showOpenDialog({
    properties: ["openDirectory", "createDirectory"],
    title: language === "ar"
      ? purpose === "output" ? "اختر مجلد الإخراج" : "اختر المجلد الأب للوحدات"
      : purpose === "output" ? "Choose output folder" : "Choose module parent folder",
  });
  return result.canceled ? null : result.filePaths[0];
});

ipcMain.handle("hub:configure-ps5-tool", async (_event, language = "en") => {
  const result = await dialog.showOpenDialog({
    properties: ["openFile"],
    filters: [{ name: "Windows executable", extensions: ["exe"] }],
    title: language === "ar" ? "اختر أداة AnyPS5 لإعادة الربط" : "Select the AnyPS5 relinker executable",
  });
  if (result.canceled) return null;

  const executablePath = result.filePaths[0];
  const inspection = await inspectWindowsX64Pe(executablePath);
  if (!inspection.valid) {
    throw new Error("Choose a valid Windows x64 executable.");
  }
  const config = await readToolConfig();
  config.ps5RelinkerPath = executablePath;
  config.ps5RelinkerSha256 = await sha256File(executablePath);
  config.ps5ToolSource = "custom";
  delete config.ps5ReleaseTag;
  delete config.ps5ReleaseUrl;
  delete config.ps5ArchiveSha256;
  delete config.ps5AssetName;
  await writeToolConfig(config);
  return executablePath;
});

ipcMain.handle("hub:install-official-ps5-tool", async (event) => {
  if (installingPs5Tools.has(event.sender.id)) {
    throw new Error("An AnyPS5 installation is already running.");
  }
  installingPs5Tools.add(event.sender.id);
  try {
    return await installOfficialPs5Tool(event);
  } finally {
    installingPs5Tools.delete(event.sender.id);
  }
});

ipcMain.handle("hub:get-tool-status", async () => {
  const config = await readToolConfig();
  return getToolStatus(config);
});

ipcMain.handle("hub:run-ps5-relinker", async (event, input) => {
  if (process.platform !== "win32") {
    throw new Error("The Windows relinker can only run from the packaged Windows app.");
  }

  const config = await readToolConfig();
  const executablePath = config.ps5RelinkerPath;
  if (!executablePath) throw new Error("Configure the AnyPS5 relinker first.");
  if (runningProcesses.has(event.sender.id)) {
    throw new Error("A conversion is already running.");
  }

  const rawSourcePath = input?.sourcePath;
  const rawOutputDirectory = input?.outputDirectory;
  const rawModuleParentPath = input?.moduleParentPath;
  if (![rawSourcePath, rawOutputDirectory, rawModuleParentPath].every((value) => typeof value === "string" && value.trim())) {
    throw new Error("Choose the ELF, module parent, and output folder using the file dialogs.");
  }

  const sourcePath = path.resolve(rawSourcePath);
  const outputDirectory = path.resolve(rawOutputDirectory);
  const moduleParentPath = path.resolve(rawModuleParentPath);
  if (path.extname(sourcePath).toLowerCase() !== ".elf") {
    throw new Error("AnyPS5 requires a prepared .elf file, not a retail PKG.");
  }
  if (!path.isAbsolute(sourcePath) || !path.isAbsolute(outputDirectory) || !path.isAbsolute(moduleParentPath)) {
    throw new Error("Choose the ELF, module parent, and output folder using the file dialogs.");
  }

  const [sourceStat, moduleStat, outputStat] = await Promise.all([
    fs.stat(sourcePath),
    fs.stat(moduleParentPath),
    fs.stat(outputDirectory),
  ]);
  if (!sourceStat.isFile()) throw new Error("The selected ELF path is not a file.");
  if (!moduleStat.isDirectory()) throw new Error("The module parent path is not a folder.");
  if (!outputStat.isDirectory()) throw new Error("The output path is not a folder.");
  const moduleEntries = await fs.readdir(moduleParentPath, { withFileTypes: true });
  const moduleDirectoryNames = new Set(
    moduleEntries.filter((entry) => entry.isDirectory()).map((entry) => entry.name.toLowerCase()),
  );
  if (!["sce_module", "sce_modules", "prx"].some((name) => moduleDirectoryNames.has(name))) {
    throw new Error("The selected module parent must contain a sce_module, sce_modules, or prx folder.");
  }
  const toolInspection = await inspectWindowsX64Pe(executablePath);
  if (!toolInspection.valid) {
    throw new Error("The configured AnyPS5 relinker is not a valid Windows x64 executable.");
  }
  const currentToolSha256 = await sha256File(executablePath);
  if (config.ps5RelinkerSha256 && currentToolSha256 !== config.ps5RelinkerSha256) {
    throw new Error("The configured AnyPS5 relinker changed after verification. Reinstall or select it again.");
  }

  const outputPath = path.join(
    outputDirectory,
    `${path.basename(sourcePath, path.extname(sourcePath))}.exe`,
  );
  try {
    await fs.access(outputPath);
    throw new Error("That output file already exists. Choose a different output folder to avoid overwriting it.");
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  const args = [
    "--windows",
    "--sce-module-path",
    moduleParentPath,
    sourcePath,
    outputPath,
  ];

  return new Promise((resolve, reject) => {
    const child = spawn(executablePath, args, {
      cwd: path.dirname(sourcePath),
      windowsHide: true,
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
    });
    runningProcesses.set(event.sender.id, child);

    const sendOutput = (stream, chunk) => {
      event.sender.send("hub:tool-output", {
        stream,
        text: chunk.toString("utf8"),
      });
    };
    child.stdout.on("data", (chunk) => sendOutput("stdout", chunk));
    child.stderr.on("data", (chunk) => sendOutput("stderr", chunk));
    child.once("error", (error) => {
      runningProcesses.delete(event.sender.id);
      reject(new Error(`Could not start the relinker: ${error.message}`));
    });
    child.once("close", async (code, signal) => {
      runningProcesses.delete(event.sender.id);
      if (signal) {
        resolve({ ok: false, cancelled: true, outputPath });
      } else if (code === 0) {
        try {
          const output = await inspectWindowsX64Pe(outputPath);
          if (!output.valid) {
            await fs.rm(outputPath, { force: true });
            resolve({
              ok: false,
              outputPath,
              exitCode: 0,
              message: "The relinker exited successfully but did not produce a valid Windows x64 executable.",
            });
            return;
          }
          resolve({
            ok: true,
            outputPath,
            outputSize: output.size,
            outputSha256: await sha256File(outputPath),
          });
        } catch (error) {
          resolve({
            ok: false,
            outputPath,
            exitCode: 0,
            message: `The relinker exited successfully but the output file could not be verified: ${error.message}`,
          });
        }
      } else {
        resolve({
          ok: false,
          outputPath,
          exitCode: code,
          message: `The relinker exited with code ${code ?? "unknown"}.`,
        });
      }
    });
  });
});

ipcMain.handle("hub:cancel-run", (event) => {
  const child = runningProcesses.get(event.sender.id);
  if (!child) return false;
  child.kill();
  return true;
});

app.whenReady().then(() => {
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
