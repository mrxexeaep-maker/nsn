<script setup lang="ts">
import { useFileDialog } from '@vueuse/core'
import { computed, ref, watch } from 'vue'

import { useCloudPortalMessages } from '@open-pencil/vue/i18n'

import AccountAvatar from '@/components/presence/AccountAvatar.vue'
import SettingsGroup from '@/components/settings/layout/SettingsGroup.vue'
import SettingsRow from '@/components/settings/layout/SettingsRow.vue'
import SettingsSection from '@/components/settings/layout/SettingsSection.vue'
import AppButton from '@/components/ui/button/AppButton.vue'
import AppCopyField from '@/components/ui/input/AppCopyField.vue'
import AppInput from '@/components/ui/input/AppInput.vue'
import { portalForm } from '@/theme/cloud-portal/form'

/**
 * How a person appears on a Cloud server: their name, which they change here, their email, which
 * changes through a link sent to the new address, their picture, and the account ID an
 * administrator asks for.
 */
const {
  profile,
  emailChangeAvailable = true,
  busy = false
} = defineProps<{
  profile: {
    id: string
    name: string
    email: string
    image: string | null
    memberSince: string
  }
  /** Whether the server can send the link a new address needs. */
  emailChangeAvailable?: boolean
  busy?: boolean
}>()
const emit = defineEmits<{
  rename: [name: string]
  changeEmail: []
  choosePicture: [file: File]
  removePicture: []
}>()

const ui = portalForm()
const messages = useCloudPortalMessages()
const name = ref(profile.name)
watch(
  () => profile.name,
  (next) => {
    name.value = next
  }
)
const { open: pickPicture, onChange: onPicture } = useFileDialog({
  accept: 'image/png,image/jpeg,image/webp,image/gif',
  multiple: false,
  reset: true
})
onPicture((files) => {
  const file = files?.[0]
  if (file) emit('choosePicture', file)
})
const renamed = computed(() => {
  const value = name.value.trim()
  return value.length > 0 && value !== profile.name
})
</script>

<template>
  <div class="flex max-w-2xl flex-col gap-6">
    <div class="flex items-center gap-3">
      <AccountAvatar :id="profile.id" :name="profile.name" :image="profile.image" size="lg" />
      <div class="min-w-0">
        <p class="truncate text-sm font-semibold text-surface">{{ profile.name }}</p>
        <p class="truncate text-xs text-muted">{{ profile.email }}</p>
        <p class="mt-0.5 text-[11px] text-muted">
          {{ messages.memberSince({ date: profile.memberSince }) }}
        </p>
      </div>
    </div>

    <SettingsSection>
      <template #title>{{ messages.detailsSection }}</template>
      <template #description>{{ messages.detailsSectionDescription }}</template>
      <SettingsGroup>
        <form
          class="flex flex-col gap-1.5 px-3 py-2.5"
          novalidate
          @submit.prevent="renamed && emit('rename', name.trim())"
        >
          <label for="portal-profile-name" :class="ui.label()">{{ messages.name }}</label>
          <div class="flex items-center gap-2">
            <AppInput
              id="portal-profile-name"
              v-model="name"
              autocomplete="name"
              maxlength="100"
              :disabled="busy"
              :ui="{ root: 'flex-1' }"
            />
            <AppButton v-if="renamed" type="submit" size="sm" variant="outline" :disabled="busy">
              {{ messages.save }}
            </AppButton>
          </div>
        </form>
        <SettingsRow
          :label="messages.email"
          :description="emailChangeAvailable ? profile.email : messages.emailChangeUnavailable"
        >
          <AppButton
            v-if="emailChangeAvailable"
            size="sm"
            variant="outline"
            :disabled="busy"
            @click="emit('changeEmail')"
          >
            {{ messages.changeEmail }}
          </AppButton>
        </SettingsRow>
        <SettingsRow
          :label="messages.picture"
          :description="profile.image ? messages.pictureShown : messages.pictureInitials"
        >
          <div class="flex items-center gap-2">
            <AppButton
              v-if="profile.image"
              size="sm"
              variant="ghost"
              :disabled="busy"
              @click="emit('removePicture')"
            >
              {{ messages.removePicture }}
            </AppButton>
            <AppButton size="sm" variant="outline" :disabled="busy" @click="pickPicture()">
              {{ profile.image ? messages.changePicture : messages.uploadPicture }}
            </AppButton>
            <AccountAvatar :id="profile.id" :name="profile.name" :image="profile.image" size="md" />
          </div>
        </SettingsRow>
      </SettingsGroup>
    </SettingsSection>

    <SettingsSection>
      <template #title>{{ messages.accountId }}</template>
      <template #description>{{ messages.accountIdDescription }}</template>
      <AppCopyField
        :value="profile.id"
        :copy-label="messages.copy"
        :copied-label="messages.copied"
      />
    </SettingsSection>
  </div>
</template>
