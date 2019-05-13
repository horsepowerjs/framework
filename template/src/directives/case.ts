import { Template } from '../helpers/extend';
import { step, replaceHolders } from '../helpers';
import { Mixin } from '../helpers/mixin';
import { TemplateData } from '..';
import { Client } from '@red5/server';

// <case :="{{$item}}">
//   <when :="1">...</when>
//   <when :="2">...</when>
//   <default>...</default>
// </case>

export default async function (client: Client, root: Template, element: Element, data: TemplateData, mixins: Mixin[]) {
  if (!element.ownerDocument) return
  let nodes: Element[] = Array.from(element.querySelectorAll('when, default'))

  let value = replaceHolders(element.getAttribute(':') || 'false', data)

  let frag = element.ownerDocument.createDocumentFragment()
  // Loop over all the when/default nodes
  for (let node of nodes) {
    // If the node is a default node append the data to the fragment
    if (node.nodeName.toLowerCase() == 'default') {
      for (let child of node.childNodes) {
        frag.appendChild(child.cloneNode(true))
      }
    }
    // the node is a when node, test its conditions
    else {
      let condition = node.getAttribute(':') || 'false'
      let result = replaceHolders(condition, data) == value
      // let result = !!eval(replaceHolders(condition, data))
      // The test failed go to the next node
      if (!result) continue
      // The test succeeded add the children to the fragment
      for (let child of node.childNodes) {
        frag.appendChild(child.cloneNode(true))
      }
    }
    step(client, root, frag, data, mixins)
    element.replaceWith(frag)
    break
  }
  // Remove all the if/elif/else nodes that failed
  for (let node of nodes) {
    node.remove()
  }
  element.remove()
}