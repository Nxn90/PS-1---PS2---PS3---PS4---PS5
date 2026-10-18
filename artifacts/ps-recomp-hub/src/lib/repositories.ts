export type RepositoryDefinition = {
  id: 'ps1' | 'ps2' | 'ps3' | 'ps5';
  slug: string;
  url: string;
};

export type RepositoryUpdate = RepositoryDefinition & {
  sha?: string;
  commitUrl?: string;
  commitMessage?: string;
  committedAt?: string;
  checkedAt: number;
  status: 'ok' | 'error';
  changed: boolean;
};

export const trackedRepositories: RepositoryDefinition[] = [
  {
    id: 'ps1',
    slug: 'RetroPortingToolKit/psxrecomp',
    url: 'https://github.com/RetroPortingToolKit/psxrecomp',
  },
  {
    id: 'ps2',
    slug: 'open-goal/jak-project',
    url: 'https://github.com/open-goal/jak-project',
  },
  {
    id: 'ps3',
    slug: 'sp00nznet/ps3recomp',
    url: 'https://github.com/sp00nznet/ps3recomp',
  },
  {
    id: 'ps5',
    slug: 'boykopovar/AnyPS5',
    url: 'https://github.com/boykopovar/AnyPS5',
  },
];

const checkInterval = 15 * 60 * 1000;
const seenCommitKey = 'ps-recomp-hub:github-seen-v1';

export async function checkRepositories(
  signal?: AbortSignal,
): Promise<RepositoryUpdate[]> {
  const checkedAt = Date.now();
  const results = await Promise.all(
    trackedRepositories.map(async (repository): Promise<RepositoryUpdate> => {
      try {
        const response = await fetch(
          `https://api.github.com/repos/${repository.slug}/commits?per_page=1`,
          {
            headers: {
              Accept: 'application/vnd.github+json',
              'X-GitHub-Api-Version': '2022-11-28',
            },
            cache: 'no-store',
            signal: signal ?? AbortSignal.timeout(12_000),
          },
        );
        if (!response.ok) {
          throw new Error(`GitHub returned ${response.status}`);
        }

        const commits: Array<{
          sha?: string;
          html_url?: string;
          commit?: {
            message?: string;
            author?: { date?: string } | null;
            committer?: { date?: string } | null;
          };
        }> = await response.json();
        const latest = commits[0];
        if (!latest?.sha) throw new Error('No commit data returned');

        const seenSha = localStorage.getItem(`${seenCommitKey}:${repository.id}`);
        const changed = Boolean(seenSha && seenSha !== latest.sha);
        if (!seenSha) localStorage.setItem(`${seenCommitKey}:${repository.id}`, latest.sha);

        return {
          ...repository,
          sha: latest.sha,
          commitUrl: latest.html_url,
          commitMessage: latest.commit?.message?.split('\n')[0],
          committedAt: latest.commit?.author?.date ?? latest.commit?.committer?.date,
          checkedAt,
          status: 'ok',
          changed,
        };
      } catch {
        return {
          ...repository,
          checkedAt,
          status: 'error',
          changed: false,
        };
      }
    }),
  );

  return results;
}

export { checkInterval };
export function markRepositorySeen(id: RepositoryDefinition['id'], sha: string) {
  localStorage.setItem(`${seenCommitKey}:${id}`, sha);
}
