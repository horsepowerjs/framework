import { JSDOM } from 'jsdom'
import { parseFile } from './files';

// <extends file="../abc/def"></extends>

export interface Template {
  dom: JSDOM
  document: Document
  body: HTMLBodyElement
  file: string
  child?: Template
}

export default async function extend(tpl: Template) {
  let document = tpl.document
  let item = document.documentElement.querySelector(':scope extends')
  if (!item) return tpl
  let inclFileName = item.getAttribute('file')
  if (inclFileName && item.parentElement) {
    // let dir = path.dirname(tpl.file)
    // let file = path.resolve(dir, inclFileName + (!inclFileName.endsWith('.mix') ? '.mix' : ''))
    let file = inclFileName + (!inclFileName.endsWith('.mix') ? '.mix' : '')
    let parent = await parseFile(file)
    // let rootTpl:Template
    if (parent) {
      parent.child = tpl
      // rootTpl = parent
      let ext = parent.document.querySelector('extends')
      if (ext && ext.parentElement) {
        ext.replaceWith(tpl.document)
        extend(parent)
      }
      return parent
    }
  }
  // rootTpl = tpl
  return tpl
}
