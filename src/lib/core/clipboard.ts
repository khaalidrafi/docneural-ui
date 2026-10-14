// clipboard.ts — copy text, in the two worlds this site runs in.
//
// navigator.clipboard needs a secure context, which covers https:// (the
// tunnel) and localhost but NOT http://192.168.x.x:5173 — the plain-IP dev
// server. There the async API is simply absent, so the legacy execCommand
// path is not a curiosity here, it is the only way a copy works on a phone
// pointed at the LAN address.

/** True when the text reached the clipboard. Never throws. */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    /* fall through to the legacy path */
  }
  try {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.setAttribute('readonly', '')
    // Off-screen but rendered: a display:none textarea cannot be selected.
    ta.style.cssText = 'position:fixed;top:0;left:-9999px;'
    document.body.appendChild(ta)
    ta.select()
    const ok = document.execCommand('copy')
    ta.remove()
    return ok
  } catch {
    return false
  }
}
