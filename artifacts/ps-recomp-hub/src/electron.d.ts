export {};

declare global {
  interface Window {
    recompHub?: {
      isDesktop: true;
      chooseInput: (generation: "ps1" | "ps2" | "ps5", language: "ar" | "en") => Promise<string[] | null>;
      validatePs1DiscSet: (paths: string[]) => Promise<{ ok: boolean; discCount: number }>;
      chooseFolder: (purpose: "output" | "modules", language: "ar" | "en") => Promise<string | null>;
      configurePs5Tool: (language: "ar" | "en") => Promise<string | null>;
      getToolStatus: () => Promise<{
        platform: string;
        packaged: boolean;
        ps5RelinkerPath: string | null;
        ps5RelinkerReady: boolean;
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
      }>;
      cancelRun: () => Promise<boolean>;
      onToolOutput: (
        callback: (event: { stream: "stdout" | "stderr"; text: string }) => void,
      ) => () => void;
    };
  }
}
