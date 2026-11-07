/** Minimal allow-list-ish sanitizer for exported org HTML before it meets
 *  {@html}. The exporter emits semantic prose markup, but bodies travel
 *  (imports, later exports, pipeline slips) — one pass closes the whole
 *  script/handler/javascript:-URL class instead of trusting the source.
 *  No dependencies, no surprise rewrites: it only REMOVES.
 *
 *  The kill RULES are pure functions (node-testable); the DOM walk is the
 *  only environment-dependent part and degrades to identity without a
 *  parser (crawler/jsdom). */

const KILL_TAGS = 'script,iframe,frame,frameset,object,embed,link,meta,base,form'
const URL_ATTRS = new Set(['href', 'src', 'xlink:href', 'action', 'formaction'])

/** Event-handler attributes (onclick, onerror, …) are never welcome. */
export function isHandlerAttr(name: string): boolean {
  return name.toLowerCase().startsWith('on')
}

/** URL-bearing attributes may not carry script payloads. data: images and
 *  other data: media stay — only data:text/html is a script carrier. */
export function isBlockedUrl(name: string, value: string): boolean {
  if (!URL_ATTRS.has(name.toLowerCase())) return false
  const v = value.trim().toLowerCase()
  return v.startsWith('javascript:') || v.startsWith('data:text/html')
}

export function sanitizeHtml(dirty: string): string {
  if (typeof DOMParser !== 'function') return dirty // non-DOM env: untouched
  const doc = new DOMParser().parseFromString(dirty, 'text/html')
  doc.querySelectorAll(KILL_TAGS).forEach((el) => el.remove())
  doc.querySelectorAll('*').forEach((el) => {
    for (const attr of [...el.attributes]) {
      if (isHandlerAttr(attr.name) || isBlockedUrl(attr.name, attr.value)) {
        el.removeAttribute(attr.name)
      }
    }
  })
  return doc.body.innerHTML
}
