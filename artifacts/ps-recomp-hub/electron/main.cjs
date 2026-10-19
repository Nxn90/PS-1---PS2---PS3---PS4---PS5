const { app, BrowserWindow, dialog, ipcMain, shell } = require("electron");
const { spawn } = require("node:child_process");
const { createHash } = require("node:crypto");
const nodeFs = require("node:fs");
const fs = require("node:fs/promises");
const path = require("node:path");

const configPath = () => path.join(app.getPath("userData"), "tools.json");
const runningProcesses = new Map();
let installingPs5Tools = false;

function sendToolProgress(event, progress) {
  if (!event.sender.isDestroyed()) {
    event.sender.send("hub:tool-progress", progress);
  }
}

function runUtility(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      ...options,
      windowsHide: true,
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      if (stdout.length < 2_000_000) stdout += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk) => {
      if (stderr.length < 2_000_000) stderr += chunk.toString("utf8");
    });
    child.once("error", reject);
    child.once("close", (code, signal) => {
      if (code === 0 && !signal) {
        resolve({ stdout, stderr });
      } else {
        reject(new Error(stderr.trim() || `${command} exited with code ${code ?? signal ?? "unknown"}.`));
      }
    });
  });
}

async function downloadVerifiedAsset(asset, targetPath, event, range) {
  const assetUrl = new URL(asset.browser_download_url);
  if (assetUrl.protocol !== "https:" || assetUrl.hostname !== "github.com") {
    throw new Error("GitHub returned an unexpected download URL.");
  }
  if (!asset.digest?.startsWith("sha256:")) {
    throw new Error(`GitHub did not provide a SHA-256 digest for ${asset.name}.`);
  }

  sendToolProgress(event, { phase: "download", asset: asset.name, percent: range.start });
  const response = await fetch(asset.browser_download_url, {
    headers: { "User-Agent": "PlayStation-Recomp-Hub", Accept: "application/octet-stream" },
    signal: AbortSignal.timeout(15 * 60 * 1000),
  });
  if (!response.ok || !response.body) {
    throw new Error(`Could not download ${asset.name} (HTTP ${response.status}).`);
  }
  const finalHost = new URL(response.url).hostname;
  if (!["github.com", "release-assets.githubusercontent.com"].includes(finalHost)) {
    throw new Error("GitHub redirected the download to an unexpected host.");
  }

  await fs.mkdir(path.dirname(targetPath), { recursive: true });
  const handle = await fs.open(targetPath, "w");
  let received = 0;
  let lastProgressAt = 0;
  try {
    for await (const chunk of response.body) {
      await handle.writeFile(chunk);
      received += chunk.length;
      const now = Date.now();
      if (now - lastProgressAt > 250 || received >= asset.size) {
        const fraction = asset.size > 0 ? Math.min(1, received / asset.size) : 0;
        sendToolProgress(event, {
          phase: "download",
          asset: asset.name,
          percent: Math.round(range.start + fraction * (range.end - range.start)),
        });
        lastProgressAt = now;
      }
    }
  } catch (error) {
    await handle.close();
    await fs.rm(targetPath, { force: true });
    throw error;
  }
  await handle.close();

  if (asset.size > 0 && received !== asset.size) {
    await fs.rm(targetPath, { force: true });
    throw new Error(`${asset.name} downloaded incompletely (${received} of ${asset.size} bytes).`);
  }

  const hash = createHash("sha256");
  await new Promise((resolve, reject) => {
    const stream = nodeFs.createReadStream(targetPath);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.once("error", reject);
    stream.once("end", resolve);
  });
  if (hash.digest("hex") !== asset.digest.slice("sha256:".length).toLowerCase()) {
    await fs.rm(targetPath, { force: true });
    throw new Error(`SHA-256 verification failed for ${asset.name}.`);
  }
}

async function findPs5Libraries(root) {
  const pending = [{ directory: root, depth: 0 }];
  while (pending.length > 0) {
    const { directory, depth } = pending.pop();
    if (depth > 6) continue;
    const entries = await fs.readdir(directory, { withFileTypes: true });
    const hasPrx = entries.some((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".prx"));
    if (path.basename(directory).toLowerCase() === "libs" && hasPrx) return directory;
    for (const entry of entries) {
      if (entry.isDirectory()) pending.push({ directory: path.join(directory, entry.name), depth: depth + 1 });
    }
  }
  throw new Error("The AnyPS5 release archive did not contain a libs folder with PRX system libraries.");
}

async function findPs5RuntimeDlls(root) {
  const required = ["libgcc_s_seh-1.dll", "libstdc++-6.dll", "libwinpthread-1.dll"];
  const found = new Map();
  const pending = [{ directory: root, depth: 0 }];
  while (pending.length > 0) {
    const { directory, depth } = pending.pop();
    if (depth > 6) continue;
    const entries = await fs.readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        pending.push({ directory: path.join(directory, entry.name), depth: depth + 1 });
      } else if (entry.isFile() && required.includes(entry.name.toLowerCase())) {
        found.set(entry.name.toLowerCase(), path.join(directory, entry.name));
      }
    }
  }
  const missing = required.filter((name) => !found.has(name));
  if (missing.length > 0) {
    throw new Error(`The AnyPS5 Windows library bundle is missing: ${missing.join(", ")}.`);
  }
  return found;
}

async function getInstalledPs5ToolStatus(config) {
  let ps5RelinkerReady = false;
  let ps5LibrariesReady = false;
  let ps5RuntimeReady = false;
  let ps5RelinkerPath = null;
  let ps5LibrariesPath = null;
  let ps5RuntimeDllPath = null;
  let ps5ToolVersion = config.ps5ToolVersion ?? null;

  if (config.ps5RelinkerPath) {
    try {
      const stat = await fs.stat(config.ps5RelinkerPath);
      ps5RelinkerReady = stat.isFile();
      if (ps5RelinkerReady) ps5RelinkerPath = config.ps5RelinkerPath;
    } catch {
      ps5RelinkerReady = false;
    }
  }
  if (config.ps5LibrariesPath) {
    try {
      const entries = await fs.readdir(config.ps5LibrariesPath);
      ps5LibrariesReady = entries.some((entry) => entry.toLowerCase().endsWith(".prx"));
      if (ps5LibrariesReady) ps5LibrariesPath = config.ps5LibrariesPath;
    } catch {
      ps5LibrariesReady = false;
    }
  }

  if (config.ps5RuntimeDllPath) {
    try {
      await Promise.all(["libgcc_s_seh-1.dll", "libstdc++-6.dll", "libwinpthread-1.dll"].map(
        (name) => fs.access(path.join(config.ps5RuntimeDllPath, name)),
      ));
      ps5RuntimeReady = true;
      ps5RuntimeDllPath = config.ps5RuntimeDllPath;
    } catch {
      ps5RuntimeReady = false;
    }
  }

  return {
    ps5RelinkerReady,
    ps5RelinkerPath,
    ps5LibrariesReady,
    ps5LibrariesPath,
    ps5RuntimeReady,
    ps5RuntimeDllPath,
    ps5ToolVersion,
  };
}

async function inspectPeExecutable(executablePath) {
  const stat = await fs.stat(executablePath).catch(() => null);
  if (!stat?.isFile() || stat.size < 512) return false;
  const handle = await fs.open(executablePath, "r");
  try {
    const dosHeader = Buffer.alloc(64);
    const { bytesRead } = await handle.read(dosHeader, 0, dosHeader.length, 0);
    if (bytesRead < dosHeader.length || dosHeader.toString("ascii", 0, 2) !== "MZ") return false;
    const peOffset = dosHeader.readUInt32LE(0x3c);
    if (peOffset < 64 || peOffset > stat.size - 4) return false;
    const signature = Buffer.alloc(4);
    const result = await handle.read(signature, 0, signature.length, peOffset);
    return result.bytesRead === 4 && signature.toString("ascii") === "PE\u0000\u0000";
  } finally {
    await handle.close();
  }
}

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
  const config = await readToolConfig();
  config.ps5RelinkerPath = executablePath;
  await writeToolConfig(config);
  return executablePath;
});

ipcMain.handle("hub:install-ps5-tools", async (event) => {
  if (process.platform !== "win32") {
    throw new Error("The AnyPS5 Windows tool bundle can only be installed from the packaged Windows app.");
  }
  if (installingPs5Tools) throw new Error("An AnyPS5 installation is already in progress.");
  installingPs5Tools = true;

  const toolsDirectory = path.join(app.getPath("userData"), "tools", "anyps5");
  let temporaryDirectory = null;
  try {
    sendToolProgress(event, { phase: "release", percent: 1 });
    const releaseResponse = await fetch("https://api.github.com/repos/boykopovar/AnyPS5/releases/latest", {
      headers: {
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "PlayStation-Recomp-Hub",
      },
      signal: AbortSignal.timeout(30_000),
    });
    if (!releaseResponse.ok) {
      throw new Error(`Could not check the official AnyPS5 release (HTTP ${releaseResponse.status}).`);
    }
    const release = await releaseResponse.json();
    const version = release.tag_name;
    if (typeof version !== "string" || !/^v[\w.-]+$/.test(version)) {
      throw new Error("GitHub returned an invalid AnyPS5 release version.");
    }
    const relinkerAsset = release.assets?.find((asset) => asset.name === `relinker-${version}.exe`);
    const librariesAsset = release.assets?.find((asset) => asset.name === `prx-windows-${version}.zip`);
    if (!relinkerAsset || !librariesAsset) {
      throw new Error(`The AnyPS5 release ${version} does not include the Windows relinker and matching libraries.`);
    }

    const finalDirectory = path.join(toolsDirectory, version);
    const cachedStatus = await getInstalledPs5ToolStatus({
      ps5RelinkerPath: path.join(finalDirectory, "relinker.exe"),
      ps5LibrariesPath: path.join(finalDirectory, "libs"),
      ps5RuntimeDllPath: finalDirectory,
      ps5ToolVersion: version,
    });
    if (cachedStatus.ps5RelinkerReady && cachedStatus.ps5LibrariesReady && cachedStatus.ps5RuntimeReady) {
      const config = await readToolConfig();
      config.ps5RelinkerPath = cachedStatus.ps5RelinkerPath;
      config.ps5LibrariesPath = cachedStatus.ps5LibrariesPath;
      config.ps5RuntimeDllPath = finalDirectory;
      config.ps5ToolVersion = version;
      await writeToolConfig(config);
      sendToolProgress(event, { phase: "complete", percent: 100 });
      return await getInstalledPs5ToolStatus(config);
    }

    await fs.mkdir(toolsDirectory, { recursive: true });
    temporaryDirectory = path.join(toolsDirectory, `.install-${version}-${process.pid}-${Date.now()}`);
    await fs.mkdir(temporaryDirectory, { recursive: false });
    const downloadedRelinker = path.join(temporaryDirectory, "relinker-download.exe");
    const downloadedLibraries = path.join(temporaryDirectory, "prx-windows.zip");
    await downloadVerifiedAsset(relinkerAsset, downloadedRelinker, event, { start: 5, end: 20 });
    await downloadVerifiedAsset(librariesAsset, downloadedLibraries, event, { start: 20, end: 85 });

    sendToolProgress(event, { phase: "extract", asset: librariesAsset.name, percent: 87 });
    const archiveEntries = (await runUtility("tar", ["-tf", downloadedLibraries])).stdout
      .split(/\r?\n/)
      .filter(Boolean);
    for (const entry of archiveEntries) {
      const normalized = entry.replace(/\\/g, "/");
      if (
        normalized.startsWith("/") ||
        /^[A-Za-z]:/.test(normalized) ||
        normalized.split("/").some((segment) => segment === "..")
      ) {
        throw new Error("The AnyPS5 archive contains an unsafe file path.");
      }
    }

    const extractedDirectory = path.join(temporaryDirectory, "extracted");
    await fs.mkdir(extractedDirectory);
    await runUtility("tar", ["-xf", downloadedLibraries, "-C", extractedDirectory]);
    const libraryDirectory = await findPs5Libraries(extractedDirectory);
    const runtimeDlls = await findPs5RuntimeDlls(extractedDirectory);
    const stagedPackage = path.join(temporaryDirectory, "package");
    await fs.mkdir(stagedPackage);
    await fs.copyFile(downloadedRelinker, path.join(stagedPackage, "relinker.exe"));
    await fs.cp(libraryDirectory, path.join(stagedPackage, "libs"), { recursive: true, errorOnExist: true });
    for (const [name, source] of runtimeDlls) {
      await fs.copyFile(source, path.join(stagedPackage, name));
    }
    await fs.writeFile(
      path.join(stagedPackage, "release.json"),
      JSON.stringify({
        repository: "boykopovar/AnyPS5",
        version,
        relinkerSha256: relinkerAsset.digest,
        librariesSha256: librariesAsset.digest,
        installedAt: new Date().toISOString(),
      }, null, 2),
      "utf8",
    );

    try {
      await fs.access(finalDirectory);
      throw new Error(`AnyPS5 ${version} already has an incomplete installation. Remove it before retrying.`);
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    await fs.rename(stagedPackage, finalDirectory);

    const config = await readToolConfig();
    config.ps5RelinkerPath = path.join(finalDirectory, "relinker.exe");
    config.ps5LibrariesPath = path.join(finalDirectory, "libs");
    config.ps5RuntimeDllPath = finalDirectory;
    config.ps5ToolVersion = version;
    await writeToolConfig(config);
    sendToolProgress(event, { phase: "complete", percent: 100 });
    return await getInstalledPs5ToolStatus(config);
  } catch (error) {
    sendToolProgress(event, { phase: "error", percent: 0 });
    throw error;
  } finally {
    installingPs5Tools = false;
    if (temporaryDirectory) await fs.rm(temporaryDirectory, { recursive: true, force: true }).catch(() => {});
  }
});

ipcMain.handle("hub:get-tool-status", async () => {
  const config = await readToolConfig();
  return {
    platform: process.platform,
    packaged: app.isPackaged,
    ...await getInstalledPs5ToolStatus(config),
  };
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
  if (moduleDirectoryNames.has("sce_module") && moduleDirectoryNames.has("sce_modules")) {
    throw new Error("The module parent cannot contain both sce_module and sce_modules.");
  }
  const moduleFolderNames = ["sce_module", "sce_modules", "prx"]
    .filter((name) => moduleDirectoryNames.has(name));
  if (moduleFolderNames.length === 0) {
    throw new Error("The selected module parent must contain a sce_module, sce_modules, or prx folder.");
  }
  for (const name of moduleFolderNames) {
    const moduleFiles = await fs.readdir(path.join(moduleParentPath, name), { withFileTypes: true });
    if (!moduleFiles.some((entry) => entry.isFile())) {
      throw new Error(`The ${name} folder is empty; AnyPS5 needs the game's prepared module files.`);
    }
  }
  const toolStatus = await getInstalledPs5ToolStatus(config);
  if (!toolStatus.ps5LibrariesReady || !toolStatus.ps5LibrariesPath || !toolStatus.ps5RuntimeReady) {
    throw new Error("Install the matching AnyPS5 Windows system libraries before converting.");
  }
  await fs.access(executablePath);
  const runtimeDirectory = config.ps5RuntimeDllPath || path.dirname(executablePath);

  const outputPath = path.join(
    outputDirectory,
    `${path.basename(sourcePath, path.extname(sourcePath))}.exe`,
  );
  const outputApp0Path = path.join(outputDirectory, "app0");
  const outputLibrariesPath = path.join(outputDirectory, "libs");
  const runtimeDllNames = ["libgcc_s_seh-1.dll", "libstdc++-6.dll", "libwinpthread-1.dll"];
  for (const targetPath of [outputPath, outputApp0Path, outputLibrariesPath, ...runtimeDllNames.map((name) => path.join(outputDirectory, name))]) {
    try {
      await fs.access(targetPath);
      throw new Error("The output folder already contains files used by a converted game. Choose an empty folder to avoid overwriting them.");
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }

  await fs.cp(toolStatus.ps5LibrariesPath, outputLibrariesPath, {
    recursive: true,
    errorOnExist: true,
  });
  for (const name of runtimeDllNames) {
    await fs.copyFile(path.join(runtimeDirectory, name), path.join(outputDirectory, name));
  }

  const sourceApp0Path = path.join(moduleParentPath, "app0");
  const sourceApp0Stat = await fs.stat(sourceApp0Path).catch(() => null);
  const resourcesIncluded = Boolean(sourceApp0Stat?.isDirectory());
  if (sourceApp0Stat && !sourceApp0Stat.isDirectory()) {
    throw new Error("The app0 resource path exists but is not a folder.");
  }
  if (resourcesIncluded) {
    const generatedModuleFolders = new Set(["sce_module", "sce_modules", "prx"]);
    await fs.cp(sourceApp0Path, outputApp0Path, {
      recursive: true,
      errorOnExist: true,
      filter: (source) => {
        const relativePath = path.relative(sourceApp0Path, source);
        const firstSegment = relativePath.split(path.sep)[0]?.toLowerCase();
        return relativePath === "" || !generatedModuleFolders.has(firstSegment);
      },
    });
  }

  const args = [
    "--windows",
    "--rpath",
    "$ORIGIN/libs",
    "--sce-module-path",
    moduleParentPath,
    sourcePath,
    outputPath,
  ];
  return new Promise((resolve, reject) => {
    const child = spawn(executablePath, args, {
      cwd: outputDirectory,
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
    child.once("close", (code, signal) => {
      runningProcesses.delete(event.sender.id);
      if (signal) {
        resolve({ ok: false, cancelled: true, outputPath });
      } else if (code === 0) {
        void inspectPeExecutable(outputPath).then((validPe) => {
          if (!validPe) {
            resolve({
              ok: false,
              outputPath,
              message: "The relinker exited successfully but did not produce a valid Windows PE executable.",
            });
            return;
          }
          resolve({ ok: true, outputPath, resourcesIncluded });
        }).catch((error) => reject(error));
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
