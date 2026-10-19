const { createReadStream, promises: fs } = require("node:fs");
const { createHash } = require("node:crypto");
const path = require("node:path");

const maxWindowsAssetSize = 250 * 1024 * 1024;
const officialReleaseApi = "https://api.github.com/repos/boykopovar/AnyPS5/releases/latest";

function selectWindowsReleaseAsset(release) {
  const tag = release?.tag_name;
  if (
    typeof tag !== "string" ||
    !/^v\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(tag) ||
    release.draft === true ||
    release.prerelease === true
  ) {
    throw new Error("GitHub did not return a published stable AnyPS5 release.");
  }

  const name = `prx-windows-${tag}.zip`;
  const asset = Array.isArray(release.assets)
    ? release.assets.find((candidate) => candidate?.name === name)
    : undefined;
  if (
    !asset ||
    !Number.isSafeInteger(asset.size) ||
    asset.size <= 0 ||
    asset.size > maxWindowsAssetSize ||
    typeof asset.digest !== "string" ||
    !/^sha256:[a-f0-9]{64}$/i.test(asset.digest)
  ) {
    throw new Error("The official Windows release is missing a valid SHA-256 asset digest.");
  }

  const expectedUrl = `https://github.com/boykopovar/AnyPS5/releases/download/${tag}/${name}`;
  if (asset.browser_download_url !== expectedUrl) {
    throw new Error("The Windows release asset URL did not match the official AnyPS5 release.");
  }

  return {
    tag,
    pageUrl: `https://github.com/boykopovar/AnyPS5/releases/tag/${tag}`,
    name,
    size: asset.size,
    sha256: asset.digest.slice("sha256:".length).toLowerCase(),
    downloadUrl: expectedUrl,
  };
}

function isWindowsX64PeHeaders(dosHeader, peHeader) {
  if (
    !Buffer.isBuffer(dosHeader) ||
    dosHeader.length < 64 ||
    !Buffer.isBuffer(peHeader) ||
    peHeader.length < 26 ||
    dosHeader.toString("ascii", 0, 2) !== "MZ" ||
    peHeader.toString("binary", 0, 4) !== "PE\u0000\u0000"
  ) {
    return false;
  }

  const peOffset = dosHeader.readUInt32LE(0x3c);
  const machine = peHeader.readUInt16LE(4);
  const optionalHeaderSize = peHeader.readUInt16LE(20);
  const optionalHeaderMagic = peHeader.readUInt16LE(24);
  return peOffset >= 64 && machine === 0x8664 && optionalHeaderSize >= 0x70 && optionalHeaderMagic === 0x20b;
}

async function inspectWindowsX64Pe(filePath) {
  const stat = await fs.lstat(filePath);
  if (!stat.isFile() || stat.size < 64) {
    return { valid: false, size: stat.size };
  }

  const handle = await fs.open(filePath, "r");
  try {
    const dosHeader = Buffer.alloc(64);
    const dosRead = await handle.read(dosHeader, 0, dosHeader.length, 0);
    if (dosRead.bytesRead !== dosHeader.length || dosHeader.toString("ascii", 0, 2) !== "MZ") {
      return { valid: false, size: stat.size };
    }

    const peOffset = dosHeader.readUInt32LE(0x3c);
    if (peOffset < 64 || peOffset > stat.size - 26) {
      return { valid: false, size: stat.size };
    }

    const peHeader = Buffer.alloc(26);
    const peRead = await handle.read(peHeader, 0, peHeader.length, peOffset);
    const optionalHeaderSize = peHeader.readUInt16LE(20);
    const sectionCount = peHeader.readUInt16LE(6);
    return {
      valid:
        peRead.bytesRead === peHeader.length &&
        sectionCount > 0 &&
        sectionCount <= 96 &&
        peOffset + 24 + optionalHeaderSize <= stat.size &&
        peOffset + 24 + optionalHeaderSize + sectionCount * 40 <= stat.size &&
        isWindowsX64PeHeaders(dosHeader, peHeader),
      size: stat.size,
    };
  } finally {
    await handle.close();
  }
}

async function sha256File(filePath) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(filePath)) hash.update(chunk);
  return hash.digest("hex");
}

function isPathInside(parentPath, candidatePath) {
  const relative = path.relative(parentPath, candidatePath);
  return relative !== "" && relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

module.exports = {
  officialReleaseApi,
  maxWindowsAssetSize,
  selectWindowsReleaseAsset,
  isWindowsX64PeHeaders,
  inspectWindowsX64Pe,
  sha256File,
  isPathInside,
};
