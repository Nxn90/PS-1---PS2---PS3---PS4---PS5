export {};

declare global {
  interface Window {
    recompHub?: {
      isDesktop: true;
      chooseInput: (generation: "ps1" | "ps5") => Promise<string | null>;
      chooseFolder: (purpose: "output" | "modules") => Promise<string | null>;
      configurePs5Tool: () => Promise<string | null>;
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
