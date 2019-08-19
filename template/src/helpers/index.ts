import { readFile } from 'fs'
import * as vm from 'vm'
import { JSDOM } from 'jsdom'

// The template directives
import { Template } from './extend'
import block from '../directives/block'
import ifBlock from '../directives/if'
import debugBlock from '../directives/debug'
import eachBlock from '../directives/each'
import forBlock from '../directives/for'
import langBlock from '../directives/lang'
import csrfBlock from '../directives/csrf'
import caseBlock from '../directives/case'
import { includeBlock, requireBlock } from '../directives/include'
import { includeMixin, Mixin } from './mixin'
import { TemplateData, Nullable } from '..'
import { Client } from '@horsepower/server';

export * from './files'
export * from './extend'

// /**
//  * Gets the data that will be searched
//  *
//  * @export
//  * @param {string} text The variable name like: "$example"
//  * @param {TemplateData} data The template data
//  * @param {string} [scope] The optional scope
//  * @returns
//  */
// export function getData(text: string, data: TemplateData, context: vm.Context, scope?: string) {
//   // let dataToSearch = data.originalData
//   // if (typeof scope == 'string') {
//   //   dataToSearch = data.scopes && data.scopes.length > 0 ?
//   //     (data.scopes.find(i => i.reference == scope) || { data: {} }).data : {}
//   // }
//   // Call function
//   // if (text.includes('(') && text.includes(')')) {
//   // let matches = text.match(/(.+)\((.*)\)/)
//   // if (matches && matches[1]) {
//   // let params = matches[2] && (text.match(/(["'])(?:(?=(\\?))\2.)*?\1/g) as RegExpMatchArray)
//   //   .map(i => i.replace(/^('|")|('|")$/g, ''))
//   // let params = matches[2] && matches[2].trim().replace(/^('|")|('|")$/g, '').split(',') || []
//   // let func = find(matches[1], dataToSearch)
//   // if (typeof func == 'function') {
//   // let context = vm.createContext(dataToSearch)
//   // return vm.runInContext(text, context)
//   // }
//   // }
//   // }
//   // return find(text.replace(/^\$/, ''), dataToSearch)
//   // return find(text.replace(/^\{\{|\}\}$/g, ''), dataToSearch)
// }

/**
 * Gets an array of variables within a string
 * Formatted as: `$example`
 *
 * @export
 * @param {string} string The string to search
 * @returns {string[]} An array of matched variables
 */
export function getVariableValues(string: string): string[] {
  let match = ((string || '').match(/\{\{.+?\}\}/) || [])[0] || ''
  return [...new Set(match.match(/\$(?!(\d|\.))[.\w]+/g) || [])]
}

/**
 * Gets an array of variable placeholders within a string
 * Formatted as: `{{$example}}`
 *
 * @export
 * @param {string} string The string to search
 * @returns {string[]} Aan array of matched placeholders
 */
export function getVariables(string: string): string[] {
  let match = ((string || '').match(/\{\{.+?\}\}/) || [])[0] || ''
  return [...new Set(match.match(/\{\{\$(?!(\d|\.))[.\w]+\}\}/g) || [])]
}

export function getVariableStrings(string: string): string[] {
  let match = ((string || '').match(/\{\{.+?\}\}/g) || [])
  return [...new Set(match.map(i => i.replace(/^\{\{\$|\}\}$/g, '')))]
  // return [...new Set(match.match(/(?!(\d|\.))[.\w]+/g) || [])]
}

/**
 * Gets variable information about a string
 *
 * @export
 * @param {string} string The string to analyze
 * @param {*} data The data that is associated to the variables
 * @returns
 */
export function getStringInfo(string: string, data: any) {
  return getVariableStrings(string).map(key => {
    let breadcrumb = key.split('.')
    let scope = breadcrumb.length > 1 ? breadcrumb[0] : null
    let dataObject = getScopeData(breadcrumb.join('.'), data, scope)
    return { key, data: dataObject }
  })
}

/**
 * Replaces the variables in a string with actual data
 *
 * @export
 * @param {string} string The string
 * @param {*} data Data that will replace the variables
 * @returns
 */
export function replaceVariables(string: string, data: any) {
  getStringInfo(string, data).forEach(i => {
    string = string.replace(variableMatch(i.key), i.data)
  })
  return string
}

/**
 * Removes the first element in a variable
 *
 * @export
 * @param {string} text The variable
 * @returns
 */
export function dropFirst(text: string) {
  let r = text.replace(/^\{\{|\}\}$/g, '').split('.')
  r.shift()
  return r.join('.')
}

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
  return text.replace(/\{\{\$.+\}\}/g, (i) => {
    return JSON.stringify(find(i.replace(/^\{\{\$|\}\}$/g, ''), data))
  })
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
export function fragmentFromFile(file: string): Promise<DocumentFragment> {
  return new Promise<DocumentFragment>(resolve => {
    readFile(file, (err, data) => {
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
export async function step(client: Client, root: Template, node: Document | Element | Node | DocumentFragment, data: TemplateData, mixins: Mixin[]): Promise<any> {
  for (let child of node.childNodes) {
    if (child.nodeType == root.dom.window.Node.TEXT_NODE && child.textContent) {
      // child.textContent.match(/\{\{(.+)\}\}/) && console.log('step', JSON.stringify(data.scopes))
      // Replace text node placeholders
      // child.textContent = child.textContent.replace(/\{\{(.+)\}\}/g, (full, v) => getData(v, data))
    } else if (child instanceof root.dom.window.Element) {
      let name = child.nodeName.toLowerCase()
      // Elements based on tag name
      switch (name) {
        case 'include':
          await includeBlock(client, root, child, data, mixins)
          return await step(client, root, node, data, mixins)
        case 'require':
          await requireBlock(client, root, child, data, mixins)
          return await step(client, root, node, data, mixins)
        case 'block':
          await block(client, root, child, data, mixins)
          return await step(client, root, node, data, mixins)
        case 'include':
          await includeMixin(client, root, child, data, mixins)
          return await step(client, root, node, data, mixins)
        case 'if':
          await ifBlock(client, root, child, data, mixins)
          return await step(client, root, node, data, mixins)
        case 'case':
          await caseBlock(client, root, child, data, mixins)
          return await step(client, root, node, data, mixins)
        case 'each':
          await eachBlock(client, root, child, data, mixins)
          return await step(client, root, node, data, mixins)
        case 'for':
          await forBlock(client, root, child, data, mixins)
          return await step(client, root, node, data, mixins)
        case 'lang':
          await langBlock(client, root, child, data)
          return await step(client, root, node, data, mixins)
        case 'csrf':
          await csrfBlock(client, root, child)
          return await step(client, root, node, data, mixins)
        case 'debug':
          await debugBlock(child, data)
          return await step(client, root, node, data, mixins)
        // Remove node since it's not part of a valid block group
        // Blocks cannot start with an "elif" or "else"
        case 'elif':
        case 'else':
          await remove(child)
          return await step(client, root, node, data, mixins)
      }
      if (child.childNodes.length > 0) {
        await step(client, root, child, data, mixins)
      }
    }
  }
}

/**
 * Creates a regular expression for a particular variable
 * * Find values between "{{" and "}}" and not between html tags "<" and ">"
 * * Variable must start with a "$" and is not followed by a "\d" or "."
 *    * Valid Examples: {{$cat}}, {{$i.name}}
 *    * Invalid Examples: {{$234}}, {{$.name}}
 *
 * @export
 * @param {string} key The variable without braces and dollar sign `a.b.c`
 * @returns {RegExp} The regular expression to match a variable
 */
export function variableMatch(key: string, braces = true): RegExp {
  if (braces)
    return new RegExp(`\\{\\{(\\$(?!(\\d|\\.))\\b${key}\\b[.\\w]*)(?![^\\<]*\\>)\\}\\}`, 'g')
  else
    return new RegExp(`(\\$(?!(\\d|\\.))\\b${key}\\b[.\\w]*)(?![^\\<]*\\>)`, 'g')
}

/**
 * Gets data based on the scope of the search
 *
 * @export
 * @param {string} search The search `a.b.c`
 * @param {TemplateData} data The template data
 * @param {Nullable<string>} [scope] The scoped item
 * @param {(Nullable<string | number>)} [key] The key
 * @returns
 */
export function getScopeData(search: string, data: TemplateData, scope?: Nullable<string>, key?: Nullable<string | number>) {
  let dataToSearch = data.originalData
  // console.log('scope', scope)
  if (search.split('.').length == 1 && !scope) {
    return data.originalData[search.replace(/^\$/, '')]
  } if (typeof scope == 'string' && scope.length > 0) {
    dataToSearch = data.scopes && data.scopes.length > 0 ?
      (data.scopes.find(i => i.reference == scope.replace(/^\$/, '')) || { data: {} }).data : {}
  }
  // console.log(scope, search, dataToSearch)
  // console.log('search', search, key, search.replace(new RegExp(`^\\$${scope}`), (key && ['string', 'number'].includes(typeof key) ? key : '').toString()).replace(/^\$/, ''))
  return find(search.replace(new RegExp(`^\\$${scope}`), (key || search.replace(/^\$/, '')).toString()), dataToSearch)
}