import type { Meta, StoryObj } from '@storybook/vue3-vite'
import { fn } from 'storybook/test'
import { ref } from 'vue'

import SaveToDialog from './SaveToDialog.vue'
import type { SaveToDestination, SaveToState } from './types'

type Args = {
  destinations: SaveToDestination[]
  state: SaveToState
  destination: string
  onSave: () => void
}

const official: SaveToDestination = {
  kind: 'cloud',
  serverId: 'official',
  host: 'cloud.openpencil.dev',
  workspaces: [
    { id: 'design', name: 'Design team', role: 'editor' },
    { id: 'personal', name: 'Personal', role: 'admin' },
    { id: 'brand', name: 'Brand archive', role: 'viewer' }
  ]
}
const team: SaveToDestination = {
  kind: 'cloud',
  serverId: 'acme',
  host: 'design.acme.internal',
  workspaces: [{ id: 'product', name: 'Product', role: 'editor' }]
}
const bucket: SaveToDestination = { kind: 'storage', providerId: 's3', label: 'studio-designs' }

const meta = {
  title: 'App/Save To/Dialog',
  tags: ['autodocs'],
  args: {
    destinations: [official],
    state: { kind: 'ready' },
    destination: 'cloud/official/design',
    onSave: fn()
  },
  render: (args) => ({
    components: { SaveToDialog },
    setup: () => ({ args, name: ref('Onboarding flow'), destination: ref(args.destination) }),
    template: `
      <div class="h-[680px]">
        <SaveToDialog :open="true" v-model:name="name" v-model:destination="destination" :destinations="args.destinations" :state="args.state" @save="args.onSave" />
      </div>`
  })
} satisfies Meta<Args>

export default meta
type Story = StoryObj<typeof meta>

export const ChooseWorkspace: Story = {}
export const TwoServers: Story = { args: { destinations: [official, team] } }
export const WorkspaceOrBucket: Story = { args: { destinations: [official, bucket] } }
export const Uploading: Story = {
  args: { state: { kind: 'saving', sentBytes: 14.2 * 1024 ** 2, totalBytes: 38.5 * 1024 ** 2 } }
}
export const TooLarge: Story = {
  args: { state: { kind: 'error', reason: 'too-large', limitBytes: 256 * 1024 ** 2 } }
}
export const Offline: Story = { args: { state: { kind: 'error', reason: 'offline' } } }
