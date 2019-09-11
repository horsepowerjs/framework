import { Context, runInContext } from 'vm'

export default async function (context: Context, element: HTMLElement, attrName: string) {
  // Get the value to bind to
  let attr = (element.getAttribute(attrName) || '').split(/\s/)[0]
  element.removeAttribute(attrName)

  // Set the default result
  let result: any = undefined
  try { result = runInContext(attr, context) } catch (e) { }

  // If the result is an object or an array stringify it
  if (Array.isArray(result) || result instanceof Object) result = JSON.stringify(result)
  // Convert the result to a string or leave as undefined
  else result = typeof result != 'undefined' ? result.toString() : undefined

  // If the result is not undefined add the attribute
  typeof result != 'undefined' && element.setAttribute(attrName.replace(/^:/, ''), result)
}