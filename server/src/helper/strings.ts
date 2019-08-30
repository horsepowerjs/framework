export function slug(text: string, slug: string = '-'): string {
  const esc = str => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return text
    // Replace values with a slug
    .replace(/[^\w]/g, slug)
    // Replace duplicate slug values
    .replace(new RegExp(`${esc(slug)}${esc(slug)}+`, 'g'), slug)
    // Replace slugs at the begging and end of the line
    .replace(new RegExp(`^${esc(slug)}+|${esc(slug)}+$`, 'g'), '')
    .toLowerCase()
}

export function title(text: string): string {
  return text
    .toLowerCase()
    .split(' ')
    .map((s) => s.charAt(0).toUpperCase() + s.substring(1))
    .join(' ')
}

export function limit(text: string, limit: number, ellipsis: string): string
export function limit(text: string, limit: number): string
export function limit(text: string, ellipsis: string): string
export function limit(...args: (string | number)[]): string {
  let text = args[0] as string
  let limit = (args.length == 3 ? args[1] : args.length == 2 && typeof args[1] == 'number' ? args[1] : 20) as number
  let ellipsis = (args.length == 3 ? args[2] : args.length == 2 && typeof args[1] == 'string' ? args[1] : '...') as string
  let slice = text.slice(0, limit)
  return text.length > slice.length ? slice + ellipsis : slice
}

export function start(text: string, value: string): string {
  return text.startsWith(value) ? text : value + text
}

export function finish(text: string, value: string): string {
  return text.endsWith(value) ? text : text + value
}

export function random(length: number) {
  const str = () => (Math.random() * Date.now()).toString(32)
  let text = ''
  do { text += str().replace(/[^\w]/g, '') } while (text.length < length)
  return text.substr(0, length)
}

export function json(data: any) {
  return JSON.stringify(data)
}

export function entities(text: string) {
  return text.replace(/[\u00A0-\u9999<>\&]/gim, (i) => '&#' + i.charCodeAt(0) + ';')
}