import * as path from 'path'
import * as fs from 'fs'
import { Template } from '../helpers/extend';
import { fragmentFromFile, step, replaceVariables } from '../helpers';
import { Mixin } from '../helpers/mixin';
import { TemplateData } from '..';
import { Client } from '@horsepower/server';

// <include file="../abc/123"/></include>
// <require file="../abc/123"/></require>
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
export async function includeBlock(client: Client, root: Template, element: Element, data: TemplateData, mixins: Mixin[]) {
  let inclFileName = element.getAttribute('file')
  if (inclFileName && element.ownerDocument && inclFileName.length > 0) {
    inclFileName = replaceVariables(inclFileName, data)
    let dir = path.dirname(root.file)
    let file = path.resolve(dir, inclFileName + (!inclFileName.endsWith('.mix') ? '.mix' : ''))
    let isFile = await new Promise(r => fs.stat(file, (err, stats) => {
      if (err) return r(false)
      return r(stats.isFile())
    }))
    if (isFile) {
      let frag = await fragmentFromFile(file)
      step(client, root, frag, data, mixins)
      frag && element.replaceWith(frag)
    } else {
      element.remove()
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
export async function requireBlock(client: Client, root: Template, element: Element, data: TemplateData, mixins: Mixin[]) {
  let inclFileName = element.getAttribute('file')
  if (inclFileName && element.ownerDocument && inclFileName.length > 0) {
    inclFileName = replaceVariables(inclFileName, data)
    let dir = path.dirname(root.file)
    let file = path.resolve(dir, inclFileName + (!inclFileName.endsWith('.mix') ? '.mix' : ''))
    let isFile = await new Promise(r => fs.stat(file, (err, stats) => {
      if (err) return r(false)
      return r(stats.isFile())
    }))
    if (isFile) {
      let frag = await fragmentFromFile(file)
      step(client, root, frag, data, mixins)
      frag && element.replaceWith(frag)
    } else {
      throw new Error(`Could not find template "${file}"`)
    }
  }
}