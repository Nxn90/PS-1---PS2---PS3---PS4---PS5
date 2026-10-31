export {};

declare global {
  interface Window {
    recompHub?: {
      isDesktop: true;
      chooseInput: (generation: "ps1" | "ps2" | "ps5", language: "ar" | "en") => Promise<string[] | null>;
      validatePs1DiscSet: (paths: string[]) => Promise<{ ok: boolean; discCount: number }>;
      chooseFolder: (purpose: "output" | "modules", language: "ar" | "en") => Promise<string | null>;
      runPs1Build: (input: { cuePath: string; outputDirectory: string }) => Promise<{
        ok: boolean;
        cancelled?: boolean;
        projectPath: string;
        outputPath?: string;
        exitCode?: number;
        message?: string;
      }>;
      installPs5Tools: () => Promise<{
        ps5RelinkerReady: boolean;
        ps5RelinkerPath: string | null;
        ps5LibrariesReady: boolean;
        ps5LibrariesPath: string | null;
        ps5RuntimeReady: boolean;
        ps5RuntimeDllPath: string | null;
        ps5ToolVersion: string | null;
      }>;
      getToolStatus: () => Promise<{
        platform: string;
        packaged: boolean;
        ps5RelinkerPath: string | null;
        ps5RelinkerReady: boolean;
        ps5LibrariesPath: string | null;
        ps5LibrariesReady: boolean;
        ps5RuntimeDllPath: string | null;
        ps5RuntimeReady: boolean;
        ps5ToolVersion: string | null;
      }>;
      runPs5Relinker: (input: {
        sourcePath: string;
        moduleParentPath: string;
        outputDirectory: string;
      }) => Promise<{
        ok: boolean;
        cancelled?: boolean;
        outputPath: string;
        exitCode?: number;
        message?: string;
          resourcesIncluded?: boolean;
      }>;
      cancelRun: () => Promise<boolean>;
      onToolOutput: (
        callback: (event: { stream: "stdout" | "stderr"; text: string }) => void,
      ) => () => void;
      onToolProgress: (
        callback: (event: { phase: string; asset?: string; percent: number }) => void,
      ) => () => void;
    };
  }
}
