import { createCloudflareCloud } from '#cloud/runtime/cloudflare'

import config from './staging.toml'

const cloud = createCloudflareCloud(config)

export default cloud.worker
export const CollaborationRelayObject = cloud.CollaborationRelayObject
