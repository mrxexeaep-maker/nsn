import * as v from 'valibot'
import { createMarkdownRenderer } from 'vitepress'

import { classifyAsset, type Release, type Releases } from '../download/releases'

declare const data: Releases
export { data }

const RELEASES_URL = 'https://api.github.com/repos/open-pencil/open-pencil/releases?per_page=30'

const ReleaseSchema = v.object({
  tag_name: v.string(),
  html_url: v.string(),
  published_at: v.nullable(v.string()),
  draft: v.boolean(),
  prerelease: v.boolean(),
  body: v.nullable(v.string()),
  assets: v.array(v.object({ name: v.string(), browser_download_url: v.string(), size: v.number() }))
})
type GitHubRelease = v.InferOutput<typeof ReleaseSchema>

const ReleasesResponse = v.pipe(v.string(), v.parseJson(), v.array(ReleaseSchema))

async function fetchReleases(): Promise<GitHubRelease[] | null> {
  // CI passes the workflow's token; a local build without one stays within the anonymous limit.
  const token = process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN
  try {
    const response = await fetch(RELEASES_URL, {
      headers: {
        accept: 'application/vnd.github+json',
        ...(token ? { authorization: `Bearer ${token}` } : {})
      }
    })
    if (!response.ok) throw new Error(`GitHub answered ${response.status}`)
    const parsed = v.safeParse(ReleasesResponse, await response.text())
    if (!parsed.success) throw new Error('GitHub sent releases in an unexpected shape')
    return parsed.output
  } catch (error) {
    console.warn(`[download] Releases unavailable, the page links to GitHub instead: ${error}`)
    return null
  }
}

/**
 * The latest stable release and any newer beta, read from GitHub when the site is built, so the
 * download page is static: no request leaves the visitor's browser. A build that cannot reach
 * GitHub gives a page that links to the releases there instead.
 */
export default {
  async load(): Promise<Releases> {
    const releases = await fetchReleases()
    if (!releases) return { stable: null, beta: null }
    const published = releases.filter((release) => !release.draft && release.published_at)
    const stable = published.find((release) => !release.prerelease)
    const beta = published.find(
      (release) =>
        release.prerelease &&
        (!stable?.published_at || (release.published_at ?? '') > stable.published_at)
    )
    const markdown = await createMarkdownRenderer(process.cwd())
    const toRelease = (release: GitHubRelease): Release => ({
      version: release.tag_name.replace(/^v/, ''),
      date: release.published_at ?? '',
      url: release.html_url,
      files: release.assets.flatMap((asset) => {
        const file = classifyAsset({
          name: asset.name,
          url: asset.browser_download_url,
          size: asset.size
        })
        return file ? [file] : []
      }),
      checksums:
        release.assets.find((asset) => asset.name === 'SHA256SUMS')?.browser_download_url ?? null,
      notes: markdown.render(release.body ?? '')
    })
    return { stable: stable ? toRelease(stable) : null, beta: beta ? toRelease(beta) : null }
  }
}
