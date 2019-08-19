import { step, getVariableValues, getScopeData, variableMatch } from '../helpers'
import { Template } from '../helpers/extend'
import { Mixin } from '../helpers/mixin'
import { TemplateData } from '..'
import { Client } from '@horsepower/server';

// <each :="[key, value] in {{$items}}">
//   <h1>{{$key}} -> {{$value}}</h1>
// </each>
//
// <each :="value in {{$items}}">
//   <h1>{{$value}}</h1>
// </each>

export default async function (client: Client, root: Template, element: Element, data: TemplateData, mixins: Mixin[], scope?: string) {
  let query = element.getAttribute(':')
  let nodes: Element[] = []

  // Get all the nodes in the current if block
  function getNext(element: Element) {
    if (!element.nextElementSibling) return
    let ref = element.nextElementSibling
    if (element.nextElementSibling.nodeName.toLowerCase() == 'else') {
      nodes.push(ref)
    }
  }

  // Find all nodes within the if/elif/else block
  getNext(element)

  if (query && element.ownerDocument) {
    let key = '', value = ''
    let [placeholderKeys, placeholderData] = query.split(' in ')
    if (!placeholderKeys || !placeholderData) {
      element.remove()
      return
    }
    placeholderKeys = placeholderKeys.trim()
    if (placeholderKeys.startsWith('[') && placeholderKeys.endsWith(']')) {
      [key, value] = placeholderKeys.replace(/^\[|\]$/g, '').split(',').map(i => i.trim())
    } else {
      // value = placeholderKeys
      key = placeholderKeys
    }

    // console.log('placeholder', JSON.stringify(placeholderData))
    let variable = getVariableValues(placeholderData)[0] || ''

    let frag = element.ownerDocument.createDocumentFragment()
    let breadcrumb = variable.split('.')
    // let search = (breadcrumb.length > 1 ? breadcrumb[0] : variable) || ''
    let scope = breadcrumb.length > 1 ? breadcrumb[0] : null

    // console.log(scope, breadcrumb, data)
    let dataObject = getScopeData(breadcrumb.join('.'), data, scope)

    // console.log(dataObject, scope)
    data.scopes.push({ reference: key, data: dataObject })
    // console.log(JSON.stringify(data.scopes))

    if (dataObject && typeof dataObject[Symbol.iterator] == 'function' && nodes.length > 0 && dataObject.length == 0) {
    } else if (dataObject && typeof dataObject[Symbol.iterator] == 'function') {
      for (let k in dataObject) {
        let v = dataObject[k]
        for (let child of element.childNodes) {
          let clone = child.cloneNode(true)
          if (clone.nodeType == root.dom.window.Node.TEXT_NODE && clone.textContent) {
            // console.log(clone.textContent, clone.textContent.replace(new RegExp(`\\{\\{(\\$${key}).*?\\}\\}`, 'g'), 'asdf'))
            clone.textContent = clone.textContent.replace(variableMatch(key), (full, v) => {
              // console.log(v, key, k)
              return getScopeData(v, data, key, k)
            })
          } else if (clone instanceof root.dom.window.HTMLElement) {
            // console.log(key)
            clone.innerHTML = clone.innerHTML.replace(variableMatch(key), (full, v) => {
              // clone.innerHTML = clone.innerHTML.replace(/\{\{(\$(?!(\d|\.))[.\w]+)(?![^\<]*\>)\}\}/g, (full, v) => {
              // console.log(full, v, key, k)
              return getScopeData(v, data, key, k)
            })
          }
          await step(client, root, clone, data, mixins)
          frag.appendChild(clone)
        }
      }
    }

    data.scopes.pop()


    // if (dataObject && typeof dataObject[Symbol.iterator] == 'function' && nodes.length > 0 && dataObject.length == 0) {
    //   for (let node of nodes) {
    //     if (node.nodeName.toLowerCase() == 'else') {
    //       for (let child of node.childNodes) {
    //         frag.appendChild(child.cloneNode(true))
    //       }
    //     }
    //   }
    //   element.replaceWith(frag)
    // } else if (dataObject && typeof dataObject[Symbol.iterator] == 'function') {
    //   if (dataObject.length == 0) {
    //     for (let child of element.children) {
    //       if (child.nodeName.toLowerCase() == 'empty') {
    //         for (let c of child.childNodes) {
    //           frag.appendChild(c.cloneNode(true))
    //         }
    //       }
    //     }
    //   } else {
    //     for (let k in dataObject) {
    //       let v = dataObject[k]
    //       for (let child of element.childNodes) {
    //         let clone = child.cloneNode(true)
    //         frag.appendChild(clone)
    //         // if (isHTMLElement(window || root.dom, clone)) {
    //         if (clone instanceof root.dom.window.HTMLElement) {
    //           let matches = clone.innerHTML.match(`\{\{.+?\}\}`)
    //           if (matches) {
    //             let match = matches[0]
    //             if (typeof v == 'object') {
    //               v = getData(dropFirst(match), v)
    //             }
    //             clone.innerHTML = clone.innerHTML
    //               .replace(new RegExp(match, 'g'), v)
    //             step(client, roote(new RegExp(`\{\{${key}\}\}`, 'g'), k)
    //             step(client, root, clone, dataObject, mixins)
    //           } else if (clone.textContent) {
    //             clone.textContent = clone.textContent
    //               .replace(new RegExp(`\{\{${value}\}\}`, 'g'), v)
    //               .replace(new RegExp(`\{\{${key}\}\}`, 'g'), k)
    //           }
    //         }
    //       }
    //     }
    //   }
    // }
    element.replaceWith(frag)
  }
  for (let node of nodes) {
    node.remove()
  }
}