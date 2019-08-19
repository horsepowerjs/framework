import { Template } from '../helpers/extend'
import { step, replaceVariables } from '../helpers'
import { Mixin } from '../helpers/mixin'
import { TemplateData } from '..'
import { Client } from '@horsepower/server';

// <if :="{{$i}} == 0">...</if>
// <elif :="{{$i}} == 1">...</elif>
// <elif :="{{$i}} == 2 && {{$j}} == 3">...</elif>
// <else>...</else>

export default async function (client: Client, root: Template, element: Element, data: TemplateData, mixins: Mixin[]) {
  if (!element.ownerDocument) return
  let nodes: Element[] = [element]

  // Get all the nodes in the current if block
  function getNext(element: Element) {
    if (!element.nextElementSibling) return
    let ref = element.nextElementSibling
    if (ref.nodeName.toLowerCase() == 'elif') {
      nodes.push(ref)
      getNext(ref)
    } else if (ref.nodeName.toLowerCase() == 'else') {
      nodes.push(ref)
    }
  }

  // Find all nodes within the if/elif/else block
  getNext(element)

  let frag = element.ownerDocument.createDocumentFragment()
  // Loop over all the if/elif/else nodes
  for (let node of nodes) {
    // If the node is an else node append the data to the fragment
    if (node.nodeName.toLowerCase() == 'else') {
      for (let child of node.childNodes) {
        frag.appendChild(child.cloneNode(true))
      }
    }
    // the node is an if/elif node, test its conditions
    else {
      let condition = node.getAttribute(':') || 'false'

      // Replace all the variables within the condition
      condition = replaceVariables(condition, data)

      // Test the condition as a boolean value
      // TODO: Either make the condition more secure or find a way to remove the usage of eval
      let result = !!eval(condition)
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
}