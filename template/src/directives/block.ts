import { Template } from '../helpers/extend';
import { step } from '../helpers';
import { Mixin } from '../helpers/mixin';
import { TemplateData } from '..';
import { Client } from '@horsepower/server';

// <!-- Root blocks do not have content -->
// <block name="xxx"></block>
//
// <!-- Child blocks have content and fill the parent -->
// <block name="xxx">...</block>

export default async function (client: Client, root: Template, element: Element, data: TemplateData, mixins: Mixin[]) {
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
  await step(client, root, frag, data, mixins)
  element.replaceWith(frag)
}