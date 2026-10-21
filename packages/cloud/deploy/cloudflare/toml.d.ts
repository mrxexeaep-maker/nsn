// Wrangler bundles deployment TOML files as text (`rules` in wrangler.jsonc).
declare module '*.toml' {
  const source: string
  export default source
}
