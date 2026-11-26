import { appendFile, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const dayMs = 86_400_000;
const marker = /^<!-- ia-usage-campaign-v1:([A-Za-z0-9+/=]+) -->/;
const replyMarker = '<!-- ia-usage-preview-help-v1 -->';
const headers = { accept: 'application/vnd.github+json', 'x-github-api-version': '2022-11-28' };
const labelsByArea = {
  'Windows installation': 'preview: windows',
  'Cursor CSV': 'preview: cursor csv',
  'Claude Code or dashboard': 'preview: dashboard',
};

export function classifyFeedback(body) {
  const area = /^### Test area\r?\n\s*([^\r\n]+)/m.exec(body ?? '')?.[1]?.trim();
  return Object.hasOwn(labelsByArea, area) ? labelsByArea[area] : null;
}

function helpFor(issue, label, config) {
  const outcome = /^### Test result\r?\n\s*([^\r\n]+)/m.exec(issue.body ?? '')?.[1]?.trim();
  if (label === labelsByArea['Windows installation'] && outcome === 'Installation failed') {
    return 'GitHub publishes both an x64 setup executable and an MSI for the same preview. If Windows reports a setup error, please share the short error code and whether you used the EXE or the MSI. [Installers](https://github.com/'
      + config.repository + '/releases/tag/' + config.tag + ')';
  }
  if (label === labelsByArea['Cursor CSV'] && outcome === 'Cursor totals differ') {
    return 'Please compare the same date range and product filter in both apps. Cursor and Grok Bot can appear in the same export, and IA Usage groups timestamps by your local date. The CSV column names and date range are enough to investigate. [Cursor export notes](https://cursor.com/docs/release-notes/web)';
  }
  return null;
}

async function list(request, path) {
  const results = [];
  for (let page = 1; ; page++) {
    const items = await request(path + (path.includes('?') ? '&' : '?') + 'per_page=100&page=' + page);
    results.push(...items);
    if (items.length < 100) return results;
  }
}

function readState(comments, startedAt) {
  for (const comment of comments) {
    if (comment.user?.login !== 'github-actions[bot]') continue;
    const encoded = marker.exec(comment.body)?.[1];
    if (!encoded) continue;
    try {
      const state = JSON.parse(Buffer.from(encoded, 'base64').toString('utf8'));
      if (state.startedAt === startedAt && Array.isArray(state.samples) && state.baseline) {
        return { comment, state };
      }
    } catch {
      // Leave comments carrying invalid state alone.
    }
  }
  return {};
}

function assetStatus(release, expected) {
  return Object.entries(expected).map(([name, digest]) => {
    const asset = release?.assets?.find(item => item.name === name);
    const verified = release?.draft === false && asset?.state === 'uploaded'
      && asset.digest === digest && asset.size > 0;
    return { name, verified, downloads: verified ? asset.download_count : null };
  });
}

function formatDelta(current, baseline) {
  if (current === null || baseline === null) return '—';
  const change = current - baseline;
  return change > 0 ? '+' + change : String(change);
}

function render(config, state, sample, assets, feedback) {
  const repoUrl = 'https://github.com/' + config.repository;
  const { baseline } = state;
  const count = value => value ?? '—';
  const rows = state.samples.map(s =>
    '| ' + [s.day, s.observedAt, s.stars, count(s.downloads), s.issues, s.replies].join(' | ') + ' |');
  const links = feedback.filter(i => i.state === 'open').map(i => '[#' + i.number + '](' + repoUrl + '/issues/' + i.number + ')');
  return [
    state.finished ? '## Bilan de la campagne sur sept jours' : '## Suivi du lancement sur sept jours',
    '',
    'Étoiles **' + sample.stars + '** (' + formatDelta(sample.stars, baseline.stars)
      + '). Téléchargements de la préversion **' + count(sample.downloads) + '** ('
      + formatDelta(sample.downloads, baseline.downloads) + ').',
    'Les variations comparent les compteurs cumulés relevés entre ' + baseline.observedAt
      + ' et ' + sample.observedAt + '. Les retours sont comptés dans les dates de la campagne.',
    '',
    '| Jour | Relevé UTC | Étoiles | Téléchargements | Retours structurés | Participants uniques ici |',
    '| --- | --- | ---: | ---: | ---: | ---: |',
    ...rows,
    '',
    ...assets.map(a => '- `' + a.name + '` · ' + (a.verified ? 'empreinte vérifiée' : 'à vérifier')
      + ' · ' + count(a.downloads) + ' téléchargements'),
    '- ' + (sample.views === null
      ? '[GitHub Insights](' + repoUrl + '/graphs/traffic) est réservé aux comptes disposant des droits de trafic.'
      : 'GitHub Insights sur 14 jours · ' + sample.views + ' visites, dont ' + sample.uniqueViews + ' uniques.'),
    ...config.directories.map((directory, index) => '- [' + directory.label + '](https://github.com/'
      + directory.repository + '/pull/' + directory.proposal + ') · ' + (sample.proposals[index] ?? 'état indisponible')),
    '- Retours ouverts · ' + (links.join(', ') || 'aucun retour structuré ouvert'),
    '',
    '[Télécharger la préversion](' + repoUrl + '/releases/tag/' + config.tag + ') · [Donner un retour]('
      + repoUrl + '/issues/new?template=windows-preview.yml)',
  ].join('\n');
}

export async function runCampaign(request, config, now = new Date()) {
  const start = Date.parse(config.startedAt);
  const end = Date.parse(config.endsAt);
  if (!Number.isFinite(start) || end - start !== 7 * dayMs) throw Error('Invalid campaign dates');
  if (now < start) return { finished: false, markdown: 'La campagne n’a pas encore commencé.' };

  const repo = '/repos/' + config.repository;
  const thread = repo + '/issues/' + config.thread + '/comments';
  const comments = await list(request, thread);
  const saved = readState(comments, config.startedAt);
  if (saved.state?.finished) {
    return { finished: true, state: saved.state, markdown: saved.comment.body.replace(marker, '').trim() };
  }

  const [metadata, release, issues, traffic, proposal] = await Promise.all([
    request(repo),
    request(repo + '/releases/tags/' + encodeURIComponent(config.tag), { optional: true }),
    list(request, repo + '/issues?state=all&since=' + encodeURIComponent(new Date(start).toISOString())),
    request(repo + '/traffic/views', { optional: true }),
    Promise.all(config.directories.map(directory => request('/repos/' + directory.repository
      + '/pulls/' + directory.proposal, { optional: true, publicRead: true }))),
  ]);
  const feedback = issues.filter(issue => !issue.pull_request && Number.isSafeInteger(issue.number)
    && issue.number !== config.thread && Date.parse(issue.created_at) >= start
    && Date.parse(issue.created_at) < end && issue.title?.startsWith('[Preview]') && classifyFeedback(issue.body));

  for (const issue of feedback.filter(item => item.state === 'open')) {
    const label = classifyFeedback(issue.body);
    const issuePath = repo + '/issues/' + issue.number;
    if (!issue.labels.some(item => item.name === label)) {
      await request(issuePath + '/labels', { method: 'POST', body: { labels: [label] } });
    }
    const help = helpFor(issue, label, config);
    if (help) {
      const replies = await list(request, issuePath + '/comments');
      const alreadyReplied = replies.some(reply => reply.user?.login === 'github-actions[bot]'
        && reply.body?.startsWith(replyMarker));
      if (!alreadyReplied) {
        await request(issuePath + '/comments', {
          method: 'POST', body: { body: replyMarker + '\n\n' + help },
        });
      }
    }
  }

  const assets = assetStatus(release, config.assets);
  const author = config.repository.split('/')[0].toLowerCase();
  const replies = new Set(comments.filter(c => c.user?.type === 'User'
    && c.user.login.toLowerCase() !== author && Date.parse(c.created_at) >= start
    && Date.parse(c.created_at) < end).map(c => c.user.login.toLowerCase()));
  const finished = now >= end;
  const sample = {
    day: Math.min(7, Math.floor((now - start) / dayMs)),
    observedAt: now.toISOString(),
    stars: metadata.stargazers_count,
    downloads: assets.every(a => Number.isSafeInteger(a.downloads))
      ? assets.reduce((sum, a) => sum + a.downloads, 0) : null,
    issues: feedback.length,
    replies: replies.size,
    views: traffic?.count ?? null,
    uniqueViews: traffic?.uniques ?? null,
    proposals: proposal.map(item => item?.merged ? 'accepté' : item?.state === 'open' ? 'en revue'
      : item?.state === 'closed' ? 'fermé' : 'état indisponible'),
  };
  const baseline = saved.state?.baseline ?? sample;
  const samples = (saved.state?.samples ?? []).filter(item => item.day !== sample.day).concat(sample);
  const state = { startedAt: config.startedAt, finished, baseline, samples };
  const markdown = render(config, state, sample, assets, feedback);
  const encoded = Buffer.from(JSON.stringify(state)).toString('base64');
  const body = '<!-- ia-usage-campaign-v1:' + encoded + ' -->\n\n' + markdown;
  if (saved.comment?.body !== body) {
    await request(saved.comment ? repo + '/issues/comments/' + saved.comment.id : thread, {
      method: saved.comment ? 'PATCH' : 'POST', body: { body },
    });
  }
  return { finished, state, markdown };
}

async function main() {
  const config = JSON.parse(await readFile(new URL('./config.json', import.meta.url), 'utf8'));
  if (process.env.GITHUB_REPOSITORY !== config.repository || !process.env.GH_TOKEN) {
    throw Error('Use the campaign workflow in ' + config.repository);
  }
  const request = async (path, { method = 'GET', body, optional = false, publicRead = false } = {}) => {
    const response = await fetch('https://api.github.com' + path, {
      method, redirect: 'error', signal: AbortSignal.timeout(20_000),
      headers: {
        ...headers,
        ...(publicRead ? {} : { authorization: 'Bearer ' + process.env.GH_TOKEN }),
        'content-type': 'application/json',
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (optional && [403, 404].includes(response.status)) return null;
    if (!response.ok) throw Error(method + ' ' + path + ' returned HTTP ' + response.status);
    return response.json();
  };
  const result = await runCampaign(request, config);
  console.log(result.markdown);
  await appendFile(process.env.GITHUB_STEP_SUMMARY, result.markdown + '\n');
  await appendFile(process.env.GITHUB_OUTPUT, 'finished=' + result.finished + '\n');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
