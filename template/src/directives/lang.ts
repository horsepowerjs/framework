import { Template } from '../helpers/extend'
import { Client, Lang } from '@horsepower/server'
import { TemplateData } from '..'
import { replaceVariables } from '../helpers'

export default async function (client: Client, root: Template, element: Element, templateData: TemplateData) {
  if (element.ownerDocument) {
    // let text = await client.trans(replaceVariables(element.getAttribute('key') || '', templateData))
    return element.replaceWith(await createElement(client, element, templateData) as Element)
    // let store = Storage.mount('resources')
    // let [file] = (element.getAttribute('key') || '').split('.')
    // if (await store.exists(path.join('lang', client.getLocale(), `${file}.json`))) {
    //   let langData = JSON.parse((await store.read(path.join('lang', client.getLocale(), `${file}.json`)) || '{}').toString()) as Lang
    //   return element.replaceWith(await createElement(client, element, templateData, langData) as Element)
    // }
  }
  element.replaceWith(await createElement(client, element, templateData) as Element)
}

async function createElement(client: Client, element: Element, templateData: TemplateData, data?: Lang) {
  if (!element.ownerDocument) return
  let key = replaceVariables(element.getAttribute('key') || '', templateData)
  // let [, ...keyPath] = replaceVariables(key, templateData).split('.')
  let tag = replaceVariables(element.getAttribute('tag') || 'span', templateData)
  let defaultVal = element.getAttribute('default') || ''

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
  // let val: string = keyPath.reduce<any>((obj, val) => obj && obj[val] && obj[val] || element.innerHTML, data || {}).toString()
  let val = await client.trans(key)
  if (!val && defaultVal) val = defaultVal

  // Replace the placeholders with actual data
  // This will replace ":languageValue" with the attribute value and "{{$templateValue}}" with the value from the template data
  for (let i of element.attributes) {
    if (i.name.startsWith(':')) {
      val = val.replace(new RegExp(i.name, 'g'), replaceVariables(i.value, templateData))
    }
  }

  el.innerHTML = val
  return el
}