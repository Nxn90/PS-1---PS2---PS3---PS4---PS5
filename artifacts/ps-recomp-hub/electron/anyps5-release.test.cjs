const assert = require("node:assert/strict");
const test = require("node:test");
const {
  isPathInside,
  isWindowsX64PeHeaders,
  selectWindowsReleaseAsset,
} = require("./anyps5-release.cjs");

function validRelease(overrides = {}) {
  const tag = "v0.1.2";
  return {
    tag_name: tag,
    draft: false,
    prerelease: false,
    assets: [
      {
        name: `prx-windows-${tag}.zip`,
        size: 1024,
        digest: `sha256:${"a".repeat(64)}`,
        browser_download_url: `https://github.com/boykopovar/AnyPS5/releases/download/${tag}/prx-windows-${tag}.zip`,
      },
    ],
    ...overrides,
  };
}

test("selects only the published official Windows ZIP and its SHA-256 digest", () => {
  const selected = selectWindowsReleaseAsset(validRelease());
  assert.equal(selected.tag, "v0.1.2");
  assert.equal(selected.name, "prx-windows-v0.1.2.zip");
  assert.equal(selected.sha256, "a".repeat(64));
  assert.equal(selected.downloadUrl, "https://github.com/boykopovar/AnyPS5/releases/download/v0.1.2/prx-windows-v0.1.2.zip");
});

test("rejects unverified, oversized, draft, prerelease, or non-official assets", () => {
  const cases = [
    validRelease({ prerelease: true }),
    validRelease({ draft: true }),
    validRelease({ tag_name: "../v0.1.2" }),
    validRelease({ assets: [{ ...validRelease().assets[0], digest: null }] }),
    validRelease({ assets: [{ ...validRelease().assets[0], size: 251 * 1024 * 1024 }] }),
    validRelease({ assets: [{ ...validRelease().assets[0], browser_download_url: "https://example.com/tool.zip" }] }),
  ];
  for (const release of cases) {
    assert.throws(() => selectWindowsReleaseAsset(release));
  }
});

test("validates the Windows x64 PE signature rather than just an .exe extension", () => {
  const dosHeader = Buffer.alloc(64);
  dosHeader.write("MZ", 0, "ascii");
  dosHeader.writeUInt32LE(64, 0x3c);

  const peHeader = Buffer.alloc(26);
  peHeader.write("PE\u0000\u0000", 0, "binary");
  peHeader.writeUInt16LE(0x8664, 4);
  peHeader.writeUInt16LE(0x70, 20);
  peHeader.writeUInt16LE(0x20b, 24);

  assert.equal(isWindowsX64PeHeaders(dosHeader, peHeader), true);
  peHeader.writeUInt16LE(0x14c, 4);
  assert.equal(isWindowsX64PeHeaders(dosHeader, peHeader), false);
});

test("keeps discovered release executables inside the extracted release folder", () => {
  assert.equal(isPathInside("/tools/release", "/tools/release/bin/relinker.exe"), true);
  assert.equal(isPathInside("/tools/release", "/tools/release/../outside.exe"), false);
  assert.equal(isPathInside("/tools/release", "/tools/release"), false);
});
