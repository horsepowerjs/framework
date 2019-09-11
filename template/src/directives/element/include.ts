import * as path from 'path'
import { Template } from '../../helpers/extend'
import { step, makeFragment, toExec } from '../../helpers'
import { Client } from '@horsepower/server'
import { Storage } from '@horsepower/storage'
import { Context, runInContext } from 'vm'

// <include file="../abc/123"></include>
// <require file="../abc/123"></require>
// TODO: Add support for self closing tags

/**
 * Includes a file and if the file doesn't exist just continue rendering the template
 *
 * @export
 * @param {Template} root The root template
 * @param {Element} element The current element `<include ...>`
 * @param {TemplateData} data The template data
 * @param {Mixin[]} mixins
 */
export async function includeBlock(context: Context, client: Client, root: Template, element: Element) {
  let inclFileName = element.getAttribute('file')
  if (typeof inclFileName == 'string' && element.ownerDocument && inclFileName.length > 0) {
    inclFileName = <string>(runInContext(toExec(inclFileName), context) || '')
    inclFileName = path.join('views', !inclFileName.endsWith('.mix') ? inclFileName + '.mix' : inclFileName)
    let resources = Storage.mount('resources')
    if (await resources.exists(inclFileName)) {
      let content = (await resources.read(inclFileName)).toString()
      let frag = makeFragment(content)
      step(context, client, root, frag)
      frag && element.replaceWith(frag)
    } else {
      let fallback = element.getAttribute('else')
      if (fallback) {
        fallback = toExec(fallback)
        fallback = path.join('views', !fallback.endsWith('.mix') ? fallback + '.mix' : fallback)
        if (await resources.exists(fallback)) {
          let content = (await resources.read(fallback)).toString()
          let frag = makeFragment(content)
          step(context, client, root, frag)
          frag && element.replaceWith(frag)
        } else {
          element.remove()
        }
      } else {
        element.remove()
      }
    }
  }
}

/**
 * Includes a file and requires that the template exists otherwise an exception is thrown
 *
 * @export
 * @param {Template} root The root template
 * @param {Element} element The current element `<require ...>`
 * @param {TemplateData} data The template data
 * @param {Mixin[]} mixins
 */
export async function requireBlock(context: Context, client: Client, root: Template, element: Element) {
  let inclFileName = element.getAttribute('file')
  if (inclFileName && element.ownerDocument && inclFileName.length > 0) {
    inclFileName = <string>(runInContext(toExec(inclFileName), context) || '')
    inclFileName = path.join('views', !inclFileName.endsWith('.mix') ? inclFileName + '.mix' : inclFileName)
    let resources = Storage.mount('resources')
    if (await resources.exists(inclFileName)) {
      let content = (await resources.read(inclFileName)).toString()
      let frag = makeFragment(content)
      step(context, client, root, frag)
      frag && element.replaceWith(frag)
    } else {
      element.remove()
      throw new Error(`Could not find template "${inclFileName}"`)
    }
  } else {
    element.remove()
    throw new Error(`Could not find template "${inclFileName}"`)
  }
}