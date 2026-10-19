<script setup lang="ts">
import { useClipboard, useShare } from '@vueuse/core'
import { computed, ref, shallowRef, watch } from 'vue'

import type { DocumentPermission } from '@open-pencil/cloud/contract'
import { useCloudMessages, useI18n, useViewportKind } from '@open-pencil/vue'

import { cloudConnection } from '@/app/cloud/sessions/connection'
import { cloudShareOpen } from '@/app/cloud/sharing/dialog'
import {
  changeCloudLink,
  changeCloudMember,
  cloudLinkURL,
  cloudShareTarget,
  inviteToCloudDocument,
  readCloudSharing,
  resetCloudLink,
  type CloudShareLink,
  type CloudSharing
} from '@/app/cloud/sharing/document'
import { useActiveEditorStoreRef } from '@/app/editor/active-store'
import { toast } from '@/app/shell/ui'

import CloudShareDialog from './CloudShareDialog.vue'

/**
 * The active Cloud document's share dialog: who can open it and its link, managed on the server.
 * One for the app, so the header's Share button and the mobile one open the same dialog.
 */
const storeRef = useActiveEditorStoreRef()
const { locale } = useI18n()
const t = useCloudMessages()
const sharing = shallowRef<CloudSharing | null>(null)
const inviting = ref(false)
const { copy, copied } = useClipboard({ legacy: true })

const target = computed(() => {
  const binding = storeRef.value?.getStorageBinding()
  return binding ? cloudShareTarget(binding) : null
})
const workspace = computed(() => {
  const binding = storeRef.value?.getStorageBinding()
  if (!binding?.profileId) return null
  const found = cloudConnection(binding.profileId).workspaces.find(
    (candidate) => candidate.id === binding.containerId
  )
  return found ? { name: found.name, permission: 'edit' as const } : null
})
const expires = (iso: string) =>
  new Intl.DateTimeFormat(locale.value, { day: 'numeric', month: 'short' }).format(new Date(iso))
const members = computed(() =>
  (sharing.value?.members ?? []).map((member) => ({
    ...member,
    pendingUntil: member.pendingUntil ? expires(member.pendingUntil) : undefined
  }))
)

// Each read is numbered so a slower earlier one never replaces a newer one.
let latestRead = 0

async function refresh() {
  const current = target.value
  if (!current) return
  const read = ++latestRead
  try {
    const next = await readCloudSharing(current)
    if (read === latestRead && target.value?.documentId === current.documentId) sharing.value = next
  } catch {
    if (read === latestRead) toast.error(t.value.shareLoadFailed)
  }
}

/** Runs a change on the server and shows what it left. */
async function change(run: () => Promise<void>) {
  try {
    await run()
  } catch {
    toast.error(t.value.shareChangeFailed)
  }
  await refresh()
}

async function invite(email: string, permission: DocumentPermission) {
  const current = target.value
  if (!current) return
  inviting.value = true
  await change(() => inviteToCloudDocument(current, email, permission))
  inviting.value = false
}

function changeMember(id: string, permission: DocumentPermission | 'remove') {
  const current = target.value
  if (current) void change(() => changeCloudMember(current, id, permission))
}

function changeLink(link: CloudShareLink) {
  const current = target.value
  if (current) void change(() => changeCloudLink(current, link))
}

function resetLink() {
  const current = target.value
  if (current) void change(() => resetCloudLink(current))
}

const { share, isSupported: canShare } = useShare()
const { isMobile } = useViewportKind()
/** On a phone the link goes out through the system share sheet, as other apps send theirs. */
const sendsLink = computed(() => isMobile.value && canShare.value)

async function copyLink() {
  const current = target.value
  const url = current ? await cloudLinkURL(current) : null
  if (!url) return
  if (!sendsLink.value) {
    await copy(url)
    return
  }
  // Closing the sheet without sending is a choice, not a failure.
  await share({ title: storeRef.value?.state.documentName, url }).catch(() => undefined)
}

// Another document's members and link never show, or take changes, while this one's load.
watch(
  () => [cloudShareOpen.value, target.value?.documentId] as const,
  ([open], previous) => {
    if (target.value?.documentId !== previous?.[1]) sharing.value = null
    if (open) void refresh()
  }
)
</script>

<template>
  <CloudShareDialog
    v-if="target"
    v-model:open="cloudShareOpen"
    :document-name="storeRef?.state.documentName ?? ''"
    :workspace="workspace"
    :members="members"
    :link="sharing?.link ?? { access: 'restricted' }"
    :can-manage="sharing?.canManage ?? false"
    :links="sharing?.links"
    :inviting="inviting"
    :copied="copied"
    :sends-link="sendsLink"
    @invite="invite"
    @change-member="changeMember"
    @change-link="changeLink"
    @copy-link="copyLink"
    @reset-link="resetLink"
  />
</template>
