import type { TranslationKey } from './i18n';

export const generationCatalog = [
  {
    id: 'ps1',
    title: 'PlayStation 1',
    adapter: 'PSXRecomp',
    enabled: true,
    integrated: false,
    badge: 'configuredProject',
    scope: 'scopePs1',
  },
  {
    id: 'ps2',
    title: 'PlayStation 2',
    adapter: 'PS2Recomp',
    enabled: true,
    integrated: false,
    badge: 'ps2Badge',
    scope: 'scopePs2',
  },
  {
    id: 'ps3',
    title: 'PlayStation 3',
    adapter: 'PS3Recomp',
    enabled: true,
    integrated: false,
    badge: 'notIntegrated',
    scope: 'scopePs3',
  },
  {
    id: 'ps4',
    title: 'PlayStation 4',
    adapter: '—',
    enabled: false,
    integrated: false,
    badge: 'later',
    scope: 'ps4Unavailable',
  },
  {
    id: 'ps5',
    title: 'PlayStation 5',
    adapter: 'AnyPS5',
    enabled: true,
    integrated: true,
    badge: 'requiresTool',
    scope: 'scopePs5',
  },
] as const satisfies readonly {
  id: string;
  title: string;
  adapter: string;
  enabled: boolean;
  integrated: boolean;
  badge: TranslationKey;
  scope: TranslationKey;
}[];

type EnabledGeneration = Extract<(typeof generationCatalog)[number], { enabled: true }>;
export type ActiveGeneration = EnabledGeneration['id'];

export const activeGenerationInfo = Object.fromEntries(
  generationCatalog
    .filter((entry): entry is EnabledGeneration => entry.enabled)
    .map(({ id, title, adapter, scope }) => [id, { title, adapter, scope }]),
) as Record<ActiveGeneration, { title: string; adapter: string; scope: TranslationKey }>;
