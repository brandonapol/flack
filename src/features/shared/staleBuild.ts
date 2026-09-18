/**
 * A lazily loaded chunk that's gone: the page was opened before a new version was deployed, so
 * it asks for a file name that no longer exists. Reloading picks up the new build.
 */
export function isStaleBuildError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)
  return /dynamically imported module|Importing a module script failed|error loading dynamically imported module|ChunkLoadError|Loading chunk/i.test(
    message
  )
}
