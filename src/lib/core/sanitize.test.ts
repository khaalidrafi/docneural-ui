import { describe, expect, it } from 'vitest'
import { isHandlerAttr, isBlockedUrl, sanitizeHtml } from './sanitize'

// Node-environment suite: the kill RULES are pure and fully tested here;
// sanitizeHtml itself degrades to identity without DOMParser (crawler/jsdom),
// which the last case pins down.

describe('isHandlerAttr — event handlers are never welcome', () => {
  it('catches every on* spelling', () => {
    expect(isHandlerAttr('onclick')).toBe(true)
    expect(isHandlerAttr('onerror')).toBe(true)
    expect(isHandlerAttr('onmouseover')).toBe(true)
  })
  it('leaves normal attributes alone', () => {
    expect(isHandlerAttr('href')).toBe(false)
    expect(isHandlerAttr('class')).toBe(false)
    expect(isHandlerAttr('data-onion')).toBe(false) // prefix ≠ handler
  })
})

describe('isBlockedUrl — script URLs in URL-bearing attributes', () => {
  it('blocks javascript: and data:text/html on URL attributes', () => {
    expect(isBlockedUrl('href', 'javascript:alert(1)')).toBe(true)
    expect(isBlockedUrl('SRC', '  data:text/html,<b>x</b>')).toBe(true)
    expect(isBlockedUrl('formaction', 'JavaScript:void(0)')).toBe(true)
  })
  it('keeps safe schemes and data media', () => {
    expect(isBlockedUrl('href', 'https://ok.example')).toBe(false)
    expect(isBlockedUrl('href', '#anchor')).toBe(false)
    expect(isBlockedUrl('src', 'data:image/png;base64,AAAA')).toBe(false)
  })
  it('ignores non-URL attributes entirely', () => {
    expect(isBlockedUrl('title', 'javascript:alert(1)')).toBe(false)
  })
})

describe('sanitizeHtml — contract without DOMParser', () => {
  it('degrades to identity in non-DOM environments', () => {
    const body = '<p>hi</p><script>alert(1)</script>'
    expect(sanitizeHtml(body)).toBe(body)
  })
})
