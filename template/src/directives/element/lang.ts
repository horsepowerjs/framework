import { Template } from '../../helpers/extend'
import { Client } from '@horsepower/server'
import { Context, runInContext } from 'vm'

export default async function (context: Context, client: Client, root: Template, element: Element) {
  if (element.ownerDocument) {
    // let text = await client.trans(replaceVariables(element.getAttribute('key') || '', templateData))
    return element.replaceWith(await createElement(client, element, context) as Element)
    // let store = Storage.mount('resources')
    // let [file] = (element.getAttribute('key') || '').split('.')
    // if (await store.exists(path.join('lang', client.getLocale(), `${file}.json`))) {
    //   let langData = JSON.parse((await store.read(path.join('lang', client.getLocale(), `${file}.json`)) || '{}').toString()) as Lang
    //   return element.replaceWith(await createElement(client, element, templateData, langData) as Element)
    // }
  }
  element.replaceWith(await createElement(client, element, context) as Element)
}

async function createElement(client: Client, element: Element, context: Context) {
  if (!element.ownerDocument) return
  let key = (element.getAttribute('key') || '').replace(/\{\{(.+?)\}\}/g, (full, key) => {
    try { return runInContext(key, context) } catch (e) { return full }
  })
  let tag = element.getAttribute('tag') || 'span'
  let defaultVal = element.getAttribute('default') || element.innerHTML || ''

  element.removeAttribute('tag')
  element.removeAttribute('key')
  element.removeAttribute('default')

  // Create the element based on the users defined element or use a "span" element
  let el = element.ownerDocument.createElement(tag)

  // Copy the attributes from the lang tag to the new tag
  for (let i of element.attributes) {
    !i.name.startsWith(':') && el.setAttribute(i.name, i.value)
  }

  // Get the string from the json file
  let val = await client.trans(key)
  if (!val && defaultVal) val = defaultVal

  // Replace placeholders in the translations such as ":name" or ":time"
  val = val.split(/\s/).map(i => i.startsWith(':') ? runInContext(i.replace(/^:/, ''), context) : i).join(' ')

  // Replace the placeholders with actual data
  // This will replace ":languageValue" with the attribute value and "{{$templateValue}}" with the value from the template data
  // for (let i of element.attributes) {
  //   if (i.name.startsWith(':')) {
  //     // val = val.replace(new RegExp(i.name, 'g'), replaceVariables(i.value, templateData))
  //   }
  // }

  el.innerHTML = val
  return el
}