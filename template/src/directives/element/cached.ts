import { Template } from '../../helpers/extend'
import { step } from '../../helpers'
import { Client } from '@horsepower/server'
import { Storage, FileStorage } from '@horsepower/storage'
import { Context } from 'vm'
import * as crypto from 'crypto'
import * as path from 'path'

// The ttl default is 86400
// The key default is ""; this is used when multiple cached elements are used in the same path
//      If two or more cached elements are used in the same path either the wrong cached item could be displayed
//      or the wrong cache file could be overwritten/created when the key is not set

// <cached ttl="200" key="an-unique-path-based-key">
// </cached>

export default async function (context: Context, client: Client, root: Template, element: Element) {
  if (element.ownerDocument) {
    let ttl = element.getAttribute('ttl') || 86400
    let cacheKey = element.getAttribute('key') || ''
    let md5 = crypto.createHash('md5').update(`${client.path}-${cacheKey}`).digest('hex')
    let tmpPath = path.join('horsepower/cache', md5 + '.mix')

    let tmp = Storage.mount<FileStorage>('tmp')
    let info = await tmp.info(tmpPath)
    let template = element.ownerDocument.createElement('div')

    if (info) {
      let diff = Math.abs((info.ctime.getTime() - new Date().getTime()) / 1000)
      if (diff < ttl) {
        template.innerHTML = (await tmp.read(tmpPath)).toString()
      } else {
        await createCachedFile(element, template, context, client, root, tmp, tmpPath)
      }
    } else {
      await createCachedFile(element, template, context, client, root, tmp, tmpPath)
    }

    element.replaceWith(...template.childNodes)
  } else {
    element.remove()
  }
}

async function createCachedFile(element: Element, template: HTMLElement, context: Context, client: Client, root: Template, tmp: FileStorage, tmpPath: string) {
  let clone = element.cloneNode(true)
  template.appendChild(clone)
  await step(context, client, root, clone)

  let cachedElement = template.firstElementChild as HTMLElement

  await tmp.write(tmpPath, cachedElement.innerHTML.trim())
}