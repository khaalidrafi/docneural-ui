// org-roam-lite-ui API types — the subset docneural-ui consumes.
//
// These mirror org-roam's wire shape: a doc node is a FILE-level Roam node
// (level 0 — orui's default filter shows file nodes only, and every docneural
// doc IS one .org file), links are `id:` citations. docneural-ui's
// graph/roamBridge.ts::toRoam is the only producer; see its comments for why
// level/pos/olp/properties must ride along inert.
export type OrgRoamNode = {
  id: string
  file: string
  title: string
  /** 0 = FILE node. Must stay 0: orui's default filter (maxLevel 0) hides
   *  everything else, and every docneural doc is one file. */
  level: number
  pos: number
  olp: string[] | null
  properties: Record<string, string>
  tags: string[]
}

export type OrgRoamLink = {
  source: string
  target: string
  /** 'id' = an id: citation resolved at export time. */
  type: string
}

export type OrgRoamGraphReponse = {
  nodes: OrgRoamNode[]
  links: OrgRoamLink[]
  tags: string[]
}
