const { app, BrowserWindow, dialog, ipcMain, shell } = require("electron");
const { spawn } = require("node:child_process");
const fs = require("node:fs/promises");
const path = require("node:path");

const configPath = () => path.join(app.getPath("userData"), "tools.json");
const runningProcesses = new Map();

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

ipcMain.handle("hub:get-tool-status", async () => {
  const config = await readToolConfig();
  let ps5RelinkerReady = false;
  if (config.ps5RelinkerPath) {
    try {
      await fs.access(config.ps5RelinkerPath);
      ps5RelinkerReady = true;
    } catch {
      ps5RelinkerReady = false;
    }
  }

  return {
    platform: process.platform,
    packaged: app.isPackaged,
    ps5RelinkerPath: ps5RelinkerReady ? config.ps5RelinkerPath : null,
    ps5RelinkerReady,
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
  if (!["sce_module", "sce_modules", "prx"].some((name) => moduleDirectoryNames.has(name))) {
    throw new Error("The selected module parent must contain a sce_module, sce_modules, or prx folder.");
  }
  await fs.access(executablePath);

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
    child.once("close", (code, signal) => {
      runningProcesses.delete(event.sender.id);
      if (signal) {
        resolve({ ok: false, cancelled: true, outputPath });
      } else if (code === 0) {
        resolve({ ok: true, outputPath });
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
