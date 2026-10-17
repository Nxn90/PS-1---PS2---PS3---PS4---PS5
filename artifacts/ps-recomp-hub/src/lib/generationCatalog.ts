export const generationCatalog = [
  {
    id: "ps1",
    title: "PlayStation 1",
    adapter: "PSXRecomp",
    enabled: true,
    badge: "تهيئة مشروع",
  },
  {
    id: "ps2",
    title: "PlayStation 2",
    adapter: "PS2Recomp",
    enabled: false,
    badge: "لاحقاً",
  },
  {
    id: "ps3",
    title: "PlayStation 3",
    adapter: "—",
    enabled: false,
    badge: "لاحقاً",
  },
  {
    id: "ps4",
    title: "PlayStation 4",
    adapter: "—",
    enabled: false,
    badge: "لاحقاً",
  },
  {
    id: "ps5",
    title: "PlayStation 5",
    adapter: "AnyPS5",
    enabled: true,
    badge: "يتطلب أداة",
  },
] as const;

type EnabledGeneration = Extract<(typeof generationCatalog)[number], { enabled: true }>;
export type ActiveGeneration = EnabledGeneration["id"];

export const activeGenerationInfo = Object.fromEntries(
  generationCatalog
    .filter((entry): entry is EnabledGeneration => entry.enabled)
    .map(({ id, title, adapter }) => [id, { title, adapter }]),
) as Record<ActiveGeneration, { title: string; adapter: string }>;
