const fs = require('fs')
const A = '@actions/artifact'
const { uploadZipToBlobStorage } = require(`${A}/lib/internal/upload/blob-upload`)
const { internalArtifactTwirpClient } = require(`${A}/lib/internal/shared/artifact-twirp-client`)
const { getBackendIdsFromToken } = require(`${A}/lib/internal/shared/util`)
const { StringValue } = require(`${A}/lib/generated`)

async function main() {
  const name = process.env.INPUT_NAME || 'output'
  const zipPath = process.env.INPUT_ZIPPATH
  const ids = getBackendIdsFromToken()
  const client = internalArtifactTwirpClient()
  const created = await client.CreateArtifact({
    workflowRunBackendId: ids.workflowRunBackendId,
    workflowJobRunBackendId: ids.workflowJobRunBackendId,
    name,
    version: 4
  })
  if (!created.ok) throw new Error('CreateArtifact failed')
  const res = await uploadZipToBlobStorage(created.signedUploadUrl, fs.createReadStream(zipPath))
  const req = {
    workflowRunBackendId: ids.workflowRunBackendId,
    workflowJobRunBackendId: ids.workflowJobRunBackendId,
    name,
    size: res.uploadSize ? res.uploadSize.toString() : '0'
  }
  if (res.sha256Hash) req.hash = StringValue.create({ value: `sha256:${res.sha256Hash}` })
  const fin = await client.FinalizeArtifact(req)
  if (!fin.ok) throw new Error('FinalizeArtifact failed')
  console.log(`uploaded artifact ${name} id=${fin.artifactId}`)
}
main().catch(e => { console.error(e); process.exit(1) })
