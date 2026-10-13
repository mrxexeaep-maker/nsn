import { params } from '@nanostores/i18n'

import { i18n } from '#vue/i18n/create'

export const storageMessageDefaults = {
  workspace: 'Storage workspace',
  openWorkspace: 'Open workspace',
  newStoredDocument: 'New document',
  emptyStorageWorkspace: 'No stored documents yet.',
  loadingDocuments: 'Loading documents…',
  notConfigured: 'Configure storage before using this workspace.',
  providerS3: 'S3 storage',
  providerR2: 'Cloudflare R2',
  providerAmazonS3: 'Amazon S3',
  providerBackblaze: 'Backblaze B2',
  loadingWorkspace: 'Loading storage workspace…',
  copyCors: 'Copy CORS JSON',
  providerOther: 'Other',
  corsSetupNotice: 'The web app needs a one-time bucket setup before it can connect.',
  corsSetupOpen: 'Setup steps',
  corsSetupTitle: 'Set up your bucket for the web app',
  corsSetupDescription: params(
    'Your bucket must allow requests from {origin}. You only do this once. The desktop app doesn’t need it.'
  ),
  corsSetupProviders: 'Storage provider',
  corsSetupB2Key:
    'In the Backblaze web console, open Application Keys. Use your master application key, or add a key that can change bucket settings.',
  corsSetupB2Install: 'Install the B2 command-line tool:',
  corsSetupB2SignIn: 'Sign in with that key:',
  corsSetupB2Run: 'Run this command. Your site and bucket are already filled in:',
  corsSetupR2Open:
    'In the Cloudflare dashboard, open R2, select your bucket, then open Settings and find CORS policy.',
  corsSetupAWSOpen:
    'In the AWS console, open your bucket, then Permissions, and choose Edit under Cross-origin resource sharing (CORS).',
  corsSetupOtherOpen: 'Open your provider’s bucket settings or command-line tool.',
  corsSetupPaste: 'Paste these CORS rules and save:',
  corsSetupWait: 'Wait about a minute, then test the connection again.',
  corsSetupHelp: 'Provider instructions',
  unreachable: 'Your browser couldn’t reach this bucket',
  unreachableDetail:
    'Usually the bucket doesn’t allow this site yet, or the bucket name doesn’t match exactly. Bucket names are case-sensitive.',
  endpoint: 'Endpoint',
  bucket: 'Bucket',
  region: 'Region',
  accessKeyID: 'Access key ID',
  secretAccessKey: 'Secret access key',
  cloudTitle: 'OpenPencil Cloud',
  cloudDescription:
    'Your team’s workspace, hosted for you: live sync, share links, team libraries, and hosted AI, with no bucket to set up. Join the waitlist and we’ll email you when it opens.',
  waitlistEmail: 'Email address',
  waitlistPlaceholder: 'you@example.com',
  waitlistJoin: 'Join the waitlist',
  waitlistConfirmHuman: 'Confirm you’re human',
  waitlistInvalid: 'Enter a valid email address.',
  waitlistJoined: 'Check your inbox',
  waitlistJoinedDetail:
    'Open the link we sent to confirm your address. We only email you about OpenPencil Cloud.',
  waitlistRefused: 'We couldn’t confirm you’re not a bot. Try again.',
  waitlistLimited: 'Too many attempts. Try again in a minute.',
  waitlistFailed: 'Couldn’t reach the waitlist. Check your connection and try again.',
  waitlistUnavailable: 'You can’t join from here. Join on openpencil.dev instead.',
  waitlistOpenWebsite: 'Join on openpencil.dev'
} as const

export const storageMessages = i18n('storage', storageMessageDefaults)
