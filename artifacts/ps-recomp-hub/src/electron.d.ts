export {};

declare global {
  interface Window {
    recompHub?: {
      isDesktop: true;
      chooseInput: (generation: "ps1" | "ps2" | "ps3" | "ps5", language: "ar" | "en") => Promise<string[] | null>;
      validatePs1DiscSet: (paths: string[]) => Promise<{ ok: boolean; discCount: number }>;
      chooseFolder: (purpose: "output" | "modules", language: "ar" | "en") => Promise<string | null>;
      configurePs5Tool: (language: "ar" | "en") => Promise<string | null>;
      installOfficialPs5Tool: () => Promise<{
        platform: string;
        packaged: boolean;
        ps5RelinkerPath: string | null;
        ps5RelinkerReady: boolean;
        ps5RelinkerOfficial: boolean;
        ps5ReleaseTag: string | null;
        ps5ReleaseUrl: string | null;
        ps5ArchiveSha256: string | null;
        ps5RelinkerSha256: string | null;
      }>;
      getToolStatus: () => Promise<{
        platform: string;
        packaged: boolean;
        ps5RelinkerPath: string | null;
        ps5RelinkerReady: boolean;
        ps5RelinkerOfficial: boolean;
        ps5ReleaseTag: string | null;
        ps5ReleaseUrl: string | null;
        ps5ArchiveSha256: string | null;
        ps5RelinkerSha256: string | null;
      }>;
      runPs5Relinker: (input: {
        sourcePath: string;
        moduleParentPath: string;
        outputDirectory: string;
      }) => Promise<{
        ok: boolean;
        cancelled?: boolean;
        outputPath: string;
          outputSize?: number;
          outputSha256?: string;
        exitCode?: number;
        message?: string;
      }>;
      cancelRun: () => Promise<boolean>;
      onPs5InstallProgress: (
        callback: (progress: {
          phase: "preparing" | "downloading" | "extracting" | "complete";
          version?: string;
          receivedBytes?: number;
          totalBytes?: number;
        }) => void,
      ) => () => void;
      onToolOutput: (
        callback: (event: { stream: "stdout" | "stderr"; text: string }) => void,
      ) => () => void;
    };
  }
}
