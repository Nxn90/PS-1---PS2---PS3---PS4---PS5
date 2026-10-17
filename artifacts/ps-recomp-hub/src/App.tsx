import { useEffect, useRef, useState, type ChangeEvent, type DragEvent } from 'react';
import {
  AlertCircle,
  Check,
  CheckCircle2,
  CircleHelp,
  Disc3,
  FileCode2,
  FilePlus2,
  FileText,
  FolderOpen,
  HardDrive,
  Info,
  LockKeyhole,
  Monitor,
  Play,
  ShieldCheck,
  X,
} from 'lucide-react';
import { activeGenerationInfo, generationCatalog, type ActiveGeneration } from './lib/generationCatalog';

type Generation = ActiveGeneration;
type LocalFile = { id: string; name: string; size?: number; file?: File; path?: string };
type NativePaths = { sourcePath: string | null; moduleParentPath: string | null; outputDirectory: string | null };
type ToolStatus = { platform: string; packaged: boolean; ps5RelinkerPath: string | null; ps5RelinkerReady: boolean };

const emptyNativePaths: NativePaths = { sourcePath: null, moduleParentPath: null, outputDirectory: null };

function formatSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function basename(filePath: string) {
  return filePath.split(/[\\/]/).filter(Boolean).at(-1) ?? filePath;
}

function App() {
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
  const fileInputRef = useRef<HTMLInputElement>(null);
  const desktop = typeof window !== 'undefined' && Boolean(window.recompHub?.isDesktop);

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

    void bridge.getToolStatus().then(setToolStatus).catch((error: Error) => {
      setMessage(`تعذّر قراءة إعدادات الأداة: ${error.message}`);
    });
    return bridge.onToolOutput(({ stream, text }) => {
      const lines = text.split(/\r?\n/).filter(Boolean);
      if (lines.length === 0) return;
      setToolLogs((current) => [...current, ...lines.map((line) => `${stream === 'stderr' ? '!' : '›'} ${line}`)].slice(-160));
    });
  }, []);

  const hasCue = files.some(({ name }) => name.toLowerCase().endsWith('.cue'));
  const hasElf = files.some(({ name }) => name.toLowerCase().endsWith('.elf'));
  const hasModule = desktop
    ? Boolean(nativePaths.moduleParentPath)
    : files.some(({ file, name }) => {
        const lower = name.toLowerCase();
        return lower.endsWith('.prx') || Boolean(file?.webkitRelativePath.match(/(?:^|\/)(?:sce_module|sce_modules|prx)\//i));
      });
  const hasPkg = files.some(({ name }) => name.toLowerCase().endsWith('.pkg'));
  const isReady = generation === 'ps1' ? hasCue : hasElf && hasModule && !hasPkg;
  const isBlocked = checked && !isReady;

  function addFiles(incoming: FileList | File[]) {
    const fresh = Array.from(incoming);
    if (fresh.length === 0) return;
    const pkg = generation === 'ps5' && fresh.some((file) => file.name.toLowerCase().endsWith('.pkg'));
    setFiles((current) => {
      const known = new Set(current.map((entry) => entry.path ?? `${entry.name}-${entry.size ?? 0}-${entry.file?.lastModified ?? 0}`));
      const next = fresh.filter((file) => {
        const key = `${file.name}-${file.size}-${file.lastModified}`;
        if (known.has(key)) return false;
        known.add(key);
        return true;
      });
      return [...current, ...next.map((file) => ({ id: `${file.name}-${file.size}-${file.lastModified}`, name: file.name, size: file.size, file }))];
    });
    setChecked(false);
    setNativeNotice(false);
    setNativePaths((current) => ({ ...current, sourcePath: null }));
    setMessage(pkg ? 'ملف PKG لا يمكن لـ AnyPS5 معالجته مباشرة. أزله واختر ELF نظيفاً وملفات الوحدات المعدّة.' : '');
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
    if (removed?.path) setNativePaths((current) => ({ ...current, sourcePath: null }));
    setMessage('');
  }

  async function selectInput() {
    const bridge = window.recompHub;
    if (!bridge?.isDesktop) {
      fileInputRef.current?.click();
      return;
    }

    try {
      const selectedPath = await bridge.chooseInput(generation);
      if (!selectedPath) return;
      const selectedName = basename(selectedPath);
      setFiles([{ id: selectedPath, name: selectedName, path: selectedPath }]);
      setNativePaths((current) => ({ ...current, sourcePath: selectedPath }));
      setChecked(false);
      setNativeNotice(false);
      setMessage('');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'تعذّر اختيار الملف.');
    }
  }

  async function selectNativeFolder(purpose: 'output' | 'modules') {
    const bridge = window.recompHub;
    if (!bridge?.isDesktop) return;
    try {
      const selectedPath = await bridge.chooseFolder(purpose);
      if (!selectedPath) return;
      setNativePaths((current) => ({
        ...current,
        [purpose === 'output' ? 'outputDirectory' : 'moduleParentPath']: selectedPath,
      }));
      setChecked(false);
      setMessage('');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'تعذّر اختيار المجلد.');
    }
  }

  async function configurePs5Tool() {
    const bridge = window.recompHub;
    if (!bridge?.isDesktop) return;
    try {
      const selectedPath = await bridge.configurePs5Tool();
      if (selectedPath) setToolStatus(await bridge.getToolStatus());
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'تعذّر إعداد أداة PS5.');
    }
  }

  async function inspectPrerequisites() {
    setChecked(true);
    setNativeNotice(false);
    setMessage('');
    if (!isReady) return;

    if (!desktop) {
      setNativeNotice(true);
      return;
    }

    if (generation === 'ps1') {
      setMessage('ملف CUE موجود. يتطلب PSXRecomp إعداد مشروع خاصاً باللعبة؛ لم يتم تشغيل تحويل.');
      return;
    }

    const sourcePath = nativePaths.sourcePath;
    if (!sourcePath) {
      setMessage('اختر ملف ELF من نافذة الملفات في تطبيق Windows، لا من سحب المتصفح.');
      return;
    }
    if (!nativePaths.moduleParentPath) {
      setMessage('اختر المجلد الأب الذي يحتوي sce_module أو sce_modules أو prx.');
      return;
    }
    if (!nativePaths.outputDirectory) {
      setMessage('اختر مجلد الإخراج قبل بدء إعادة الربط.');
      return;
    }
    if (!toolStatus?.ps5RelinkerReady) {
      setMessage('حدد ملف relinker.exe من إعداد AnyPS5 أولاً.');
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
        setMessage(`اكتمل تشغيل الأداة. ملف الناتج المتوقع: ${result.outputPath}`);
      } else if (result.cancelled) {
        setMessage('أُوقفت العملية. لم يتم تأكيد اكتمال ملف الناتج.');
      } else {
        setMessage(result.message ?? `فشلت العملية برمز ${result.exitCode ?? 'غير معروف'}. راجع السجل.`);
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'تعذّر تشغيل أداة AnyPS5.');
    } finally {
      setRunning(false);
      setToolStatus(await bridge.getToolStatus().catch(() => toolStatus));
    }
  }

  const title = activeGenerationInfo[generation];

  return (
    <div dir="rtl" lang="ar" className="min-h-[100dvh]">
      <div className="shell">
        <header className="topbar">
          <div className="brand">
            <div className="brand-mark" aria-hidden="true"><Disc3 size={23} strokeWidth={1.7} /></div>
            <div>
              <div className="brand-title">مركز إعادة بناء ألعاب PlayStation</div>
              <div className="brand-sub">مساعد محلي لملفاتك المُعدّة قانونياً</div>
            </div>
          </div>
          <div className="top-actions">
            <div className="preview-chip" role="status" data-testid="status-preview">
              <span className="preview-dot" />
                {desktop ? 'تطبيق Windows — ملفات محلية' : 'معاينة المتصفح — بلا تنفيذ أصلي'}
            </div>
            <button className="icon-button" type="button" aria-label="حول المساعد" data-testid="button-about" onClick={() => setHelpOpen(true)}>
              <CircleHelp size={18} />
            </button>
          </div>
        </header>

        <main>
          <section className="page-intro" aria-labelledby="page-heading">
            <div>
              <div className="eyebrow">مساحة أدوات إعادة البناء</div>
              <h1 className="intro-title" id="page-heading">اختر جيل المنصة، ثم افحص ملفات مشروعك</h1>
              <p className="intro-copy">نعرض ما يتطلبه كل محوّل بوضوح. لا تُرفع الملفات من جهازك.</p>
            </div>
            <div className="adapter-count" aria-label="مساران أوليان">
              <strong>02</strong> من 05 مسارات أولية
            </div>
          </section>

          <section className="generation-grid" aria-label="أجيال PlayStation">
            {generationCatalog.map((entry) => {
              const icon = entry.id === 'ps1' || entry.id === 'ps2'
                ? <Disc3 size={22} />
                : entry.id === 'ps5'
                  ? <FileCode2 size={22} />
                  : <Monitor size={21} />;
              if (!entry.enabled) {
                return (
                  <div className="generation-card disabled" aria-disabled="true" data-testid={`generation-${entry.id}`} key={entry.id}>
                    <span className="gen-symbol">{icon}</span>
                    <span><span className="gen-name">{entry.title}</span><span className="gen-sub">قيد التطوير</span></span>
                    <span className="gen-badge">{entry.badge}</span>
                  </div>
                );
              }
              return (
                <button type="button" className={`generation-card ${generation === entry.id ? 'selected' : ''}`} aria-pressed={generation === entry.id} data-testid={`button-generation-${entry.id}`} onClick={() => selectGeneration(entry.id)} key={entry.id}>
                  <span className="gen-symbol">{icon}</span>
                  <span><span className="gen-name">{entry.title}</span><span className="gen-sub mono">{entry.adapter}</span></span>
                  <span className="gen-badge">{entry.badge}</span>
                </button>
              );
            })}
          </section>

          <section className="workspace" aria-label="إعداد المشروع">
            <div className="panel workspace-main">
              <div className="panel-head">
                <div>
                  <h2 className="section-title">ملفات المشروع</h2>
                  <p className="section-note">اختر الملفات التي أعددتها مسبقاً على هذا الجهاز</p>
                </div>
                <div className="mode-tag">{title.title} · <span className="mono">{title.adapter}</span></div>
              </div>

              <input
                ref={fileInputRef}
                className="file-input"
                type="file"
                multiple={!desktop}
                accept={generation === 'ps1' ? '.cue' : '.elf,.prx'}
                aria-label={generation === 'ps1' ? 'اختر ملفات CUE وملفات القرص' : 'اختر ملف ELF وملفات الوحدات'}
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
                  <div className="drop-icon"><FolderOpen size={20} /></div>
                  <p className="drop-title">أفلت الملفات هنا أو اخترها يدوياً</p>
                  <p className="drop-help">
                    {generation === 'ps1'
                      ? <>مسار قرص <span className="mono">CUE</span> مع ملفات القرص المرتبطة</>
                      : <>ملف <span className="mono">ELF</span> نظيف مع ملفات الوحدات الخاصة به — ليس <span className="mono">PKG</span></>}
                  </p>
                  <button className="select-button" type="button" data-testid="button-select-files" onClick={() => void selectInput()}>
                    <FilePlus2 size={15} /> استعراض الملفات
                  </button>
                </div>
              </div>

              {files.length > 0 && (
                <div className="file-list" aria-label="الملفات المختارة" data-testid="list-selected-files">
                  {files.map(({ id, name, size }) => (
                    <div className="file-row" key={id} data-testid={`file-row-${id}`}>
                      <div className="file-icon"><FileText size={17} /></div>
                      <div className="file-meta">
                        <div className="file-name" title={name}>{name}</div>
                        <div className="file-size">{size === undefined ? 'مسار محلي' : formatSize(size)}</div>
                      </div>
                      <span className="file-status"><Check size={13} /> محلي</span>
                      <button type="button" className="remove-file" aria-label={`إزالة ${name}`} data-testid={`button-remove-${id}`} onClick={() => removeFile(id)}>
                        <X size={15} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              {desktop && generation === 'ps5' && (
                <div className="desktop-controls" data-testid="desktop-ps5-controls">
                  <div className="desktop-control-row">
                    <div className="desktop-control-meta">
                      <strong>أداة AnyPS5</strong>
                      <span title={toolStatus?.ps5RelinkerPath ?? ''}>
                        {toolStatus?.ps5RelinkerReady ? basename(toolStatus.ps5RelinkerPath!) : 'لم يتم تحديد relinker.exe'}
                      </span>
                    </div>
                    <button className="select-button secondary-select" type="button" data-testid="button-configure-ps5-tool" onClick={() => void configurePs5Tool()}>
                      <FilePlus2 size={14} /> اختيار الأداة
                    </button>
                  </div>
                  <div className="desktop-control-row">
                    <div className="desktop-control-meta">
                      <strong>مجلد الوحدات</strong>
                      <span title={nativePaths.moduleParentPath ?? ''}>
                        {nativePaths.moduleParentPath ? basename(nativePaths.moduleParentPath) : 'اختر المجلد الأب للوحدات'}
                      </span>
                    </div>
                    <button className="select-button secondary-select" type="button" data-testid="button-select-modules" onClick={() => void selectNativeFolder('modules')}>
                      <FolderOpen size={14} /> استعراض
                    </button>
                  </div>
                  <div className="desktop-control-row">
                    <div className="desktop-control-meta">
                      <strong>مجلد الإخراج</strong>
                      <span title={nativePaths.outputDirectory ?? ''}>
                        {nativePaths.outputDirectory ? basename(nativePaths.outputDirectory) : 'اختر مكان حفظ ملف EXE'}
                      </span>
                    </div>
                    <button className="select-button secondary-select" type="button" data-testid="button-select-output" onClick={() => void selectNativeFolder('output')}>
                      <FolderOpen size={14} /> استعراض
                    </button>
                  </div>
                  <p className="desktop-controls-note">اختر المجلد الأب الذي يحتوي مجلد sce_module أو sce_modules أو prx.</p>
                </div>
              )}
              <div className="toast-live" role="status" aria-live="polite" data-testid="status-file-message">{message}</div>
              <div className="rule-divider" />
              <div className="requirements">
                {generation === 'ps1' ? (
                  <>
                    <div className="requirement"><Disc3 size={15} /><span><strong>PSXRecomp</strong> مشروع خاص بكل لعبة؛ ليس تحويلاً عاماً بنقرة واحدة.</span></div>
                    <div className="requirement"><Info size={15} /><span>يتطلب إعداد مشروع اللعبة ومسار قرص <span className="mono">CUE</span> مع ملفات القرص.</span></div>
                  </>
                ) : (
                  <>
                    <div className="requirement"><FileCode2 size={15} /><span><strong>AnyPS5</strong> يقبل <span className="mono">ELF</span> نظيفاً مُعدّاً مسبقاً مع ملفات الوحدات.</span></div>
                    <div className="requirement"><AlertCircle size={15} /><span>لا يستطيع معالجة حزمة <span className="mono">PKG</span> عادية مباشرة.</span></div>
                  </>
                )}
              </div>
            </div>

            <aside className="panel workspace-side" aria-labelledby="check-heading">
              <div className="side-heading">
                <div className="side-heading-icon"><ShieldCheck size={18} /></div>
                <div>
                  <div className="side-title" id="check-heading">فحص المتطلبات</div>
                  <div className="side-subtitle">تحقق محلي من الصيغ المختارة</div>
                </div>
              </div>

              <div className={`status-box ${isBlocked ? 'blocked' : isReady ? 'ready' : ''}`} role="status" data-testid="status-prerequisites">
                <div className="status-line"><span className="status-indicator" />
                  {isBlocked ? 'متطلبات غير مكتملة' : isReady ? 'الصيغ الأساسية الظاهرة موجودة' : 'بانتظار اختيار الملفات'}
                </div>
                <p className="status-copy">
                  {isBlocked
                    ? 'لا يمكن تأكيد جاهزية المشروع. راجع النواقص أدناه قبل المتابعة.'
                    : isReady
                      ? 'تم العثور على الصيغ الأساسية المطلوبة. هذا فحص للصيغ فقط، وليس فحصاً لمحتوى الملفات.'
                      : 'اختر الملفات المحلية المطلوبة لهذا المحوّل لعرض نتيجة التحقق.'}
                </p>
                {checked && (
                  <div className="validation-list">
                    {generation === 'ps1' ? (
                      <div className={`validation-item ${hasCue ? 'good' : 'bad'}`}>
                        {hasCue ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}
                        <span>{hasCue ? 'مسار CUE موجود ضمن الملفات المختارة.' : 'أضف ملف CUE؛ مسار القرص مطلوب لهذا المسار.'}</span>
                      </div>
                    ) : (
                      <>
                        <div className={`validation-item ${hasElf ? 'good' : 'bad'}`}>
                          {hasElf ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}
                          <span>{hasElf ? 'تم اختيار ELF.' : 'أضف ملف ELF نظيفاً ومُعدّاً مسبقاً.'}</span>
                        </div>
                        <div className={`validation-item ${hasModule ? 'good' : 'bad'}`}>
                        {hasModule ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}
                        <span>{hasModule ? desktop ? 'تم اختيار مجلد الوحدات؛ سيجري التحقق من بنيته عند التشغيل.' : 'عُثر على ملفات PRX أو مسارات مجلد وحدات؛ لم يُفحص محتواها.' : 'أضف ملفات PRX أو اختر مجلد الوحدات في تطبيق Windows.'}</span>
                        </div>
                        {hasPkg && <div className="validation-item bad"><AlertCircle size={14} /><span>PKG غير مدعوم كمدخل مباشر لدى AnyPS5.</span></div>}
                      </>
                    )}
                  </div>
                )}
              </div>

              {nativeNotice && (
                <div className="status-box blocked" role="status" data-testid="status-native-unavailable" style={{ marginTop: 10 }}>
                  <div className="status-line"><AlertCircle size={14} /> التنفيذ الأصلي غير متاح هنا</div>
                  <p className="status-copy">المتطلبات الأساسية موجودة، لكن معاينة المتصفح لا تشغّل PSXRecomp أو AnyPS5 ولا تنشئ ملفات ناتجة.</p>
                </div>
              )}

              {desktop && generation === 'ps5' && toolLogs.length > 0 && (
                <div className="tool-log" role="log" aria-label="سجل AnyPS5" data-testid="log-ps5-tool">
                  <div className="tool-log-heading">مخرجات AnyPS5</div>
                  {toolLogs.map((line, index) => <div className="tool-log-line mono" key={`${index}-${line}`}>{line}</div>)}
                </div>
              )}

              <button className={`run-button ${isReady ? 'valid' : ''}`} type="button" disabled={running} data-testid="button-check-files" onClick={() => void inspectPrerequisites()}>
                <Play size={14} /> {running ? 'جارٍ تشغيل AnyPS5…' : desktop && generation === 'ps5' && toolStatus?.ps5RelinkerReady ? 'إعادة الربط إلى Windows' : desktop && generation === 'ps1' ? 'فحص تهيئة PS1' : isReady ? 'فحص المتطلبات' : 'تحقق من الملفات'}
              </button>
              {running && <button className="cancel-button" type="button" data-testid="button-cancel-run" onClick={() => void window.recompHub?.cancelRun()}>إيقاف العملية</button>}
              <div className="native-note"><LockKeyhole size={13} /><span>{desktop ? 'الأدوات والملفات لا تغادر جهازك. لا يبدأ التنفيذ إلا بعد تحديد ملف الأداة والمدخلات.' : 'لا يتم رفع أي ملف أو تشغيله. يلزم تطبيق Windows أصلي للتنفيذ؛ هذه المعاينة لا تقوم بإعادة بناء.'}</span></div>
            </aside>
          </section>

          <div className="notice-strip" role="note" data-testid="notice-local-processing">
            <ShieldCheck size={16} />
            <span><strong>ملفاتك تبقى على جهازك.</strong> {desktop ? 'تطبيق Windows يشغّل الأداة التي تحددها على ملفاتك المحلية.' : 'واجهة المعاينة تتحقق من أسماء الصيغ فقط ولا تقرأ أو ترفع محتوى الملفات.'}</span>
          </div>
        </main>

        <footer className="footer">
          <div className="footer-legal"><HardDrive size={13} /> مساعد لملفاتك المُعدّة قانونياً — لا يتضمن ألعاباً أو ملفات نظام.</div>
          <div>إصدارات أخرى قيد التطوير</div>
        </footer>
      </div>

      {helpOpen && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setHelpOpen(false); }}>
          <section className="modal-card" role="dialog" aria-modal="true" aria-labelledby="help-title" dir="rtl">
            <div className="modal-title">
              <span id="help-title">حول مركز إعادة البناء</span>
              <button type="button" className="modal-close" aria-label="إغلاق" data-testid="button-close-help" onClick={() => setHelpOpen(false)}><X size={18} /></button>
            </div>
            <p className="modal-copy">مساعد Windows لتهيئة مسارات إعادة البناء على ملفات أعددتها قانونياً. لا يتضمن ألعاباً أو ملفات نظام، ولا يحوّل حزمة PKG عادية إلى لعبة Windows.</p>
            <div className="modal-points">
              <div className="modal-point"><Disc3 size={15} /><span><strong>PSXRecomp:</strong> مشروع إعادة بناء خاص بكل لعبة، يعتمد مسار قرص CUE؛ ليس تحويلاً عاماً فورياً.</span></div>
              <div className="modal-point"><FileCode2 size={15} /><span><strong>AnyPS5:</strong> يتطلب ELF نظيفاً وملفات الوحدات، ولا يعالج PKG عاديّاً مباشرة.</span></div>
              <div className="modal-point"><LockKeyhole size={15} /><span>في معاينة المتصفح يقتصر الفحص على أسماء الصيغ؛ وفي تطبيق Windows تبقى العمليات محلية.</span></div>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

export default App;
