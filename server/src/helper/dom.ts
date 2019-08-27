export function method(method: string) {
  return `<input type="hidden" name="_method" value="${method.toUpperCase()}">`
}

export function htmlentities(string: string) {
  return string
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
  // .replace(/"/g, '&quote;')
}