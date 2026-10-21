import { createCloudflareCloud } from '#cloud/runtime/cloudflare'

// Written by whoever runs the Worker locally, such as the end-to-end tests.
import config from '../generated/cloudflare.toml'

const cloud = createCloudflareCloud(config)

export default cloud.worker
export const CollaborationRelayObject = cloud.CollaborationRelayObject
