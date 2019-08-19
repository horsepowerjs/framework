import * as path from 'path'
import { Template } from './extend'
import { JSDOM } from 'jsdom'
import { Storage } from '@horsepower/storage'

export function parseFile(file: string) {
  return new Promise<Template>(async resolve => {
    let data = await Storage.mount('resources').read(path.join('views', file))
    let tpl = new JSDOM(data)
    resolve({
      file, dom: tpl,
      document: tpl.window.document,
      body: tpl.window.document.body as HTMLBodyElement
    })
    // readFile(file, (err, data) => {
    //   let tpl = new JSDOM(data)
    //   resolve({
    //     file, dom: tpl,
    //     document: tpl.window.document,
    //     body: tpl.window.document.body as HTMLBodyElement
    //   })
    // })
  })
}