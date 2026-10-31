module.exports.coverageHelper = ({ github, context, headSha, tmpCoverageDir, remoteCoverageDir, prNumber }) => ({
  AddCoverageSummary: async (dirs) => {
    console.log('coverageHelper stub', { headSha, prNumber, dirs })
  }
})
