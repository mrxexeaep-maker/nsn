<script setup lang="ts">
import { computed, ref, watch } from 'vue'

import { useCommonMessages, useStorageMessages } from '@open-pencil/vue'

import {
  buildB2CORSCommand,
  buildCORSConfigurationJSON,
  s3HostFromEndpoint,
  type S3Host
} from '@/app/integrations/storage'
import SettingsLink from '@/components/settings/layout/SettingsLink.vue'
import AppButton from '@/components/ui/button/AppButton.vue'
import { AppDialog } from '@/components/ui/dialog'
import AppCopyField from '@/components/ui/input/AppCopyField.vue'
import SegmentedControl from '@/components/ui/select/SegmentedControl.vue'

const HELP_URLS: Partial<Record<S3Host, string>> = {
  b2: 'https://www.backblaze.com/docs/cloud-storage-enable-cors-with-the-cli',
  r2: 'https://developers.cloudflare.com/r2/buckets/cors/',
  aws: 'https://docs.aws.amazon.com/AmazonS3/latest/userguide/enabling-cors-examples.html'
}

const { endpoint, bucket } = defineProps<{ endpoint: string; bucket: string }>()
const open = defineModel<boolean>('open', { default: false })
const storage = useStorageMessages()
const common = useCommonMessages()

const origin = window.location.origin
const host = ref<S3Host>('other')
// Each opening starts on the provider the endpoint points at; the user may still switch.
watch(open, (isOpen) => {
  if (isOpen) host.value = s3HostFromEndpoint(endpoint) ?? 'other'
})

const hosts = computed((): { value: S3Host; label: string }[] => [
  { value: 'b2', label: storage.value.providerBackblaze },
  { value: 'r2', label: storage.value.providerR2 },
  { value: 'aws', label: storage.value.providerAmazonS3 },
  { value: 'other', label: storage.value.providerOther }
])
const selectedHost = computed({
  get: () => host.value,
  set: (value: string) => {
    const match = hosts.value.find((option) => option.value === value)
    if (match) host.value = match.value
  }
})
const bucketName = computed(() => bucket.trim() || 'YOUR-BUCKET')
const b2Command = computed(() => buildB2CORSCommand(origin, bucketName.value))
const rulesJSON = computed(() => buildCORSConfigurationJSON([origin]))
const helpURL = computed(() => HELP_URLS[host.value])
const openStep = computed(() => {
  if (host.value === 'r2') return storage.value.corsSetupR2Open
  if (host.value === 'aws') return storage.value.corsSetupAWSOpen
  return storage.value.corsSetupOtherOpen
})
</script>

<template>
  <AppDialog
    v-model:open="open"
    size="md"
    :heading="storage.corsSetupTitle"
    :description="storage.corsSetupDescription({ origin })"
    :close-label="common.close"
    data-test-id="storage-cors-setup-dialog"
  >
    <div class="flex min-w-0 flex-col gap-4 text-xs">
      <SegmentedControl
        v-model="selectedHost"
        :options="hosts"
        :label="storage.corsSetupProviders"
        :ui="{ root: 'self-start' }"
      />
      <ol class="flex list-decimal flex-col gap-3 pl-4 marker:text-muted">
        <template v-if="host === 'b2'">
          <li>{{ storage.corsSetupB2Key }}</li>
          <li class="space-y-1.5">
            {{ storage.corsSetupB2Install }}
            <AppCopyField
              value="pip install b2"
              :copy-label="common.copy"
              :copied-label="common.copied"
            />
          </li>
          <li class="space-y-1.5">
            {{ storage.corsSetupB2SignIn }}
            <AppCopyField
              value="b2 account authorize"
              :copy-label="common.copy"
              :copied-label="common.copied"
            />
          </li>
          <li class="space-y-1.5">
            {{ storage.corsSetupB2Run }}
            <AppCopyField
              :value="b2Command"
              :copy-label="common.copy"
              :copied-label="common.copied"
              data-test-id="storage-cors-setup-command"
            />
          </li>
        </template>
        <template v-else>
          <li>{{ openStep }}</li>
          <li class="space-y-1.5">
            {{ storage.corsSetupPaste }}
            <AppCopyField
              :value="rulesJSON"
              :copy-label="common.copy"
              :copied-label="common.copied"
              :ui="{ root: 'items-start', value: 'max-h-48 overflow-y-auto whitespace-pre-wrap' }"
              data-test-id="storage-cors-setup-rules"
            />
          </li>
        </template>
        <li>{{ storage.corsSetupWait }}</li>
      </ol>
    </div>
    <template #footer>
      <SettingsLink v-if="helpURL" :href="helpURL" class="mr-auto">{{
        storage.corsSetupHelp
      }}</SettingsLink>
      <AppButton @click="open = false">{{ common.done }}</AppButton>
    </template>
  </AppDialog>
</template>
