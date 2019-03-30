import { Template } from './extend';
import { step } from '.';
import { Mixin } from './mixin';
import { TemplateData } from '..';

// <!-- Root blocks do not have content -->
// <block name="xxx"></block>
//
// <!-- Child blocks have content and fill the parent -->
// <block name="xxx">...</block>

export async function block(root: Template, element: Element, data: TemplateData, mixins: Mixin[]) {
  let name = element.getAttribute('name')
  if (!element.ownerDocument) return
  let frag = element.ownerDocument.createDocumentFragment()
  if (root.child && element.parentElement && name) {
    let childBlock = root.child.document.querySelector(`block[name=${name}]`)
    if (childBlock && element) {
      for (let child of childBlock.childNodes) {
        frag.appendChild(child.cloneNode(true))
      }
    }
  }
  await step(root, frag, data, mixins)
  element.replaceWith(frag)
}