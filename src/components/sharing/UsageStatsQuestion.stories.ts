import type { Meta, StoryObj } from '@storybook/vue3-vite'
import { expect, userEvent, within } from 'storybook/test'

import {
  appPreferences,
  updateSharingPreferences,
  type UsageStatsConsent
} from '@/app/settings/preferences/store'
import { usageStatsPromptOpen } from '@/app/telemetry'

import UsageStatsPrompt from './UsageStatsPrompt.vue'
import UsageStatsQuestion from './UsageStatsQuestion.vue'

interface Args {
  consent: UsageStatsConsent
}

const meta = {
  title: 'App/Settings/Sharing/Usage Stats Question',
  component: UsageStatsQuestion,
  args: { consent: 'unset' },
  render: (args) => ({
    components: { UsageStatsQuestion },
    setup() {
      updateSharingPreferences({ usageStats: args.consent })
      return {}
    },
    template: '<div class="max-w-md"><UsageStatsQuestion framed /></div>'
  })
} satisfies Meta<Args>

export default meta
type Story = StoryObj<typeof meta>

/** On the welcome screen, below the AI introduction. */
export const Welcome: Story = {}

export const Accepted: Story = { args: { consent: 'granted' } }

export const Declined: Story = { args: { consent: 'denied' } }

/** Answering replaces the choices with the answer and where to change it. */
export const Answering: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Share stats' }))
    await expect(canvas.getByRole('status')).toHaveTextContent('Thank you.')
    await expect(appPreferences.value.sharing.usageStats).toBe('granted')
  }
}

/** For people who skipped the welcome or updated from an earlier version. */
export const LaterPrompt: Story = {
  render: () => ({
    components: { UsageStatsPrompt },
    setup() {
      updateSharingPreferences({ usageStats: 'unset' })
      usageStatsPromptOpen.value = true
      return {}
    },
    template: '<UsageStatsPrompt />'
  })
}
