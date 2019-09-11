import { readFile } from 'fs'
import { JSDOM } from 'jsdom'

// The element template directives
import { Template } from './extend'
import block from '../directives/element/block'
import ifBlock from '../directives/element/if'
import debugBlock from '../directives/element/debug'
import eachBlock from '../directives/element/each'
import forBlock from '../directives/element/for'
import langBlock from '../directives/element/lang'
import csrfBlock from '../directives/element/csrf'
import caseBlock from '../directives/element/case'
import { includeBlock, requireBlock } from '../directives/element/include'

// The element template attribute directives
import hideAttr from '../directives/attribute/hide'
import classAttr from '../directives/attribute/class'
import bindAttr from '../directives/attribute/bind'

import { Client } from '@horsepower/server'
import { Context } from 'vm'

export * from './files'
export * from './extend'

/**
 * Finds the data in a object/array if it exists
 * `a.b.c` -> `{a: {b: {c: 'some value'}}}`
 *
 * @export
 * @param {string} query The path to the value `a.b.c`
 * @param {(object | any[])} data The data to find the value in
 * @returns {any | undefined} The resulting data
 */
export function find(query: string, data: object | any[]): any | undefined {
  const keys = query.split('.')
  const lastKey = keys.pop() as string
  const lastObj = keys.reduce<any>((obj, val) => obj ? obj[val] : obj, data)

  const ret = lastObj[lastKey]
  return typeof ret === 'function' ? ret.bind(lastObj) : ret
}

/**
 * Replaces variables with their actual data
 *
 * @export
 * @param {string} text The text to find the variables within
 * @param {object} data The data related to the variables
 * @returns {string} The resulting data
 */
export function replaceHolders(text: string, data: object): string {
  return text.replace(/\{\{.+\}\}/g, (i) => {
    return JSON.stringify(find(i.replace(/^\{\{|\}\}$/g, ''), data))
  })
}

export function toExec(text: string) {
  return text.replace(/\b\{\{(.+)\}\}\b/g, '$1')
}

/**
 * Makes a document fragment from an element
 *
 * @export
 * @param {(string | Buffer | Element)} element
 * @returns
 */
export function makeFragment(element: string | Buffer | Element): DocumentFragment {
  return typeof element == 'string' || element instanceof Buffer ?
    JSDOM.fragment(element.toString()) :
    JSDOM.fragment((<any>element).outerHTML)
}

/**
 * Makes a document fragment from a file with a single root node
 *
 * @export
 * @param {string} file The path to the file
 * @returns {Promise<DocumentFragment>} The fragment from the file
 */
export function fragmentFromFile(file: string, data: string | Buffer | Element): Promise<DocumentFragment> {
  return new Promise<DocumentFragment>(resolve => {
    readFile(file, (err) => {
      resolve(makeFragment(data))
    })
  })
}

export function remove(element: Element) {
  element.remove()
}

/**
 * Tests if the element is an HTMLElement
 *
 * @export
 * @param {(Window | JSDOM)} windowScope The window scope
 * @param {*} clone The element
 * @returns {clone is HTMLElement} Whether or not this is an HTMLElement
 */
export function isHTMLElement(windowScope: Window | JSDOM, clone: any): clone is HTMLElement {
  if (windowScope instanceof Window && clone instanceof HTMLElement) {
    return true
  } else if (windowScope instanceof JSDOM && clone instanceof windowScope.window.HTMLElement) {
    return true
  }
  return false
}

/**
 * Steps through the node list
 *
 * @export
 * @param {Template} root The root node
 * @param {(Document | Element | Node | DocumentFragment)} node The current node
 * @param {TemplateData} data The template data
 * @param {Mixin[]} mixins
 * @returns {Promise<void>}
 */
export async function step(context: Context, client: Client, root: Template, node: Document | Element | Node | DocumentFragment): Promise<any> {
  for (let child of node.childNodes) {
    if (child instanceof root.dom.window.HTMLElement) {
      await attributes(context, client, root, child)
      // Elements based on tag name
      switch (child.nodeName.toLowerCase()) {
        case 'include':
          await includeBlock(context, client, root, child)
          return await step(context, client, root, node)
        case 'require':
          await requireBlock(context, client, root, child)
          return await step(context, client, root, node)
        case 'block':
          await block(context, client, root, child)
          return await step(context, client, root, node)
        case 'if':
          await ifBlock(context, client, root, child)
          return await step(context, client, root, node)
        case 'case':
          await caseBlock(context, client, root, child)
          return await step(context, client, root, node)
        case 'each':
          await eachBlock(context, client, root, child)
          return await step(context, client, root, node)
        case 'for':
          await forBlock(context, client, root, child)
          return await step(context, client, root, node)
        case 'lang':
          await langBlock(context, client, root, child)
          return await step(context, client, root, node)
        case 'csrf':
          await csrfBlock(context, client, root, child)
          return await step(context, client, root, node)
        case 'debug':
          await debugBlock(context, child)
          return await step(context, client, root, node)
        // Remove node since it's not part of a valid block group
        // Blocks cannot start with an "elif" or "else"
        case 'elif':
        case 'else':
          remove(child)
          return await step(context, client, root, node)
      }
      if (child.childNodes.length > 0) {
        await step(context, client, root, child)
      }
    }
  }
}

export async function attributes(context: Context, client: Client, root: Template, node: HTMLElement): Promise<any> {
  for (let attr of node.attributes) {
    let attrName = attr.name
    if (attrName.startsWith(':') && attrName.length > 1) {
      switch (attrName) {
        // Sets "display:none" when evaluated to true
        case ':hide':
          await hideAttr(context, node)
          break
        // An object that evaluates each key as a class
        // If the value is true then the class will be added
        case ':class':
          await classAttr(context, node)
          break
        // Bind the attribute to a value
        default:
          await bindAttr(context, node, attrName)
          break
      }
    }
  }
}