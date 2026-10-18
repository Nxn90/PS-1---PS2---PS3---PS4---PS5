import { useEffect, useRef, useState, type ChangeEvent, type DragEvent } from 'react';
import {
  AlertCircle,
  Check,
  CheckCircle2,
  CircleHelp,
  Disc3,
  ExternalLink,
  FileCode2,
  FilePlus2,
  FileText,
  FolderOpen,
  Gamepad2,
  Github,
  HardDrive,
  Info,
  Languages,
  LockKeyhole,
  Monitor,
  Play,
  RefreshCw,
  ShieldCheck,
  X,
} from 'lucide-react';
import {
  activeGenerationInfo,
  generationCatalog,
  type ActiveGeneration,
} from './lib/generationCatalog';
import {
  checkInterval,
  checkRepositories,
  markRepositorySeen,
  trackedRepositories,
  type RepositoryUpdate,
} from './lib/repositories';
import { translate, type Language, type TranslationKey } from './lib/i18n';

type Generation = ActiveGeneration;
type LocalFile = { id: string; name: string; size?: number; file?: File; path?: string };
type NativePaths = { sourcePath: string | null; moduleParentPath: string | null; outputDirectory: string | null };
type ToolStatus = { platform: string; packaged: boolean; ps5RelinkerPath: string | null; ps5RelinkerReady: boolean };

const emptyNativePaths: NativePaths = { sourcePath: null, moduleParentPath: null, outputDirectory: null };
const repoTitleKeys: Record<RepositoryUpdate['id'], TranslationKey> = {
  ps1: 'repoPs1',
  ps2: 'repoPs2',
  ps3: 'repoPs3',
  ps5: 'repoPs5',
};
const repoScopeKeys: Record<RepositoryUpdate['id'], TranslationKey> = {
  ps1: 'scopePs1',
  ps2: 'scopePs2',
  ps3: 'scopePs3',
  ps5: 'scopePs5',
};

function formatSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function basename(filePath: string) {
  return filePath.split(/[\\/]/).filter(Boolean).at(-1) ?? filePath;
}

function extension(name: string) {
  return name.split('.').at(-1)?.toLowerCase() ?? '';
}

function App() {
  const [language, setLanguage] = useState<Language>(() => {
    try {
      return localStorage.getItem('ps-recomp-hub:language') === 'en' ? 'en' : 'ar';
    } catch {
      return 'ar';
    }
  });
  const direction = language === 'ar' ? 'rtl' : 'ltr';
  const t = (key: TranslationKey) => translate(language, key);
  const [generation, setGeneration] = useState<Generation>('ps1');
  const [files, setFiles] = useState<LocalFile[]>([]);
  const [dragging, setDragging] = useState(false);
  const [message, setMessage] = useState('');
  const [checked, setChecked] = useState(false);
  const [nativeNotice, setNativeNotice] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [toolStatus, setToolStatus] = useState<ToolStatus | null>(null);
  const [nativePaths, setNativePaths] = useState<NativePaths>(emptyNativePaths);
  const [running, setRunning] = useState(false);
  const [toolLogs, setToolLogs] = useState<string[]>([]);
  const [repoUpdates, setRepoUpdates] = useState<Record<string, RepositoryUpdate>>({});
  const [lastChecked, setLastChecked] = useState<number | null>(null);
  const [refreshingRepos, setRefreshingRepos] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const desktop = typeof window !== 'undefined' && Boolean(window.recompHub?.isDesktop);

  useEffect(() => {
    try {
      localStorage.setItem('ps-recomp-hub:language', language);
    } catch {
      // Keep the selected language for this session if storage is unavailable.
    }
    document.documentElement.lang = language;
    document.documentElement.dir = direction;
    document.title = translate(language, 'appName');
  }, [language, direction]);

  useEffect(() => {
    if (!helpOpen) return;
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') setHelpOpen(false);
    }
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [helpOpen]);

  useEffect(() => {
    const bridge = window.recompHub;
    if (!bridge?.isDesktop) return;

    void bridge.getToolStatus().then(setToolStatus).catch(() => {
      setMessage(translate(language, 'configureError'));
    });
    return bridge.onToolOutput(({ stream, text }) => {
      const lines = text.split(/\r?\n/).filter(Boolean);
      if (lines.length === 0) return;
      setToolLogs((current) => [
        ...current,
        ...lines.map((line) => `${stream === 'stderr' ? '!' : '›'} ${line}`),
      ].slice(-160));
    });
  }, []);

  useEffect(() => {
    let mounted = true;
    async function refresh() {
      if (mounted) setRefreshingRepos(true);
      const snapshots = await checkRepositories();
      if (!mounted) return;
      setRepoUpdates(Object.fromEntries(snapshots.map((item) => [item.id, item])));
      setLastChecked(Date.now());
      setRefreshingRepos(false);
    }
    void refresh();
    const interval = window.setInterval(() => void refresh(), checkInterval);
    return () => {
      mounted = false;
      window.clearInterval(interval);
    };
  }, []);

  const cueFiles = files.filter(({ name }) => extension(name) === 'cue');
  const isoFiles = files.filter(({ name }) => extension(name) === 'iso');
  const hasCue = cueFiles.length > 0;
  const hasIso = isoFiles.length > 0;
  const hasElf = files.some(({ name }) => extension(name) === 'elf');
  const hasPs2Config = files.some(({ name }) => extension(name) === 'toml');
  const hasPs2FunctionMap = files.some(({ name }) => extension(name) === 'csv');
  const hasModule = desktop
    ? Boolean(nativePaths.moduleParentPath)
    : files.some(({ file, name }) => {
        const lower = name.toLowerCase();
        return lower.endsWith('.prx') || Boolean(file?.webkitRelativePath.match(/(?:^|\/)(?:sce_module|sce_modules|prx)\//i));
      });
  const hasPkg = files.some(({ name }) => extension(name) === 'pkg');
  const discFiles = generation === 'ps1' ? cueFiles : generation === 'ps2' ? isoFiles : [];
  const isReady = generation === 'ps1'
    ? hasCue
    : generation === 'ps2'
      ? hasElf && hasPs2Config
      : generation === 'ps3'
        ? hasElf
        : hasElf && hasModule && !hasPkg;
  const isBlocked = checked && !isReady;
  const title = activeGenerationInfo[generation];

  function addFiles(incoming: FileList | File[]) {
    const fresh = Array.from(incoming);
    if (fresh.length === 0) return;
    const pkg = generation === 'ps5' && fresh.some((file) => extension(file.name) === 'pkg');
    setFiles((current) => {
      const known = new Set(current.map((entry) => entry.path ?? `${entry.name}-${entry.size ?? 0}-${entry.file?.lastModified ?? 0}`));
      const next = fresh.filter((file) => {
        const key = `${file.name}-${file.size}-${file.lastModified}`;
        if (known.has(key)) return false;
        known.add(key);
        return true;
      });
      return [
        ...current,
        ...next.map((file) => ({
          id: `${file.name}-${file.size}-${file.lastModified}`,
          name: file.name,
          size: file.size,
          file,
        })),
      ];
    });
    setChecked(false);
    setNativeNotice(false);
    setNativePaths((current) => ({ ...current, sourcePath: null }));
    setMessage(pkg ? t('ps5PkgUnsupported') : '');
  }

  function handleFileInput(event: ChangeEvent<HTMLInputElement>) {
    if (event.target.files) addFiles(event.target.files);
    event.target.value = '';
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    addFiles(event.dataTransfer.files);
  }

  function selectGeneration(next: Generation) {
    setGeneration(next);
    setFiles([]);
    setChecked(false);
    setNativeNotice(false);
    setNativePaths(emptyNativePaths);
    setToolLogs([]);
    setMessage('');
  }

  function removeFile(id: string) {
    const removed = files.find((entry) => entry.id === id);
    setFiles((current) => current.filter((entry) => entry.id !== id));
    setChecked(false);
    setNativeNotice(false);
    if (removed?.path && removed.path === nativePaths.sourcePath) {
      setNativePaths((current) => ({ ...current, sourcePath: null }));
    }
    setMessage('');
  }

  async function selectInput() {
    const bridge = window.recompHub;
    if (!bridge?.isDesktop) {
      fileInputRef.current?.click();
      return;
    }

    try {
      const selectedPaths = await bridge.chooseInput(generation, language);
      if (!selectedPaths?.length) return;
      const selectedFiles = selectedPaths.map((path) => ({
        id: path,
        name: basename(path),
        path,
      }));
      setFiles(selectedFiles);
      setNativePaths((current) => ({
        ...current,
        sourcePath: generation === 'ps5' ? selectedPaths[0] : null,
      }));
      setChecked(false);
      setNativeNotice(false);
      setMessage('');
    } catch {
      setMessage(t('chooseInputError'));
    }
  }

  async function selectNativeFolder(purpose: 'output' | 'modules') {
    const bridge = window.recompHub;
    if (!bridge?.isDesktop) return;
    try {
      const selectedPath = await bridge.chooseFolder(purpose, language);
      if (!selectedPath) return;
      setNativePaths((current) => ({
        ...current,
        [purpose === 'output' ? 'outputDirectory' : 'moduleParentPath']: selectedPath,
      }));
      setChecked(false);
      setMessage('');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t('chooseInputError'));
    }
  }

  async function configurePs5Tool() {
    const bridge = window.recompHub;
    if (!bridge?.isDesktop) return;
    try {
      const selectedPath = await bridge.configurePs5Tool(language);
      if (selectedPath) setToolStatus(await bridge.getToolStatus());
    } catch {
      setMessage(t('configureError'));
    }
  }

  async function checkCueReferences() {
    if (desktop) {
      const bridge = window.recompHub;
      const paths = cueFiles.map(({ path }) => path).filter((path): path is string => Boolean(path));
      if (bridge && paths.length === cueFiles.length && paths.length > 0) {
        await bridge.validatePs1DiscSet(paths);
        return;
      }
    }
    for (const cue of cueFiles) {
      if (!cue.file) continue;
      const cueText = await cue.file.text();
      if (!/^\s*FILE\s+(?:"[^"]+"|\S+)/im.test(cueText)) {
        throw new Error('CUE_FILE_REFERENCE_MISSING');
      }
    }
  }

  async function inspectPrerequisites() {
    setChecked(true);
    setNativeNotice(false);
    setMessage('');
    if (!isReady) return;

    if (generation === 'ps1') {
      try {
        await checkCueReferences();
      } catch {
        setMessage(t('ps1CueInvalid'));
        return;
      }
      setMessage(desktop ? t('ps1ProjectNeeded') : t('browserNativeCopy'));
      if (!desktop) setNativeNotice(true);
      return;
    }

    if (generation === 'ps2') {
      setMessage(t('ps2NoConverter'));
      return;
    }

    if (generation === 'ps3') {
      setMessage(t('ps3NoRunner'));
      return;
    }

    if (!desktop) {
      setNativeNotice(true);
      return;
    }

    const sourcePath = nativePaths.sourcePath;
    if (!sourcePath) {
      setMessage(t('sourceNeeded'));
      return;
    }
    if (!nativePaths.moduleParentPath) {
      setMessage(t('modulesNeeded'));
      return;
    }
    if (!nativePaths.outputDirectory) {
      setMessage(t('outputNeeded'));
      return;
    }
    if (!toolStatus?.ps5RelinkerReady) {
      setMessage(t('toolNeeded'));
      return;
    }

    const bridge = window.recompHub;
    if (!bridge) return;
    setRunning(true);
    setToolLogs([]);
    try {
      const result = await bridge.runPs5Relinker({
        sourcePath,
        moduleParentPath: nativePaths.moduleParentPath,
        outputDirectory: nativePaths.outputDirectory,
      });
      if (result.ok) {
        setMessage(`${t('runSuccess')} ${result.outputPath}`);
      } else if (result.cancelled) {
        setMessage(t('runCancelled'));
      } else {
        setMessage(result.message ?? t('runFailed'));
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t('runFailed'));
    } finally {
      setRunning(false);
      setToolStatus(await bridge.getToolStatus().catch(() => toolStatus));
    }
  }

  async function refreshRepositories() {
    setRefreshingRepos(true);
    const snapshots = await checkRepositories();
    setRepoUpdates(Object.fromEntries(snapshots.map((item) => [item.id, item])));
    setLastChecked(Date.now());
    setRefreshingRepos(false);
  }

  function acknowledgeRepository(update: RepositoryUpdate) {
    if (!update.sha) return;
    try {
      markRepositorySeen(update.id, update.sha);
    } catch {
      // Opening the repository is still useful if browser storage is blocked.
    }
    setRepoUpdates((current) => ({
      ...current,
      [update.id]: { ...update, changed: false },
    }));
  }

  function formatDate(value?: string | number) {
    if (!value) return '';
    return new Intl.DateTimeFormat(language === 'ar' ? 'ar-SA' : 'en-US', {
      dateStyle: 'medium',
      timeStyle: 'short',
      calendar: 'gregory',
    }).format(new Date(value));
  }

  const acceptedFiles = generation === 'ps1'
    ? '.cue,.bin'
    : generation === 'ps2'
      ? '.elf,.toml,.csv,.iso'
      : generation === 'ps3'
        ? '.elf'
        : '.elf,.prx,.pkg';
  const dropHintKey: TranslationKey = generation === 'ps1'
    ? 'ps1DropHint'
    : generation === 'ps2'
      ? 'ps2DropHint'
      : generation === 'ps3'
        ? 'ps3DropHint'
        : 'ps5DropHint';
  const runLabel = running
    ? t('runningTool')
    : desktop && generation === 'ps5' && toolStatus?.ps5RelinkerReady
      ? t('runPs5')
      : generation === 'ps1'
        ? t('inspectPs1')
        : generation === 'ps2'
          ? t('inspectPs2')
          : generation === 'ps3'
            ? t('inspectPs3')
            : t('checkInputs');

  const repoTitle: Record<RepositoryUpdate['id'], TranslationKey> = repoTitleKeys;
  const repoScope: Record<RepositoryUpdate['id'], TranslationKey> = repoScopeKeys;

  return (
    <div dir={direction} lang={language} className="min-h-[100dvh]">
      <div className="shell">
        <header className="topbar">
          <div className="brand">
            <div className="brand-mark" aria-hidden="true"><Disc3 size={25} strokeWidth={1.7} /></div>
            <div>
              <div className="brand-title">{t('appName')}</div>
              <div className="brand-sub">{t('tagline')}</div>
            </div>
          </div>
          <div className="top-actions">
            <label className="language-control">
              <Languages size={15} aria-hidden="true" />
              <span className="sr-only">{t('language')}</span>
              <select
                className="language-select"
                value={language}
                aria-label={t('language')}
                data-testid="select-language"
                onChange={(event) => setLanguage(event.target.value as Language)}
              >
                <option value="ar">{t('arabic')}</option>
                <option value="en">{t('english')}</option>
              </select>
            </label>
            <div className="preview-chip" role="status" data-testid="status-preview">
              <span className={`preview-dot ${desktop ? 'live' : ''}`} />
              {desktop ? t('windowsApp') : t('browserPreview')}
            </div>
            <button className="icon-button" type="button" aria-label={t('about')} data-testid="button-about" onClick={() => setHelpOpen(true)}>
              <CircleHelp size={18} />
            </button>
          </div>
        </header>

        <main>
          <section className="page-intro" aria-labelledby="page-heading">
            <div>
              <div className="eyebrow">{t('eyebrow')}</div>
              <h1 className="intro-title" id="page-heading">{t('headline')}</h1>
              <p className="intro-copy">{t('intro')}</p>
            </div>
            <div className="adapter-count">
              <strong>{String(generationCatalog.filter((entry) => entry.enabled).length).padStart(2, '0')}</strong>
              <span>/ 05 · {t('readyCount')}</span>
            </div>
          </section>

          <section className="generation-grid" aria-label={t('generationLabel')}>
            {generationCatalog.map((entry) => {
              const icon = entry.id === 'ps1' || entry.id === 'ps2'
                ? <Disc3 size={34} strokeWidth={1.5} />
                : entry.id === 'ps5'
                  ? <FileCode2 size={32} strokeWidth={1.5} />
                  : <Monitor size={32} strokeWidth={1.5} />;
              const symbol = entry.id === 'ps1' ? 'PSX' : entry.id.toUpperCase();
              const common = (
                <>
                  <span className="gen-symbol"><span className="gen-symbol-icon">{icon}</span><span className="gen-console">{symbol}</span></span>
                  <span className="gen-text">
                    <span className="gen-name">{entry.title}</span>
                    <span className="gen-sub mono">{entry.adapter}</span>
                  </span>
                  <span className="gen-badge">{t(entry.badge)}</span>
                </>
              );
              if (!entry.enabled) {
                return (
                  <div className="generation-card disabled" aria-disabled="true" data-testid={`generation-${entry.id}`} key={entry.id} title={t(entry.scope)}>
                    {common}
                  </div>
                );
              }
              return (
                <button
                  type="button"
                  className={`generation-card ${generation === entry.id ? 'selected' : ''}`}
                  aria-pressed={generation === entry.id}
                  data-testid={`button-generation-${entry.id}`}
                  onClick={() => selectGeneration(entry.id)}
                  key={entry.id}
                  title={t(entry.scope)}
                >
                  {common}
                </button>
              );
            })}
          </section>

          <section className="workspace" aria-label={t('projectSetup')}>
            <div className="panel workspace-main">
              <div className="panel-head">
                <div>
                  <h2 className="section-title">{t('workspaceTitle')}</h2>
                  <p className="section-note">{t('workspaceNote')}</p>
                </div>
                <div className="mode-tag">{title.title} · <span className="mono">{title.adapter}</span></div>
              </div>

              <input
                ref={fileInputRef}
                className="file-input"
                type="file"
                multiple={generation !== 'ps3'}
                accept={acceptedFiles}
                aria-label={t('inputFileLabel')}
                data-testid="input-project-files"
                onChange={handleFileInput}
              />

              <div
                className={`dropzone ${dragging ? 'dragging' : ''}`}
                onDragEnter={(event) => { event.preventDefault(); setDragging(true); }}
                onDragOver={(event) => event.preventDefault()}
                onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setDragging(false); }}
                onDrop={handleDrop}
                data-testid="dropzone-project-files"
              >
                <div className="drop-content">
                  <div className="drop-icon"><FolderOpen size={22} /></div>
                  <p className="drop-title">{t('dropTitle')}</p>
                  <p className="drop-help">{t('dropOr')} <span className="mono">{acceptedFiles.replaceAll('.', '').toUpperCase()}</span> · {t(dropHintKey)}</p>
                  <button className="select-button" type="button" data-testid="button-select-files" onClick={() => void selectInput()}>
                    <FilePlus2 size={15} /> {t('browseFiles')}
                  </button>
                </div>
              </div>

              {files.length > 0 && (
                <div className="file-list" aria-label={t('selectedFiles')} data-testid="list-selected-files">
                  {files.map(({ id, name, size }) => (
                    <div className="file-row" key={id} data-testid={`file-row-${id}`}>
                      <div className="file-icon"><FileText size={17} /></div>
                      <div className="file-meta">
                        <div className="file-name" title={name}>{name}</div>
                        <div className="file-size">{size === undefined ? t('localPath') : formatSize(size)}</div>
                      </div>
                      <span className="file-status"><Check size={13} /> {t('local')}</span>
                      <button type="button" className="remove-file" aria-label={`${t('removeFile')} ${name}`} data-testid={`button-remove-${id}`} onClick={() => removeFile(id)}>
                        <X size={15} />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {(generation === 'ps1' || generation === 'ps2') && (
                <div className="disc-set" data-testid="disc-set-summary">
                  <div className="disc-set-icon"><Disc3 size={17} /></div>
                  <div className="disc-set-copy">
                    <strong>{t('discSet')}</strong>
                    <span>{discFiles.length === 0
                      ? t('noDiscSelected')
                      : `${discFiles.length > 1 ? t('multipleDiscs') : t('oneDisc')} · ${discFiles.length} ${t('discCount')}`}</span>
                  </div>
                  <span className={`disc-count ${discFiles.length > 1 ? 'multiple' : ''}`}>{String(discFiles.length).padStart(2, '0')}</span>
                  <p className="disc-set-note">{t('discSetNote')}</p>
                </div>
              )}

              {desktop && generation === 'ps5' && (
                <div className="desktop-controls" data-testid="desktop-ps5-controls">
                  <div className="desktop-control-row">
                    <div className="desktop-control-meta">
                      <strong>{t('anyps5Tool')}</strong>
                      <span title={toolStatus?.ps5RelinkerPath ?? ''}>
                        {toolStatus?.ps5RelinkerReady ? basename(toolStatus.ps5RelinkerPath!) : t('noRelinker')}
                      </span>
                    </div>
                    <button className="select-button secondary-select" type="button" data-testid="button-configure-ps5-tool" onClick={() => void configurePs5Tool()}>
                      <FilePlus2 size={14} /> {t('configureTool')}
                    </button>
                  </div>
                  <div className="desktop-control-row">
                    <div className="desktop-control-meta">
                      <strong>{t('modulesFolder')}</strong>
                      <span title={nativePaths.moduleParentPath ?? ''}>
                        {nativePaths.moduleParentPath ? basename(nativePaths.moduleParentPath) : t('chooseModules')}
                      </span>
                    </div>
                    <button className="select-button secondary-select" type="button" data-testid="button-select-modules" onClick={() => void selectNativeFolder('modules')}>
                      <FolderOpen size={14} /> {t('browse')}
                    </button>
                  </div>
                  <div className="desktop-control-row">
                    <div className="desktop-control-meta">
                      <strong>{t('outputFolder')}</strong>
                      <span title={nativePaths.outputDirectory ?? ''}>
                        {nativePaths.outputDirectory ? basename(nativePaths.outputDirectory) : t('chooseOutput')}
                      </span>
                    </div>
                    <button className="select-button secondary-select" type="button" data-testid="button-select-output" onClick={() => void selectNativeFolder('output')}>
                      <FolderOpen size={14} /> {t('browse')}
                    </button>
                  </div>
                  <p className="desktop-controls-note">{t('moduleFolderHint')}</p>
                </div>
              )}

              {generation === 'ps2' && (
                <div className="scope-callout ps2-callout" data-testid="notice-ps2-scope">
                  <Gamepad2 size={18} />
                  <div>
                    <strong>{t('ps2ScopeTitle')}</strong>
                    <p>{t('ps2Scope')}</p>
                    <a href="https://github.com/ran-j/PS2Recomp" target="_blank" rel="noreferrer" onClick={() => {
                      const update = repoUpdates.ps2;
                      if (update) acknowledgeRepository(update);
                    }}>
                      {t('openProject')} <ExternalLink size={13} />
                    </a>
                  </div>
                </div>
              )}

              {generation === 'ps3' && (
                <div className="scope-callout ps2-callout" data-testid="notice-ps3-scope">
                  <Monitor size={18} />
                  <div>
                    <strong>{t('ps3ScopeTitle')}</strong>
                    <p>{t('ps3Scope')}</p>
                    <a href="https://github.com/sp00nznet/ps3recomp" target="_blank" rel="noreferrer" onClick={() => {
                      const update = repoUpdates.ps3;
                      if (update) acknowledgeRepository(update);
                    }}>
                      {t('openPs3Project')} <ExternalLink size={13} />
                    </a>
                  </div>
                </div>
              )}

              <div className="toast-live" role="status" aria-live="polite" data-testid="status-file-message">{message}</div>
              <div className="rule-divider" />
              <h3 className="requirements-heading">{generation === 'ps1' ? t('ps1ReqTitle') : generation === 'ps2' ? t('ps2ReqTitle') : generation === 'ps3' ? t('ps3ReqTitle') : t('ps5ReqTitle')}</h3>
              <div className="requirements">
                {generation === 'ps1' ? (
                  <>
                    <div className="requirement"><Disc3 size={15} /><span><strong>PSXRecomp</strong> {t('ps1Req1')}</span></div>
                    <div className="requirement"><Info size={15} /><span>{t('ps1Req2')}</span></div>
                    <div className="requirement"><AlertCircle size={15} /><span>{t('ps1Req3')}</span></div>
                  </>
                ) : generation === 'ps2' ? (
                  <>
                    <div className="requirement"><Gamepad2 size={15} /><span><strong>PS2Recomp</strong> {t('ps2Req1')}</span></div>
                    <div className="requirement"><Info size={15} /><span>{t('ps2Req2')}</span></div>
                    <div className="requirement"><Disc3 size={15} /><span>{t('ps2Req3')}</span></div>
                  </>
                ) : generation === 'ps3' ? (
                  <>
                    <div className="requirement"><FileCode2 size={15} /><span><strong>PS3Recomp</strong> {t('ps3Req1')}</span></div>
                    <div className="requirement"><Info size={15} /><span>{t('ps3Req2')}</span></div>
                    <div className="requirement"><AlertCircle size={15} /><span>{t('ps3Req3')}</span></div>
                  </>
                ) : (
                  <>
                    <div className="requirement"><FileCode2 size={15} /><span><strong>AnyPS5</strong> {t('ps5Req1')}</span></div>
                    <div className="requirement"><AlertCircle size={15} /><span>{t('ps5Req2')}</span></div>
                  </>
                )}
              </div>
            </div>

            <aside className="panel workspace-side" aria-labelledby="check-heading">
              <div className="side-heading">
                <div className="side-heading-icon"><ShieldCheck size={18} /></div>
                <div>
                  <div className="side-title" id="check-heading">{t('checkHeading')}</div>
                  <div className="side-subtitle">{t('checkSubtitle')}</div>
                </div>
              </div>

              <div className={`status-box ${isBlocked ? 'blocked' : isReady ? 'ready' : ''}`} role="status" data-testid="status-prerequisites">
                <div className="status-line"><span className="status-indicator" />
                  {isBlocked ? t('incomplete') : isReady ? t('filesFound') : t('waitingFiles')}
                </div>
                <p className="status-copy">
                  {isBlocked
                    ? t('reviewMissing')
                    : isReady
                      ? t('checkOnly')
                      : t('selectInputsFirst')}
                </p>
                {checked && (
                  <div className="validation-list">
                    {generation === 'ps1' ? (
                      <div className={`validation-item ${hasCue ? 'good' : 'bad'}`}>
                        {hasCue ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}
                        <span>{hasCue ? `${t('ps1CueFound')} · ${cueFiles.length}` : t('ps1CueMissing')}</span>
                      </div>
                    ) : generation === 'ps2' ? (
                      <>
                        <div className={`validation-item ${hasElf ? 'good' : 'bad'}`}>
                          {hasElf ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}
                          <span>{hasElf ? t('ps2ElfFound') : t('ps2ElfMissing')}</span>
                        </div>
                        <div className={`validation-item ${hasPs2Config ? 'good' : 'bad'}`}>
                          {hasPs2Config ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}
                          <span>{hasPs2Config ? t('ps2ConfigFound') : t('ps2ConfigMissing')}</span>
                        </div>
                        <div className="validation-item">
                          {hasPs2FunctionMap ? <CheckCircle2 size={14} /> : <Info size={14} />}
                          <span>{hasPs2FunctionMap ? t('ps2MapSelected') : t('ps2MapRecommended')}</span>
                        </div>
                        {hasIso && (
                          <div className="validation-item">
                            <Disc3 size={14} />
                            <span>{t('ps2IsoGrouped')} · {isoFiles.length}</span>
                          </div>
                        )}
                      </>
                    ) : generation === 'ps3' ? (
                      <div className={`validation-item ${hasElf ? 'good' : 'bad'}`}>
                        {hasElf ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}
                        <span>{hasElf ? t('ps3ElfFound') : t('ps3ElfMissing')}</span>
                      </div>
                    ) : (
                      <>
                        <div className={`validation-item ${hasElf ? 'good' : 'bad'}`}>
                          {hasElf ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}
                          <span>{hasElf ? t('ps5ElfFound') : t('ps5ElfMissing')}</span>
                        </div>
                        <div className={`validation-item ${hasModule ? 'good' : 'bad'}`}>
                          {hasModule ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}
                          <span>{hasModule ? desktop ? t('ps5ModuleFound') : t('ps5ModuleFoundBrowser') : t('ps5ModuleMissing')}</span>
                        </div>
                        {hasPkg && <div className="validation-item bad"><AlertCircle size={14} /><span>{t('ps5PkgUnsupported')}</span></div>}
                      </>
                    )}
                  </div>
                )}
              </div>

              {nativeNotice && (
                <div className="status-box blocked native-warning" role="status" data-testid="status-native-unavailable">
                  <div className="status-line"><AlertCircle size={14} /> {t('browserNativeTitle')}</div>
                  <p className="status-copy">{t('browserNativeCopy')}</p>
                </div>
              )}

              {desktop && generation === 'ps5' && toolLogs.length > 0 && (
                <div className="tool-log" role="log" aria-label={t('toolLog')} data-testid="log-ps5-tool">
                  <div className="tool-log-heading">{t('toolLog')}</div>
                  {toolLogs.map((line, index) => <div className="tool-log-line mono" key={`${index}-${line}`}>{line}</div>)}
                </div>
              )}

              <button className={`run-button ${isReady ? 'valid' : ''}`} type="button" disabled={running} data-testid="button-check-files" onClick={() => void inspectPrerequisites()}>
                <Play size={14} /> {runLabel}
              </button>
              {running && <button className="cancel-button" type="button" data-testid="button-cancel-run" onClick={() => void window.recompHub?.cancelRun()}>{t('cancel')}</button>}
              <div className="native-note"><LockKeyhole size={13} /><span>{desktop ? t('localPrivacyDesktop') : t('localPrivacyBrowser')}</span></div>
            </aside>
          </section>

          <div className="notice-strip" role="note" data-testid="notice-local-processing">
            <ShieldCheck size={16} />
            <span><strong>{t('privacyTitle')}</strong> {desktop ? t('privacyDesktop') : t('privacyBrowser')}</span>
          </div>

          <section className="repository-section" aria-labelledby="repositories-heading" data-testid="repository-updates">
            <div className="repository-header">
              <div>
                <div className="repository-kicker"><Github size={15} /> {t('updatesTitle')}</div>
                <p className="repository-subtitle" id="repositories-heading">{t('updatesSubtitle')}</p>
              </div>
              <div className="repository-refresh-area">
                {lastChecked && <span className="last-checked">{t('checkedAt')} · {formatDate(lastChecked)}</span>}
                <button className="refresh-button" type="button" onClick={() => void refreshRepositories()} disabled={refreshingRepos} data-testid="button-refresh-repositories">
                  <RefreshCw size={14} className={refreshingRepos ? 'spinning' : ''} />
                  {refreshingRepos ? t('refreshing') : t('refresh')}
                </button>
              </div>
            </div>
            <div className="repository-grid">
              {trackedRepositories.map((repository) => {
                const update = repoUpdates[repository.id];
                return (
                  <article className="repository-card" key={repository.id} data-testid={`repository-card-${repository.id}`}>
                    <div className="repository-card-top">
                      <span className="repository-icon"><Github size={16} /></span>
                      <span className={`repository-state ${!update ? 'pending' : update.status === 'error' ? 'error' : update.changed ? 'changed' : 'current'}`}>
                        {update?.status === 'error'
                          ? t('updateFailed')
                          : update?.changed
                            ? t('updateFound')
                            : update
                              ? update.sha?.slice(0, 7)
                              : t('neverChecked')}
                      </span>
                    </div>
                    <h3>{t(repoTitle[repository.id])}</h3>
                    <p className="repository-slug mono">{repository.slug}</p>
                    <p className="repository-scope">{t(repoScope[repository.id])}</p>
                    {update?.committedAt && <div className="repository-date">{t('updatedAt')} · {formatDate(update.committedAt)}</div>}
                    {update?.commitMessage && <p className="repository-commit" title={update.commitMessage}>{update.commitMessage}</p>}
                    <div className="repository-actions">
                      <a href={repository.url} target="_blank" rel="noreferrer" onClick={() => acknowledgeRepository(update ?? { ...repository, status: 'error', changed: false, checkedAt: Date.now() })}>
                        {t('openGithub')} <ExternalLink size={13} />
                      </a>
                      {update?.changed && <button type="button" onClick={() => acknowledgeRepository(update)}>{t('markRead')}</button>}
                    </div>
                  </article>
                );
              })}
            </div>
            <p className="repository-safety"><LockKeyhole size={13} /> {t('updateSafety')}</p>
          </section>
        </main>

        <footer className="footer">
          <div className="footer-legal"><HardDrive size={13} /> {t('footerLegal')}</div>
          <div>{t('footerRoadmap')}</div>
        </footer>
      </div>

      {helpOpen && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setHelpOpen(false); }}>
          <section className="modal-card" role="dialog" aria-modal="true" aria-labelledby="help-title" dir={direction}>
            <div className="modal-title">
              <span id="help-title">{t('aboutTitle')}</span>
              <button type="button" className="modal-close" aria-label={t('close')} data-testid="button-close-help" onClick={() => setHelpOpen(false)}><X size={18} /></button>
            </div>
            <p className="modal-copy">{t('aboutCopy')}</p>
            <div className="modal-points">
              <div className="modal-point"><Disc3 size={15} /><span><strong>PSXRecomp:</strong> {t('ps1About')}</span></div>
              <div className="modal-point"><Gamepad2 size={15} /><span><strong>PS2Recomp:</strong> {t('ps2About')}</span></div>
              <div className="modal-point"><Monitor size={15} /><span><strong>PS3Recomp:</strong> {t('ps3About')}</span></div>
              <div className="modal-point"><FileCode2 size={15} /><span><strong>AnyPS5:</strong> {t('ps5About')}</span></div>
              <div className="modal-point"><LockKeyhole size={15} /><span>{t('privacyAbout')}</span></div>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

export default App;
