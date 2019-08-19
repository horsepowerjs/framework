import { Template } from './extend';
import { step } from '.';
import { TemplateData } from '..';
import { Client } from '@horsepower/server';

export interface Mixin {
  name: string
  element: Element
}


function getMixin(mixins: Mixin[], name: string) {
  if (!Array.isArray(mixins)) return
  let mixin = mixins.find(m => m.name == name)
  if (mixin) {
    return mixin.element
  }
}

export function getMixins(tpl: Template) {
  const mixins: Mixin[] = []
  function get(tpl: Template) {
    Array.from(tpl.document.querySelectorAll('mixin')).forEach(mixin => {
      let name = mixin.getAttribute('name') || ''
      let m = getMixin(mixins, name)
      if (!m && name.trim().length > 0) {
        mixins.push({ name, element: mixin.cloneNode(true) as Element })
        mixin.remove()
      }
    })
    tpl.child && get(tpl.child)
  }
  tpl.child && get(tpl)
  return mixins
}

// export function mixin(element: Element, data: object) {
//   let name = element.getAttribute('name')
//   console.log(name)
//   if (name && !getMixin(name)) {
//     mixins.push({ name, element: element.cloneNode(true) as Element })
//   }
//   element.remove()
// }

export function includeMixin(client: Client, root: Template, element: Element, data: TemplateData, mixins: Mixin[]) {
  let name = element.getAttribute('use')
  if (!element.ownerDocument) {
    element.remove()
    return
  }
  let frag = element.ownerDocument.createDocumentFragment()
  if (name) {
    let mixin = getMixin(mixins, name)
    if (mixin) {
      for (let child of mixin.childNodes) {
        frag.appendChild(child.cloneNode(true))
      }
    }
  }
  step(client, root, frag, data, mixins)
  element.replaceWith(frag)
  return
  // let name = element.getAttribute('mixin') || ''
  // element.removeAttribute('mixin')
  // let mixin = this.getMixin(name)
  // if (mixin && element.ownerDocument) {
  //   let frag = element.ownerDocument.createDocumentFragment()
  //   let dta: { [key: string]: any } = {}
  //   let each = element.attributes.getNamedItem('each')
  //   if (each) {
  //     // this.eachBlock(element, data)
  //     // return
  //     //   return this.step(element.parentElement, data)
  //   }
  //   for (let attr of element.attributes) {
  //     dta[attr.name] = this.getData(attr.value, data)
  //   }
  //   console.log(dta)
  //   for (let child of mixin.children) {
  //     frag.appendChild(child)
  //     //   for (let attr of mixin.attributes) {
  //     //     if (attr.name == 'name') continue
  //     //     console.log(attr.name, attr.value)
  //     //     child.innerHTML = child.innerHTML.replace(new RegExp(`\{\{${attr.name}\}\}`, 'g'), attr.value)
  //     //   }
  //   }
  //   // console.log(mixin.outerHTML)
  //   element.replaceWith(frag)
  // }
}