import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { runCampaign, classifyFeedback } from './run.mjs';

const config = {
  repository: 'owner/repo', startedAt: '2026-11-26T00:00:00+01:00',
  endsAt: '2026-12-03T00:00:00+01:00', thread: 1, tag: 'preview',
  assets: { 'Setup.exe': 'sha256:example' },
  directories: [{ repository: 'maintainer/awesome', proposal: 12, label: 'Test directory' }],
};
const title = '### Test area\n\nCursor CSV\n\n### Test result\n\nCursor totals differ\n\n### Outcome\n\nTotals differ';
const feedback = {
  number: 2, title: '[Preview] CSV discrepancy', body: title,
  created_at: '2026-11-26T09:00:00Z', state: 'open',
  user: { login: 'tester', type: 'User' },
};

function fixture() {
  let stars = 0;
  let downloads = 1;
  let failure;
  const calls = [];
  const labels = [];
  const issueReplies = [];
  const comments = [{
    id: 9, user: { login:'someone' }, body:'<!-- ia-usage-campaign-v1:ZXZpbA== -->',
  }];
  const release = { draft: false, assets: [
    { name: 'Setup.exe', digest:'sha256:example', state:'uploaded', size:300, download_count: downloads },
  ] };
  return {
    calls, comments, release, issueReplies,
    setCounts(s,d) { stars=s; downloads=d; },
    failWrites() { failure = new Error('write failed'); },
    async request(path, {method = 'GET', body} = {}) {
      const url = new URL(path, 'https://api.github.com');
      calls.push({ path: url.pathname, query: url.searchParams, method, body });
      if(method !== 'GET' && failure) throw failure;
      if(url.pathname === '/repos/owner/repo') return { stargazers_count: stars };
      if(url.pathname === '/repos/owner/repo/releases/tags/preview') {
        release.assets[0].download_count = downloads;
        return release;
      }
      if(url.pathname === '/repos/owner/repo/issues') return [
        { ...feedback, labels },
        { ...feedback, labels, number: 5, pull_request: {} },
      ];
      if(url.pathname === '/repos/owner/repo/issues/1/comments') {
        if(method === 'GET') return [...comments];
        comments.push({ id:10, body:body.body, user:{ login:'github-actions[bot]' } });
        return comments.at(-1);
      }
      if(url.pathname === '/repos/owner/repo/issues/comments/10' && method === 'PATCH') {
        comments.at(-1).body = body.body;
        return comments.at(-1);
      }
      if(url.pathname === '/repos/owner/repo/issues/2/labels' && method === 'POST') {
        for(const name of body.labels) labels.push({ name });
        return labels;
      }
      if(url.pathname === '/repos/owner/repo/issues/2/comments') {
        if (method === 'GET') return issueReplies;
        issueReplies.push({ id: 11, body: body.body, user: { login: 'github-actions[bot]' } });
        return issueReplies.at(-1);
      }
      if(url.pathname === '/repos/maintainer/awesome/pulls/12') return { state:'open', merged:false };
      if(url.pathname.includes('/traffic/')) return null;
      throw Error(path);
    },
  };
}

describe('weekly campaign', () => {
  it('uses the structured form area and ignores unrelated issues', () => {
    assert.equal(classifyFeedback(title), 'preview: cursor csv');
    assert.equal(classifyFeedback('### Test area\n\nWindows installation\n'), 'preview: windows');
    assert.equal(classifyFeedback('Free text about Windows'), null);
  });

  it('starts from actual counts and leaves human comments alone', async () => {
    const api = fixture();
    const result = await runCampaign(api.request, config, new Date('2026-11-26T10:00:00Z'));
    assert.equal(result.finished, false);
    assert.equal(result.state.baseline.downloads, 1);
    assert.equal(result.state.samples[0].issues, 1);
    assert.equal(api.calls.find(x => x.path === '/repos/owner/repo/issues').query.get('since'),
      '2026-11-25T23:00:00.000Z');
    assert.equal(api.comments.length, 2);
    assert.equal(api.calls.filter(x=>x.path.endsWith('/issues/2/labels')).length, 1);
    assert.match(api.comments[1].body, /GitHub Insights/);
    assert.equal(api.issueReplies.length, 1);
    assert.match(api.issueReplies[0].body, /same date range/);
  });

  it('updates a single comment, reports real growth and stops after the final snapshot', async () => {
    const api = fixture();
    await runCampaign(api.request, config, new Date('2026-11-26T10:00:00Z'));
    api.setCounts(3,4);
    await runCampaign(api.request, config, new Date('2026-11-29T10:00:00Z'));
    const result = await runCampaign(api.request, config, new Date('2026-12-03T10:00:00Z'));
    assert.equal(result.finished, true);
    assert.equal(result.state.samples.at(-1).stars, 3);
    assert.equal(result.state.samples.at(-1).day, 7);
    assert.match(api.comments[1].body, /\+3/);
    assert.equal(api.comments.length, 2);
    assert.equal(api.issueReplies.length, 1);
    const writes = api.calls.filter(x=>x.method!=='GET').length;
    await runCampaign(api.request, config, new Date('2026-12-04T10:00:00Z'));
    assert.equal(api.calls.filter(x=>x.method!=='GET').length, writes);
  });

  it('marks missing installers and avoids invented download totals', async () => {
    const api = fixture();
    api.release.assets[0].digest = 'sha256:different';
    const result = await runCampaign(api.request, config, new Date('2026-11-26T10:00:00Z'));
    assert.equal(result.state.samples[0].downloads, null);
    assert.match(api.comments[1].body, /à vérifier/);
  });

  it('skips days prior to launch without any request', async () => {
    const api = fixture();
    await runCampaign(api.request, config, new Date('2026-11-23T10:00:00Z'));
    assert.deepEqual(api.calls, []);
  });

  it('propagates failed writes so a later scheduled run can retry', async () => {
    const api = fixture();
    api.failWrites();
    await assert.rejects(runCampaign(api.request, config, new Date('2026-12-03T10:00:00Z')), /write failed/);
    assert.equal(api.comments.length, 1);
  });
});
