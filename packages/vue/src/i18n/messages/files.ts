import { params } from '@nanostores/i18n'

import { i18n } from '#vue/i18n/create'

export const filesMessageDefaults = {
  expressionWarningHeading: 'Some variable expressions are not supported',
  expressionWarningDescription: params(
    '{count} variables use unsupported expressions. Saved layer values are shown instead; appearance and mode changes may differ. Expressions are preserved when saving. Adding or removing modes, editing these values, duplication, and transfer to another document are unavailable.'
  ),
  unsupportedExpressionValue: 'Unsupported expression',
  unsupportedExpressionDependency:
    'This resource is used by a preserved expression. Delete the dependent expression first, or delete their entire collection together.',
  unsupportedExpressionModes:
    'Modes cannot be added or removed while this collection contains unsupported expressions.',
  importLabel: 'Import',
  importHTMLCSS: 'Import HTML/CSS',
  importHTMLCSSDescription: 'Paste HTML plus optional CSS or compiled Tailwind CSS.',
  importFailed: 'Import failed. Check the HTML and CSS, then try again.',
  importReplacesDocument: 'Import replaces the current document.',
  importing: 'Importing…',
  importToCanvas: 'Import to canvas',
  newTab: 'New tab',
  closeTab: params('Close {name}'),
  unsavedChanges: 'Unsaved changes',
  saveBeforeClosing: params('Save changes to “{name}”?'),
  saveBeforeClosingDescription: 'Your changes will be discarded if you close without saving.',
  discard: 'Don’t Save',
  clipboardImageUnavailableWeb:
    'Pasted design includes 1 image that cannot be loaded in the web app. Use the desktop app to include it.',
  clipboardImagesUnavailableWeb: params(
    'Pasted design includes {count} images that cannot be loaded in the web app. Use the desktop app to include them.'
  ),
  clipboardImageFetchFailed:
    'Failed to fetch 1 image from Figma. Check that the source file is accessible and try again.',
  clipboardImagesFetchFailed: params(
    'Failed to fetch {count} images from Figma. Check that the source file is accessible and try again.'
  ),
  recentFiles: 'Recent files',
  recentFilesDescription: 'Continue working on a design or start a new one.',
  noRecentFiles: 'No recent files yet',
  noRecentFilesDescription: 'Files you open in the desktop app will appear here.',
  searchFiles: 'Search files…',
  searchRecentAndStorageFiles: 'Search recent and storage files…',
  newDesign: 'New design',
  newDesignIn: params('New design in {place}'),
  noMatchingFiles: params('No files match “{query}”.'),
  saveAsPrompt: 'Save as:',
  browserFileAPINotSupported:
    "Your browser doesn't support the local file API. Files will be downloaded instead of saved in place."
} as const

export const filesMessages = i18n('files', filesMessageDefaults)
