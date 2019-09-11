import { step } from '../../helpers'
import { Template } from '../../helpers/extend'
import { Client } from '@horsepower/server'
import { Context, runInContext } from 'vm'

// <for :="i from 10 through 15">{{$i}}</for> <!-- 10,11,12,13,14,15 -->
// <for :="i from 10 thru 15">{{$i}}</for>    <!-- 10,11,12,13,14,15 -->
// <for :="i from 10 to 15">{{$i}}</for>      <!-- 10,11,12,13,14 -->

export default async function (context: Context, client: Client, root: Template, element: Element) {
  let query = element.getAttribute(':')
  if (query && element.ownerDocument) {
    let [name, startStr, method, endStr] = query.replace(/\s\s+/g, ' ')
      .split(/(\w+) from (-?\d+|\{\{\$\w+\}\}) (through|thru|to) (-?\d+|\{\{\$\w+\}\})/i).filter(String)

    if (!name && !startStr && !method && !endStr) {
      return element.remove()
    }

    function makeNode(element: Element, frag: DocumentFragment, key: string, i: number) {
      for (let child of element.childNodes) {
        let clone = child.cloneNode(true)
        if (clone instanceof root.dom.window.Element) {
          clone.innerHTML = clone.innerHTML.replace(/\{\{(.+?)\}\}/g, (full, itm) => {
            try { return runInContext(itm || '', context) || '' } catch (e) { return full }
          })
        }
        step(context, client, root, clone)
        frag.appendChild(clone)
      }
    }

    let start = parseFloat(startStr) || 0
    let end = parseFloat(endStr) || 0

    let frag = element.ownerDocument.createDocumentFragment()
    switch (method) {
      case 'through':
      case 'thru':
        if (start < end) {
          for (let i = start; i <= end; i++) {
            context[name] = i
            makeNode(element, frag, name, i)
          }
          delete context[name]
        } else {
          for (let i = start; i >= end; i--) {
            context[name] = i
            makeNode(element, frag, name, i)
          }
          delete context[name]
        }
        break;
      case 'to':
        if (start < end) {
          for (let i = start; i < end; i++) {
            context[name] = i
            makeNode(element, frag, name, i)
          }
          delete context[name]
        } else {
          for (let i = start; i > end; i--) {
            context[name] = i
            makeNode(element, frag, name, i)
          }
          delete context[name]
        }
        break;
    }
    element.replaceWith(frag)
  }
}