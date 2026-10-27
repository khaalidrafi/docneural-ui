// Wire shapes for the org-roam-lite-ui graph snapshot ("graphdata" message).
// Moved verbatim from the root api.d.ts of the old Next.js app; the elisp
// side (org-roam-lite-ui--send-graphdata) is the source of truth for these fields.

export type OrgRoamGraphReponse = {
  nodes: OrgRoamNode[]
  links: OrgRoamLink[]
  tags: string[]
}

export type OrgRoamNode = {
  id: string
  file: string
  title: string
  level: number
  pos: number
  olp: string[] | null
  properties: {
    [key: string]: string | number
  }
  tags: string[]
}

export type OrgRoamLink = {
  source: string
  target: string
  type: string
}
